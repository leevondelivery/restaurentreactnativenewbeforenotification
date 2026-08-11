import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  BackHandler,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useOrders } from '@/context/OrdersContext';
import { stopOrderNotificationSound } from '@/services/NotificationService';
import { getDisplayOrderId } from '../orders';

import './notifications.css';

export default function NotificationsScreen() {
  const router = useRouter();
  const { incomingOrders, acceptOrder: contextAcceptOrder, rejectOrder: contextRejectOrder, fetchGlobalOrders, loading, restaurantInfo } = useOrders();
  const safeIncomingOrders = Array.isArray(incomingOrders) ? incomingOrders : [];
  const [refreshing, setRefreshing] = useState(false);
  const [rejectingLoading, setRejectingLoading] = useState(false);
  const [acceptingLoading, setAcceptingLoading] = useState(false);

  // Custom Reject Confirmation Modal State
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [orderToReject, setOrderToReject] = useState(null);

  // Custom Accept Preparation Time Modal State
  const [acceptModalVisible, setAcceptModalVisible] = useState(false);
  const [orderToAccept, setOrderToAccept] = useState(null);

  // Device level Back Button / Gesture Navigation Compatibility
  useEffect(() => {
    const onBackPress = () => {
      if (rejectModalVisible) {
        setRejectModalVisible(false);
        return true;
      }
      if (acceptModalVisible) {
        setAcceptModalVisible(false);
        return true;
      }
      router.replace('/home');
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [rejectModalVisible, acceptModalVisible, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchGlobalOrders(false);
    setRefreshing(false);
  };

  // Open custom styled reject modal
  const handleOpenRejectModal = (order) => {
    setOrderToReject(order);
    setRejectModalVisible(true);
  };

  // Confirm Reject Action
  const handleConfirmReject = async () => {
    if (!orderToReject) return;
    const targetOrderId = orderToReject?.orderId || orderToReject?._id;
    setRejectingLoading(true);

    try {
      if (targetOrderId) {
        await contextRejectOrder(targetOrderId);
        stopOrderNotificationSound(targetOrderId);
      }
      setRejectModalVisible(false);
      setOrderToReject(null);
    } catch (err) {
      console.error('Error rejecting order:', err);
    } finally {
      setRejectingLoading(false);
    }
  };

  // Open Preparation Time modal on Accept Order press
  const handleOpenAcceptModal = (order) => {
    setOrderToAccept(order);
    setAcceptModalVisible(true);
  };

  // Confirm Accept Order Action
  const handleConfirmAccept = async (prepMinutes) => {
    if (!orderToAccept) return;
    const targetOrderId = orderToAccept?.orderId || orderToAccept?._id;
    const prepMins = Number(prepMinutes || 0);

    setAcceptingLoading(true);

    try {
      if (targetOrderId) {
        await contextAcceptOrder(orderToAccept, prepMins);
        stopOrderNotificationSound(targetOrderId);
      }
      setAcceptModalVisible(false);
      setOrderToAccept(null);
    } catch (err) {
      console.error('Error accepting order:', err);
    } finally {
      setAcceptingLoading(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          safeIncomingOrders.length === 0 && styles.scrollContentEmpty,
        ]}
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
        {/* Header Pill */}
        <View style={styles.topHeaderPill}>
          <Ionicons name="notifications" size={20} color="#0AB28D" />
          <Text style={styles.topHeaderText}>Alerts</Text>
        </View>

        {safeIncomingOrders.length === 0 ? (
          /* Empty State when no incoming orders exist in DB */
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={64} color="#9B8F6E" />
            <Text style={styles.emptyTitle}>No Alerts Yet</Text>
            <Text style={styles.emptySubtitle}>
              New incoming customer orders will appear here.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefresh}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Render incoming orders fetched from MongoDB */
          safeIncomingOrders.map((order) => {
            const orderIdVal = getDisplayOrderId(order);
            const customerName = order.userName || order.customerName || 'Customer';
            const paymentStatus = order.paymentStatus || 'Paid';

            const formattedDate = order.createdAt
              ? new Date(order.createdAt).toLocaleString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: true,
                })
              : new Date().toLocaleString();

            const items = order.items && order.items.length > 0 ? order.items : [];

            const commRate = Number(
              order.commissionRate ?? order.commission ?? restaurantInfo?.commission ?? 12
            );

            // Calculate price after commission discount
            const itemCalculations = items.map((it) => {
              const rawPrice = it.originalPrice ?? it.price ?? 0;
              const discountedPrice =
                it.priceAfterCommission ?? rawPrice * (1 - commRate / 100);
              const qty = it.quantity || 1;
              const lineTotal = discountedPrice * qty;
              return {
                ...it,
                rawPrice,
                discountedPrice,
                qty,
                lineTotal,
              };
            });

            const netRestaurantTotal = itemCalculations.reduce(
              (acc, it) => acc + it.lineTotal,
              0
            );

            const keepPercentage = 100 - commRate;

            return (
              <View key={order._id || orderIdVal} style={styles.incomingCard}>
                {/* Header Strip with Order ID & Paid Badge */}
                <View style={styles.cardHeaderStrip}>
                  <View style={styles.orderIdContainer}>
                    <Ionicons name="receipt-outline" size={18} color="#111111" />
                    <Text style={styles.orderIdText}>ORDER ID: {orderIdVal}</Text>
                  </View>
                  <View style={styles.paymentBadge}>
                    <Text style={styles.paymentBadgeText}>{paymentStatus}</Text>
                  </View>
                </View>

                {/* Customer Box - Name and Date Only (No Phone, No Address) */}
                <View style={styles.customerBox}>
                  <View style={styles.customerRow}>
                    <Ionicons name="person-circle-outline" size={20} color="#444444" />
                    <Text style={styles.customerNameText}>{customerName}</Text>
                  </View>
                  <Text style={styles.dateText}>{formattedDate}</Text>
                </View>

                {/* Items Table */}
                <View style={styles.itemsTable}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.colHeader, { flex: 2, borderRightWidth: 1.5, borderRightColor: '#555555', paddingRight: 6 }]}>ITEM</Text>
                    <Text style={[styles.colHeader, { flex: 1, textAlign: 'center', borderRightWidth: 1.5, borderRightColor: '#555555', paddingHorizontal: 4 }]}>
                      QTY
                    </Text>
                    <Text style={[styles.colHeader, { flex: 1, textAlign: 'right', paddingLeft: 6 }]}>
                      NET PRICE
                    </Text>
                  </View>

                  {itemCalculations.map((it, idx) => (
                    <View key={idx} style={styles.tableRow}>
                      <Text style={[styles.itemName, { flex: 2, borderRightWidth: 1.5, borderRightColor: '#555555', paddingRight: 6 }]}>{it.name}</Text>
                      <Text style={[styles.itemQty, { flex: 1, textAlign: 'center', borderRightWidth: 1.5, borderRightColor: '#555555', paddingHorizontal: 4 }]}>x{it.qty}</Text>
                      <Text style={[styles.itemPrice, { flex: 1, textAlign: 'right', paddingLeft: 6 }]}>
                        ₹{Number(it.discountedPrice).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={styles.divider} />

                {/* Net Earnings Summary */}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Net Earnings</Text>
                  <Text style={styles.summaryVal}>
                    ₹{Number(netRestaurantTotal).toFixed(2)}
                  </Text>
                </View>

                {/* Action Buttons: Reject & Accept */}
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => handleOpenRejectModal(order)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.rejectButtonText}>Reject Order</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleOpenAcceptModal(order)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.acceptButtonText}>Accept Order</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Custom Styled Reject Confirmation Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <View style={styles.rejectModalOverlay}>
          <View style={styles.rejectModalCard}>
            {/* Top Close Cross */}
            <TouchableOpacity
              style={styles.modalCloseCross}
              onPress={() => setRejectModalVisible(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#777777" />
            </TouchableOpacity>

            {/* Red Terracotta Icon Circle */}
            <View style={styles.rejectIconCircle}>
              <Ionicons name="close-circle-outline" size={36} color="#FFFFFF" />
            </View>

            {/* Title */}
            <Text style={styles.rejectModalTitle}>
              Are you sure you want to reject this order?
            </Text>

            {/* Confirm Reject Button */}
            <TouchableOpacity
              style={[styles.confirmRejectButton, rejectingLoading && styles.buttonDisabled]}
              onPress={handleConfirmReject}
              disabled={rejectingLoading}
              activeOpacity={0.8}
            >
              {rejectingLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmRejectButtonText}>Reject Order</Text>
              )}
            </TouchableOpacity>

            {/* Not Now / Cancel Link */}
            <TouchableOpacity
              onPress={() => setRejectModalVisible(false)}
              activeOpacity={0.7}
              style={styles.cancelLinkButton}
              disabled={rejectingLoading}
            >
              <Text style={styles.cancelLinkText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Preparation Time Selection Modal (Matching Screenshot Design) */}
      <Modal
        visible={acceptModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAcceptModalVisible(false)}
      >
        <View style={styles.prepModalOverlay}>
          <View style={styles.prepModalCard}>
            {/* Header: Clock Icon + Preparation Time Title */}
            <View style={styles.prepHeaderRow}>
              <Ionicons name="time-outline" size={26} color="#E4583D" />
              <Text style={styles.prepModalTitle}>Preparation Time</Text>
            </View>

            <Text style={styles.prepModalSubtitle}>
              Select estimated preparation time for delivery boy pickup:
            </Text>

            {/* Preparation Time Options Grid */}
            <View style={styles.prepGrid}>
              <TouchableOpacity
                style={styles.prepOptionCard}
                onPress={() => handleConfirmAccept(5)}
                disabled={acceptingLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.prepOptionNumber}>5</Text>
                <Text style={styles.prepOptionUnit}>MINUTES</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.prepOptionCard}
                onPress={() => handleConfirmAccept(10)}
                disabled={acceptingLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.prepOptionNumber}>10</Text>
                <Text style={styles.prepOptionUnit}>MINUTES</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.prepOptionCard}
                onPress={() => handleConfirmAccept(20)}
                disabled={acceptingLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.prepOptionNumber}>20</Text>
                <Text style={styles.prepOptionUnit}>MINUTES</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.prepOptionCard}
                onPress={() => handleConfirmAccept(30)}
                disabled={acceptingLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.prepOptionNumber}>30</Text>
                <Text style={styles.prepOptionUnit}>MINUTES</Text>
              </TouchableOpacity>
            </View>

            {/* Items Ready Direct Button */}
            <TouchableOpacity
              style={styles.itemsReadyButton}
              onPress={() => handleConfirmAccept(0)}
              disabled={acceptingLoading}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={22} color="#0AB28D" />
              <Text style={styles.itemsReadyButtonText}>Items Ready</Text>
            </TouchableOpacity>

            {acceptingLoading && (
              <ActivityIndicator size="small" color="#111111" style={{ marginVertical: 8 }} />
            )}

            {/* CANCEL Button */}
            <TouchableOpacity
              style={styles.cancelCapsuleButton}
              onPress={() => setAcceptModalVisible(false)}
              disabled={acceptingLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelCapsuleText}>CANCEL</Text>
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
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
    alignItems: 'center',
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },
  topHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E0D6BC',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 26,
    marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 12) + 8 : 12,
    marginBottom: 20,
  },
  topHeaderText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 20,
    minHeight: 350,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#777777',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  incomingCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#F7F7EB',
    borderWidth: 1,
    borderColor: '#E6DFD1',
    borderRadius: 24,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeaderStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E5DCC6',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  orderIdContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderIdText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: 0.2,
  },
  paymentBadge: {
    backgroundColor: '#0AB28D',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  paymentBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  customerBox: {
    backgroundColor: '#EFE7D8',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  customerNameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  dateText: {
    fontSize: 13,
    color: '#777777',
    marginLeft: 28,
  },
  itemsTable: {
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE3D2',
    marginBottom: 4,
  },
  colHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555555',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemName: {
    flex: 2,
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
  },
  itemQty: {
    flex: 1,
    fontSize: 15,
    textAlign: 'center',
    color: '#444444',
  },
  itemPrice: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'right',
    color: '#111111',
  },
  divider: {
    height: 1.5,
    backgroundColor: '#555555',
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#444444',
    flex: 1,
  },
  summaryVal: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#E4583D',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  rejectButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  acceptButton: {
    flex: 1,
    height: 48,
    backgroundColor: '#0AB28D',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  /* Custom Styled Reject Confirmation Modal */
  rejectModalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  rejectModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#F7F7EB',
    borderRadius: 28,
    paddingTop: 24,
    paddingBottom: 26,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 8,
  },
  modalCloseCross: {
    position: 'absolute',
    top: 16,
    right: 18,
    zIndex: 10,
  },
  rejectIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E4583D',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#E4583D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  rejectModalTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 25,
  },
  confirmRejectButton: {
    backgroundColor: '#E4583D',
    borderRadius: 24,
    height: 48,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E4583D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmRejectButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelLinkButton: {
    marginTop: 14,
    paddingVertical: 6,
  },
  cancelLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666666',
    textDecorationLine: 'underline',
  },

  /* Preparation Time Selection Modal */
  prepModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  prepModalCard: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  prepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  prepModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
  },
  prepModalSubtitle: {
    fontSize: 13,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  prepGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
    marginBottom: 12,
  },
  prepOptionCard: {
    width: '47%',
    height: 84,
    backgroundColor: '#EFE8D8',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2D8C3',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  prepOptionNumber: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111111',
    lineHeight: 30,
  },
  prepOptionUnit: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555555',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  itemsReadyButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#EFE8D8',
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#DCD1B8',
    marginBottom: 16,
  },
  itemsReadyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  cancelCapsuleButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#1E1E1E',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  cancelCapsuleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
