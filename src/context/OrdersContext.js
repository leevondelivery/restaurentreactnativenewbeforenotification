import {
  acceptOrder as apiAcceptOrder,
  rejectOrder as apiRejectOrder,
  fetchAcceptedByRestaurants,
  fetchAcceptedOrders,
  fetchIncomingOrdersContext,
  insertPendingPayment,
  updateOrderPrepStatus,
  fetchAllRestaurants,
} from '@/services/api';
import { displayOrderNotification, extractRestId, isOrderDismissed, isOrderNotified, markOrderAsNotified, stopOrderNotificationSound } from '@/services/NotificationService';
import { playOrderSound } from '@/services/soundService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { BASE_URL } from '@/constants/api';
import { extractIsActive, extractIsActiveStrict } from '@/utils/statusUtils';
import { useDispatch } from 'react-redux';
import { setUser } from '@/store/userSlice';

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
  const [isSwitchingRestaurant, setIsSwitchingRestaurant] = useState(false);
  const isSwitchingRestaurantRef = useRef(false);
  const seenIncomingIdsRef = useRef(new Set());
  const dispatch = useDispatch();
  const isInitialFetchRef = useRef(true);
  const [assignedRestaurants, setAssignedRestaurants] = useState([]);
  const [currentRestId, setCurrentRestId] = useState('');
  const [pendingCountsByRestId, setPendingCountsByRestId] = useState({});
  const assignedRestaurantsRef = useRef([]);
  const currentRestIdRef = useRef('');
  const otherRingingCountRef = useRef(0);

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

  // Load stored restaurant identity, subrestaurants list & commission from AsyncStorage
  const loadRestaurantInfo = useCallback(async () => {
    try {
      const storedUserStr = await AsyncStorage.getItem('userData');
      const storedRestId = await AsyncStorage.getItem('restId');
      const storedSelected = await AsyncStorage.getItem('selectedRestId');
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

      // 1. Resolve restaurant names & profiles from backend /api/users
      let allUsers = [];
      try {
        allUsers = await fetchAllRestaurants();
      } catch (e) {}

      // 2. Identify current user from local storage
      const targetRestId = String(
        storedSelected ||
        storedRestId ||
        parsedUser?.restId ||
        parsedUser?.restaurantId ||
        parsedUser?.restaurant_id ||
        ''
      ).trim();
      const targetUserId = String(parsedUser?._id || parsedUser?.id || '').trim();
      const targetPhone = String(parsedUser?.phone || parsedUser?.mobileNumber || '').trim();
      const targetEmail = String(parsedUser?.email || '').trim().toLowerCase();

      // 3. Find logged-in user and preserve master subrestaurants list
      const parseSubIds = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) {
          return raw.map((x) => String(x).trim()).filter(Boolean);
        }
        if (typeof raw === 'string') {
          return raw.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
        }
        return [];
      };

      // Check cached master sub-restaurant list from storage
      let cachedSub = null;
      try {
        const c = await AsyncStorage.getItem('masterSubrestaurentsId');
        if (c) cachedSub = JSON.parse(c);
      } catch (e) {}

      let subIds = parseSubIds(
        parsedUser?.subrestaurentsId ??
        parsedUser?.subrestaurantsId ??
        parsedUser?.subrestaurents_id ??
        parsedUser?.subrestaurants_id ??
        cachedSub
      );

      // Search all users in DB for the master account that owns subrestaurants
      if (subIds.length === 0) {
        const parentUser = (Array.isArray(allUsers) ? allUsers : []).find((u) => {
          const uSubs = parseSubIds(u.subrestaurentsId || u.subrestaurantsId);
          if (uSubs.length === 0) return false;
          const uRestId = String(u.restId || u.restaurantId || '').trim();
          const uId = String(u._id || u.id || '').trim();
          const uPhone = String(u.phone || u.mobileNumber || '').trim();
          const uEmail = String(u.email || '').trim().toLowerCase();

          return (
            (targetUserId && uId === targetUserId) ||
            (targetPhone && uPhone === targetPhone) ||
            (targetEmail && uEmail === targetEmail) ||
            (targetRestId && (uSubs.includes(targetRestId) || uRestId === targetRestId))
          );
        });

        if (parentUser) {
          subIds = parseSubIds(parentUser.subrestaurentsId || parentUser.subrestaurantsId);
        }
      }

      // Check if ANY user in database has subrestaurants containing targetRestId
      if (subIds.length === 0 && targetRestId) {
        const parentWithBranch = (Array.isArray(allUsers) ? allUsers : []).find((u) => {
          const uSubs = parseSubIds(u.subrestaurentsId || u.subrestaurantsId);
          return uSubs.includes(targetRestId);
        });
        if (parentWithBranch) {
          subIds = parseSubIds(parentWithBranch.subrestaurentsId || parentWithBranch.subrestaurantsId);
        }
      }

      // Save valid subIds into persistent cache so they never get lost
      if (subIds.length > 0) {
        AsyncStorage.setItem('masterSubrestaurentsId', JSON.stringify(subIds)).catch(() => {});
        if (parsedUser) {
          parsedUser = {
            ...parsedUser,
            subrestaurentsId: subIds,
            subrestaurantsId: subIds,
          };
          AsyncStorage.setItem('userData', JSON.stringify(parsedUser)).catch(() => {});
          dispatch(setUser(parsedUser));
        }
      }

      // Collect target restaurant branch IDs (e.g., ["31", "10", "11"])
      const allIds = [];
      subIds.forEach((sid) => {
        const s = String(sid).trim();
        if (s && !allIds.includes(s)) allIds.push(s);
      });

      // If user has no subrestaurentsId, fallback to single account restId
      if (allIds.length === 0 && targetRestId) {
        allIds.push(targetRestId);
      }

      let activeRestId = currentRestIdRef.current || storedSelected || storedRestId || (allIds.length > 0 ? allIds[0] : targetRestId);
      if (allIds.length > 0 && !allIds.includes(activeRestId)) {
        activeRestId = allIds[0];
      }
      if (activeRestId && !currentRestIdRef.current) {
        AsyncStorage.setItem('selectedRestId', activeRestId).catch(() => {});
        AsyncStorage.setItem('restId', activeRestId).catch(() => {});
      }

      let cachedMap = {};
      try {
        const c = await AsyncStorage.getItem('cached_all_restaurants_map');
        if (c) cachedMap = JSON.parse(c);
      } catch (e) {}

      const mappedList = allIds.map((id) => {
        const found = (Array.isArray(allUsers) ? allUsers : []).find(
          (u) =>
            String(u.restId || u.restaurantId || '').trim().toLowerCase() === id.toLowerCase() ||
            String(u._id || '').trim().toLowerCase() === id.toLowerCase()
        );
        const name =
          found?.name ||
          cachedMap[id]?.name ||
          (id === targetRestId ? parsedUser?.name : '') ||
          `Restaurant #${id}`;
        const comm = Number(found?.commission || found?.commissionRate || cachedMap[id]?.commission || 5);
        // CRITICAL: Extract respective restaurant operational status strictly from DB
        const isActiveBool = found ? (extractIsActiveStrict(found) ?? false) : false;
        return {
          restId: id,
          name,
          commission: comm,
          isActive: isActiveBool,
          address: found?.address || found?.location || '',
          phone: found?.phone || '',
          rawUser: found || null,
        };
      });

      setAssignedRestaurants(mappedList);
      assignedRestaurantsRef.current = mappedList;
      if (!currentRestIdRef.current || currentRestIdRef.current !== activeRestId) {
        setCurrentRestId(activeRestId);
        currentRestIdRef.current = activeRestId;
      }

      // Save mapped restaurant names to cache
      if (mappedList.length > 0) {
        const mapToCache = {};
        mappedList.forEach((r) => {
          mapToCache[r.restId] = { name: r.name, commission: r.commission };
        });
        AsyncStorage.setItem('cached_all_restaurants_map', JSON.stringify(mapToCache)).catch(() => {});
      }

      const activeProfile = mappedList.find((r) => String(r.restId).trim().toLowerCase() === String(activeRestId).trim().toLowerCase());

      const restId = activeRestId;
      const name = activeProfile?.name || parsedUser?.name || parsedUser?.restaurantName || `Restaurant #${activeRestId}`;

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

      let commission = activeProfile?.commission || 0;
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

      const branchIsActive = activeProfile?.isActive ?? false;

      await AsyncStorage.setItem('commission', String(commission));
      if (parsedUser) {
        parsedUser = {
          ...parsedUser,
          restId: activeRestId,
          restaurantId: activeRestId,
          name: activeProfile?.name || parsedUser?.name,
          commission,
          commissionRate: commission,
          isActive: branchIsActive,
          is_active: branchIsActive,
          isOpen: branchIsActive,
          is_open: branchIsActive,
          status: branchIsActive ? 'active' : 'closed',
        };
        await AsyncStorage.setItem('userData', JSON.stringify(parsedUser));
        await AsyncStorage.setItem(`activeRestStatus_${activeRestId}`, String(branchIsActive));
        dispatch(setUser(parsedUser));
      }

      const address =
        storedAddress ||
        activeProfile?.address ||
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
        isActive: branchIsActive,
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

  // Instantly re-hydrate cached orders from AsyncStorage on app launch per active restaurant (0ms display)
  useEffect(() => {
    (async () => {
      try {
        const storedRestId = (await AsyncStorage.getItem('selectedRestId')) || (await AsyncStorage.getItem('restId'));
        const restSuffix = storedRestId ? `_${storedRestId}` : '';
        const [cAccepted, cTrack, cIncoming] = await Promise.all([
          AsyncStorage.getItem(`cached_accepted_orders${restSuffix}`) || AsyncStorage.getItem('cached_accepted_orders'),
          AsyncStorage.getItem(`cached_tracker_orders${restSuffix}`) || AsyncStorage.getItem('cached_tracker_orders'),
          AsyncStorage.getItem(`cached_incoming_orders${restSuffix}`) || AsyncStorage.getItem('cached_incoming_orders'),
        ]);
        if (cAccepted) {
          const parsed = JSON.parse(cAccepted);
          if (Array.isArray(parsed) && parsed.length > 0) setOrders(parsed);
        }
        if (cTrack) {
          const parsed = JSON.parse(cTrack);
          if (Array.isArray(parsed) && parsed.length > 0) setTrackerOrders(parsed);
        }
        if (cIncoming) {
          const parsedInc = JSON.parse(cIncoming);
          if (Array.isArray(parsedInc) && parsedInc.length > 0) {
            setIncomingOrders(parsedInc);
            setIncomingCount(parsedInc.length);
          }
        }
      } catch (e) {
        console.warn('OrdersContext: Error loading cached orders from AsyncStorage:', e);
      }
    })();
  }, []);

  // Fetch both accepted orders and incoming orders from API
  const fetchGlobalOrders = useCallback(async (isPolling = false, overrideRestId = null) => {
    // If a restaurant switch is in flight and this is an uncoordinated background poll/FCM, skip
    if (isSwitchingRestaurantRef.current && !overrideRestId) {
      if (!isPolling) setLoading(false);
      return;
    }

    if (!isPolling) {
      setLoading(true);
    }

    try {
      const storedUserStr = await AsyncStorage.getItem('userData');
      const storedSelected = await AsyncStorage.getItem('selectedRestId');
      const storedRestId = await AsyncStorage.getItem('restId');
      let restId = String(overrideRestId || currentRestIdRef.current || storedSelected || storedRestId || '').trim();
      if (!restId && storedUserStr) {
        try {
          const u = JSON.parse(storedUserStr);
          restId = String(
            u?.restId ||
            u?.restaurantId ||
            u?.restaurant_id ||
            u?._id ||
            ''
          ).trim();
        } catch (e) { }
      }

      if (!restId) {
        if (!isPolling) {
          setLoading(false);
        }
        return;
      }

      let acceptedOrdersData = null;
      let rawTrack = null;
      let incomingData = null;

      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000); // 12-second timeout

      try {
        const [resAccepted, resTrack, resIncoming] = await Promise.allSettled([
          fetchAcceptedOrders(restId, controller.signal),
          fetchAcceptedByRestaurants(restId, controller.signal),
          fetchIncomingOrdersContext(restId, controller.signal),
        ]);

        if (resAccepted.status === 'fulfilled' && resAccepted.value && resAccepted.value.ok) {
          try {
            const json = await resAccepted.value.json();
            acceptedOrdersData = json.orders || json.data || (Array.isArray(json) ? json : []);
          } catch (e) { }
        }

        if (resTrack.status === 'fulfilled' && resTrack.value && resTrack.value.ok) {
          try {
            const jsonTrack = await resTrack.value.json();
            rawTrack = jsonTrack.orders || jsonTrack.data || (Array.isArray(jsonTrack) ? jsonTrack : []);
          } catch (e) { }
        }

        if (resIncoming.status === 'fulfilled' && resIncoming.value && resIncoming.value.ok) {
          try {
            const jsonIncoming = await resIncoming.value.json();
            incomingData = jsonIncoming.orders || jsonIncoming.incomingOrders || (Array.isArray(jsonIncoming) ? jsonIncoming : null);
          } catch (e) { }
        }
      } catch (err) {
        // Parallel fetch error fallback
      }

      if (Array.isArray(acceptedOrdersData)) {
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
        // Isolate cache per restaurant
        AsyncStorage.setItem(`cached_accepted_orders_${restId}`, JSON.stringify(filteredAccepted)).catch(() => { });
        AsyncStorage.setItem('cached_accepted_orders', JSON.stringify(filteredAccepted)).catch(() => { });
        filteredAccepted.forEach((o) => {
          if (o._id) processedOrderIdsRef.current.add(String(o._id));
          if (o.orderId) processedOrderIdsRef.current.add(String(o.orderId));
        });
      }

      if (Array.isArray(rawTrack)) {
        const filteredTrack = rawTrack
          .map((o) => {
            if (!o) return o;
            const oId = String(o._id || o.orderId || '').trim();
            const accMatch = Array.isArray(acceptedOrdersData)
              ? acceptedOrdersData.find((acc) => String(acc._id || acc.orderId || '').trim() === oId)
              : null;
            if (accMatch) {
              const accStatus = String(accMatch.status || accMatch.orderStatus || '').toLowerCase();
              if (accStatus === 'ready' || accMatch.isReady || Number(accMatch.preparationTime ?? accMatch.prepTime) === 0) {
                return {
                  ...o,
                  status: 'Ready',
                  orderStatus: 'Ready',
                  isReady: true,
                  preparationTime: 0,
                  prepTime: 0,
                  remainingPrepTimeMins: 0,
                };
              }
            }
            return o;
          })
          .filter((o) => {
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
        // Isolate cache per restaurant
        AsyncStorage.setItem(`cached_tracker_orders_${restId}`, JSON.stringify(filteredTrack)).catch(() => { });
        AsyncStorage.setItem('cached_tracker_orders', JSON.stringify(filteredTrack)).catch(() => { });
      }

      let activeIncomingCount = 0;
      let activeRingingList = [];

      if (Array.isArray(incomingData)) {
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

        activeRingingList = filteredIncoming.filter((o) => !isOrderDismissed(o._id || o.orderId));
        activeIncomingCount = filteredIncoming.length;

        if (isInitialFetchRef.current) {
          isInitialFetchRef.current = false;
        }

        setIncomingOrders(filteredIncoming);
        setIncomingCount(filteredIncoming.length);
        // Isolate cache per restaurant
        AsyncStorage.setItem(`cached_incoming_orders_${restId}`, JSON.stringify(filteredIncoming)).catch(() => { });
        AsyncStorage.setItem('cached_incoming_orders', JSON.stringify(filteredIncoming)).catch(() => { });
      } else {
        setIncomingOrders((prev) => {
          const filtered = prev.filter((o) => {
            const id1 = String(o._id || '');
            const id2 = String(o.orderId || '');
            return !processedOrderIdsRef.current.has(id1) && !processedOrderIdsRef.current.has(id2);
          });
          setIncomingCount(filtered.length);
          activeIncomingCount = filtered.length;
          activeRingingList = filtered.filter((o) => !isOrderDismissed(o._id || o.orderId));
          return filtered;
        });
      }

      // Check OTHER assigned restaurants in parallel for incoming orders
      const otherIds = (assignedRestaurantsRef.current || [])
        .map((r) => String(r.restId).trim())
        .filter((id) => id && id.toLowerCase() !== restId.toLowerCase());

      const newCounts = { [restId]: activeIncomingCount };
      let otherUndismissedCount = 0;

      if (otherIds.length > 0) {
        try {
          const otherResults = await Promise.allSettled(
            otherIds.map((otherId) =>
              fetchIncomingOrdersContext(otherId, controller.signal)
                .then(async (res) => {
                  if (res && res.ok) {
                    const json = await res.json();
                    const data = json.orders || json.incomingOrders || (Array.isArray(json) ? json : []);
                    return { otherId, data };
                  }
                  return { otherId, data: [] };
                })
                .catch(() => ({ otherId, data: [] }))
            )
          );

          otherResults.forEach((res) => {
            if (res.status === 'fulfilled' && res.value) {
              const { otherId, data } = res.value;
              const validOrders = (Array.isArray(data) ? data : []).filter((o) => {
                const id1 = String(o._id || '');
                const id2 = String(o.orderId || '');
                return !processedOrderIdsRef.current.has(id1) && !processedOrderIdsRef.current.has(id2);
              });
              newCounts[otherId] = validOrders.length;

              // Sound detection for newly arrived orders of other assigned restaurant!
              validOrders.forEach((ord) => {
                const key = String(ord._id || ord.orderId || '');
                if (key) {
                  const alreadyNotified = seenIncomingIdsRef.current.has(key) || isOrderNotified(key);
                  seenIncomingIdsRef.current.add(key);
                  markOrderAsNotified(key);
                  if (!alreadyNotified && !isInitialFetchRef.current) {
                    displayOrderNotification(ord, true); // Plays sound!
                  }
                }
              });

              const ringingForOther = validOrders.filter((o) => !isOrderDismissed(o._id || o.orderId));
              otherUndismissedCount += ringingForOther.length;
            }
          });
        } catch (e) { }
      }

      clearTimeout(tid);
      setPendingCountsByRestId(newCounts);
      otherRingingCountRef.current = otherUndismissedCount;

      // Ensure sound plays if CURRENT active restaurant OR ANY OTHER assigned restaurant has active undismissed orders!
      const totalRinging = activeRingingList.length + otherUndismissedCount;
      if (totalRinging > 0) {
        playOrderSound();
      } else {
        stopOrderNotificationSound();
      }
    } catch (err) {
      console.error('OrdersContext: fetchGlobalOrders error:', err);
    } finally {
      if (!isPolling) {
        setLoading(false);
      }
    }
  }, []);

  // Helper to dynamically update in-memory active status for any restaurant
  const updateRestaurantActiveStatus = useCallback((restId, isActiveBool) => {
    const sid = String(restId || '').trim().toLowerCase();
    if (!sid) return;
    const boolVal = Boolean(isActiveBool);
    const updated = assignedRestaurantsRef.current.map((r) =>
      String(r.restId).trim().toLowerCase() === sid
        ? { ...r, isActive: boolVal }
        : r
    );
    setAssignedRestaurants(updated);
    assignedRestaurantsRef.current = updated;
  }, []);

  // Switch active restaurant with isolated storage & instantaneous UI update
  const switchRestaurant = useCallback(async (targetRestId) => {
    const newId = String(targetRestId || '').trim();
    if (!newId || newId.toLowerCase() === String(currentRestIdRef.current).trim().toLowerCase()) return;
    if (isSwitchingRestaurantRef.current) return;

    isSwitchingRestaurantRef.current = true;
    setIsSwitchingRestaurant(true);
    currentRestIdRef.current = newId;
    setCurrentRestId(newId);

    try {
      console.log(`[OrdersContext] Switching active restaurant to restId="${newId}"...`);

      // 1. Immediately persist to AsyncStorage
      await Promise.all([
        AsyncStorage.setItem('restId', newId).catch(() => {}),
        AsyncStorage.setItem('selectedRestId', newId).catch(() => {}),
      ]);

      // Find in-memory target profile immediately for instantaneous 0ms display
      const targetProfile = assignedRestaurantsRef.current.find(
        (r) => String(r.restId).trim().toLowerCase() === newId.toLowerCase()
      );
      let targetName = targetProfile?.name || `Restaurant #${newId}`;
      let targetCommission = targetProfile?.commission ?? 5;
      let finalActive = targetProfile?.isActive ?? false;

      // Immediately set restaurantInfo so header, dropdown, and toggle reflect new branch without lag
      setRestaurantInfo({
        restId: newId,
        name: targetName,
        phone: targetProfile?.phone || '',
        email: '',
        gstin: '37AANFL1602Q1ZW',
        commission: targetCommission,
        address: targetProfile?.address || '',
        fssai: '',
        openTime: targetProfile?.openTime || '00:00',
        closeTime: targetProfile?.closeTime || '00:01',
        isActive: finalActive,
      });

      // 2. Load isolated cached orders for new restaurant immediately
      try {
        const [cAcc, cTrk, cInc] = await Promise.all([
          AsyncStorage.getItem(`cached_accepted_orders_${newId}`),
          AsyncStorage.getItem(`cached_tracker_orders_${newId}`),
          AsyncStorage.getItem(`cached_incoming_orders_${newId}`),
        ]);
        setOrders(cAcc ? JSON.parse(cAcc) : []);
        setTrackerOrders(cTrk ? JSON.parse(cTrk) : []);
        const parsedInc = cInc ? JSON.parse(cInc) : [];
        setIncomingOrders(parsedInc);
        setIncomingCount(parsedInc.length);
      } catch (e) {
        setOrders([]);
        setTrackerOrders([]);
        setIncomingOrders([]);
        setIncomingCount(0);
      }

      // 3. Fetch fresh restaurant status and full details from backend /api/users
      let matchedFound = null;
      let allUsers = [];
      try {
        allUsers = await fetchAllRestaurants();
        matchedFound = (Array.isArray(allUsers) ? allUsers : []).find(
          (u) =>
            String(u.restId || u.restaurantId || '').trim().toLowerCase() === newId.toLowerCase() ||
            String(u._id || '').trim().toLowerCase() === newId.toLowerCase()
        );
        if (matchedFound) {
          targetName = matchedFound?.name || targetName;
          targetCommission = matchedFound?.commission ?? targetCommission;
          finalActive = extractIsActive(matchedFound);
        }
      } catch (e) { }

      // 4. Update assigned list in memory with fresh status
      const updatedList = assignedRestaurantsRef.current.map((r) =>
        String(r.restId).trim().toLowerCase() === newId.toLowerCase()
          ? {
              ...r,
              name: targetName,
              commission: targetCommission,
              isActive: finalActive,
              address: matchedFound?.address || matchedFound?.restLocation || r.address || '',
              phone: matchedFound?.phone || r.phone || '',
              openTime: matchedFound?.openTime || r.openTime || '00:00',
              closeTime: matchedFound?.closeTime || r.closeTime || '00:01',
              fssai: matchedFound?.fssai || r.fssai || '',
              rawUser: matchedFound || r.rawUser,
            }
          : r
      );
      setAssignedRestaurants(updatedList);
      assignedRestaurantsRef.current = updatedList;

      // 5. Update master userData in AsyncStorage and Redux PRESERVING subrestaurentsId & master login identity
      const storedUserStr = await AsyncStorage.getItem('userData');
      if (storedUserStr) {
        try {
          const u = JSON.parse(storedUserStr);
          const cachedSubStr = await AsyncStorage.getItem('masterSubrestaurentsId');
          const masterSubs =
            u.subrestaurentsId ||
            u.subrestaurantsId ||
            (cachedSubStr ? JSON.parse(cachedSubStr) : null) ||
            assignedRestaurantsRef.current.map((x) => x.restId);

          const updatedUser = {
            ...u,
            restId: newId,
            restaurantId: newId,
            name: targetName,
            address: matchedFound?.address || matchedFound?.restLocation || u.address,
            fssai: matchedFound?.fssai || u.fssai,
            openTime: matchedFound?.openTime || u.openTime || '00:00',
            closeTime: matchedFound?.closeTime || u.closeTime || '00:01',
            phone: matchedFound?.phone || u.phone,
            email: matchedFound?.email || u.email,
            commission: targetCommission,
            isActive: finalActive,
            is_active: finalActive,
            isOpen: finalActive,
            is_open: finalActive,
            status: finalActive ? 'active' : 'closed',
            subrestaurentsId: masterSubs,
            subrestaurantsId: masterSubs,
          };
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUser));
          await AsyncStorage.setItem(`activeRestStatus_${newId}`, String(finalActive));
          dispatch(setUser(updatedUser));
        } catch (e) { }
      }

      setRestaurantInfo({
        restId: newId,
        name: targetName,
        phone: matchedFound?.phone || targetProfile?.phone || '',
        email: matchedFound?.email || '',
        gstin: '37AANFL1602Q1ZW',
        commission: targetCommission,
        address: matchedFound?.address || matchedFound?.restLocation || targetProfile?.address || '',
        fssai: matchedFound?.fssai || '',
        openTime: matchedFound?.openTime || '00:00',
        closeTime: matchedFound?.closeTime || '00:01',
        isActive: finalActive,
      });

      // 6. Retrieve fresh live orders for new branch from backend
      try {
        await Promise.race([
          fetchGlobalOrders(true, newId),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch (err) {
        console.warn('[OrdersContext] Background orders refresh on switch notice:', err);
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      console.error('[OrdersContext] Error switching restaurant:', err);
    } finally {
      isSwitchingRestaurantRef.current = false;
      setIsSwitchingRestaurant(false);
    }
  }, [dispatch, fetchGlobalOrders]);

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
        } catch (e) { }
      }

      const rawDate = orderData.createdAt || orderData.orderDate || orderData.date || orderData.created_at || orderData.acceptedAt || orderData.timestamp;
      const normalizedOrder = {
        ...orderData,
        _id: orderId,
        orderId: orderId,
        grandTotal: orderData.grandTotal || orderData.totalPrice || orderData.amount || '0',
        totalPrice: orderData.totalPrice || orderData.grandTotal || orderData.amount || '0',
        userName: orderData.userName || orderData.customerName || orderData.name || 'Customer',
        userPhone: orderData.userPhone || orderData.phone || orderData.mobileNumber || '',
        items: Array.isArray(itemsParsed) ? itemsParsed : [],
        createdAt: rawDate || new Date().toISOString(),
      };

      return [normalizedOrder, ...prev];
    });

    setIncomingCount((prev) => prev + 1);
  }, []);

  // Reject Order Flow - Instant 0ms UI Response
  const rejectOrder = useCallback(
    async (orderId) => {
      try {
        const idStr = String(orderId);
        processedOrderIdsRef.current.add(idStr);

        // 1. Immediately stop sound & update local UI state (0ms instant response)
        stopOrderNotificationSound(orderId);
        setIncomingOrders((prev) => {
          const next = prev.filter((o) => String(o.orderId || o._id) !== idStr);
          AsyncStorage.setItem('cached_incoming_orders', JSON.stringify(next)).catch(() => { });
          setIncomingCount(next.length);
          return next;
        });

        // 2. Fire backend API call asynchronously in background
        apiRejectOrder(orderId, undefined, undefined).catch((err) => {
          console.warn('OrdersContext: background apiRejectOrder warning:', err);
        });

        return { success: true };
      } catch (err) {
        console.error('OrdersContext: rejectOrder error:', err);
        return { success: false, error: err.message };
      }
    },
    []
  );

  // Accept Order & Preparation Time Flow - Instant 0ms UI Response
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
          ...targetOrder,
          orderData: targetOrder,
          orderId: orderIdVal,
          restaurantId: String(asyncRestId || targetOrder.restaurantId || targetOrder.restId || ''),
          restId: String(asyncRestId || targetOrder.restId || targetOrder.restaurantId || ''),
          restaurant_id: String(asyncRestId || targetOrder.restaurant_id || ''),
          rest: restaurantInfo.address || targetOrder.rest || '',
          restaurantLocation: {
            lat: restaurantInfo.lat ?? targetOrder.restaurantLocation?.lat,
            lng: restaurantInfo.lng ?? targetOrder.restaurantLocation?.lng,
          },
          razorpayOrderId: targetOrder.razorpayOrderId || targetOrder.orderId || 'order_T4fAtetGb5u6c9',
          preparationTime: prepMins,
          prepTime: prepMins,
          remainingPrepTimeMins: prepMins,
          acceptedAt: acceptedAtStr,
          estimatedPrepEndTime: estimatedPrepEndTimeStr,
          status: initialStatus,
          orderStatus: initialStatus,
          isReady: isReady,
        };

        const packagingFee = Number(
          targetOrder.packagingFee ??
          targetOrder.orderData?.packagingFee ??
          targetOrder.packagingCharges ??
          targetOrder.orderData?.packagingCharges ??
          targetOrder.packagingCharge ??
          targetOrder.orderData?.packagingCharge ??
          targetOrder.packingFee ??
          targetOrder.orderData?.packingFee ??
          targetOrder.packingCharges ??
          targetOrder.orderData?.packingCharges ??
          0
        ) || 0;

        const grossTotal = Number(targetOrder.totalPrice || 0);
        const commissionRate = Number(
          targetOrder.commissionRate || restaurantInfo.commission || 0
        );
        const calculatedGrandTotal = commissionRate > 0
          ? parseFloat((grossTotal * (1 - commissionRate / 100)).toFixed(2)) + packagingFee
          : grossTotal + packagingFee;
        const grandTotal = Number(
          targetOrder.totalPriceAfterCommission ?? targetOrder.netEarnings ?? calculatedGrandTotal
        );
        const totalCommissionCut = parseFloat((grossTotal - (grandTotal - packagingFee)).toFixed(2));

        const pendingPayload = {
          restaurantId: String(asyncRestId),
          restaurantName: asyncRestName,
          grossTotal,
          grandTotal,
          packagingFee,
          commissionRate,
          totalCommissionCut,
          date: acceptedAtStr,
          status: 'Pending Clearance',
        };

        payload.packagingFee = packagingFee;
        payload.netEarnings = grandTotal;
        payload.totalPriceAfterCommission = grandTotal;

        const newlyAcceptedOrder = {
          ...targetOrder,
          packagingFee,
          acceptedAt: acceptedAtStr,
          preparationTime: prepMins,
          prepTime: prepMins,
          remainingPrepTimeMins: prepMins,
          estimatedPrepEndTime: estimatedPrepEndTimeStr,
          status: initialStatus,
          orderStatus: initialStatus,
          isReady: isReady,
          netEarnings: grandTotal,
          totalPriceAfterCommission: grandTotal,
        };

        // 1. Immediately stop sound & update local UI state (0ms instant response)
        stopOrderNotificationSound(orderIdVal);
        if (altIdStr) stopOrderNotificationSound(altIdStr);

        setOrders((prev) => {
          const next = [newlyAcceptedOrder, ...prev.filter((o) => String(o._id || o.orderId) !== idStr && String(o._id || o.orderId) !== altIdStr)];
          AsyncStorage.setItem('cached_accepted_orders', JSON.stringify(next)).catch(() => { });
          return next;
        });

        setTrackerOrders((prev) => {
          const next = [newlyAcceptedOrder, ...prev.filter((o) => String(o._id || o.orderId) !== idStr && String(o._id || o.orderId) !== altIdStr)];
          AsyncStorage.setItem('cached_tracker_orders', JSON.stringify(next)).catch(() => { });
          return next;
        });

        setIncomingOrders((prev) => {
          const next = prev.filter((o) => String(o._id || o.orderId) !== idStr && String(o.orderId || '') !== altIdStr);
          AsyncStorage.setItem('cached_incoming_orders', JSON.stringify(next)).catch(() => { });
          setIncomingCount(next.length);
          return next;
        });

        // 2. Fire backend API calls asynchronously in background
        (async () => {
          try {
            await apiAcceptOrder(payload);
          } catch (err) {
            console.warn('OrdersContext: background apiAcceptOrder warning:', err);
          }

          try {
            const ppRes = await insertPendingPayment(pendingPayload);
            const ppData = await ppRes.json();
            if (!ppRes.ok) {
              console.error('pendingpayments FAILED — HTTP', ppRes.status, JSON.stringify(ppData));
            } else {
              console.log('pendingpayments SUCCESS:', ppData);
            }
          } catch (ppErr) {
            console.error('pendingpayments ERROR (network/timeout):', ppErr.message);
          }
        })();

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
        if (statusVal === 'ready' || ord.isReady || Number(ord.preparationTime ?? ord.prepTime) === 0) continue;

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

  // Setup 3-second background polling loop for fast incoming order detection
  useEffect(() => {
    loadRestaurantInfo().then(() => {
      fetchGlobalOrders(false);
    });

    pollingTimerRef.current = setInterval(() => {
      fetchGlobalOrders(true);
    }, 3000); // 3-second fast polling

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [loadRestaurantInfo, fetchGlobalOrders]);

  // Manage in-app native looping notification sound based on active & other assigned restaurants
  useEffect(() => {
    const activeRinging = incomingOrders.filter((o) => !isOrderDismissed(o._id || o.orderId));
    const totalRinging = activeRinging.length + (otherRingingCountRef.current || 0);
    if (totalRinging > 0) {
      if (AppState.currentState === 'active') {
        playOrderSound();
      }
    } else {
      stopOrderNotificationSound();
    }
  }, [incomingOrders, pendingCountsByRestId]);

  // When app returns to active foreground: immediately poll fresh data & update ringing sound
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        fetchGlobalOrders(true);
        const activeRinging = incomingOrders.filter((o) => !isOrderDismissed(o._id || o.orderId));
        const totalRinging = activeRinging.length + (otherRingingCountRef.current || 0);
        if (totalRinging > 0) {
          playOrderSound();
        }
      } else if (nextAppState !== 'active') {
        stopOrderNotificationSound();
      }
    });
    return () => sub.remove();
  }, [incomingOrders, pendingCountsByRestId, fetchGlobalOrders]);

  const currentRestObj = assignedRestaurants.find(
    (r) => String(r.restId).trim().toLowerCase() === String(currentRestId).trim().toLowerCase()
  );
  const currentRestaurantName = currentRestObj?.name || restaurantInfo.name || '';
  const hasMultipleRestaurants = assignedRestaurants.length > 1;
  const hasPendingOtherRestaurantOrders = Object.entries(pendingCountsByRestId).some(
    ([id, cnt]) => String(id).trim().toLowerCase() !== String(currentRestId).trim().toLowerCase() && cnt > 0
  );

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
        // Multi-restaurant support
        assignedRestaurants,
        currentRestId,
        currentRestaurantName,
        pendingCountsByRestId,
        hasPendingOtherRestaurantOrders,
        hasMultipleRestaurants,
        switchRestaurant,
        isSwitchingRestaurant,
        updateRestaurantActiveStatus,
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


