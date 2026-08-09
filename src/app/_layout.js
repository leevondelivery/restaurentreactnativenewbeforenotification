import React, { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Provider } from 'react-redux';
import BottomNavbar from '@/components/navbar/BottomNavbar';
import store from '@/store/store';
import { OrdersProvider } from '@/context/OrdersContext';

SplashScreen.preventAutoHideAsync();

function AppLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const hideNavbarOn = ['/login'];
  const isNavbarVisible = !hideNavbarOn.includes(pathname) && pathname !== '/';

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <OrdersProvider>
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
        </View>
      </OrdersProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <AppLayout />
    </Provider>
  );
}

