import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter, useFocusEffect } from 'expo-router';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useOrders } from '@/context/OrdersContext';
import { fetchAcceptedOrders, fetchRestaurantStats, updateRestaurantStatus } from '@/services/api';
import {
  Animated,
  Easing,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';

import './home.css';

export default function HomeScreen() {
  const router = useRouter();
  const reduxUserData = useSelector((state) => state.user.userData);
  const { orders: globalOrders, fetchGlobalOrders } = useOrders();
  const [userData, setUserData] = useState(reduxUserData || null);
  const [isOpen, setIsOpen] = useState(true);

  // Animated value: 1 = OPEN, 0 = CLOSED
  const animVal = useRef(new Animated.Value(1)).current;

  // Real stats loaded from acceptedbyrestorents collection by restaurantId
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [todayOrders, setTodayOrders] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);

  // Instantly sync user profile data from Redux if available
  useEffect(() => {
    if (reduxUserData) {
      setUserData(reduxUserData);
      const activeBool = reduxUserData.isActive !== undefined ? Boolean(reduxUserData.isActive) : true;
      setIsOpen(activeBool);
      animVal.setValue(activeBool ? 1 : 0);
    }
  }, [reduxUserData]);

  // Compute stats instantly from background orders context
  useEffect(() => {
    const rawOrdersList = Array.isArray(globalOrders) ? globalOrders : [];
    const targetRestId = String(
      userData?.restId || userData?.restaurantId || userData?.restaurant_id || userData?._id || userData?.id || ''
    ).trim();

    const matchingOrders = rawOrdersList.filter((ord) => {
      if (!targetRestId) return true;
      const ordRestId = String(
        ord.restaurantId || ord.restId || ord.restaurant_id || ord.storeId || ord.vendorId || ord.restaurant || ''
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
      const earnings = Number(
        ord.totalPriceAfterCommission ?? ord.netEarnings ?? ord.totalPrice ?? 0
      );
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
      } else {
        tOrders += 1;
        tEarnings += earnings;
      }
    });

    setTodayEarnings(tEarnings);
    setTodayOrders(tOrders);
    setTotalEarnings(totEarnings);
    setTotalOrders(totOrders);
  }, [globalOrders, userData]);

  // Load stats on mount and whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [])
  );

  const fetchStats = async (targetRestId) => {
    try {
      setLoadingStats(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetchAcceptedOrders(targetRestId, controller.signal);
      clearTimeout(timeoutId);

      const data = await response.json();
      console.log('Fetched accepted orders for home stats:', data);

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
            if (Array.isArray(statsJson.orders)) {
              rawOrdersList = statsJson.orders;
            } else if (statsJson.success && statsJson.todayEarnings !== undefined && (!targetRestId || targetRestId === '1')) {
              // If stats JSON returned direct stats numbers from backend
              // BUT first verify if restaurantId filter applies:
              if (statsJson.restaurantId && String(statsJson.restaurantId).trim() !== String(targetRestId).trim()) {
                setTodayEarnings(0);
                setTodayOrders(0);
                setTotalEarnings(0);
                setTotalOrders(0);
                return;
              }
            }
          }
        } catch (e) {}
      }

      // STRICT FILTER: Compare restaurant ID of each order with targetRestId
      const matchingOrders = rawOrdersList.filter((ord) => {
        if (!targetRestId) return false;
        const ordRestId = String(
          ord.restaurantId || ord.restId || ord.restaurant_id || ord.storeId || ord.vendorId || ord.restaurant || ''
        ).trim();
        return ordRestId === String(targetRestId).trim();
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
        const earnings = Number(
          ord.totalPriceAfterCommission ?? ord.netEarnings ?? ord.totalPrice ?? 0
        );
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
        } else {
          tOrders += 1;
          tEarnings += earnings;
        }
      });

      setTodayEarnings(tEarnings);
      setTodayOrders(tOrders);
      setTotalEarnings(totEarnings);
      setTotalOrders(totOrders);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Error fetching home stats:', err);
      }
    } finally {
      setLoadingStats(false);
    }
  };

  const loadUserData = async () => {
    try {
      // Extend 30-day session countdown whenever app is used
      await AsyncStorage.setItem('lastActiveTimestamp', Date.now().toString());
      const storedUser = await AsyncStorage.getItem('userData');
      const storedRestId = await AsyncStorage.getItem('restId');
      let targetRestId = '';

      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        setUserData(parsed);
        const activeBool = parsed.isActive !== undefined ? Boolean(parsed.isActive) : true;
        setIsOpen(activeBool);
        animVal.setValue(activeBool ? 1 : 0);
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
    } catch (error) {
      console.error('Error loading user data from AsyncStorage:', error);
      fetchStats('');
    }
  };

  const handleToggle = async () => {
    const nextState = !isOpen;

    // 1. Instantly trigger smooth animation
    setIsOpen(nextState);
    Animated.timing(animVal, {
      toValue: nextState ? 1 : 0,
      duration: 260,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
      useNativeDriver: false,
    }).start();

    // 2. Update local AsyncStorage user data
    const updatedUserData = {
      ...(userData || {}),
      isActive: nextState,
    };
    setUserData(updatedUserData);
    try {
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));
    } catch (err) {
      console.error('Error updating AsyncStorage on status toggle:', err);
    }

    // 3. Update MongoDB restuarentusers collection via API
    try {
      const targetRestId =
        userData?.restId ||
        userData?.restaurantId ||
        userData?.restaurant_id ||
        userData?._id ||
        '';
      const targetPhone = userData?.phone || userData?.mobileNumber || '';

      const response = await updateRestaurantStatus({
        userId: userData?._id,
        restId: targetRestId,
        phone: targetPhone,
        isActive: nextState,
      });

      const data = await response.json();
      console.log('Update status MongoDB response:', data);
    } catch (err) {
      console.error('Error updating isActive in MongoDB backend:', err);
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

  const openTextOpacity = animVal;
  const closedTextOpacity = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
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
          activeOpacity={0.9}
          onPress={handleToggle}
        >
          <Animated.View style={[styles.toggleContainer, { backgroundColor: bgColor }]}>
            {/* OPEN Text on Left */}
            <Animated.View style={[styles.openTextWrapper, { opacity: openTextOpacity }]} pointerEvents="none">
              <Text style={styles.toggleText}>OPEN</Text>
            </Animated.View>

            {/* CLOSED Text on Right */}
            <Animated.View style={[styles.closedTextWrapper, { opacity: closedTextOpacity }]} pointerEvents="none">
              <Text style={styles.toggleText}>CLOSED</Text>
            </Animated.View>

            {/* Sliding White Power Circle */}
            <Animated.View
              style={[
                styles.powerCircle,
                { transform: [{ translateX: circleX }] },
              ]}
            >
              <Ionicons
                name="power"
                size={20}
                color={isOpen ? '#05B686' : '#E35436'}
              />
            </Animated.View>
          </Animated.View>
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
});
