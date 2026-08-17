import { BASE_URL } from '@/constants/api';

/**
 * Central API service - all backend calls go through here.
 * Import individual functions in screens instead of calling fetch directly.
 */

const DEFAULT_TIMEOUT_MS = 8000;

/** Abortable fetch helper with built-in timeout */
const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(tid));
};

// Auth

export const loginUser = (email, password, fcmToken) =>
  fetchWithTimeout(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phone: email, mobileNumber: email, password, fcmToken }),
  });

// Orders

export const fetchAcceptedOrders = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/orders/acceptedorders?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal });

export const fetchAcceptedByRestaurants = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/orders/acceptedbyrestorents?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal });

export const fetchIncomingOrders = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/orders/incoming?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal });

export const fetchIncomingOrdersContext = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/orders/incomingorders?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal });

export const fetchRejectedOrders = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/orders/rejected?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal });

export const rejectOrder = (orderId, orderData, commission) =>
  fetchWithTimeout(BASE_URL + '/api/orders/reject-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, orderData, commission }),
  });

export const acceptOrder = (payload) =>
  fetchWithTimeout(BASE_URL + '/api/orders/accept-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// Payments

export const fetchPayments = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/payments?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal });

export const insertPendingPayment = (payload) =>
  fetchWithTimeout(BASE_URL + '/api/pendingpayments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

// Restaurant

export const updateRestaurantStatus = (payload) =>
  fetchWithTimeout(BASE_URL + '/api/restaurant/status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const updateRestaurantTimings = (payload) =>
  fetchWithTimeout(BASE_URL + '/api/restaurant/timings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const fetchRestaurantStats = (restaurantId) =>
  fetchWithTimeout(BASE_URL + '/api/restaurant/stats?restaurantId=' + encodeURIComponent(restaurantId || ''));

// Menu

export const fetchMenu = (restaurantId, name) => {
  const params = new URLSearchParams();
  if (restaurantId) { params.append('restaurantId', restaurantId); params.append('restId', restaurantId); }
  if (name) params.append('name', name);
  return fetchWithTimeout(BASE_URL + '/api/menu?' + params.toString());
};

export const updateMenuItemStatus = (collectionName, itemId, itemStatus) =>
  fetchWithTimeout(BASE_URL + '/api/menu/item-status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collectionName, itemId, itemStatus }),
  });

// Reviews

export const fetchReviews = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/reviews?restaurant_id=' + encodeURIComponent(restaurantId || ''), { signal });

// FCM Push Notifications

export const registerFCMToken = (payload) =>
  fetchWithTimeout(BASE_URL + '/api/restaurant/fcm-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });


