import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  fetchAcceptedOrders,
  fetchAcceptedByRestaurants,
  fetchIncomingOrdersContext,
  rejectOrder as apiRejectOrder,
  acceptOrder as apiAcceptOrder,
  insertPendingPayment,
} from '@/services/api';
import { stopOrderNotificationSound, displayOrderNotification, extractRestId, markOrderAsNotified, isOrderNotified } from '@/services/NotificationService';
import { playOrderSound } from '@/services/soundService';

const OrdersContext = createContext();

export const getBaseApiUrl = () => BASE_URL;

export const OrdersProvider = ({ children }) => {
  // Data from 'accepted orders' (acceptedorders) collection -> used in /tracker
  const [orders, setOrders] = useState([]); 
  // Data from 'acceptedbyrestaurent' (acceptedbyrestorents) collection -> used in /orders
  const [trackerOrders, setTrackerOrders] = useState([]); 
  const [incomingOrders, setIncomingOrders] = useState([]); // Pending incoming orders
  const [incomingCount, setIncomingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const seenIncomingIdsRef = useRef(new Set());
  const isInitialFetchRef = useRef(true);
  const [restaurantInfo, setRestaurantInfo] = useState({
    restId: '',
    commission: 12,
    address: 'Nandyal Road, Kurnool',
    fssai: '12345678901234',
    lat: 15.83,
    lng: 78.01,
  });

  const pollingTimerRef = useRef(null);
  const processedOrderIdsRef = useRef(new Set());

  // Load stored restaurant identity & commission from AsyncStorage
  const loadRestaurantInfo = useCallback(async () => {
    try {
      const storedUserStr = await AsyncStorage.getItem('userData');
      const storedRestId = await AsyncStorage.getItem('restId');
      const storedCommission = await AsyncStorage.getItem('commission');
      const storedAddress = await AsyncStorage.getItem('address');
      const storedFssai = await AsyncStorage.getItem('fssai');
      const storedLat = await AsyncStorage.getItem('lat');
      const storedLng = await AsyncStorage.getItem('lng');

      let parsedUser = null;
      if (storedUserStr) {
        try {
          parsedUser = JSON.parse(storedUserStr);
        } catch (e) {
          console.warn('OrdersContext: Failed to parse userData');
        }
      }

      const restId =
        storedRestId ||
        parsedUser?.restId ||
        parsedUser?.restaurantId ||
        parsedUser?.restaurant_id ||
        parsedUser?._id ||
        '';

      const commission =
        storedCommission !== null
          ? Number(storedCommission)
          : parsedUser?.commission ?? 12;

      const address =
        storedAddress ||
        parsedUser?.address ||
        parsedUser?.restLocation ||
        'Nandyal Road, Kurnool';

      const fssai = storedFssai || parsedUser?.fssai || '12345678901234';
      const lat = storedLat ? Number(storedLat) : parsedUser?.lat ?? 15.83;
      const lng = storedLng ? Number(storedLng) : parsedUser?.lng ?? 78.01;

      setRestaurantInfo({
        restId,
        commission,
        address,
        fssai,
        lat,
        lng,
      });

      return { restId, commission, address, fssai, lat, lng };
    } catch (err) {
      console.error('OrdersContext: Error loading stored restaurant info:', err);
      return restaurantInfo;
    }
  }, []);

  // Fetch both accepted orders and incoming orders from API
  const fetchGlobalOrders = useCallback(async (isPolling = false) => {
    if (!isPolling) {
      setLoading(true);
    }

    try {
      const storedUserStr = await AsyncStorage.getItem('userData');
      const storedRestId = await AsyncStorage.getItem('restId');
      let restId = storedRestId || '';
      if (storedUserStr) {
        try {
          const u = JSON.parse(storedUserStr);
          restId =
            storedRestId ||
            u?.restId ||
            u?.restaurantId ||
            u?.restaurant_id ||
            u?._id ||
            '';
        } catch (e) { }
      }

      if (!restId) {
        if (!isPolling) {
          setLoading(false);
        }
        return;
      }

      let acceptedOrdersData = [];
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        const res = await fetchAcceptedOrders(restId, controller.signal);
        clearTimeout(tid);
        if (res.ok) {
          const json = await res.json();
          acceptedOrdersData = json.orders || json.data || (Array.isArray(json) ? json : []);
        }
      } catch (err) {
        // Network timeout / offline fallback
      }

      const filteredAccepted = acceptedOrdersData.filter((o) => {
        if (!o) return false;
        const oRestId = String(
          o.restaurantId ||
          o.restId ||
          o.restaurant_id ||
          o.storeId ||
          o.vendorId ||
          (o.restaurant && (typeof o.restaurant === 'object' ? (o.restaurant.restId || o.restaurant.id || o.restaurant._id) : o.restaurant)) ||
          (o.restaurantDetails && (typeof o.restaurantDetails === 'object' ? (o.restaurantDetails.restId || o.restaurantDetails.id || o.restaurantDetails._id) : '')) ||
          ''
        ).trim();

        if (oRestId && restId) {
          return oRestId.toLowerCase() === String(restId).trim().toLowerCase();
        }
        return !restId;
      });

      setOrders(filteredAccepted);
      filteredAccepted.forEach((o) => {
        if (o._id) processedOrderIdsRef.current.add(String(o._id));
        if (o.orderId) processedOrderIdsRef.current.add(String(o.orderId));
      });

      // 1b. Fetch Tracker Orders from acceptedbyrestorents
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        const resTrack = await fetchAcceptedByRestaurants(restId, controller.signal);
        clearTimeout(tid);
        if (resTrack.ok) {
          const jsonTrack = await resTrack.json();
          const rawTrack = jsonTrack.orders || jsonTrack.data || (Array.isArray(jsonTrack) ? jsonTrack : []);
          const filteredTrack = rawTrack.filter((o) => {
            if (!o) return false;
            const oRestId = String(
              o.restaurantId ||
              o.restId ||
              o.restaurant_id ||
              o.storeId ||
              o.vendorId ||
              ''
            ).trim();
            if (oRestId && restId) {
              return oRestId.toLowerCase() === String(restId).trim().toLowerCase();
            }
            return true;
          });
          setTrackerOrders(filteredTrack);
        }
      } catch (errTrack) {}

      // 2. Fetch Incoming Orders
      let incomingData = null;
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        const res = await fetchIncomingOrdersContext(restId, controller.signal);
        clearTimeout(tid);
        if (res.ok) {
          const json = await res.json();
          incomingData = json.orders || json.incomingOrders || (Array.isArray(json) ? json : null);
        }
      } catch (err) {
        // Network failure
      }

      if (Array.isArray(incomingData) && incomingData.length > 0) {
        // Filter by restaurantId match and filter out any orders processed locally
        const filteredIncoming = incomingData.filter((o) => {
          if (restId) {
            const oRestId =
              extractRestId(o.restaurantId) ||
              extractRestId(o.restId) ||
              extractRestId(o.restaurant_id) ||
              extractRestId(o.storeId) ||
              extractRestId(o.vendorId) ||
              extractRestId(o.restaurant);
            if (oRestId && oRestId !== String(restId).trim().toLowerCase()) return false;
          }
          const id1 = String(o._id || '');
          const id2 = String(o.orderId || '');
          return !processedOrderIdsRef.current.has(id1) && !processedOrderIdsRef.current.has(id2);
        });

        // Detect newly arrived orders to trigger in-app custom sound & heads-up banner
        filteredIncoming.forEach((ord) => {
          const key = String(ord._id || ord.orderId || '');
          if (key) {
            const alreadyNotified = seenIncomingIdsRef.current.has(key) || isOrderNotified(key);
            seenIncomingIdsRef.current.add(key);
            markOrderAsNotified(key);

            if (!alreadyNotified && !isInitialFetchRef.current) {
              displayOrderNotification(ord, true);
            }
          }
        });

        // Ensure continuous in-app sound loop plays until all incoming orders are accepted or rejected
        if (filteredIncoming.length > 0) {
          playOrderSound();
        } else {
          stopOrderNotificationSound();
        }

        if (isInitialFetchRef.current) {
          isInitialFetchRef.current = false;
        }

        setIncomingOrders(filteredIncoming);
        setIncomingCount(filteredIncoming.length);
      } else {
        stopOrderNotificationSound();
        setIncomingOrders((prev) => {
          const filtered = prev.filter((o) => {
            const id1 = String(o._id || '');
            const id2 = String(o.orderId || '');
            return !processedOrderIdsRef.current.has(id1) && !processedOrderIdsRef.current.has(id2);
          });
          setIncomingCount(filtered.length);
          return filtered;
        });
      }
    } catch (err) {
      console.error('OrdersContext: fetchGlobalOrders error:', err);
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, []);

  // Reject Order Flow
  const rejectOrder = useCallback(
    async (orderId) => {
      try {
        const idStr = String(orderId);
        processedOrderIdsRef.current.add(idStr);

        try {
          await apiRejectOrder(orderId, undefined, undefined);
        } catch (err) {
          console.warn('OrdersContext: rejectOrder API call warning:', err);
        }

        // Locally update state & stop ringing sound
        stopOrderNotificationSound(orderId);
        setIncomingOrders((prev) => prev.filter((o) => String(o.orderId || o._id) !== idStr));
        setIncomingCount((prev) => Math.max(0, prev - 1));

        return { success: true };
      } catch (err) {
        console.error('OrdersContext: rejectOrder error:', err);
        return { success: false, error: err.message };
      }
    },
    []
  );

  // Accept Order & Preparation Time Flow
  const acceptOrder = useCallback(
    async (targetOrder, prepMins) => {
      try {
        const orderIdVal =
          targetOrder.orderId ||
          targetOrder.order_id ||
          targetOrder.displayOrderId ||
          targetOrder.customOrderId ||
          targetOrder.orderNumber ||
          targetOrder._id ||
          'MONGODB_OBJECT_ID';
        const idStr = String(orderIdVal);
        const altIdStr = String(targetOrder.orderId || targetOrder._id || '');

        processedOrderIdsRef.current.add(idStr);
        if (altIdStr) processedOrderIdsRef.current.add(altIdStr);

        // Read restaurantId & restaurantName fresh from AsyncStorage
        let asyncRestId = restaurantInfo.restId || '';
        let asyncRestName = targetOrder.restaurantName || restaurantInfo.address || '';
        try {
          const storedRestId = await AsyncStorage.getItem('restId');
          const storedUserStr = await AsyncStorage.getItem('userData');
          if (storedRestId) asyncRestId = storedRestId;
          if (storedUserStr) {
            const u = JSON.parse(storedUserStr);
            asyncRestId = storedRestId ||
              u?.restId ||
              u?.restaurantId ||
              u?.restaurant_id ||
              u?._id ||
              asyncRestId;
            asyncRestName =
              u?.name ||
              u?.restaurantName ||
              u?.restName ||
              asyncRestName;
          }
        } catch (_e) {
          console.warn('OrdersContext: could not read restId/userData from AsyncStorage');
        }

        const acceptedAtStr = new Date().toISOString();
        const estimatedPrepEndTimeStr = new Date(Date.now() + prepMins * 60000).toISOString();

        const payload = {
          orderId: orderIdVal,
          restaurantId: String(asyncRestId),
          restId: String(asyncRestId),
          restaurant_id: String(asyncRestId),
          rest: restaurantInfo.address,
          restaurantLocation: {
            lat: restaurantInfo.lat,
            lng: restaurantInfo.lng,
          },
          razorpayOrderId: targetOrder.razorpayOrderId || 'order_T4fAtetGb5u6c9',
          preparationTime: prepMins,
          acceptedAt: acceptedAtStr,
          estimatedPrepEndTime: estimatedPrepEndTimeStr,
        };

        // 1. Fire accept-order — errors here do NOT block pendingpayments
        try {
          await apiAcceptOrder(payload);
        } catch (err) {
          console.warn('OrdersContext: acceptOrder API call warning:', err);
        }

        // grossTotal = totalPrice (raw order amount before commission)
        // grandTotal = totalPriceAfterCommission sent by backend (what restaurant earns)
        // totalCommissionCut = the commission amount deducted (what platform takes)
        const grossTotal = Number(targetOrder.totalPrice || 0);
        const commissionRate = Number(
          targetOrder.commissionRate || restaurantInfo.commission || 0
        );
        const calculatedGrandTotal = commissionRate > 0
          ? parseFloat((grossTotal * (1 - commissionRate / 100)).toFixed(2))
          : grossTotal;
        const grandTotal = Number(
          targetOrder.totalPriceAfterCommission ?? targetOrder.netEarnings ?? calculatedGrandTotal
        );
        const totalCommissionCut = parseFloat((grossTotal - grandTotal).toFixed(2));

        const pendingPayload = {
          restaurantId: String(asyncRestId),
          restaurantName: asyncRestName,
          grossTotal,   // totalPrice from the order
          grandTotal,   // totalPriceAfterCommission from the order (after commission deduction)
          commissionRate,
          totalCommissionCut,
          date: acceptedAtStr,
        };

        console.log('pendingpayments payload being sent:', JSON.stringify(pendingPayload));

        try {
          const ppRes = await insertPendingPayment(pendingPayload);
          const ppData = await ppRes.json();
          if (!ppRes.ok) {
            console.error('pendingpayments FAILED — HTTP', ppRes.status, JSON.stringify(ppData));
          } else {
            console.log('pendingpayments SUCCESS:', ppData);
          }
        } catch (ppErr) {
          console.error('pendingpayments ERROR (network/timeout):', ppErr.message, '\nPayload was:', JSON.stringify(pendingPayload));
        }

        // Create accepted order record locally for immediate feedback
        const newlyAcceptedOrder = {
          ...targetOrder,
          acceptedAt: acceptedAtStr,
          preparationTime: prepMins,
          estimatedPrepEndTime: estimatedPrepEndTimeStr,
          status: 'Preparing',
        };

        setOrders((prev) => [newlyAcceptedOrder, ...prev.filter((o) => String(o._id || o.orderId) !== idStr && String(o._id || o.orderId) !== altIdStr)]);
        // Locally remove from incoming list & stop ringing sound
        stopOrderNotificationSound(orderIdVal);
        stopOrderNotificationSound(altIdStr);
        setIncomingOrders((prev) => prev.filter((o) => String(o._id || o.orderId) !== idStr && String(o.orderId || '') !== altIdStr));
        setIncomingCount((prev) => Math.max(0, prev - 1));

        return { success: true };
      } catch (err) {
        console.error('OrdersContext: acceptOrder error:', err);
        return { success: false, error: err.message };
      }
    },
    [restaurantInfo]
  );

  // Setup 5-second background polling loop
  useEffect(() => {
    loadRestaurantInfo().then(() => {
      fetchGlobalOrders(false);
    });

    pollingTimerRef.current = setInterval(() => {
      fetchGlobalOrders(true);
    }, 5000);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [loadRestaurantInfo, fetchGlobalOrders]);

  // Manage in-app native looping notification sound based on incomingOrders state
  useEffect(() => {
    if (incomingOrders.length > 0) {
      if (AppState.currentState === 'active') {
        playOrderSound();
      }
    } else {
      stopOrderNotificationSound();
    }
  }, [incomingOrders.length]);

  // When app returns to active foreground and incoming orders exist, resume looping sound
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && incomingOrders.length > 0) {
        playOrderSound();
      } else if (nextAppState !== 'active') {
        stopOrderNotificationSound();
      }
    });
    return () => sub.remove();
  }, [incomingOrders.length]);

  return (
    <OrdersContext.Provider
      value={{
        orders,
        acceptedOrders: orders,
        trackerOrders,
        acceptedByRestaurantsOrders: trackerOrders,
        incomingOrders,
        incomingCount,
        loading,
        restaurantInfo,
        fetchGlobalOrders,
        acceptOrder,
        rejectOrder,
        setIncomingOrders,
        setIncomingCount,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
};

export const useOrders = () => {
  const context = useContext(OrdersContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
};

export default OrdersContext;
