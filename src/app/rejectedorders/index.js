import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';

import CustomLoader from '@/components/CustomLoader';

import './rejectedorders.css';

export default function RejectedOrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restId, setRestId] = useState('');

  useEffect(() => {
    fetchRejectedOrders();
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
    return `${baseUrl}/api/orders/rejected?restaurantId=${encodeURIComponent(restaurantId || '')}`;
  };

  const fetchRejectedOrders = async () => {
    try {
      setLoading(true);
      const storedUserStr = await AsyncStorage.getItem('userData');
      const storedRestId = await AsyncStorage.getItem('restId');
      let targetRestId = '';
      if (storedUserStr) {
        try {
          const storedUser = JSON.parse(storedUserStr);
          targetRestId = String(
            storedUser?.restId ||
            storedUser?.restaurantId ||
            storedUser?.restaurant_id ||
            storedUser?._id ||
            storedUser?.id ||
            ''
          ).trim();
        } catch (e) {}
      }
      if (!targetRestId && storedRestId) {
        targetRestId = String(storedRestId).trim();
      }
      setRestId(targetRestId);

      const API_URL = getApiUrl(targetRestId);
      console.log('Fetching rejected orders from:', API_URL);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(API_URL, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await response.json();

      if (response.ok && data.success && Array.isArray(data.orders)) {
        const matchingOrders = data.orders.filter((ord) => {
          if (!targetRestId) return false;
          const ordRestId = String(
            ord.restaurantId || ord.restId || ord.restaurant_id || ord.storeId || ord.vendorId || ord.restaurant || ''
          ).trim();
          return ordRestId === String(targetRestId).trim();
        });
        setOrders(matchingOrders);
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.error('Error fetching rejected orders:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const isNavigatingRef = React.useRef(false);

  const handleBack = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Row with Back Button & Center Rejected Orders Pill */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButtonCircle}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#111111" />
          </TouchableOpacity>

          <View style={styles.topHeaderPill}>
            <Ionicons name="ban-outline" size={20} color="#111111" />
            <Text style={styles.topHeaderText}>Rejected Orders</Text>
          </View>
        </View>

        {loading && (
          <CustomLoader
            visible={loading}
            title="Loading Rejected Orders..."
            subtitle="Fetching rejected orders"
          />
        )}

        {!loading && orders.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="ban-outline" size={64} color="#736B5E" />
            <Text style={styles.emptyTitle}>No Rejected Orders</Text>
            <Text style={styles.emptySubtitle}>
              Orders that you reject will appear in this list.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchRejectedOrders}
              activeOpacity={0.8}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {orders.map((order) => {
          const commRate = Number(order.commission !== undefined ? order.commission : 12);
          const keepPct = 100 - commRate;

          const formattedDate =
            order.createdAtFormatted ||
            (order.rejectedAt
              ? new Date(order.rejectedAt).toLocaleString()
              : order.orderDate
              ? new Date(order.orderDate).toLocaleString()
              : order.createdAt
              ? new Date(order.createdAt).toLocaleString()
              : new Date().toLocaleString());

          const itemsList =
            order.items && order.items.length > 0
              ? order.items
              : [{ name: 'Item', quantity: 1, price: order.totalPrice || 0 }];

          // Calculate price after commission deduction for each item
          const itemCalculations = itemsList.map((it) => {
            const rawPrice = Number(it.originalPrice ?? it.price ?? 0);
            const discountedPrice =
              it.priceAfterCommission !== undefined
                ? Number(it.priceAfterCommission)
                : rawPrice * (1 - commRate / 100);
            const qty = Number(it.quantity || it.qty || 1);
            const lineTotal = discountedPrice * qty;
            return {
              ...it,
              rawPrice,
              discountedPrice,
              qty,
              lineTotal,
            };
          });

          const totalQty = itemCalculations.reduce((acc, it) => acc + it.qty, 0);
          const netEarningsTotal = itemCalculations.reduce((acc, it) => acc + it.lineTotal, 0);

          return (
            <View key={order._id || order.orderId} style={styles.orderOuterCard}>
              {/* Top Header Strip */}
              <View style={styles.orderTopStrip}>
                <Text style={styles.orderIdText}>ORDER ID: {order.orderId || order._id}</Text>
                <Text style={styles.orderDateText}>{formattedDate}</Text>
              </View>

              {/* Table Header Row */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCol, { flex: 2 }]}>ITEM</Text>
                <Text style={[styles.tableHeaderCol, { flex: 1, textAlign: 'center' }]}>QTY</Text>
                <Text style={[styles.tableHeaderCol, { flex: 1, textAlign: 'right' }]}>NET PRICE</Text>
              </View>

              {/* Table Items */}
              {itemCalculations.map((item, idx) => (
                <View key={idx} style={styles.tableItemRow}>
                  <Text style={styles.itemNameText}>{item.name}</Text>
                  <Text style={styles.itemQtyText}>x{item.qty}</Text>
                  <Text style={styles.itemPriceText}>₹{Number(item.discountedPrice).toFixed(2)}</Text>
                </View>
              ))}

              <View style={styles.orderDivider} />

              {/* Totals Section */}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabelText}>Total Quantity</Text>
                <Text style={styles.totalValText}>{totalQty}</Text>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabelText}>
                  Net Earnings ({keepPct}% after {commRate}% commission)
                </Text>
                <Text style={styles.totalValText}>₹{Number(netEarningsTotal).toFixed(2)}</Text>
              </View>

              {/* Rejected Status Pill Badge */}
              <View style={styles.rejectedBadgePill}>
                <Ionicons name="ban" size={14} color="#FFFFFF" />
                <Text style={styles.rejectedBadgeText}>Rejected</Text>
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
  headerRow: {
    width: '100%',
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: 8,
    marginBottom: 24,
  },
  backButtonCircle: {
    position: 'absolute',
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  topHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E0D6BC',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 26,
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
    backgroundColor: '#F7F7EB',
    borderRadius: 24,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E6DFD1',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    position: 'relative',
  },
  orderTopStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E5DCC6',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  orderIdText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  orderDateText: {
    fontSize: 12,
    color: '#666666',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE3D2',
    marginBottom: 4,
  },
  tableHeaderCol: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666666',
  },
  tableItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemNameText: {
    flex: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  itemQtyText: {
    flex: 1,
    fontSize: 14,
    textAlign: 'center',
    color: '#555555',
  },
  itemPriceText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    color: '#111111',
  },
  orderDivider: {
    height: 1,
    backgroundColor: '#EAE3D2',
    marginVertical: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  totalLabelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#444444',
  },
  totalValText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  rejectedBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E4583D',
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  rejectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
