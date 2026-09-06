import { BASE_URL } from '@/constants/api';

/**
 * Central API service - all backend calls go through here.
 * Import individual functions in screens instead of calling fetch directly.
 */

const DEFAULT_TIMEOUT_MS = 25000;

/** Abortable fetch helper with built-in timeout */
const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  if (typeof options === 'number') {
    timeoutMs = options;
    options = {};
  }
  const controller = new AbortController();
  let timedOut = false;
  const tid = setTimeout(() => {
    timedOut = true;
    try {
      controller.abort();
    } catch (_) { }
  }, timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => {
        try {
          controller.abort();
        } catch (_) { }
      }, { once: true });
    }
  }

  return fetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (timedOut || err.name === 'AbortError') {
        const timeoutError = new Error(`Request to ${url} timed out after ${timeoutMs / 1000}s`);
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      throw err;
    })
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
  fetchWithTimeout(BASE_URL + '/api/orders/acceptedbyrestorents?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal }, 10000);

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

export const updateOrderPrepStatus = async (payload) => {
  try {
    const res = await fetchWithTimeout(BASE_URL + '/api/orders/update-status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return res;
  } catch (e) { }

  return fetchWithTimeout(BASE_URL + '/api/orders/accept-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

// Payments

export const fetchPayments = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/payments?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal });

export const fetchPendingPayments = (restaurantId, signal) =>
  fetch(BASE_URL + '/api/pendingpayments?restaurantId=' + encodeURIComponent(restaurantId || ''), { signal });

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

export const fetchRestaurantStatus = async (restaurantId, phone, userId, signal) => {
  try {
    const res = await fetchWithTimeout(BASE_URL + '/api/users', { signal }, 8000);
    if (!res.ok) return null;
    const data = await res.json();
    const users = Array.isArray(data.users) ? data.users : [];
    const targetRestId = String(restaurantId || '').trim().toLowerCase();
    const targetPhone = String(phone || '').trim().toLowerCase();
    const targetUserId = String(userId || '').trim().toLowerCase();

    const match = users.find((u) => {
      const uRestId = String(u.restId || u.restaurantId || '').trim().toLowerCase();
      const uId = String(u._id || u.id || '').trim().toLowerCase();
      const uPhone = String(u.phone || u.mobileNumber || '').trim().toLowerCase();

      if (targetRestId && (uRestId === targetRestId || uId === targetRestId)) return true;
      if (targetUserId && (uId === targetUserId || uRestId === targetUserId)) return true;
      if (targetPhone && uPhone === targetPhone) return true;
      return false;
    });

    if (match) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          isActive: match.isActive,
          user: match,
        }),
        isActive: match.isActive,
        user: match,
      };
    }
  } catch (e) {
    // Routine polling network hiccup; return null silently and retry on next tick
    return null;
  }
  return null;
};

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
  return fetchWithTimeout(BASE_URL + '/api/menu?' + params.toString(), {}, 30000);
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


