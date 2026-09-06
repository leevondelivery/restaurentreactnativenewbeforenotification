// Web stub — @react-native-firebase and notifee are not supported on web.
// This file is automatically used by Metro bundler on web platform instead of NotificationService.js

import { playOrderSound, stopOrderSoundNative } from './soundService';

const dismissedOrderIds = new Set();
const notifiedOrderIds = new Set();

export const extractRestId = (obj) => {
  if (!obj) return '';
  if (typeof obj === 'string' || typeof obj === 'number') return String(obj).trim().toLowerCase();
  if (typeof obj === 'object') {
    return String(obj.restId || obj.restaurantId || obj._id || obj.id || '').trim().toLowerCase();
  }
  return '';
};

export const isOrderDismissed = (orderId) => {
  if (!orderId) return false;
  return dismissedOrderIds.has(String(orderId));
};

export const markOrderAsDismissed = (orderId) => {
  if (!orderId) return;
  dismissedOrderIds.add(String(orderId));
};

export const isOrderNotified = (orderId) => {
  if (!orderId) return false;
  return notifiedOrderIds.has(String(orderId));
};

export const markOrderAsNotified = (orderId) => {
  if (!orderId) return;
  notifiedOrderIds.add(String(orderId));
};

export const displayOrderNotification = async (orderData, isForeground = false) => {
  try {
    const orderId = String(orderData?.orderId || orderData?._id || 'NEW');
    if (orderId && orderId !== 'NEW') {
      if (isOrderNotified(orderId)) {
        await playOrderSound();
        return;
      }
      markOrderAsNotified(orderId);
    }
    await playOrderSound();
  } catch (err) {
    console.error('Error in web displayOrderNotification:', err);
  }
};

export const stopOrderNotificationSound = async (orderId) => {
  try {
    if (orderId) {
      markOrderAsDismissed(orderId);
    }
    await stopOrderSoundNative();
  } catch (err) {
    console.error('Error in web stopOrderNotificationSound:', err);
  }
};

export const setupNotificationChannel = async () => {};
export const initFCMToken = async () => {};
export const clearFCMTokenOnLogout = async () => {};
