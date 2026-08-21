
import { fetchPayments as apiFetchPayments, fetchPendingPayments } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import CustomLoader from '@/components/CustomLoader';

import './payments.css';

export default function PaymentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [grossTotal, setGrossTotal] = useState(0);

  const isNavigatingRef = React.useRef(false);

  const handleBack = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    router.replace('/settings');
  };

  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);
  const [grandTotal, setGrandTotal] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const safeTx = Array.isArray(transactions) ? transactions : [];

  useEffect(() => {
    fetchPaymentsData();
  }, []);

  const fetchPaymentsData = async () => {
    try {
      setLoading(true);
      const storedUserStr = await AsyncStorage.getItem('userData');
      let targetRestId = '';
      if (storedUserStr) {
        const storedUser = JSON.parse(storedUserStr);
        targetRestId =
          storedUser?.restId ||
          storedUser?.restaurantId ||
          storedUser?.restaurant_id ||
          storedUser?._id ||
          '';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      let response = null;
      try {
        response = await fetchPendingPayments(targetRestId, controller.signal);
        if (!response.ok) {
          response = await apiFetchPayments(targetRestId, controller.signal);
        }
      } catch (e) {
        try {
          response = await apiFetchPayments(targetRestId, controller.signal);
        } catch (err) { }
      }

      clearTimeout(timeoutId);

      if (!response || !response.ok) {
        setGrossTotal(0);
        setGrandTotal(0);
        setTransactions([]);
        return;
      }

      const data = await response.json();

      // Normalize document list from API response
      let docList = [];
      if (Array.isArray(data)) {
        docList = data;
      } else if (Array.isArray(data.data)) {
        docList = data.data;
      } else if (Array.isArray(data.pendingPayments)) {
        docList = data.pendingPayments;
      } else if (Array.isArray(data.payments)) {
        docList = data.payments;
      } else if (data && typeof data === 'object') {
        docList = [data];
        if (data.payment && typeof data.payment === 'object') docList.push(data.payment);
        if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) docList.push(data.data);
      }

      let mainGross = 0;
      let mainGrand = 0;
      let extractedTransactions = [];

      docList.forEach((doc) => {
        if (!doc || typeof doc !== 'object') return;

        if (doc.grossTotal !== undefined) mainGross = Number(doc.grossTotal) || mainGross;
        if (doc.grandTotal !== undefined) mainGrand = Number(doc.grandTotal) || mainGrand;

        const parentCommission = doc.commissionRate;
        const parentRestName = doc.restaurantName;

        // Target specifically the transactions array inside the document
        const txArray = doc.transactions || doc.transactionList;
        if (Array.isArray(txArray) && txArray.length > 0) {
          txArray.forEach((tx) => {
            if (!tx || typeof tx !== 'object') return;
            extractedTransactions.push({
              ...tx,
              _id: tx._id || tx.transactionId || `tx_${Math.random()}`,
              transactionId: tx.transactionId || tx.id || tx._id,
              amount: tx.amount ?? tx.grandTotal ?? tx.totalAmount ?? 0,
              commissionRate: tx.commissionRate ?? parentCommission ?? null,
              restaurantName: tx.restaurantName ?? parentRestName ?? '',
              date: tx.date || tx.createdAt || tx.timestamp || doc.createdAt || doc.updatedAt,
              status: tx.status || 'Completed',
            });
          });
        }
      });

      // Fallbacks if top level object contains total fields
      if (data.grossTotal !== undefined) mainGross = Number(data.grossTotal) || mainGross;
      if (data.grandTotal !== undefined) mainGrand = Number(data.grandTotal) || mainGrand;

      if (Array.isArray(data.transactions) && data.transactions.length > 0) {
        data.transactions.forEach((tx) => {
          if (!tx || typeof tx !== 'object') return;
          if (Array.isArray(tx.transactions)) {
            tx.transactions.forEach((subTx) => {
              extractedTransactions.push({
                ...subTx,
                _id: subTx._id || subTx.transactionId || `tx_${Math.random()}`,
                transactionId: subTx.transactionId || subTx.id || subTx._id,
                amount: subTx.amount ?? subTx.grandTotal ?? 0,
                date: subTx.date || subTx.createdAt,
                status: subTx.status || 'Completed',
              });
            });
          } else {
            extractedTransactions.push({
              ...tx,
              _id: tx._id || tx.transactionId || `tx_${Math.random()}`,
              transactionId: tx.transactionId || tx.id || tx._id,
              amount: tx.amount ?? tx.grandTotal ?? 0,
              date: tx.date || tx.createdAt,
              status: tx.status || 'Completed',
            });
          }
        });
      }

      // Deduplicate extracted transactions by unique key
      const seenIds = new Set();
      const finalTxList = [];
      extractedTransactions.forEach((item) => {
        const key = String(item._id || item.transactionId);
        if (key && !seenIds.has(key)) {
          seenIds.add(key);
          finalTxList.push(item);
        }
      });

      // Sort transactions descending by date (latest transactions at the top)
      finalTxList.sort((a, b) => {
        const timeA = new Date(a.date || a.createdAt || a.timestamp || 0).getTime();
        const timeB = new Date(b.date || b.createdAt || b.timestamp || 0).getTime();
        if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
          return timeB - timeA;
        }
        return String(b._id || b.transactionId || '').localeCompare(String(a._id || a.transactionId || ''));
      });

      setGrossTotal(mainGross);
      setGrandTotal(mainGrand);
      setTransactions(finalTxList);
    } catch (err) {
      console.error('Error fetching payments:', err);
      setGrossTotal(0);
      setGrandTotal(0);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const formatTxDateTime = (tx) => {
    const raw = tx.date || tx.createdAt || tx.timestamp || tx.updatedAt;
    if (!raw) {
      return { date: 'N/A', time: '' };
    }

    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const date = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const time = d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      return { date, time };
    }

    return {
      date: String(tx.date || 'N/A'),
      time: String(tx.time || ''),
    };
  };

  const formatCurrency = (val) => {
    const num = Number(val) || 0;
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Row with Back Button & Center Payments History Pill */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButtonCircle}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#111111" />
          </TouchableOpacity>

          <View style={styles.topHeaderPill}>
            <Ionicons name="card" size={20} color="#111111" />
            <Text style={styles.topHeaderText}>Payments History</Text>
          </View>
        </View>

        {loading && (
          <CustomLoader
            visible={loading}
            title="Loading Payments..."
            subtitle="Fetching payment history"
          />
        )}

        {!loading && (
          <>
            {/* Single Dark Card containing 2-column breakdown for TOTAL EARNINGS & PENDING PAYMENTS */}
            <View style={styles.darkPendingCard}>
              <View style={styles.pendingCardHeader}>
                <View style={styles.clockIconCircle}>
                  <Ionicons name="time-outline" size={18} color="#FFFFFF" />
                </View>
                <Text style={styles.pendingCardTitle}>Pending Payment</Text>
              </View>

              {/* 2-Column Amount Box inside the dark card */}
              <View style={styles.pendingAmountBoxTwoCols}>
                <View style={styles.darkColItem}>
                  <Text style={styles.darkColLabel}>TOTAL EARNINGS</Text>
                  <Text style={styles.darkColValue}>{formatCurrency(grossTotal)}</Text>
                </View>

                <View style={styles.darkColDivider} />

                <View style={styles.darkColItem}>
                  <Text style={styles.darkColLabel}>PENDING PAYMENTS</Text>
                  <Text style={styles.darkColValue}>{formatCurrency(grandTotal)}</Text>
                </View>
              </View>

              <View style={styles.pendingCardFooter}>
                <View style={styles.pendingBadge}>
                  <View style={styles.pendingDot} />
                  <Text style={styles.pendingBadgeText}>Pending Clearance</Text>
                </View>
                <Text style={styles.transactionCountText}>
                  {transactions.length} {transactions.length === 1 ? 'Transaction' : 'Transactions'}
                </Text>
              </View>
            </View>

            {/* Transactions Section */}
            <View style={styles.transactionsHeaderRow}>
              <Text style={styles.transactionsSectionTitle}>Transactions</Text>
              <Text style={styles.transactionsItemCount}>
                {safeTx.length} {safeTx.length === 1 ? 'item' : 'items'}
              </Text>
            </View>

            {/* Transactions List or Empty State */}
            {safeTx.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="card-outline" size={64} color="#736B5E" />
                <Text style={styles.emptyTitle}>No Transactions Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Payment history and transaction details{`\n`}will appear here.
                </Text>
                <TouchableOpacity
                  style={styles.refreshButton}
                  onPress={fetchPaymentsData}
                  activeOpacity={0.8}
                >
                  <Text style={styles.refreshButtonText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            ) : (
              safeTx.map((tx, idx) => {
                if (!tx) return null;
                const txId = tx.transactionId || tx.id || tx._id || `TXN-${98401 - idx}`;
                const amountVal = tx.amount ?? tx.grandTotal ?? 0;
                const grossVal = tx.grossTotal ?? tx.grossAmount ?? null;
                const commRate = tx.commissionRate ?? null;
                const commCut = tx.totalCommissionCut ?? (grossVal !== null && amountVal !== null && grossVal > amountVal ? parseFloat((grossVal - amountVal).toFixed(2)) : null);
                const rawStatus = String(tx.status || '').trim();
                const isPending = !rawStatus || rawStatus.toLowerCase().includes('pend') || rawStatus.toLowerCase().includes('clearance') || rawStatus.toLowerCase().includes('unpaid');
                const statusVal = isPending ? 'Pending Clearance' : (rawStatus || 'Paid');
                const orderIdVal = tx.orderId || tx.orderid || null;
                const { date: txDate, time: txTime } = formatTxDateTime(tx);

                return (
                  <View key={tx._id || tx.transactionId || idx} style={styles.transactionCard}>
                    {/* Top Row: Transaction ID & Status Badge */}
                    <View style={styles.transactionTopHeaderRow}>
                      <View style={styles.txInfoCol}>
                        <Text style={styles.txIdLabel}>TRANSACTION ID</Text>
                        <Text style={styles.txIdValue}>{txId}</Text>
                      </View>
                      <View style={[styles.statusPill, isPending ? styles.statusPillPending : styles.statusPillSuccess]}>
                        <View style={[styles.statusDot, isPending ? styles.statusDotPending : styles.statusDotSuccess]} />
                        <Text style={[styles.statusPillText, isPending ? styles.statusPillTextPending : styles.statusPillTextSuccess]}>
                          {statusVal}
                        </Text>
                      </View>
                    </View>

                    {/* Main Amount Breakdown Row */}
                    <View style={styles.transactionMainRow}>
                      <View style={styles.txIconCircle}>
                        <Ionicons name="swap-horizontal" size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.txAmountDetailsCol}>
                        <Text style={styles.netAmountLabel}>AMOUNT</Text>
                        <Text style={styles.txAmountText}>{formatCurrency(amountVal)}</Text>
                      </View>
                      {(grossVal !== null || commCut !== null) && (
                        <View style={styles.breakdownCol}>
                          {grossVal !== null && (
                            <Text style={styles.breakdownText}>
                              Gross: <Text style={styles.breakdownVal}>{formatCurrency(grossVal)}</Text>
                            </Text>
                          )}
                          {commCut !== null && commCut > 0 && (
                            <Text style={styles.breakdownText}>
                              Comm {commRate ? `(${commRate}%)` : ''}: <Text style={styles.breakdownCutVal}>-{formatCurrency(commCut)}</Text>
                            </Text>
                          )}
                        </View>
                      )}
                    </View>

                    {/* Badges Row: Order ID, Date & Time */}
                    <View style={styles.txBadgesRow}>
                      {orderIdVal && (
                        <View style={styles.txBadgePill}>
                          <Ionicons name="receipt-outline" size={14} color="#E35436" />
                          <Text style={styles.txBadgeTextOrder}>Order #{orderIdVal}</Text>
                        </View>
                      )}
                      {txDate !== 'N/A' && (
                        <View style={styles.txBadgePill}>
                          <Ionicons name="calendar-outline" size={14} color="#555555" />
                          <Text style={styles.txBadgeText}>{txDate}</Text>
                        </View>
                      )}
                      {txTime !== '' && (
                        <View style={styles.txBadgePill}>
                          <Ionicons name="time-outline" size={14} color="#555555" />
                          <Text style={styles.txBadgeText}>{txTime}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
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
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 12) + 8 : 12,
    position: 'relative',
    height: 48,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  topHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8E2D0',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 22,
    gap: 8,
  },
  topHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  darkPendingCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
  },
  pendingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  clockIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E35436',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pendingAmountBoxTwoCols: {
    backgroundColor: '#2D2D2D',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  darkColItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkColLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999999',
    letterSpacing: 0.6,
    marginBottom: 6,
    textAlign: 'center',
  },
  darkColValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  darkColDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#444444',
    marginHorizontal: 8,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999999',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  grandTotalValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pendingCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(227, 84, 54, 0.2)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E35436',
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E35436',
  },
  transactionCountText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#CCCCCC',
  },
  transactionsHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  transactionsSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  transactionsItemCount: {
    fontSize: 13,
    fontWeight: '500',
    color: '#777777',
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  transactionTopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EFE6',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D97706',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  statusPillPending: {
    backgroundColor: '#FFF8E7',
  },
  statusDotPending: {
    backgroundColor: '#D97706',
  },
  statusPillTextPending: {
    color: '#D97706',
  },
  statusPillSuccess: {
    backgroundColor: '#ECFDF5',
  },
  statusDotSuccess: {
    backgroundColor: '#10B981',
  },
  statusPillTextSuccess: {
    color: '#047857',
  },
  transactionMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  txIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfoCol: {
    flex: 1,
  },
  txAmountDetailsCol: {
    flex: 1,
  },
  netAmountLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#888888',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  txIdLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  txIdValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  txAmountText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E35436',
  },
  breakdownCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  breakdownText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666666',
  },
  breakdownVal: {
    color: '#111111',
    fontWeight: '700',
  },
  breakdownCutVal: {
    color: '#DC2626',
    fontWeight: '700',
  },
  txBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  txBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3EFE0',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  txBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444444',
  },
  txBadgeTextOrder: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E35436',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    paddingHorizontal: 32,
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
    color: '#888888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  refreshButton: {
    backgroundColor: '#1E1E1E',
    borderRadius: 30,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
