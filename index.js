import { Platform, NativeModules } from 'react-native';

// firebase, messaging, notifee background handlers are native-only — skip on web and in Expo Go
const isFirebaseNativeAvailable = Platform.OS !== 'web' && !!NativeModules?.RNFBAppModule;
const isNotifeeNativeAvailable =
  Platform.OS !== 'web' && !!(NativeModules?.NotifeeApiModule || NativeModules?.NotifeeNativeModule);

if (isFirebaseNativeAvailable && isNotifeeNativeAvailable) {
  try {
    const firebase = require('@react-native-firebase/app').default;
    const messaging = require('@react-native-firebase/messaging').default;
    const notifeeModule = require('@notifee/react-native');
    const notifee = notifeeModule.default;
    const { EventType } = notifeeModule;
    const { displayOrderNotification, markOrderAsNotified } = require('./src/services/NotificationService');

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

    // Notifee Background Event Listener
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS || type === EventType.ACTION_PRESS || type === EventType.DISMISSED) {
        const orderId = detail.notification?.data?.orderId || detail.notification?.data?._id;
        if (orderId) markOrderAsNotified(orderId);
      }
    });
  } catch (err) {
    console.warn('[index.js] Firebase background handler init notice:', err);
  }
}

// Register Expo Router entry point
import 'expo-router/entry';
