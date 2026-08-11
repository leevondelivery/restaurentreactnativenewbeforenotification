import firebase from '@react-native-firebase/app';
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { displayOrderNotification, stopOrderNotificationSound, markOrderAsNotified } from './src/services/NotificationService';

// Ensure Firebase default app is initialized before calling messaging()
if (!firebase.apps || firebase.apps.length === 0) {
  try {
    firebase.initializeApp();
  } catch (e) {
    console.warn('Firebase index safe init notice:', e);
  }
}

// Android Device-Level Background Handler for Firebase Cloud Messaging
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('FCM Device-Level Background Message received:', remoteMessage);
  if (remoteMessage) {
    const orderData = remoteMessage.data || remoteMessage.notification || {};
    try {
      await displayOrderNotification(orderData, false);
    } catch (e) {
      console.error('Error displaying background notification via Notifee:', e);
    }
  }
  return Promise.resolve();
});

// Notifee Background Event Listener (stops sound on notification click or dismissal)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS || type === EventType.ACTION_PRESS || type === EventType.DISMISSED) {
    const orderId = detail.notification?.data?.orderId || detail.notification?.data?._id;
    if (orderId) markOrderAsNotified(orderId);
    await stopOrderNotificationSound(orderId);
    await stopOrderNotificationSound();
  }
});

// Register Expo Router entry point
import 'expo-router/entry';

