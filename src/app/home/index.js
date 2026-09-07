import { useOrders } from '@/context/OrdersContext';
import { fetchAcceptedByRestaurants, fetchRestaurantStats, fetchRestaurantStatus, updateRestaurantStatus } from '@/services/api';
import { checkIsThisDeviceActiveForFCM, clearFCMTokenOnLogout, initFCMToken } from '@/services/NotificationService';
import { setUser } from '@/store/userSlice';
import { extractIsActive, extractIsActiveStrict } from '@/utils/statusUtils';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { getEffectiveCommissionRate } from '../orders';

import './home.css';

export default function HomeScreen() {
  const dispatch = useDispatch();
  const router = useRouter();
  const reduxUserData = useSelector((state) => state.user.userData);
  const { acceptedByRestaurantsOrders, fetchGlobalOrders, restaurantInfo } = useOrders();
  const initialActive = extractIsActiveStrict(reduxUserData) ?? false;
  const [userData, setUserData] = useState(reduxUserData || null);
  const [isOpen, setIsOpen] = useState(initialActive);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isNotifActive, setIsNotifActive] = useState(false);
  const [isTogglingNotif, setIsTogglingNotif] = useState(false);
  const [notifModalVisible, setNotifModalVisible] = useState(false);
  const [notifModalConfig, setNotifModalConfig] = useState({
    type: 'success',
    title: '',
    message: '',
  });

  const showNotifModal = (type, title, message) => {
    setNotifModalConfig({ type, title, message });
    setNotifModalVisible(true);
  };

  const syncNotifStatusWithBackend = useCallback(async () => {
    try {
      const dbFcmToken = reduxUserData?.fcmToken || userData?.fcmToken;
      if (!dbFcmToken || String(dbFcmToken).trim() === '') {
        setIsNotifActive(false);
        await AsyncStorage.setItem('isNotifEnabled', 'false');
        return;
      }
      const isActiveOnThisDevice = await checkIsThisDeviceActiveForFCM(dbFcmToken);
      setIsNotifActive(isActiveOnThisDevice);
      await AsyncStorage.setItem('isNotifEnabled', isActiveOnThisDevice ? 'true' : 'false');
    } catch (e) {}
  }, [reduxUserData, userData]);

  useEffect(() => {
    syncNotifStatusWithBackend();
  }, [syncNotifStatusWithBackend]);

  useFocusEffect(
    useCallback(() => {
      syncNotifStatusWithBackend();
    }, [syncNotifStatusWithBackend])
  );

  const handleNotifToggle = async () => {
    if (isTogglingNotif) return;
    setIsTogglingNotif(true);

    const nextState = !isNotifActive;
    const currentU = userDataRef.current || reduxUserData;

    try {
      if (nextState) {
        console.log('[Notif Toggle] Claiming notifications for this device...');
        const res = await initFCMToken(currentU);
        if (res && res.success) {
          setIsNotifActive(true);
          await AsyncStorage.setItem('isNotifEnabled', 'true');
          showNotifModal('success', 'Notifications Enabled', 'Incoming order alerts will ring on this device.');
        } else {
          setIsNotifActive(false);
          await AsyncStorage.setItem('isNotifEnabled', 'false');
          showNotifModal(
            'error',
            'Notification Notice',
            res?.error || 'Could not obtain device FCM token. Please check phone notification permissions.'
          );
        }
      } else {
        console.log('[Notif Toggle] Disabling notifications for this device...');
        await clearFCMTokenOnLogout(currentU);
        setIsNotifActive(false);
        await AsyncStorage.setItem('isNotifEnabled', 'false');
        showNotifModal('off', 'Notifications Disabled', 'Push notifications paused for this device.');
      }
    } catch (err) {
      console.error('[Notif Toggle] Error toggling notification state:', err);
    } finally {
      setIsTogglingNotif(false);
    }
  };

  // Real stats loaded from acceptedbyrestorents collection by restaurantId
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);

  // Animated value: 1 = OPEN, 0 = CLOSED
  const animVal = useRef(new Animated.Value(initialActive ? 1 : 0)).current;
  const isUpdatingStatusRef = useRef(false);
  const isOpenRef = useRef(initialActive);
  const userDataRef = useRef(userData);
  const lastUserToggleTimeRef = useRef(0);

  useEffect(() => {
    isUpdatingStatusRef.current = isUpdatingStatus;
  }, [isUpdatingStatus]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    userDataRef.current = userData;
  }, [userData]);

  const syncToggleState = useCallback((targetActiveBool, animate = true) => {
    setIsOpen(targetActiveBool);
    isOpenRef.current = targetActiveBool;
    if (animate) {
      Animated.timing(animVal, {
        toValue: targetActiveBool ? 1 : 0,
        duration: 220,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
        useNativeDriver: false,
      }).start();
    } else {
      animVal.setValue(targetActiveBool ? 1 : 0);
    }
  }, [animVal]);

  // Instantly sync user profile data from Redux if available without overriding active user interaction
  useEffect(() => {
    if (reduxUserData) {
      const activeBool = extractIsActiveStrict(reduxUserData);
      if (JSON.stringify(reduxUserData) !== JSON.stringify(userDataRef.current)) {
        setUserData(reduxUserData);
      }
      if (Date.now() - lastUserToggleTimeRef.current >= 10000 && !isUpdatingStatusRef.current) {
        if (typeof activeBool === 'boolean' && activeBool !== isOpenRef.current) {
          syncToggleState(activeBool, false);
        }
      }
    }
  }, [reduxUserData, syncToggleState]);

  // Helper to calculate exact Net Earnings after restaurant commission cut for an order
  const calculateOrderNetEarnings = useCallback((ord) => {
    if (!ord || typeof ord !== 'object') return 0;

    const currentU = userDataRef.current;
    // 1. Determine effective commission percentage for this order & restaurant
    const commRate = getEffectiveCommissionRate(
      ord,
      currentU?.commission ?? restaurantInfo?.commission
    );

    // 2. If items exist, compute sum of discounted item prices (matches Orders & Notifications)
    let itemsRaw = [];
    if (Array.isArray(ord.items)) {
      itemsRaw = ord.items;
    } else if (typeof ord.items === 'string') {
      try {
        const parsed = JSON.parse(ord.items);
        if (Array.isArray(parsed)) itemsRaw = parsed;
      } catch (e) { }
    }

    if (itemsRaw.length > 0) {
      const itemEarningsSum = itemsRaw.reduce((acc, it) => {
        if (!it || typeof it !== 'object') return acc;
        const rawPrice = Number(it.originalPrice ?? it.price ?? 0) || 0;
        const discountedPrice = commRate > 0
          ? rawPrice * (1 - commRate / 100)
          : (it.priceAfterCommission !== undefined ? Number(it.priceAfterCommission) || 0 : rawPrice);
        const qty = Number(it.quantity || it.qty || 1) || 1;
        return acc + (discountedPrice * qty);
      }, 0);

      if (itemEarningsSum > 0) {
        return itemEarningsSum;
      }
    }

    // 3. Fallback: Apply commission discount to gross order total
    const grossTotal = Number(ord.totalPrice ?? ord.grandTotal ?? ord.amount ?? 0) || 0;
    if (commRate > 0) {
      return grossTotal * (1 - commRate / 100);
    }

    // 4. Fallback to stored document property
    if (ord.totalPriceAfterCommission !== undefined && ord.totalPriceAfterCommission !== null && !isNaN(Number(ord.totalPriceAfterCommission)) && Number(ord.totalPriceAfterCommission) > 0) {
      return Number(ord.totalPriceAfterCommission);
    }
    if (ord.netEarnings !== undefined && ord.netEarnings !== null && !isNaN(Number(ord.netEarnings)) && Number(ord.netEarnings) > 0) {
      return Number(ord.netEarnings);
    }

    return grossTotal;
  }, [restaurantInfo]);

  // Compute stats instantly from background orders context
  useEffect(() => {
    const rawOrdersList = Array.isArray(acceptedByRestaurantsOrders) ? acceptedByRestaurantsOrders : [];
    const targetRestId = String(
      userData?.restId || userData?.restaurantId || userData?.restaurant_id || userData?._id || userData?.id || ''
    ).trim();

    const matchingOrders = rawOrdersList.filter((ord) => {
      if (!targetRestId) return true;
      const ordRestId = String(
        ord.restaurantId || ord.restId || ord.restaurant_id || ord.storeId || ord.vendorId || (ord.restaurant && typeof ord.restaurant === 'object' ? (ord.restaurant.restId || ord.restaurant.id || ord.restaurant._id) : ord.restaurant) || ''
      ).trim();
      return ordRestId.toLowerCase() === targetRestId.toLowerCase();
    });

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();

    let tEarnings = 0;
    let tOrders = 0;
    let totEarnings = 0;
    let totOrders = matchingOrders.length;

    matchingOrders.forEach((ord) => {
      const earnings = calculateOrderNetEarnings(ord);
      totEarnings += earnings;

      const ordDateRaw = ord.acceptedAt || ord.orderDate || ord.createdAt;
      if (ordDateRaw) {
        const d = new Date(ordDateRaw);
        if (
          !isNaN(d.getTime()) &&
          d.getFullYear() === todayYear &&
          d.getMonth() === todayMonth &&
          d.getDate() === todayDate
        ) {
          tOrders += 1;
          tEarnings += earnings;
        }
      }
    });

    setTodayEarnings(parseFloat(tEarnings.toFixed(2)));
    setTodayOrders(tOrders);
    setTotalEarnings(parseFloat(totEarnings.toFixed(2)));
    setTotalOrders(totOrders);
  }, [acceptedByRestaurantsOrders, userData, restaurantInfo, calculateOrderNetEarnings]);

  const fetchStats = useCallback(async (targetRestId) => {
    try {
      setLoadingStats(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetchAcceptedByRestaurants(targetRestId, controller.signal);
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('Fetched acceptedbyrestaurants orders for home stats:', data);

      // 1. Direct Backend Stats Handling: If backend returned pre-calculated stats numbers, use them directly
      if (response.ok && data && data.todayEarnings !== undefined && data.totalEarnings !== undefined) {
        setTodayEarnings(Number(data.todayEarnings) || 0);
        setTodayOrders(Number(data.todayOrders) || 0);
        setTotalEarnings(Number(data.totalEarnings) || 0);
        setTotalOrders(Number(data.totalOrders) || 0);
        return;
      }

      let rawOrdersList = [];
      if (response.ok) {
        if (Array.isArray(data.orders)) {
          rawOrdersList = data.orders;
        } else if (Array.isArray(data)) {
          rawOrdersList = data;
        } else if (Array.isArray(data.data)) {
          rawOrdersList = data.data;
        }
      }

      // If acceptedbyrestorents didn't return an array or failed, try fallback /api/restaurant/stats endpoint
      if (rawOrdersList.length === 0) {
        try {
          const resStats = await fetchRestaurantStats(targetRestId);
          if (resStats.ok) {
            const statsJson = await resStats.json();
            if (statsJson && statsJson.todayEarnings !== undefined && statsJson.totalEarnings !== undefined) {
              setTodayEarnings(Number(statsJson.todayEarnings) || 0);
              setTodayOrders(Number(statsJson.todayOrders) || 0);
              setTotalEarnings(Number(statsJson.totalEarnings) || 0);
              setTotalOrders(Number(statsJson.totalOrders) || 0);
              return;
            } else if (Array.isArray(statsJson.orders)) {
              rawOrdersList = statsJson.orders;
            }
          }
        } catch (e) { }
      }

      // STRICT FILTER: Compare restaurant ID of each order with targetRestId
      const matchingOrders = rawOrdersList.filter((ord) => {
        if (!targetRestId) return true;
        const ordRestId = String(
          ord.restaurantId || ord.restId || ord.restaurant_id || ord.storeId || ord.vendorId || (ord.restaurant && typeof ord.restaurant === 'object' ? (ord.restaurant.restId || ord.restaurant.id || ord.restaurant._id) : ord.restaurant) || ''
        ).trim();
        return ordRestId.toLowerCase() === String(targetRestId).trim().toLowerCase();
      });

      const now = new Date();
      const todayYear = now.getFullYear();
      const todayMonth = now.getMonth();
      const todayDate = now.getDate();

      let tEarnings = 0;
      let tOrders = 0;
      let totEarnings = 0;
      let totOrders = matchingOrders.length;

      matchingOrders.forEach((ord) => {
        const earnings = calculateOrderNetEarnings(ord);
        totEarnings += earnings;

        const ordDateRaw = ord.acceptedAt || ord.orderDate || ord.createdAt;
        if (ordDateRaw) {
          const d = new Date(ordDateRaw);
          if (
            !isNaN(d.getTime()) &&
            d.getFullYear() === todayYear &&
            d.getMonth() === todayMonth &&
            d.getDate() === todayDate
          ) {
            tOrders += 1;
            tEarnings += earnings;
          }
        }
      });

      setTodayEarnings(parseFloat(tEarnings.toFixed(2)));
      setTodayOrders(tOrders);
      setTotalEarnings(parseFloat(totEarnings.toFixed(2)));
      setTotalOrders(totOrders);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Notice: Background stats fetch will retry:', err?.message || err);
      }
    } finally {
      setLoadingStats(false);
    }
  }, [calculateOrderNetEarnings]);

  const pollRestaurantStatus = useCallback(async () => {
    // If currently updating or recently toggled by user, do not poll or override state
    if (isUpdatingStatusRef.current) return;
    if (Date.now() - lastUserToggleTimeRef.current < 10000) return;

    try {
      let u = userDataRef.current;
      const storedRestId = await AsyncStorage.getItem('restId');
      if (!u || (!u._id && !u.restId && !u.phone)) {
        const stored = await AsyncStorage.getItem('userData');
        if (stored) {
          try { u = JSON.parse(stored); } catch (e) { }
        }
      }

      const targetRestId = String(
        u?.restId ||
        u?.restaurantId ||
        u?.restaurant_id ||
        storedRestId ||
        ''
      ).trim();
      const targetPhone = String(u?.phone || u?.mobileNumber || '').trim();
      const targetUserId = String(u?._id || u?.id || '').trim();

      if (!targetRestId && !targetPhone && !targetUserId) return;

      const res = await fetchRestaurantStatus(targetRestId, targetPhone, targetUserId);

      // Discard poll result if user manually interacted while fetch was in-flight
      if (isUpdatingStatusRef.current) return;
      if (Date.now() - lastUserToggleTimeRef.current < 10000) return;

      if (res && res.ok) {
        const data = await res.json();
        const remoteIsActive = extractIsActiveStrict(data);
        if (typeof remoteIsActive === 'boolean') {
          if (remoteIsActive !== isOpenRef.current) {
            console.log('[Status Poll] Real-time MongoDB status sync:', remoteIsActive);
            syncToggleState(remoteIsActive, true);
          }
          const updatedUserData = {
            ...(userDataRef.current || u || {}),
            ...(data.user || {}),
            isActive: remoteIsActive,
            is_active: remoteIsActive,
            isOpen: remoteIsActive,
            is_open: remoteIsActive,
            status: remoteIsActive ? 'active' : 'closed',
          };
          setUserData(updatedUserData);
          dispatch(setUser(updatedUserData));
          await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData)).catch(() => { });
        }
      }
    } catch (err) {
      // Periodic background poll silently retries next interval on network glitch
    }
  }, [dispatch, syncToggleState]);

  const loadUserData = useCallback(async () => {
    if (isUpdatingStatusRef.current) return;

    try {
      // Extend 30-day session countdown whenever app is used
      await AsyncStorage.setItem('lastActiveTimestamp', Date.now().toString());
      const storedUser = await AsyncStorage.getItem('userData');
      const storedRestId = await AsyncStorage.getItem('restId');
      let targetRestId = '';

      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (JSON.stringify(parsed) !== JSON.stringify(userDataRef.current)) {
          setUserData(parsed);
        }
        const activeBool = extractIsActiveStrict(parsed);
        if (
          Date.now() - lastUserToggleTimeRef.current >= 10000 &&
          typeof activeBool === 'boolean' &&
          activeBool !== isOpenRef.current &&
          !isUpdatingStatusRef.current
        ) {
          syncToggleState(activeBool, false);
        }
        targetRestId = String(
          parsed?.restId ||
          parsed?.restaurantId ||
          parsed?.restaurant_id ||
          parsed?._id ||
          parsed?.id ||
          ''
        ).trim();
      }

      if (!targetRestId && storedRestId) {
        targetRestId = String(storedRestId).trim();
      }

      fetchStats(targetRestId);
      pollRestaurantStatus();
    } catch (error) {
      console.error('Error loading user data from AsyncStorage:', error);
      fetchStats('');
    }
  }, [fetchStats, pollRestaurantStatus, syncToggleState]);

  // Load stats on mount and whenever screen comes into focus, with 5s status polling interval
  useFocusEffect(
    useCallback(() => {
      loadUserData();
      pollRestaurantStatus();

      const timerId = setInterval(() => {
        pollRestaurantStatus();
      }, 5000);

      return () => {
        clearInterval(timerId);
      };
    }, [loadUserData, pollRestaurantStatus])
  );

  const handleToggle = async () => {
    if (isUpdatingStatusRef.current) return;

    const nextState = !isOpenRef.current;
    lastUserToggleTimeRef.current = Date.now();
    setIsUpdatingStatus(true);
    isUpdatingStatusRef.current = true;

    // 1. Instantly trigger smooth optimistic UI animation & state update
    syncToggleState(nextState, true);

    // 2. Deep update user data object including all top-level & nested entities
    const currentU = userDataRef.current || {};
    const updatedUserData = {
      ...currentU,
      isActive: nextState,
      is_active: nextState,
      isOpen: nextState,
      is_open: nextState,
      status: nextState ? 'active' : 'closed',
      active: nextState,
    };
    if (updatedUserData.user && typeof updatedUserData.user === 'object') {
      updatedUserData.user = {
        ...updatedUserData.user,
        isActive: nextState,
        is_active: nextState,
        isOpen: nextState,
        is_open: nextState,
        status: nextState ? 'active' : 'closed',
      };
    }
    if (updatedUserData.restaurant && typeof updatedUserData.restaurant === 'object') {
      updatedUserData.restaurant = {
        ...updatedUserData.restaurant,
        isActive: nextState,
        is_active: nextState,
        isOpen: nextState,
        is_open: nextState,
        status: nextState ? 'active' : 'closed',
      };
    }
    if (updatedUserData.restaurantDetails && typeof updatedUserData.restaurantDetails === 'object') {
      updatedUserData.restaurantDetails = {
        ...updatedUserData.restaurantDetails,
        isActive: nextState,
        is_active: nextState,
        isOpen: nextState,
        is_open: nextState,
        status: nextState ? 'active' : 'closed',
      };
    }

    setUserData(updatedUserData);
    dispatch(setUser(updatedUserData));
    try {
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));
    } catch (err) {
      console.error('Error updating AsyncStorage on status toggle:', err);
    }

    // 3. Update MongoDB restuarentusers collection via API
    try {
      const storedRestId = await AsyncStorage.getItem('restId');
      const targetRestId =
        currentU?.restId ||
        currentU?.restaurantId ||
        currentU?.restaurant_id ||
        storedRestId ||
        currentU?._id ||
        currentU?.id ||
        '';
      const targetPhone = currentU?.phone || currentU?.mobileNumber || '';

      const payload = {
        userId: currentU?._id || currentU?.id,
        restId: targetRestId,
        restaurantId: targetRestId,
        restaurant_id: targetRestId,
        phone: targetPhone,
        mobileNumber: targetPhone,
        email: currentU?.email || '',
        isActive: nextState,
        is_active: nextState,
        isOpen: nextState,
        is_open: nextState,
        status: nextState ? 'active' : 'closed',
        active: nextState,
      };

      console.log('[Status Toggle] Sending API update payload:', payload);
      const response = await updateRestaurantStatus(payload);

      if (response && response.ok) {
        const data = await response.json();
        console.log('[Status Toggle] MongoDB response:', data);
        const confirmedIsActive = extractIsActiveStrict(data);
        if (typeof confirmedIsActive === 'boolean' && confirmedIsActive !== isOpenRef.current) {
          syncToggleState(confirmedIsActive, true);
        }
      }
    } catch (err) {
      console.error('Error updating status in MongoDB backend:', err);
    } finally {
      setIsUpdatingStatus(false);
      isUpdatingStatusRef.current = false;
    }
  };

  // Interpolations
  const bgColor = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E35436', '#05B686'],
  });

  const circleX = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 142],
  });

  const openOpacity = animVal.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const closedOpacity = animVal.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1, 0, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Brand Header Pill ── */}
        <View style={styles.brandPill}>
          <View style={styles.brandLogoCircle}>
            <Image
              source={require('../../../assets/images/leevon-logo.png')}
              style={styles.brandLogoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandName}>LEEVON DELIVERY LLP</Text>
        </View>

        {/* ── OPEN / CLOSED Smooth Sliding Toggle Pill ── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleToggle}
          disabled={isUpdatingStatus}
        >
          <Animated.View
            style={[
              styles.toggleContainer,
              { backgroundColor: bgColor },
            ]}
          >
            {/* OPEN Text on Left */}
            <Animated.View
              style={[
                styles.openTextWrapper,
                { opacity: openOpacity },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.toggleText}>OPEN</Text>
            </Animated.View>

            {/* CLOSED Text on Right */}
            <Animated.View
              style={[
                styles.closedTextWrapper,
                { opacity: closedOpacity },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.toggleText}>CLOSED</Text>
            </Animated.View>

            {/* Sliding White Power Circle */}
            <Animated.View
              style={[
                styles.powerCircle,
                { transform: [{ translateX: circleX }] },
              ]}
            >
              <Animated.View style={[StyleSheet.absoluteFill, styles.centerContent, { opacity: openOpacity }]}>
                <Ionicons
                  name="power"
                  size={20}
                  color="#05B686"
                />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.centerContent, { opacity: closedOpacity }]}>
                <Ionicons
                  name="power"
                  size={20}
                  color="#E35436"
                />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </TouchableOpacity>

        {/* ── NOTIFICATIONS ON / OFF Pill ── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleNotifToggle}
          disabled={isTogglingNotif}
          style={[
            styles.notifPillButton,
            { backgroundColor: isNotifActive ? '#05B686' : '#4B5563' }
          ]}
        >
          {isTogglingNotif ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name={isNotifActive ? 'notifications' : 'notifications-off'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={styles.notifPillText}>
                {isNotifActive ? 'NOTIFICATIONS ON' : 'NOTIFICATIONS OFF'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── MY MENU Button ── */}
        <TouchableOpacity
          style={styles.myMenuButton}
          activeOpacity={0.85}
          onPress={() => router.push('/mymenu')}
        >
          <Ionicons name="restaurant" size={18} color="#FFFFFF" />
          <Text style={styles.myMenuText}>MY MENU</Text>
        </TouchableOpacity>

        {/* ── Stats 2×2 Grid ── */}
        <View style={styles.statsGrid}>
          {/* TODAY EARNINGS */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TODAY EARNINGS</Text>
            <Text style={styles.statValue}>₹ {todayEarnings}</Text>
          </View>

          {/* TODAY ORDERS */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TODAY ORDERS</Text>
            <Text style={styles.statValue}>{todayOrders}</Text>
          </View>

          {/* TOTAL EARNINGS */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL EARNINGS</Text>
            <Text style={styles.statValue}>₹ {totalEarnings}</Text>
          </View>

          {/* TOTAL ORDERS */}
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>TOTAL ORDERS</Text>
            <Text style={styles.statValue}>{totalOrders}</Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Custom Styled Notification Alert Modal ── */}
      <Modal
        visible={notifModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setNotifModalVisible(false)}
      >
        <View style={styles.notifModalOverlay}>
          <View style={styles.notifModalCard}>
            <TouchableOpacity
              style={styles.notifModalCloseBtn}
              onPress={() => setNotifModalVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={20} color="#777777" />
            </TouchableOpacity>

            <View
              style={[
                styles.notifModalIconCircle,
                {
                  backgroundColor:
                    notifModalConfig.type === 'success'
                      ? '#05B686'
                      : notifModalConfig.type === 'off'
                      ? '#4B5563'
                      : '#E35436',
                },
              ]}
            >
              <Ionicons
                name={
                  notifModalConfig.type === 'success'
                    ? 'notifications'
                    : notifModalConfig.type === 'off'
                    ? 'notifications-off'
                    : 'alert-circle'
                }
                size={28}
                color="#FFFFFF"
              />
            </View>

            <Text style={styles.notifModalTitle}>{notifModalConfig.title}</Text>
            <Text style={styles.notifModalMessage}>{notifModalConfig.message}</Text>

            <TouchableOpacity
              style={[
                styles.notifModalButton,
                {
                  backgroundColor:
                    notifModalConfig.type === 'success' ? '#05B686' : '#1E1E1E',
                },
              ]}
              onPress={() => setNotifModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.notifModalButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7EB',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
    alignItems: 'center',
  },

  /* ── Brand Header Pill ── */
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6DFD0',
    borderRadius: 50,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 28,
    width: '100%',
    maxWidth: 400,
    marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 12) + 4 : 8,
    marginBottom: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  brandLogoCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  brandLogoImage: {
    width: 28,
    height: 28,
  },
  brandName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2A2A2A',
    letterSpacing: 1.0,
    fontStyle: 'italic',
    flex: 1,
  },

  /* ── Smooth Animated Toggle Container ── */
  toggleContainer: {
    width: 196,
    height: 54,
    borderRadius: 27,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  openTextWrapper: {
    position: 'absolute',
    left: 36,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  closedTextWrapper: {
    position: 'absolute',
    right: 28,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  powerCircle: {
    position: 'absolute',
    left: 8,
    top: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── NOTIFICATIONS Pill Button ── */
  notifPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
    height: 46,
    width: 220,
    gap: 8,
    marginTop: 14,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  notifPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },

  /* ── MY MENU Button ── */
  myMenuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 50,
    height: 54,
    width: 196,
    gap: 10,
    marginBottom: 36,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  myMenuText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },

  /* ── Stats Grid ── */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    width: '100%',
    maxWidth: 400,
    justifyContent: 'space-between',
  },
  statCard: {
    width: '47.5%',
    backgroundColor: '#E6DFD0',
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7A7263',
    letterSpacing: 0.8,
    marginBottom: 12,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1C1C',
    textAlign: 'center',
  },

  /* ── Custom Styled Notification Modal Styles ── */
  notifModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  notifModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#F7F7EB',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
  },
  notifModalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  notifModalIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  notifModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  notifModalMessage: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555555',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  notifModalButton: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifModalButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
});
