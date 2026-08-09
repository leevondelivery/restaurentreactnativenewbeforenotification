import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Platform,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';

import CustomLoader from '@/components/CustomLoader';
import { useOrders } from '@/context/OrdersContext';

import './orders.css';

// Live Preparation Countdown Badge Component
function PrepTimerBadge({ order }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const targetEndTimeRef = useRef(0);

  useEffect(() => {
    const acceptedAtMs = order.acceptedAt
      ? new Date(order.acceptedAt).getTime()
      : Date.now();

    const prepMins = order.preparationTime || 15;
    const estimatedPrepEndTimeMs = order.estimatedPrepEndTime
      ? new Date(order.estimatedPrepEndTime).getTime()
      : acceptedAtMs + prepMins * 60000;

    const totalDuration = estimatedPrepEndTimeMs - acceptedAtMs;
    const elapsedOnServer = Date.now() - acceptedAtMs;
    const initialRemainingSecs = Math.max(
      0,
      Math.floor((totalDuration - elapsedOnServer) / 1000)
    );

    targetEndTimeRef.current = Date.now() + initialRemainingSecs * 1000;
    setSecondsLeft(initialRemainingSecs);

    const intervalId = setInterval(() => {
      const remaining = Math.floor((targetEndTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        setSecondsLeft(0);
        clearInterval(intervalId);
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [order.acceptedAt, order.estimatedPrepEndTime, order.preparationTime]);

  if (secondsLeft <= 0) {
    return (
      <View style={styles.saviorBadge}>
        <Ionicons name="bicycle" size={16} color="#FFFFFF" />
        <Text style={styles.saviorBadgeText}>Savior At Door</Text>
      </View>
    );
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <View style={styles.prepBadge}>
      <Ionicons name="time-outline" size={16} color="#E05638" />
      <Text style={styles.prepBadgeText}>Prep: {formattedTime}</Text>
    </View>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const { orders, loading, fetchGlobalOrders, restaurantInfo } = useOrders();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedAccordionMap, setExpandedAccordionMap] = useState({});

  // Receipt Modal State
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState(null);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);

  // 5-Second Background Polling Loop for accepted orders
  useEffect(() => {
    fetchGlobalOrders(true);
    const pollingInterval = setInterval(() => {
      fetchGlobalOrders(true);
    }, 5000);

    return () => clearInterval(pollingInterval);
  }, [fetchGlobalOrders]);

  // Android Back Button Interception
  useEffect(() => {
    const onBackPress = () => {
      if (invoiceModalVisible) {
        setInvoiceModalVisible(false);
        setSelectedInvoiceOrder(null);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );
    return () => subscription.remove();
  }, [invoiceModalVisible]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchGlobalOrders(false);
    setRefreshing(false);
  };

  const toggleAccordion = (id) => {
    setExpandedAccordionMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
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

  const handleOpenInvoiceModal = (orderObj) => {
    setSelectedInvoiceOrder(orderObj);
    setInvoiceModalVisible(true);
  };

  const generateInvoiceHtml = (order) => {
    const restName = order.restaurantName || restaurantInfo.name || 'Amigoo Noshery';
    const restAddress = restaurantInfo.address || 'Nandyal Road, Kurnool';
    const fssaiNum = restaurantInfo.fssai || '12345678901234';
    const orderIdVal = order.orderId || order._id || 'ORD-00000';

    const dateStr = order.acceptedAt
      ? new Date(order.acceptedAt).toLocaleString()
      : new Date().toLocaleString();

    const commRate = order.commissionRate ?? order.commission ?? restaurantInfo.commission ?? 12;
    const itemsRaw = order.items && order.items.length > 0 ? order.items : [];

    const itemsList = itemsRaw.map((it) => {
      const rawPrice = it.originalPrice ?? it.price ?? 0;
      const discountedPrice =
        it.priceAfterCommission ?? rawPrice * (1 - commRate / 100);
      return {
        name: it.name || 'Item',
        quantity: it.quantity || 1,
        price: discountedPrice,
      };
    });

    const calculatedNetTotal = itemsList.reduce(
      (acc, it) => acc + it.price * it.quantity,
      0
    );

    const netTotal = order.totalPriceAfterCommission ?? order.netEarnings ?? calculatedNetTotal;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
          <title>Receipt - ${orderIdVal}</title>
          <style>
            @page {
              size: auto;
              margin: 0;
            }
            body {
              font-family: 'Courier New', Courier, monospace;
              padding: 24px;
              color: #111111;
              background-color: #ffffff;
              max-width: 420px;
              margin: 0 auto;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { text-align: center; margin: 10px 0; color: #888888; letter-spacing: 1px; }
            table { width: 100%; border-collapse: collapse; margin: 12px 0; }
            th, td { font-family: 'Courier New', Courier, monospace; padding: 6px 0; font-size: 13px; }
            th { text-align: left; font-weight: bold; }
            .right { text-align: right; font-weight: bold; }
            .total-row td { border-top: 1px dashed #444; border-bottom: 1px dashed #444; font-size: 15px; padding: 8px 0; }
            .footer { margin-top: 18px; font-size: 11px; color: #666; }
          </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 18px;">${restName}</div>
          <div class="center" style="font-size: 12px; margin-top: 4px;">Address: ${restAddress}</div>
          <div class="center" style="font-size: 12px;">FSSAI: ${fssaiNum}</div>
          
          <div class="divider">---------------------------------------------</div>
          
          <div style="font-size: 13px;"><strong>Order ID:</strong> ${orderIdVal}</div>
          <div style="font-size: 13px;"><strong>Date:</strong> ${dateStr}</div>
          
          <div class="divider">---------------------------------------------</div>
          
          <table>
            <thead>
              <tr>
                <th>ITEM</th>
                <th class="center">QTY</th>
                <th class="right">NET PRICE</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList
                .map(
                  (item) => `
                <tr>
                  <td>${item.name}</td>
                  <td class="center">${item.quantity}</td>
                  <td class="right">₹${Number(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              `
                )
                .join('')}
              <tr class="total-row">
                <td colspan="2" class="bold">TOTAL (Net After ${commRate}% Comm)</td>
                <td class="right bold">₹${Number(netTotal).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="divider">---------------------------------------------</div>
          
          <div class="center footer">
            Thank you for ordering with us!<br/>
            Have a pleasant meal!
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintReceipt = async (order) => {
    try {
      const html = generateInvoiceHtml(order);

      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Print.printAsync({ uri });
      }
    } catch (err) {
      console.error('Error printing receipt:', err);
    }
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
            onRefresh={handleRefresh}
            colors={['#111111']}
            tintColor="#111111"
          />
        }
      >
        {/* Header Row */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButtonCircle}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#111111" />
          </TouchableOpacity>

          <View style={styles.topHeaderPill}>
            <Ionicons name="document-text" size={20} color="#111111" />
            <Text style={styles.topHeaderText}>Accepted Orders</Text>
          </View>
        </View>

        {loading && (
          <CustomLoader
            visible={loading}
            title="Loading Orders..."
            subtitle="Fetching active preparing orders"
          />
        )}

        {!loading && orders.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-clear-outline" size={48} color="#9B8F6E" />
            </View>
            <Text style={styles.emptyTitle}>No Active Orders</Text>
            <Text style={styles.emptySubtitle}>
              Accepted orders being prepared will appear here with live prep countdown timers.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefresh}
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
            : new Date().toLocaleString();

          const commRate = Number(
            order.commissionRate ?? order.commission ?? restaurantInfo.commission ?? 12
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

          const isExpanded = !!expandedAccordionMap[order._id || orderIdVal];

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
                  onPress={() => handlePrintReceipt(order)}
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

      {/* Invoice Receipt Modal Preview */}
      {selectedInvoiceOrder && (
        <Modal
          visible={invoiceModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setInvoiceModalVisible(false);
            setSelectedInvoiceOrder(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.receiptModalCard}>
              <TouchableOpacity
                style={styles.closeCrossCircle}
                onPress={() => {
                  setInvoiceModalVisible(false);
                  setSelectedInvoiceOrder(null);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#111111" />
              </TouchableOpacity>

              <ScrollView style={styles.receiptPaperCard} showsVerticalScrollIndicator={false}>
                <View style={styles.restaurantHeaderSection}>
                  <Text style={styles.restaurantNameText}>
                    🍽️ {selectedInvoiceOrder.restaurantName || restaurantInfo.name || 'Amigoo Noshery'}
                  </Text>
                  <Text style={styles.restaurantSubText}>
                    Address: {restaurantInfo.address}
                  </Text>
                  <Text style={styles.restaurantSubText}>
                    FSSAI: {restaurantInfo.fssai}
                  </Text>
                </View>

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                <Text style={styles.receiptOrderText}>
                  Order ID: {selectedInvoiceOrder.orderId || selectedInvoiceOrder._id}
                </Text>
                <Text style={styles.receiptOrderText}>
                  Date: {selectedInvoiceOrder.acceptedAt ? new Date(selectedInvoiceOrder.acceptedAt).toLocaleString() : new Date().toLocaleString()}
                </Text>

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                {(selectedInvoiceOrder.items || []).map((it, i) => {
                  const rawP = it.originalPrice ?? it.price ?? 0;
                  const comm = selectedInvoiceOrder.commissionRate ?? restaurantInfo.commission ?? 12;
                  const discP = it.priceAfterCommission ?? rawP * (1 - comm / 100);
                  return (
                    <View key={i} style={styles.receiptItemRow}>
                      <Text style={[styles.receiptItemText, { flex: 2 }]}>{it.name}</Text>
                      <Text style={[styles.receiptItemText, { flex: 1, textAlign: 'center' }]}>
                        {it.quantity}
                      </Text>
                      <Text style={[styles.receiptItemText, { flex: 1, textAlign: 'right' }]}>
                        ₹{Number(discP * (it.quantity || 1)).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                <View style={styles.receiptTotalRow}>
                  <Text style={styles.receiptTotalLabel}>TOTAL (Net):</Text>
                  <Text style={styles.receiptTotalValue}>
                    ₹{Number(selectedInvoiceOrder.totalPriceAfterCommission ?? selectedInvoiceOrder.netEarnings ?? 0).toFixed(2)}
                  </Text>
                </View>

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                <Text style={styles.receiptFooterText}>
                  Thank you for ordering with us!
                </Text>
              </ScrollView>

              <TouchableOpacity
                style={styles.modalPrintButton}
                onPress={() => {
                  handlePrintReceipt(selectedInvoiceOrder);
                  setInvoiceModalVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="print" size={18} color="#FFFFFF" />
                <Text style={styles.modalPrintButtonText}>Print Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
    marginBottom: 20,
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
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E0D6BC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  receiptModalCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  closeCrossCircle: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  receiptPaperCard: {
    width: '100%',
    marginBottom: 16,
  },
  restaurantHeaderSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  restaurantNameText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 4,
  },
  restaurantSubText: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 2,
  },
  dashedDivider: {
    textAlign: 'center',
    color: '#888888',
    marginVertical: 8,
  },
  receiptOrderText: {
    fontSize: 13,
    color: '#111111',
    marginBottom: 4,
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptItemText: {
    fontSize: 13,
    color: '#111111',
  },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  receiptTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  receiptTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  receiptFooterText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666666',
    marginTop: 8,
  },
  modalPrintButton: {
    backgroundColor: '#0066FF',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalPrintButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
