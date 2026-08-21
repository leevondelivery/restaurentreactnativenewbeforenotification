import BatteryOptimizationModal from '@/components/BatteryOptimizationModal';
import BottomNavbar from '@/components/navbar/BottomNavbar';
import { OrdersProvider, useOrders } from '@/context/OrdersContext';
import store from '@/store/store';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { displayOrderNotification, extractRestId, initFCMToken, markOrderAsNotified, setupNotificationChannel } from '@/services/NotificationService';
import { extractIsActive } from '@/utils/statusUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

// firebase, messaging, notifee are native-only — skip on web
let firebase, messaging, notifee, EventType;
if (Platform.OS !== 'web') {
  firebase = require('@react-native-firebase/app').default;
  messaging = require('@react-native-firebase/messaging').default;
  const notifeeModule = require('@notifee/react-native');
  notifee = notifeeModule.default;
  EventType = notifeeModule.EventType;

  if (!firebase.apps || firebase.apps.length === 0) {
    try {
      firebase.initializeApp();
    } catch (e) {
      console.warn('Firebase layout safe init notice:', e);
    }
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
    if (extractIsActive(u) === false) {
      console.log('[FCM Filter] Restaurant status is CLOSED (isActive: false) — skipping push notification & sound.');
      return false;
    }
    const myRestId = String(u?.restId || u?.restaurantId || u?._id || u?.phone || u?.mobileNumber || '').trim().toLowerCase();
    const msgRestId =
      extractRestId(orderData?.restaurantId) ||
      extractRestId(orderData?.restId) ||
      extractRestId(orderData?.restaurant_id) ||
      extractRestId(orderData?.restaurant) ||
      extractRestId(orderData?.storeId) ||
      extractRestId(orderData?.vendorId);

    if (myRestId && msgRestId && myRestId !== msgRestId) {
      console.log(`[FCM Filter] Ignoring push notification for restaurantId "${msgRestId}" (logged in as "${myRestId}")`);
      return false;
    }
  } catch (e) {}
  return true;
};

SplashScreen.preventAutoHideAsync();

function AppLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const router = useRouter();
  const { addIncomingOrderOptimistic, fetchGlobalOrders } = useOrders();

  useEffect(() => {
    SplashScreen.hideAsync();

    if (Platform.OS === 'web') return; // notifications not supported on web

    setupNotificationChannel();

    // Request Android 13+ Notification Permission & Init FCM
    (async () => {
      try {
        await notifee.requestPermission();
        const storedUserStr = await AsyncStorage.getItem('userData');
        if (storedUserStr) {
          const u = JSON.parse(storedUserStr);
          initFCMToken(u);
        }
      } catch (e) {
        console.warn('Error requesting notification permission on launch:', e);
      }
    })();

    // 2. Firebase Foreground Message Handler (runs when app is open/active)
    const unsubscribeFCM = messaging().onMessage(async (remoteMessage) => {
      console.log('FCM Foreground Order Received:', remoteMessage);
      if (remoteMessage) {
        const orderData = remoteMessage.data || remoteMessage.notification || {};
        if (await isForCurrentRestaurant(orderData)) {
          addIncomingOrderOptimistic(orderData);
          await displayOrderNotification(orderData, true);
        }
      }
    });

    // 3. Handle FCM Notification Tap when app is opened from background
    const unsubscribeFCMTap = messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log('Notification opened app from background:', remoteMessage);
      const orderData = remoteMessage?.data || remoteMessage?.notification || {};
      const orderId = orderData?.orderId || orderData?._id;
      if (orderId) markOrderAsNotified(orderId);
      addIncomingOrderOptimistic(orderData);
      fetchGlobalOrders(true);
      router.push('/notifications');
    });

    // 4. Handle Notification Tap when app is launched from killed state (FCM & Notifee)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log('FCM initial notification opened:', remoteMessage);
          const orderData = remoteMessage?.data || remoteMessage?.notification || {};
          const orderId = orderData?.orderId || orderData?._id;
          if (orderId) markOrderAsNotified(orderId);
          addIncomingOrderOptimistic(orderData);
          fetchGlobalOrders(true);
          setTimeout(() => {
            router.replace('/notifications');
          }, 200);
        }
      });

    if (notifee) {
      notifee.getInitialNotification().then((initialNotification) => {
        if (initialNotification) {
          console.log('Notifee initial notification opened:', initialNotification);
          const orderData = initialNotification.notification?.data || {};
          const orderId = orderData?.orderId || orderData?._id;
          if (orderId) markOrderAsNotified(orderId);
          addIncomingOrderOptimistic(orderData);
          fetchGlobalOrders(true);
          setTimeout(() => {
            router.replace('/notifications');
          }, 200);
        }
      });
    }

    // 5. Notifee Notification Interaction Listener (navigates to notifications/alerts page)
    const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
      const orderData = detail.notification?.data || {};
      const orderId = orderData?.orderId || orderData?._id;
      if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
        if (orderId) markOrderAsNotified(orderId);
        addIncomingOrderOptimistic(orderData);
        fetchGlobalOrders(true);
        router.push('/notifications');
      } else if (type === EventType.DISMISSED) {
        if (orderId) markOrderAsNotified(orderId);
      }
    });

    return () => {
      unsubscribeFCM();
      unsubscribeFCMTap();
      unsubscribeNotifee();
    };
  }, [router, addIncomingOrderOptimistic, fetchGlobalOrders]);

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

