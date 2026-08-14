import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Platform,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import { getDisplayOrderId } from '../orders';

import './invoice.css';

export default function OrderInvoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [userData, setUserData] = useState(null);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    loadUserData();
    if (params?.orderData) {
      try {
        setOrder(JSON.parse(params.orderData));
      } catch (err) {
        console.error('Error parsing orderData param:', err);
      }
    }
  }, []);

  const loadUserData = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('userData');
      if (storedUser) {
        setUserData(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Error loading user data from AsyncStorage:', error);
    }
  };

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

  // Fallback defaults matching user reference screenshot
  const restaurantName =
    userData?.name || userData?.restaurantName || 'Test Restaurant';
  const restaurantAddress =
    userData?.address || userData?.restLocation || 'Nandyal Road';
  const fssaiNumber = userData?.fssai || '1234567';

  const orderIdVal = getDisplayOrderId(order || params);
  const dateStr =
    order?.createdAtFormatted ||
    (order?.createdAt
      ? new Date(order.createdAt).toLocaleString()
      : '8/8/2026, 01:48:34 AM');

  const commRate = order?.commissionRate ?? userData?.commission ?? 12;

  const itemsRaw =
    order?.items && order.items.length > 0
      ? order.items
      : [{ name: 'Chicken Biryani', quantity: 1, price: 200.0 }];

  const itemsList = itemsRaw.map((it) => {
    const rawPrice = it.originalPrice ?? it.price ?? 200.0;
    const discountedPrice =
      it.priceAfterCommission ??
      (it.price !== undefined && it.price < rawPrice
        ? it.price
        : rawPrice - rawPrice * (commRate / 100));
    return {
      name: it.name || 'Item',
      quantity: it.quantity || 1,
      price: discountedPrice,
    };
  });

  const grandTotalVal =
    order?.netEarnings ??
    order?.totalPrice ??
    itemsList.reduce(
      (acc, it) => acc + it.price * (it.quantity || 1),
      0
    );

  const handlePrintReceipt = async () => {
    try {
      const htmlContent = `
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
                padding: 30px;
                color: #111111;
                background-color: #ffffff;
                max-width: 450px;
                margin: 0 auto;
              }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .divider { text-align: center; margin: 12px 0; color: #888888; letter-spacing: 1px; }
              table { width: 100%; border-collapse: collapse; margin: 14px 0; }
              th, td { font-family: 'Courier New', Courier, monospace; padding: 6px 0; font-size: 14px; }
              th { text-align: left; font-weight: bold; }
              .right { text-align: right; font-weight: bold; }
              .center-col { text-align: center; }
              .total-row { font-size: 16px; font-weight: bold; margin-top: 14px; }
              .footer { font-style: italic; margin-top: 20px; text-align: center; }
            </style>
          </head>
          <body>
            <div class="center">
              <h2 style="margin:0; font-size:20px;">🍽️ ${restaurantName}</h2>
              <p style="margin:4px 0; font-size:12px;">Address: ${restaurantAddress}</p>
              <p style="margin:4px 0; font-size:12px;">FSSAI: ${fssaiNumber}</p>
            </div>
            <div class="divider">---------------------------------------------</div>
            <div>
              <p style="margin:4px 0;" class="bold">Order ID: ${orderIdVal}</p>
              <p style="margin:4px 0;">Date: ${dateStr}</p>
            </div>
            <div class="divider">---------------------------------------------</div>
            <table>
              <thead>
                <tr>
                  <th>ITEM</th>
                  <th class="center-col">QTY</th>
                  <th class="right">PRICE</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td class="center-col">${item.quantity}</td>
                    <td class="right">₹${Number(item.price || 0).toFixed(2)}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
            <div class="divider">---------------------------------------------</div>
            <div style="display:flex; justify-content:space-between;" class="total-row">
              <span>Grand Total</span>
              <span>₹${Number(grandTotalVal || 0).toFixed(2)}</span>
            </div>
            <div class="footer">
              🙏 Thank you for ordering!
            </div>
          </body>
        </html>
      `;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const printWindow = window.open('', '_blank', 'width=600,height=700');
        if (printWindow) {
          printWindow.document.open();
          printWindow.document.write(htmlContent);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 300);
          return;
        }
      }

      await Print.printAsync({ html: htmlContent });
    } catch (err) {
      console.error('Error printing receipt:', err);
    }
  };

  const dashedLine = '---------------------------------------------';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Row with Back Button & Center Order Invoice Pill */}
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
            <Text style={styles.topHeaderText}>Order Invoice</Text>
          </View>
        </View>

        {/* Tan Outer Background Wrapper Card */}
        <View style={styles.tanCardWrapper}>
          {/* Overlapping Top Right Close Cross Button */}
          <TouchableOpacity
            style={styles.closeCrossCircle}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color="#111111" />
          </TouchableOpacity>

          {/* White Receipt Paper Container */}
          <View style={styles.receiptPaperCard}>
            {/* Restaurant Header Section */}
            <View style={styles.restaurantHeaderSection}>
              <View style={styles.restaurantTitleRow}>
                <Text style={{ fontSize: 18 }}>🍽️</Text>
                <Text style={styles.restaurantNameText}>{restaurantName}</Text>
              </View>
              <Text style={styles.restaurantSubDetailText}>
                Address: {restaurantAddress}
              </Text>
              <Text style={styles.restaurantSubDetailText}>
                FSSAI: {fssaiNumber}
              </Text>
            </View>

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            {/* Order Info Section */}
            <View style={styles.receiptOrderInfoSection}>
              <Text style={styles.receiptOrderInfoLine}>
                Order ID: {orderIdVal}
              </Text>
              <Text style={styles.receiptOrderInfoLine}>
                Date: {dateStr}
              </Text>
            </View>

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            {/* Table Header Row */}
            <View style={styles.receiptTableHeaderRow}>
              <Text style={[styles.receiptHeaderCol, { flex: 2 }]}>ITEM</Text>
              <Text
                style={[
                  styles.receiptHeaderCol,
                  { flex: 1, textAlign: 'center' },
                ]}
              >
                QTY
              </Text>
              <Text
                style={[
                  styles.receiptHeaderCol,
                  { flex: 1, textAlign: 'right' },
                ]}
              >
                PRICE
              </Text>
            </View>

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            {/* Table Items */}
            {itemsList.map((item, idx) => (
              <View key={idx} style={styles.receiptTableItemRow}>
                <Text style={styles.receiptItemNameText}>{item.name}</Text>
                <Text style={styles.receiptItemQtyText}>{item.quantity}</Text>
                <Text style={styles.receiptItemPriceText}>
                  ₹{Number(item.price || 0).toFixed(2)}
                </Text>
              </View>
            ))}

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            {/* Grand Total Row */}
            <View style={styles.receiptGrandTotalRow}>
              <Text style={styles.receiptGrandTotalLabel}>Grand Total</Text>
              <Text style={styles.receiptGrandTotalVal}>
                ₹{Number(grandTotalVal || 0).toFixed(2)}
              </Text>
            </View>

            {/* Thank You Footer */}
            <View style={styles.receiptThankYouFooter}>
              <Text style={{ fontSize: 16 }}>🙏</Text>
              <Text style={styles.receiptThankYouText}>
                Thank you for ordering!
              </Text>
            </View>
          </View>

          {/* Dark Print Receipt Button */}
          <TouchableOpacity
            style={styles.printReceiptButton}
            onPress={handlePrintReceipt}
            activeOpacity={0.8}
          >
            <Ionicons name="print" size={20} color="#FFFFFF" />
            <Text style={styles.printReceiptText}>Print Receipt</Text>
          </TouchableOpacity>
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  topHeaderText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
  },
  tanCardWrapper: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#E0D6BC',
    borderRadius: 30,
    padding: 16,
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  closeCrossCircle: {
    position: 'absolute',
    top: -12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  receiptPaperCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  restaurantHeaderSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  restaurantTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  restaurantNameText: {
    fontFamily: monospaceFont(),
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: 0.5,
  },
  restaurantSubDetailText: {
    fontFamily: monospaceFont(),
    fontSize: 12,
    color: '#555555',
    marginTop: 2,
    textAlign: 'center',
  },
  dashedDividerText: {
    fontFamily: monospaceFont(),
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
    marginVertical: 6,
    letterSpacing: 1,
  },
  receiptOrderInfoSection: {
    marginVertical: 6,
    gap: 4,
  },
  receiptOrderInfoLine: {
    fontFamily: monospaceFont(),
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  receiptTableHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  receiptHeaderCol: {
    fontFamily: monospaceFont(),
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
  },
  receiptTableItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  receiptItemNameText: {
    fontFamily: monospaceFont(),
    fontSize: 14,
    color: '#111111',
  },
  receiptItemQtyText: {
    fontFamily: monospaceFont(),
    fontSize: 14,
    color: '#111111',
  },
  receiptItemPriceText: {
    fontFamily: monospaceFont(),
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  receiptGrandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  receiptGrandTotalLabel: {
    fontFamily: monospaceFont(),
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  receiptGrandTotalVal: {
    fontFamily: monospaceFont(),
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  receiptThankYouFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  receiptThankYouText: {
    fontFamily: monospaceFont(),
    fontSize: 14,
    fontStyle: 'italic',
    color: '#333333',
  },
  printReceiptButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#1E1E1E',
    borderRadius: 26,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  printReceiptText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

function monospaceFont() {
  return Platform.OS === 'ios' ? 'Courier' : 'monospace';
}
