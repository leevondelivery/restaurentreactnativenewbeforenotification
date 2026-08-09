import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const OrdersContext = createContext();

export const MOCK_INCOMING_ORDER = {
  _id: '6a391eaecc05a4f188f982db',
  orderId: 'ORD-00737',
  userId: '6a3579405049fb87f94f96f2',
  userName: 'Customer Name',
  userPhone: '9876543210',
  deliveryAddress: 'House #42, Main Street, Green Valley',
  razorpayOrderId: 'order_T4fAtetGb5u6c9',
  items: [
    {
      itemId: '208',
      name: 'Milk Chocolate Waffle',
      price: 119,
      quantity: 1,
    },
    {
      itemId: '209',
      name: 'Paneer Butter Masala',
      price: 180,
      quantity: 1,
    },
  ],
  totalPrice: 299,
  grandTotal: 335,
  paymentStatus: 'Paid',
  restaurantId: 'demo_rest_101',
  restaurantName: 'Amigoo Noshery',
  orderDate: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

export const getBaseApiUrl = () => {
  let baseUrl = 'http://localhost:5000';
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    baseUrl = `http://${window.location.hostname}:5000`;
  } else {
    const hostUri =
      Constants.expoConfig?.hostUri ||
      Constants.manifest2?.extra?.expoGo?.developer?.tool;
    if (hostUri) {
      const ip = hostUri.split(':')[0];
      if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
        baseUrl = `http://${ip}:5000`;
      }
    }
  }
  return baseUrl;
};

export const OrdersProvider = ({ children }) => {
  const [orders, setOrders] = useState([]); // Accepted / Active preparing orders
  const [incomingOrders, setIncomingOrders] = useState([MOCK_INCOMING_ORDER]); // Pending incoming orders
  const [incomingCount, setIncomingCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [restaurantInfo, setRestaurantInfo] = useState({
    restId: 'demo_rest_101',
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
        'demo_rest_101';

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
      let restId = storedRestId || 'demo_rest_101';
      if (storedUserStr) {
        try {
          const u = JSON.parse(storedUserStr);
          restId =
            storedRestId ||
            u?.restId ||
            u?.restaurantId ||
            u?.restaurant_id ||
            u?._id ||
            'demo_rest_101';
        } catch (e) { }
      }

      const baseUrl = getBaseApiUrl();

      // 1. Fetch Accepted Orders
      const acceptedUrlPrimary = `${baseUrl}/api/orders/acceptedbyrestorents?restaurantId=${encodeURIComponent(restId)}`;
      const acceptedUrlFallback = `${baseUrl}/accepted-orders/${encodeURIComponent(restId)}`;

      let acceptedOrdersData = [];
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        let res = await fetch(acceptedUrlPrimary, { signal: controller.signal });
        clearTimeout(tid);
        if (!res.ok) {
          const controller2 = new AbortController();
          const tid2 = setTimeout(() => controller2.abort(), 4000);
          res = await fetch(acceptedUrlFallback, { signal: controller2.signal });
          clearTimeout(tid2);
        }
        if (res.ok) {
          const json = await res.json();
          acceptedOrdersData = json.orders || json.data || (Array.isArray(json) ? json : []);
        }
      } catch (err) {
        // Network timeout / offline fallback
      }

      if (acceptedOrdersData && acceptedOrdersData.length > 0) {
        const filteredAccepted = restId
          ? acceptedOrdersData.filter((o) => {
            const oRestId = String(
              o.restaurantId || o.restId || o.restaurant_id || o.storeId || o.vendorId || o.restaurant || ''
            ).trim();
            return !oRestId || oRestId === String(restId).trim();
          })
          : acceptedOrdersData;

        setOrders(filteredAccepted);
        // Mark all fetched accepted order IDs as processed
        filteredAccepted.forEach((o) => {
          if (o._id) processedOrderIdsRef.current.add(String(o._id));
          if (o.orderId) processedOrderIdsRef.current.add(String(o.orderId));
        });
      }

      // 2. Fetch Incoming Orders
      const incomingUrlPrimary = `${baseUrl}/api/orders/incomingorders?restaurantId=${encodeURIComponent(restId)}`;
      const incomingUrlFallback = `${baseUrl}/incoming-orders/${encodeURIComponent(restId)}`;

      let incomingData = null;
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4000);
        let res = await fetch(incomingUrlPrimary, { signal: controller.signal });
        clearTimeout(tid);
        if (!res.ok) {
          const controller2 = new AbortController();
          const tid2 = setTimeout(() => controller2.abort(), 4000);
          res = await fetch(incomingUrlFallback, { signal: controller2.signal });
          clearTimeout(tid2);
        }
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
            const oRestId = String(
              o.restaurantId || o.restId || o.restaurant_id || o.storeId || o.vendorId || o.restaurant || ''
            ).trim();
            if (oRestId && oRestId !== String(restId).trim()) return false;
          }
          const id1 = String(o._id || '');
          const id2 = String(o.orderId || '');
          return !processedOrderIdsRef.current.has(id1) && !processedOrderIdsRef.current.has(id2);
        });
        setIncomingOrders(filteredIncoming);
        setIncomingCount(filteredIncoming.length);
      } else {
        // Check if demo mock order should be shown (only if NOT already accepted or rejected)
        const mockId1 = String(MOCK_INCOMING_ORDER._id);
        const mockId2 = String(MOCK_INCOMING_ORDER.orderId);
        const isMockProcessed =
          processedOrderIdsRef.current.has(mockId1) ||
          processedOrderIdsRef.current.has(mockId2);

        if (!isMockProcessed && (restId === 'demo_rest_101' || !storedRestId)) {
          setIncomingOrders([MOCK_INCOMING_ORDER]);
          setIncomingCount(1);
        } else {
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

        const baseUrl = getBaseApiUrl();
        const primaryUrl = `${baseUrl}/api/orders/reject-order`;
        const fallbackUrl = `${baseUrl}/reject-order`;

        try {
          const res = await fetch(primaryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
          });

          if (!res.ok) {
            await fetch(fallbackUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId }),
            });
          }
        } catch (err) {
          console.warn('OrdersContext: rejectOrder API call warning:', err);
        }

        // Locally update state
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
        const orderIdVal = targetOrder._id || targetOrder.orderId || 'MONGODB_OBJECT_ID';
        const idStr = String(orderIdVal);
        const altIdStr = String(targetOrder.orderId || '');

        processedOrderIdsRef.current.add(idStr);
        if (altIdStr) processedOrderIdsRef.current.add(altIdStr);

        const acceptedAtStr = new Date().toISOString();
        const estimatedPrepEndTimeStr = new Date(Date.now() + prepMins * 60000).toISOString();

        const payload = {
          orderId: orderIdVal,
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

        const baseUrl = getBaseApiUrl();
        const primaryUrl = `${baseUrl}/api/orders/accept-order`;
        const fallbackUrl = `${baseUrl}/accept-order`;

        // 1. Fire accept-order — errors here do NOT block pendingpayments
        try {
          const res = await fetch(primaryUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            await fetch(fallbackUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          }
        } catch (err) {
          console.warn('OrdersContext: acceptOrder API call warning:', err);
        }

        // 2. Read restaurantId & restaurantName fresh from AsyncStorage so it
        //    always matches what is stored (same value used to filter payments)
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
          console.warn('OrdersContext: could not read restId/userData from AsyncStorage for pendingpayments');
        }

        // grossTotal = totalPrice (raw order amount before commission)
        // grandTotal = grossTotal - commission% of grossTotal (what restaurant earns)
        // totalCommissionCut = the commission amount deducted (what platform takes)
        const grossTotal = Number(targetOrder.totalPrice || 0);
        const commissionRate = Number(
          targetOrder.commissionRate || restaurantInfo.commission || 0
        );
        const grandTotal = commissionRate > 0
          ? parseFloat((grossTotal * (1 - commissionRate / 100)).toFixed(2))
          : grossTotal;
        const totalCommissionCut = parseFloat((grossTotal - grandTotal).toFixed(2));

        const pendingPayload = {
          restaurantId: String(asyncRestId),
          restaurantName: asyncRestName,
          grossTotal,   // totalPrice from the order
          grandTotal,   // grandTotal from the order (after commission deduction)
          commissionRate,
          totalCommissionCut,
          date: acceptedAtStr,
          orderId: String(targetOrder.orderId || orderIdVal),
        };

        console.log('pendingpayments payload being sent:', JSON.stringify(pendingPayload));

        try {
          const ppRes = await fetch(`${baseUrl}/api/pendingpayments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pendingPayload),
          });
          const ppData = await ppRes.json();
          console.log('pendingpayments response:', ppData);
        } catch (ppErr) {
          console.warn('OrdersContext: pendingpayments insert warning:', ppErr.message);
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
        setIncomingOrders((prev) => prev.filter((o) => String(o._id || o.orderId) !== idStr && String(o._id || o.orderId) !== altIdStr));
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

  return (
    <OrdersContext.Provider
      value={{
        orders,
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
