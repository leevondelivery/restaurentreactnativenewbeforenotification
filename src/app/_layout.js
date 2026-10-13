import BatteryOptimizationModal from '@/components/BatteryOptimizationModal';
import BottomNavbar from '@/components/navbar/BottomNavbar';
import CustomLoader from '@/components/CustomLoader';
import { OrdersProvider, useOrders } from '@/context/OrdersContext';
import store from '@/store/store';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, View, useColorScheme, NativeModules } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { displayOrderNotification, extractRestId, initFCMToken, markOrderAsNotified, setupNotificationChannel } from '@/services/NotificationService';
import { extractIsActive } from '@/utils/statusUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

// firebase, messaging, notifee are native-only — skip on web and in Expo Go
let firebase = null;
let messaging = null;
let notifee = null;
let EventType = null;

if (Platform.OS !== 'web' && NativeModules?.RNFBAppModule) {
  try {
    firebase = require('@react-native-firebase/app').default;
    messaging = require('@react-native-firebase/messaging').default;

    if (!firebase.apps || firebase.apps.length === 0) {
      try {
        firebase.initializeApp();
      } catch (e) {
        console.warn('Firebase layout safe init notice:', e);
      }
    }
  } catch (e) {
    console.warn('[Layout] Firebase native init notice:', e);
  }
}

if (Platform.OS !== 'web' && (NativeModules?.NotifeeApiModule || NativeModules?.NotifeeNativeModule)) {
  try {
    const notifeeModule = require('@notifee/react-native');
    notifee = notifeeModule.default;
    EventType = notifeeModule.EventType;
  } catch (e) {
    console.warn('[Layout] Notifee native init notice:', e);
  }
}

const isForCurrentRestaurant = async (orderData) => {
  try {
    const storedUserStr = await AsyncStorage.getItem('userData');
    if (!storedUserStr) {
      console.log('[FCM Filter] Restaurant user is LOGGED OUT — skipping push notification & sound.');
      return false;
    }
    const u = JSON.parse(storedUserStr);
    if (!u || (!u._id && !u.restId && !u.email && !u.phone)) {
      console.log('[FCM Filter] User session invalid — skipping push notification & sound.');
      return false;
    }

    const msgRestId =
      extractRestId(orderData?.restaurantId) ||
      extractRestId(orderData?.restId) ||
      extractRestId(orderData?.restaurant_id) ||
      extractRestId(orderData?.restaurant) ||
      extractRestId(orderData?.storeId) ||
      extractRestId(orderData?.vendorId);

    // Collect all valid IDs belonging to user (including subrestaurantsId)
    const validIds = new Set();
    if (u?.restId) validIds.add(String(u.restId).trim().toLowerCase());
    if (u?.restaurantId) validIds.add(String(u.restaurantId).trim().toLowerCase());
    if (u?._id) validIds.add(String(u._id).trim().toLowerCase());
    if (u?.phone) validIds.add(String(u.phone).trim().toLowerCase());
    if (u?.mobileNumber) validIds.add(String(u.mobileNumber).trim().toLowerCase());
    const rawSubs = u?.subrestaurentsId || u?.subrestaurantsId || u?.subrestaurents_id || u?.subrestaurants_id;
    if (Array.isArray(rawSubs)) {
      rawSubs.forEach((subId) => {
        if (subId) validIds.add(String(subId).trim().toLowerCase());
      });
    } else if (typeof rawSubs === 'string') {
      rawSubs.split(/[\s,]+/).forEach((subId) => {
        if (subId) validIds.add(String(subId).trim().toLowerCase());
      });
    }

    if (msgRestId && validIds.size > 0 && !validIds.has(msgRestId)) {
      console.log(`[FCM Filter] Ignoring push notification for restaurantId "${msgRestId}" (not in user's assigned restaurants)`);
      return false;
    }
  } catch (e) {}
  return true;
};

const extractOrderTargetRestId = (orderData) => {
  if (!orderData) return '';
  let restId =
    extractRestId(orderData?.restaurantId) ||
    extractRestId(orderData?.restId) ||
    extractRestId(orderData?.restaurant_id) ||
    extractRestId(orderData?.restaurant) ||
    extractRestId(orderData?.storeId) ||
    extractRestId(orderData?.vendorId);

  if (!restId && orderData?.order) {
    let innerOrder = orderData.order;
    if (typeof innerOrder === 'string') {
      try {
        innerOrder = JSON.parse(innerOrder);
      } catch (e) {}
    }
    if (innerOrder && typeof innerOrder === 'object') {
      restId =
        extractRestId(innerOrder?.restaurantId) ||
        extractRestId(innerOrder?.restId) ||
        extractRestId(innerOrder?.restaurant_id) ||
        extractRestId(innerOrder?.restaurant) ||
        extractRestId(innerOrder?.storeId) ||
        extractRestId(innerOrder?.vendorId);
    }
  }
  return restId || '';
};

SplashScreen.preventAutoHideAsync();

function AppLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const router = useRouter();
  const { addIncomingOrderOptimistic, fetchGlobalOrders, isSwitchingRestaurant, switchRestaurant } = useOrders();

  useEffect(() => {
    SplashScreen.hideAsync();

    if (Platform.OS === 'web' || (!messaging && !notifee)) return;

    setupNotificationChannel();

    // Request Android 13+ Notification Permission
    if (notifee) {
      (async () => {
        try {
          await notifee.requestPermission();
        } catch (e) {
          console.warn('Error requesting notification permission on launch:', e);
        }
      })();
    }

    // Helper to auto-switch branch if notification is for a different branch
    const handleNotificationTap = async (orderData, isReplace = false) => {
      const orderId = orderData?.orderId || orderData?._id;
      if (orderId) markOrderAsNotified(orderId);

      const targetRestId = extractOrderTargetRestId(orderData);
      if (targetRestId && switchRestaurant) {
        try {
          await switchRestaurant(targetRestId);
        } catch (e) {
          console.warn('[Layout] Auto-switch restaurant on notification tap notice:', e);
        }
      }

      addIncomingOrderOptimistic(orderData);
      fetchGlobalOrders(true);
      if (isReplace) {
        setTimeout(() => {
          router.replace('/notifications');
        }, 200);
      } else {
        router.push('/notifications');
      }
    };

    let unsubscribeFCM = () => {};
    let unsubscribeFCMTap = () => {};
    let unsubscribeNotifee = () => {};

    if (messaging) {
      // 2. Firebase Foreground Message Handler (runs when app is open/active)
      unsubscribeFCM = messaging().onMessage(async (remoteMessage) => {
        console.log('FCM Foreground Order Received:', remoteMessage);
        if (remoteMessage) {
          const orderData = remoteMessage.data || remoteMessage.notification || {};
          if (await isForCurrentRestaurant(orderData)) {
            const msgRestId =
              extractRestId(orderData?.restaurantId) ||
              extractRestId(orderData?.restId) ||
              extractRestId(orderData?.restaurant_id);
            const storedRestId =
              (await AsyncStorage.getItem('selectedRestId')) || (await AsyncStorage.getItem('restId'));

            // If order is for currently active restaurant, insert optimistically
            if (!msgRestId || !storedRestId || msgRestId.toLowerCase() === String(storedRestId).trim().toLowerCase()) {
              addIncomingOrderOptimistic(orderData);
            }
            // Trigger sound & banner for all assigned restaurants
            await displayOrderNotification(orderData, true);
            // Refresh counts across all restaurants
            fetchGlobalOrders(true);
          }
        }
      });

      // 3. Handle FCM Notification Tap when app is opened from background
      unsubscribeFCMTap = messaging().onNotificationOpenedApp(async (remoteMessage) => {
        console.log('Notification opened app from background:', remoteMessage);
        const orderData = remoteMessage?.data || remoteMessage?.notification || {};
        await handleNotificationTap(orderData, false);
      });

      // 4. Handle Notification Tap when app is launched from killed state (FCM & Notifee)
      messaging()
        .getInitialNotification()
        .then(async (remoteMessage) => {
          if (remoteMessage) {
            console.log('FCM initial notification opened:', remoteMessage);
            const orderData = remoteMessage?.data || remoteMessage?.notification || {};
            await handleNotificationTap(orderData, true);
          }
        });
    }

    if (notifee) {
      notifee.getInitialNotification().then(async (initialNotification) => {
        if (initialNotification) {
          console.log('Notifee initial notification opened:', initialNotification);
          const orderData = initialNotification.notification?.data || {};
          await handleNotificationTap(orderData, true);
        }
      });

      // 5. Notifee Notification Interaction Listener (navigates to notifications/alerts page)
      unsubscribeNotifee = notifee.onForegroundEvent(async ({ type, detail }) => {
        const orderData = detail.notification?.data || {};
        const orderId = orderData?.orderId || orderData?._id;
        if (type === EventType?.PRESS || type === EventType?.ACTION_PRESS) {
          await handleNotificationTap(orderData, false);
        } else if (type === EventType?.DISMISSED) {
          if (orderId) markOrderAsNotified(orderId);
        }
      });
    }

    return () => {
      unsubscribeFCM();
      unsubscribeFCMTap();
      unsubscribeNotifee();
    };
  }, [router, addIncomingOrderOptimistic, fetchGlobalOrders, switchRestaurant]);

  const hideNavbarOn = ['/login'];
  const isNavbarVisible = !hideNavbarOn.includes(pathname) && pathname !== '/';

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1, backgroundColor: '#F7F7EB' }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#F7F7EB' },
            animation: 'none',
            freezeOnBlur: false,
            detachInactiveScreens: false,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="home" />
          <Stack.Screen name="orders" />
          <Stack.Screen name="tracker" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="contact" />
          <Stack.Screen name="rejectedorders" />
          <Stack.Screen name="myreviews" />
          <Stack.Screen name="invoice" />
          <Stack.Screen name="restaurantprofile" />
          <Stack.Screen name="payments" />
          <Stack.Screen name="mymenu" />
          <Stack.Screen name="notifications" />
        </Stack>
        <CustomLoader
          visible={isSwitchingRestaurant}
          title="Switching Restaurant..."
          subtitle="Updating live branch data"
          overlay={true}
        />
        {isNavbarVisible && <BottomNavbar />}
        {isNavbarVisible && <BatteryOptimizationModal />}
      </View>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Provider store={store}>
        <OrdersProvider>
          <AppLayout />
        </OrdersProvider>
      </Provider>
    </SafeAreaProvider>
  );
}

