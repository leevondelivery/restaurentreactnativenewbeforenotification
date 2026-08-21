import {
  acceptOrder as apiAcceptOrder,
  rejectOrder as apiRejectOrder,
  fetchAcceptedByRestaurants,
  fetchAcceptedOrders,
  fetchIncomingOrdersContext,
  insertPendingPayment,
  updateOrderPrepStatus,
} from '@/services/api';
import { displayOrderNotification, extractRestId, isOrderNotified, markOrderAsNotified, stopOrderNotificationSound } from '@/services/NotificationService';
import { playOrderSound } from '@/services/soundService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

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
    name: '',
    phone: '',
    gstin: '37AANFL1602Q1ZW',
    commission: 0,
    address: '',
    fssai: '',
    lat: null,
    lng: null,
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

      const name =
        parsedUser?.name ||
        parsedUser?.restaurantName ||
        parsedUser?.restName ||
        '';

      const phone =
        parsedUser?.phone ||
        parsedUser?.mobileNumber ||
        parsedUser?.mobile ||
        parsedUser?.contactNumber ||
        parsedUser?.mobileNo ||
        parsedUser?.phoneNumber ||
        '';

      const gstin =
        parsedUser?.gstin ||
        parsedUser?.gst ||
        parsedUser?.gstNumber ||
        '37AANFL1602Q1ZW';

      let commission = 0;
      let hasUserComm = false;
      if (parsedUser && typeof parsedUser === 'object') {
        const candKeys = [
          'commission',
          'commissionRate',
          'commission_rate',
          'commissionPercent',
          'commission_percent',
          'commissionPercentage',
          'adminCommission',
          'restaurantCommission',
          'commRate',
          'comm',
        ];
        for (const k of candKeys) {
          if (parsedUser[k] !== undefined && parsedUser[k] !== null && parsedUser[k] !== '') {
            const val = Number(parsedUser[k]);
            if (!isNaN(val)) {
              commission = val;
              hasUserComm = true;
              break;
            }
          }
        }
      }

      if (!hasUserComm && storedCommission !== null && storedCommission !== undefined && storedCommission !== '') {
        const val = Number(storedCommission);
        if (!isNaN(val) && val > 0) {
          commission = val;
        }
      }

      if (commission === 0) {
        commission = 5;
      }

      await AsyncStorage.setItem('commission', String(commission));
      if (parsedUser) {
        parsedUser.commission = commission;
        parsedUser.commissionRate = commission;
        await AsyncStorage.setItem('userData', JSON.stringify(parsedUser));
      }

      const address =
        storedAddress ||
        parsedUser?.address ||
        parsedUser?.restAddress ||
        parsedUser?.restaurantAddress ||
        parsedUser?.restLocation ||
        parsedUser?.restaurantLocation ||
        parsedUser?.location ||
        '';

      const fssai = storedFssai || parsedUser?.fssai || '';

      const lat =
        storedLat !== null && storedLat !== undefined && storedLat !== ''
          ? Number(storedLat)
          : (parsedUser?.lat !== undefined && parsedUser?.lat !== null
            ? Number(parsedUser.lat)
            : (parsedUser?.latitude !== undefined && parsedUser?.latitude !== null
              ? Number(parsedUser.latitude)
              : null));

      const lng =
        storedLng !== null && storedLng !== undefined && storedLng !== ''
          ? Number(storedLng)
          : (parsedUser?.lng !== undefined && parsedUser?.lng !== null
            ? Number(parsedUser.lng)
            : (parsedUser?.longitude !== undefined && parsedUser?.longitude !== null
              ? Number(parsedUser.longitude)
              : null));

      const info = {
        restId,
        name,
        phone,
        gstin,
        commission,
        address,
        fssai,
        lat,
        lng,
      };

      setRestaurantInfo(info);
      return info;
    } catch (err) {
      console.error('OrdersContext: Error loading stored restaurant info:', err);
      return restaurantInfo;
    }
  }, []);

  // Ensure restaurant identity is loaded on mount
  useEffect(() => {
    loadRestaurantInfo();
  }, [loadRestaurantInfo]);

  // Fetch both accepted orders and incoming orders from API
  const fetchGlobalOrders = useCallback(async (isPolling = false) => {
    if (!isPolling) {
      setLoading(true);
    }

    try {
      // Ensure restaurant identity & commission context state refreshes for current logged-in user
      await loadRestaurantInfo();

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
        setOrders([]);
        setTrackerOrders([]);
        setIncomingOrders([]);
        setIncomingCount(0);
        try {
          stopOrderNotificationSound();
        } catch (e) {}
        return;
      }

      let acceptedOrdersData = [];
      let rawTrack = [];
      let incomingData = null;

      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);

        const [resAccepted, resTrack, resIncoming] = await Promise.allSettled([
          fetchAcceptedOrders(restId, controller.signal),
          fetchAcceptedByRestaurants(restId, controller.signal),
          fetchIncomingOrdersContext(restId, controller.signal),
        ]);
        clearTimeout(tid);

        if (resAccepted.status === 'fulfilled' && resAccepted.value && resAccepted.value.ok) {
          try {
            const json = await resAccepted.value.json();
            acceptedOrdersData = json.orders || json.data || (Array.isArray(json) ? json : []);
          } catch (e) {}
        }

        if (resTrack.status === 'fulfilled' && resTrack.value && resTrack.value.ok) {
          try {
            const jsonTrack = await resTrack.value.json();
            rawTrack = jsonTrack.orders || jsonTrack.data || (Array.isArray(jsonTrack) ? jsonTrack : []);
          } catch (e) {}
        }

        if (resIncoming.status === 'fulfilled' && resIncoming.value && resIncoming.value.ok) {
          try {
            const jsonIncoming = await resIncoming.value.json();
            incomingData = jsonIncoming.orders || jsonIncoming.incomingOrders || (Array.isArray(jsonIncoming) ? jsonIncoming : null);
          } catch (e) {}
        }
      } catch (err) {
        // Parallel fetch error fallback
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

      const filteredTrack = rawTrack.filter((o) => {
        if (!o) return false;
        const oRestId = String(
          o.restaurantId ||
          o.restId ||
          o.restaurant_id ||
          o.storeId ||
          o.vendorId ||
          (o.restaurant && typeof o.restaurant === 'object' ? (o.restaurant.restId || o.restaurant.id || o.restaurant._id) : o.restaurant) ||
          ''
        ).trim();
        if (restId) {
          return oRestId.toLowerCase() === String(restId).trim().toLowerCase();
        }
        return true;
      });
      setTrackerOrders(filteredTrack);

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

  // Optimistically insert incoming order from FCM push notification payload directly into state (0ms instant display)
  const addIncomingOrderOptimistic = useCallback((orderData) => {
    if (!orderData) return;
    const orderId = String(orderData.orderId || orderData._id || orderData.id || '');
    if (!orderId) return;

    setIncomingOrders((prev) => {
      const exists = prev.some((o) => String(o.orderId || o._id || o.id || '') === orderId);
      if (exists) return prev;

      let itemsParsed = orderData.items;
      if (typeof itemsParsed === 'string') {
        try {
          itemsParsed = JSON.parse(itemsParsed);
        } catch (e) {}
      }

      const normalizedOrder = {
        _id: orderId,
        orderId: orderId,
        grandTotal: orderData.grandTotal || orderData.totalPrice || orderData.amount || '0',
        totalPrice: orderData.totalPrice || orderData.grandTotal || orderData.amount || '0',
        userName: orderData.userName || orderData.customerName || orderData.name || 'Customer',
        userPhone: orderData.userPhone || orderData.phone || orderData.mobileNumber || '',
        items: Array.isArray(itemsParsed) ? itemsParsed : [],
        createdAt: orderData.createdAt || new Date().toISOString(),
        ...orderData,
      };

      return [normalizedOrder, ...prev];
    });

    setIncomingCount((prev) => prev + 1);
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
        const isReady = Number(prepMins) === 0;
        const initialStatus = isReady ? 'Ready' : 'Preparing';

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
          prepTime: prepMins,
          remainingPrepTimeMins: prepMins,
          acceptedAt: acceptedAtStr,
          estimatedPrepEndTime: estimatedPrepEndTimeStr,
          status: initialStatus,
          orderStatus: initialStatus,
          isReady: isReady,
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
          status: 'Pending Clearance',
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
          prepTime: prepMins,
          remainingPrepTimeMins: prepMins,
          estimatedPrepEndTime: estimatedPrepEndTimeStr,
          status: initialStatus,
          orderStatus: initialStatus,
          isReady: isReady,
        };

        setOrders((prev) => [newlyAcceptedOrder, ...prev.filter((o) => String(o._id || o.orderId) !== idStr && String(o._id || o.orderId) !== altIdStr)]);
        setTrackerOrders((prev) => [newlyAcceptedOrder, ...prev.filter((o) => String(o._id || o.orderId) !== idStr && String(o._id || o.orderId) !== altIdStr)]);

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

  // Mark Order as Items Ready Flow (Syncs to MongoDB immediately)
  const markOrderAsReady = useCallback(async (targetOrderOrId) => {
    try {
      let targetId = '';
      let altTargetId = '';
      if (typeof targetOrderOrId === 'object' && targetOrderOrId !== null) {
        targetId = String(targetOrderOrId.orderId || targetOrderOrId._id || targetOrderOrId.id || '').trim();
        altTargetId = String(targetOrderOrId._id || targetOrderOrId.orderId || '').trim();
      } else {
        targetId = String(targetOrderOrId || '').trim();
      }

      if (!targetId) return { success: false, error: 'No order ID provided' };

      const readyAtStr = new Date().toISOString();

      const updatePayload = {
        orderId: targetId,
        _id: targetId,
        preparationTime: 0,
        prepTime: 0,
        remainingPrepTimeMins: 0,
        status: 'Ready',
        orderStatus: 'Ready',
        isReady: true,
        readyAt: readyAtStr,
      };

      // Fire API update to MongoDB
      try {
        await updateOrderPrepStatus(updatePayload);
      } catch (err) {
        console.warn('OrdersContext: markOrderAsReady API call warning:', err);
      }

      // Update local state immediately
      const updateOrderState = (prevList) =>
        prevList.map((o) => {
          if (!o) return o;
          const oId1 = String(o._id || '').trim();
          const oId2 = String(o.orderId || '').trim();
          if (
            (targetId && (oId1 === targetId || oId2 === targetId)) ||
            (altTargetId && (oId1 === altTargetId || oId2 === altTargetId))
          ) {
            return {
              ...o,
              preparationTime: 0,
              prepTime: 0,
              remainingPrepTimeMins: 0,
              status: 'Ready',
              orderStatus: 'Ready',
              isReady: true,
              readyAt: readyAtStr,
            };
          }
          return o;
        });

      setOrders(updateOrderState);
      setTrackerOrders(updateOrderState);

      return { success: true };
    } catch (err) {
      console.error('OrdersContext: markOrderAsReady error:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Setup 1-Minute Periodic Timer Sync to MongoDB for remainingPrepTimeMins & status
  const syncTimerRef = useRef(null);
  useEffect(() => {
    syncTimerRef.current = setInterval(async () => {
      if (!orders || orders.length === 0) return;
      const nowMs = Date.now();

      for (const ord of orders) {
        if (!ord) continue;
        const statusVal = String(ord.status || ord.orderStatus || '').toLowerCase();
        if (statusVal === 'ready' || ord.isReady) continue;

        const acceptedAtMs = ord.acceptedAt ? new Date(ord.acceptedAt).getTime() : nowMs;
        const prepMins = Number(ord.preparationTime ?? ord.prepTime ?? 15);
        const estimatedPrepEndTimeMs = ord.estimatedPrepEndTime
          ? new Date(ord.estimatedPrepEndTime).getTime()
          : acceptedAtMs + prepMins * 60000;

        const remainingMins = Math.max(0, Math.ceil((estimatedPrepEndTimeMs - nowMs) / 60000));
        const isExpired = remainingMins <= 0;
        const newStatus = isExpired ? 'Ready' : 'Preparing';
        const targetId = String(ord.orderId || ord._id || '');

        if (targetId) {
          const updatePayload = isExpired
            ? {
              orderId: targetId,
              preparationTime: 0,
              status: 'Ready',
              orderStatus: 'Ready',
              isReady: true,
              readyAt: new Date().toISOString(),
            }
            : {
              orderId: targetId,
              preparationTime: remainingMins,
            };

          try {
            await updateOrderPrepStatus(updatePayload);
          } catch (e) { }

          // Update state locally if expired
          if (isExpired) {
            markOrderAsReady(targetId);
          }
        }
      }
    }, 60000);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [orders, markOrderAsReady]);

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
        loadRestaurantInfo,
        refreshRestaurantInfo: loadRestaurantInfo,
        fetchGlobalOrders,
        addIncomingOrderOptimistic,
        acceptOrder,
        rejectOrder,
        markOrderAsReady,
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
