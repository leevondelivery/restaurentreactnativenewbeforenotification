import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';

import CustomLoader from '@/components/CustomLoader';
import './tracker.css';

export default function TrackerScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const isNavigatingRef = useRef(false);
  // Track if we have ever successfully loaded orders — skip spinner on subsequent tab taps
  const hasLoadedRef = useRef(false);

  // 1-second clock for countdown timers
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  const getApiUrl = (restaurantId) => {
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
    return `${baseUrl}/api/orders/acceptedbyrestorents?restaurantId=${encodeURIComponent(restaurantId || '')}`;
  };

  // Stable fetch — useCallback with [] so reference never changes between renders
  const fetchAcceptedOrders = useCallback(async (isSilent = false) => {
    try {
      // Only show full loading spinner on the very first fetch ever
      if (!isSilent && !hasLoadedRef.current) {
        setLoading(true);
      }

      const storedUserStr = await AsyncStorage.getItem('userData');
      const storedRestId = await AsyncStorage.getItem('restId');
      let targetRestId = '';

      if (storedUserStr) {
        try {
          const u = JSON.parse(storedUserStr);
          targetRestId = String(
            u?.restId || u?.restaurantId || u?.restaurant_id || u?._id || u?.id || storedRestId || ''
          ).trim();
        } catch (e) {}
      }
      if (!targetRestId && storedRestId) {
        targetRestId = String(storedRestId).trim();
      }

      const API_URL = getApiUrl(targetRestId);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(API_URL, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.orders)) {
          const matchingOrders = data.orders.filter((ord) => {
            if (!targetRestId) return false;
            const ordRestId = String(
              ord.restaurantId || ord.restId || ord.restaurant_id || ord.storeId || ord.vendorId || ord.restaurant || ''
            ).trim();
            return ordRestId === String(targetRestId).trim();
          });
          const processedOrders = matchingOrders.map((ord, idx) => ({
            ...ord,
            startTime: ord.createdAt
              ? new Date(ord.createdAt).getTime()
              : ord.orderDate
              ? new Date(ord.orderDate).getTime()
              : Date.now() - idx * 180000,
          }));
          hasLoadedRef.current = true;
          setOrders(processedOrders);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.log('Tracker fetch notice:', err.message);
      }
    } finally {
      // Always clear loading — never gate on isMountedRef so loading never gets permanently stuck
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Stable useFocusEffect — fetchAcceptedOrders ref never changes so this only runs on focus/blur
  useFocusEffect(
    useCallback(() => {
      isNavigatingRef.current = false;
      // Silent if already loaded before — no spinner flash when switching tabs
      fetchAcceptedOrders(hasLoadedRef.current);

      const intervalId = setInterval(() => {
        fetchAcceptedOrders(true);
      }, 5000);

      return () => clearInterval(intervalId);
    }, [fetchAcceptedOrders])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchAcceptedOrders(true);
  };

  const handlePrintInvoice = (order) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 400);

    router.push({
      pathname: '/invoice',
      params: {
        orderData: JSON.stringify(order),
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#111111']}
            tintColor="#111111"
          />
        }
      >
        {/* Header Pill */}
        <View style={styles.topHeaderPill}>
          <Ionicons name="checkmark-circle" size={20} color="#0AB28D" />
          <Text style={styles.topHeaderText}>Accepted Orders</Text>
        </View>

        {loading && orders.length === 0 && (
          <CustomLoader
            visible={loading}
            title="Loading Orders..."
            subtitle="Fetching accepted orders"
          />
        )}

        {!loading && orders.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#736B5E" />
            <Text style={styles.emptyTitle}>No Accepted Orders</Text>
            <Text style={styles.emptySubtitle}>
              Orders that you accept will appear here in real-time.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={() => fetchAcceptedOrders(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {orders.map((order) => {
          const orderIdVal = order.orderId || order._id || 'ORD-00000';
          const formattedDate = order.acceptedAt
            ? new Date(order.acceptedAt).toLocaleString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })
            : order.createdAt
            ? new Date(order.createdAt).toLocaleString()
            : new Date().toLocaleString();

          const commRate = Number(
            order.commissionRate ?? order.commission ?? 12
          );

          const itemsRaw = order.items && order.items.length > 0 ? order.items : [];

          const itemsList = itemsRaw.map((it) => {
            const rawPrice = Number(it.originalPrice ?? it.price ?? 0);
            const discountedPrice =
              it.priceAfterCommission !== undefined
                ? Number(it.priceAfterCommission)
                : rawPrice * (1 - commRate / 100);
            const qty = Number(it.quantity || it.qty || 1);
            return {
              ...it,
              rawPrice,
              discountedPrice,
              qty,
            };
          });

          const totalDistinctItems = itemsList.length;
          const totalQtySum = itemsList.reduce((acc, it) => acc + it.qty, 0);

          const calculatedNetEarnings = itemsList.reduce(
            (acc, it) => acc + it.discountedPrice * it.qty,
            0
          );

          const finalTotalPrice = Number(
            order.totalPriceAfterCommission ?? order.netEarnings ?? calculatedNetEarnings
          );

          return (
            <View key={order._id || orderIdVal} style={styles.orderOuterCard}>
              {/* Card Title & Date Header */}
              <View style={styles.orderHeaderSection}>
                <Text style={styles.orderIdMainTitle}>ORDER ID : {orderIdVal}</Text>
                <Text style={styles.orderHeaderDateText}>{formattedDate}</Text>
              </View>

              <View style={styles.headerDivider} />

              {/* Items Table Header */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.colHeader, { flex: 2 }]}>ITEMS</Text>
                <Text style={[styles.colHeader, { flex: 1, textAlign: 'center' }]}>
                  QTY
                </Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right' }]}>
                  PRICE
                </Text>
              </View>

              {/* Items Rows */}
              {itemsList.map((item, idx) => (
                <View key={idx} style={styles.tableItemRow}>
                  <Text style={styles.itemNameText}>{item.name}</Text>
                  <Text style={styles.itemQtyText}>{item.qty}</Text>

                  <View style={styles.priceColumnContainer}>
                    {/* Strikethrough Raw Price & Red Commission Badge */}
                    <View style={styles.strikethroughRow}>
                      <Text style={styles.strikethroughPriceText}>
                        ₹{item.rawPrice}
                      </Text>
                      <Text style={styles.commissionBadgeText}>
                        -{commRate}%
                      </Text>
                    </View>
                    {/* Net Price After Commission */}
                    <Text style={styles.finalNetPriceText}>
                      ₹{Number(item.discountedPrice).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}

              <View style={styles.orderDivider} />

              {/* Totals Row */}
              <View style={styles.totalsRow}>
                <View style={styles.totalCol}>
                  <Text style={styles.totalColLabel}>Total Items</Text>
                  <Text style={styles.totalColVal}>{totalDistinctItems}</Text>
                </View>

                <View style={styles.totalCol}>
                  <Text style={styles.totalColLabel}>Total QTY</Text>
                  <Text style={styles.totalColVal}>{totalQtySum}</Text>
                </View>

                <View style={[styles.totalCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.totalColLabel}>Total Price</Text>
                  <Text style={styles.totalPriceMainVal}>
                    ₹{finalTotalPrice.toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Action Button: Print Invoice */}
              <View style={styles.cardBottomActionRow}>
                <TouchableOpacity
                  style={styles.printInvoiceCapsuleButton}
                  onPress={() => handlePrintInvoice(order)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="print" size={18} color="#FFFFFF" />
                  <Text style={styles.printInvoiceButtonText}>Print Invoice</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
    alignItems: 'center',
  },
  topHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E0D6BC',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 26,
    marginTop: 8,
    marginBottom: 20,
  },
  topHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#777777',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  refreshButton: {
    backgroundColor: '#111111',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  orderOuterCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#E0D6BC',
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  orderHeaderSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  orderIdMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: 0.5,
  },
  orderHeaderDateText: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#D8CEB2',
    marginVertical: 12,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 6,
  },
  colHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555555',
    letterSpacing: 0.5,
  },
  tableItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  itemNameText: {
    flex: 2,
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  itemQtyText: {
    flex: 1,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
    color: '#111111',
  },
  priceColumnContainer: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  strikethroughRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  strikethroughPriceText: {
    fontSize: 13,
    color: '#888888',
    textDecorationLine: 'line-through',
  },
  commissionBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E4583D',
  },
  finalNetPriceText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
  },
  orderDivider: {
    height: 1,
    backgroundColor: '#D8CEB2',
    marginVertical: 14,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  totalCol: {
    flex: 1,
  },
  totalColLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 4,
  },
  totalColVal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  totalPriceMainVal: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111111',
  },
  cardBottomActionRow: {
    alignItems: 'flex-end',
  },
  printInvoiceCapsuleButton: {
    backgroundColor: '#0066FF',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  printInvoiceButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
