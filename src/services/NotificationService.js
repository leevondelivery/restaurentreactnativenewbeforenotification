import AsyncStorage from '@react-native-async-storage/async-storage';
import firebase from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';
import { registerFCMToken } from '@/services/api';
import { playOrderSound, stopOrderSoundNative } from './soundService';

// Safe check to guarantee default Firebase App is initialized
if (!firebase.apps || firebase.apps.length === 0) {
  try {
    firebase.initializeApp();
  } catch (e) {
    console.warn('Firebase app safe init notice:', e);
  }
}

export const extractRestId = (obj) => {
  if (!obj) return '';
  if (typeof obj === 'string' || typeof obj === 'number') return String(obj).trim().toLowerCase();
  if (typeof obj === 'object') {
    return String(obj.restId || obj.restaurantId || obj._id || obj.id || '').trim().toLowerCase();
  }
  return '';
};

const ORDER_CHANNEL_ID = 'order_incoming_channel_v3';
const activeRepeatTimers = new Map();
const notifiedOrderIds = new Set();

export function isOrderNotified(orderId) {
  if (!orderId) return false;
  return notifiedOrderIds.has(String(orderId));
}

export function markOrderAsNotified(orderId) {
  if (!orderId) return;
  notifiedOrderIds.add(String(orderId));
}

/**
 * Initialize Android High-Priority Notification Channel with custom sound (ordernotification.wav)
 */
export async function setupNotificationChannel() {
  try {
    await notifee.createChannel({
      id: ORDER_CHANNEL_ID,
      name: 'Incoming Order Alerts',
      importance: AndroidImportance.HIGH,
      sound: 'ordernotification',
      vibration: true,
      vibrationPattern: [300, 500, 300, 500],
      visibility: AndroidVisibility.PUBLIC,
    });
  } catch (err) {
    console.error('Error creating notification channel:', err);
  }
}

// Immediately attempt channel creation on module import
setupNotificationChannel();

/**
 * Internal single display trigger
 */
async function showSingleNotification(orderData, isForeground = false) {
  const orderId = orderData?.orderId || orderData?._id || 'NEW';
  const amount = orderData?.grandTotal || orderData?.totalPrice || orderData?.amount || '0';
  const notificationId = `order_${String(orderId)}`;

  // Convert all properties to primitive strings for Notifee native compatibility
  const safeData = {
    orderId: String(orderId),
    totalPrice: String(amount),
    grandTotal: String(amount),
  };

  if (orderData && typeof orderData === 'object') {
    Object.keys(orderData).forEach((key) => {
      const val = orderData[key];
      if (val !== null && val !== undefined) {
        if (typeof val === 'object') {
          try {
            safeData[key] = JSON.stringify(val);
          } catch (e) {}
        } else {
          safeData[key] = String(val);
        }
      }
    });
  }

  try {
    await setupNotificationChannel();
    await notifee.displayNotification({
      id: notificationId,
      title: orderData?.title || '🔔 NEW ORDER RECEIVED!',
      body: orderData?.body || `Order #${orderId} - Total Amount: ₹${amount}`,
      data: safeData,
      android: {
        channelId: ORDER_CHANNEL_ID,
        // HIGH importance pops up heads-up banner & plays custom sound continuously until user acts
        importance: AndroidImportance.HIGH,
        sound: 'ordernotification',
        loopSound: true,
        ongoing: true,
        autoCancel: true,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: {
          id: 'default',
          launchActivity: 'default',
        },
        actions: [
          {
            title: 'View Order',
            pressAction: { id: 'view_order', launchActivity: 'default' },
          },
        ],
      },
    });
  } catch (e) {
    console.error('Error displaying single notification:', e);
  }
}

/**
 * Display notification and trigger native looping order sound.
 * @param {object} orderData
 * @param {boolean} isForeground Pass true when inside app (sound only), false when outside app (banner + sound)
 */
export async function displayOrderNotification(orderData, isForeground = false) {
  try {
    await setupNotificationChannel();

    const orderId = String(orderData?.orderId || orderData?._id || 'NEW');
    if (orderId && orderId !== 'NEW') {
      markOrderAsNotified(orderId);
    }

    // 1. Display system notification banner with sound alert
    await showSingleNotification(orderData, isForeground);

    // 2. Play in-app native order sound
    await playOrderSound();

    // 3. 5-second loop: Repeat sound & system notification alert every 5 seconds until order is accepted/rejected
    if (orderId && orderId !== 'NEW') {
      if (!activeRepeatTimers.has(orderId)) {
        const timerId = setInterval(async () => {
          try {
            console.log(`[5-sec Alert Loop] Re-triggering sound & notification for Order #${orderId}`);
            await playOrderSound();
            await showSingleNotification(orderData, isForeground);
          } catch (e) {
            console.error('Error in 5-second alert loop timer:', e);
          }
        }, 5000);

        activeRepeatTimers.set(orderId, timerId);
      }
    }
  } catch (err) {
    console.error('Error displaying order notification:', err);
  }
}

/**
 * Cancel persistent notification & stop native looping order sound when user acts on an order
 */
export async function stopOrderNotificationSound(orderId) {
  try {
    // 1. Stop native Android looping MediaPlayer
    await stopOrderSoundNative();

    // 2. Clear the 5-second alert loop timer for this orderId (or all if un-specified)
    const key = orderId ? String(orderId) : null;
    if (key && activeRepeatTimers.has(key)) {
      clearInterval(activeRepeatTimers.get(key));
      activeRepeatTimers.delete(key);
    } else if (!key) {
      activeRepeatTimers.forEach((timerId) => clearInterval(timerId));
      activeRepeatTimers.clear();
    }

    // 3. Cancel system notification banner
    if (orderId) {
      await notifee.cancelNotification(`order_${String(orderId)}`);
    } else {
      await notifee.cancelAllNotifications();
    }
    console.log(`Order notification sound & 5-sec loop timer stopped for Order #${orderId || 'ALL'}`);
  } catch (err) {
    console.error('Error stopping notification sound:', err);
  }
}

/**
 * Request notification permissions and register FCM token to backend
 */
export async function initFCMToken(userParam) {
  try {
    let token = null;
    try {
      token = await messaging().getToken();
    } catch (tokenErr) {
      console.warn('[FCM] Direct getToken notice:', tokenErr.message);
      try {
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;
        if (enabled) {
          token = await messaging().getToken();
        }
      } catch (pErr) {
        console.warn('[FCM] Permission request notice:', pErr.message);
      }
    }

    if (!token) {
      console.warn('[FCM] Could not obtain device FCM token.');
      return;
    }

    console.log(`[FCM] Device FCM token obtained: ${token}`);

    let restId = '';
    let userId = '';
    let phone = '';
    let email = '';

    if (typeof userParam === 'object' && userParam !== null) {
      restId = userParam.restId || userParam.restaurantId || userParam.restaurant_id || userParam._id || '';
      userId = userParam._id || userParam.id || '';
      phone = userParam.phone || userParam.mobileNumber || '';
      email = userParam.email || '';
    } else if (typeof userParam === 'string' || typeof userParam === 'number') {
      restId = String(userParam);
    }

    if (!restId && !phone && !email && !userId) {
      try {
        const storedUserStr = await AsyncStorage.getItem('userData');
        const storedRestId = await AsyncStorage.getItem('restId');
        if (storedRestId) restId = storedRestId;
        if (storedUserStr) {
          const u = JSON.parse(storedUserStr);
          restId = restId || u.restId || u.restaurantId || u.restaurant_id || u._id || '';
          userId = userId || u._id || u.id || '';
          phone = phone || u.phone || u.mobileNumber || '';
          email = email || u.email || '';
        }
      } catch (e) {}
    }

    console.log(`[FCM] Registering token to backend for restId="${restId}", phone="${phone}", email="${email}"...`);

    const res = await registerFCMToken({
      restaurantId: restId,
      restId: restId,
      userId,
      phone,
      email,
      fcmToken: token,
    });
    const resData = await res.json();
    console.log(`[FCM] Server response for token registration:`, resData);

    messaging().onTokenRefresh(async (newToken) => {
      if (newToken) {
        try {
          const refRes = await registerFCMToken({
            restaurantId: restId,
            restId: restId,
            userId,
            phone,
            email,
            fcmToken: newToken,
          });
          const refData = await refRes.json();
          console.log(`[FCM] Server response for token refresh:`, refData);
        } catch (refErr) {
          console.error('[FCM] Error updating refreshed FCM token:', refErr);
        }
      }
    });
  } catch (err) {
    console.error('[FCM] Error initializing FCM token:', err);
  }
}


