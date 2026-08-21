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

const getSafeAddress = (obj, fallbackObj) => {
  const candidates = [
    obj?.restaurantAddress,
    obj?.restAddress,
    obj?.address,
    obj?.restLocation,
    obj?.restaurantLocation,
    obj?.location,
    fallbackObj?.address,
    fallbackObj?.restAddress,
    fallbackObj?.restaurantAddress,
    fallbackObj?.restLocation,
    fallbackObj?.restaurantLocation,
    fallbackObj?.location,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  return '';
};

const getSafePhone = (obj, fallbackObj) => {
  const candidates = [
    obj?.restaurantPhone,
    obj?.phone,
    obj?.mobileNumber,
    obj?.mobile,
    obj?.contactNumber,
    obj?.restaurantMobile,
    fallbackObj?.phone,
    fallbackObj?.mobileNumber,
    fallbackObj?.mobile,
    fallbackObj?.contactNumber,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
    if (typeof c === 'number') {
      return String(c);
    }
  }
  return '';
};

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
    order?.restaurantName || userData?.name || userData?.restaurantName || userData?.restName || '';
  const restaurantAddress = getSafeAddress(order, userData);
  const gstNumber = order?.gstin || userData?.gstin || userData?.gst || '37AANFL1602Q1ZW';
  const restaurantPhone = getSafePhone(order, userData);

  const orderIdVal = getDisplayOrderId(order || params);
  
  const rawDate = order?.acceptedAt || order?.createdAt || order?.orderDate;
  const dateObj = rawDate ? new Date(rawDate) : new Date();
  const dateStr = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const customerName = order?.customerName || order?.userName || order?.user?.name || '';

  let itemsRaw = [];
  if (Array.isArray(order?.items) && order.items.length > 0) {
    itemsRaw = order.items;
  } else if (typeof order?.items === 'string') {
    try {
      const parsed = JSON.parse(order.items);
      if (Array.isArray(parsed) && parsed.length > 0) itemsRaw = parsed;
    } catch (e) {}
  }
  if (itemsRaw.length === 0) {
    itemsRaw = [{ name: 'Chicken Biryani', quantity: 1, price: 200.0 }];
  }

  const itemsList = itemsRaw.map((it) => {
    const rawPrice = Number(it.originalPrice ?? it.price ?? 200.0) || 0;
    return {
      name: it.name || 'Item',
      quantity: Number(it.quantity || it.qty || 1) || 1,
      price: rawPrice,
    };
  });

  const totalQtySum = itemsList.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);

  const itemsSubtotal = itemsList.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);

  const storedGstRate = Number(order?.gstPercentage ?? order?.gstRate ?? order?.gstPercent ?? 0);
  const calculatedGst = rawGst > 0 ? rawGst : (storedGstRate > 0 ? itemsSubtotal * (storedGstRate / 100) : 0);
  const finalGst = Number(calculatedGst.toFixed(2));

  const effectiveGstRate = storedGstRate > 0
    ? storedGstRate
    : (itemsSubtotal > 0 && finalGst > 0 ? Number(((finalGst / itemsSubtotal) * 100).toFixed(1)) : 5);

  const halfRate = Number((effectiveGstRate / 2).toFixed(2));

  const cgstVal = rawCgst > 0 ? rawCgst : (finalGst > 0 ? Number((finalGst / 2).toFixed(2)) : Number((itemsSubtotal * (halfRate / 100)).toFixed(2)));
  const sgstVal = rawSgst > 0 ? rawSgst : (finalGst > 0 ? Number((finalGst / 2).toFixed(2)) : Number((itemsSubtotal * (halfRate / 100)).toFixed(2)));

  const cgstLabel = `CGST (${halfRate}%)`;
  const sgstLabel = `SGST (${halfRate}%)`;

  const grandTotalVal = Number((itemsSubtotal + (cgstVal + sgstVal)).toFixed(2));

  const handlePrintReceipt = async () => {
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <title></title>
            <style>
              @page {
                size: auto;
                margin: 0mm !important;
              }
              @media print {
                @page {
                  margin: 0mm !important;
                }
                html, body {
                  width: 100% !important;
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #ffffff !important;
                }
                tr, td, th {
                  page-break-inside: avoid !important;
                  break-inside: avoid !important;
                }
              }
              * {
                box-sizing: border-box;
              }
              html, body {
                width: 100%;
                margin: 0;
                padding: 0;
                background-color: #ffffff;
                color: #000000;
                font-family: 'Courier New', Courier, monospace;
                font-size: 11px;
                line-height: 1.3;
              }
              .receipt-wrapper {
                width: 100%;
                max-width: 280px;
                margin: 0 auto;
                padding: 8px 4px 24px 4px;
              }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .divider {
                text-align: center;
                margin: 6px 0;
                color: #444444;
                letter-spacing: -0.5px;
                white-space: nowrap;
                overflow: hidden;
              }
              table { width: 100%; border-collapse: collapse; margin: 6px 0; }
              th, td {
                font-family: 'Courier New', Courier, monospace;
                padding: 3px 0;
                font-size: 10px;
                word-break: break-word;
              }
              th { text-align: left; font-weight: bold; border-bottom: 1px dashed #444444; }
              .right { text-align: right; }
              .center-col { text-align: center; }
              .row-flex { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; }
              .total-row { border-top: 1px dashed #000000; border-bottom: 1px dashed #000000; font-size: 13px; font-weight: bold; padding: 6px 0; margin-top: 4px; display: flex; justify-content: space-between; }
              .footer { margin-top: 12px; font-size: 11px; color: #000000; text-align: center; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="receipt-wrapper">
              <!-- Block 1: Restaurant Info -->
              <div class="center bold" style="font-size: 15px;">${restaurantName}</div>
              <div class="center" style="font-size: 10px; margin-top: 2px;">Address: ${restaurantAddress}</div>
              <div class="center" style="font-size: 10px;">The GSTIN : ${gstNumber}</div>
              ${restaurantPhone ? `<div class="center" style="font-size: 10px;">Phone: ${restaurantPhone}</div>` : ''}

              <div class="divider">--------------------------------</div>

              <!-- Block 2: Order & Delivery Info -->
              <div style="font-size: 11px;"><strong>Order ID:</strong> ${orderIdVal}</div>
              <div style="font-size: 11px;"><strong>Date:</strong> ${dateStr}</div>
              <div class="bold" style="font-size: 12px; margin-top: 4px; margin-bottom: 2px;">From Leevon Delivery</div>

              <div class="divider">--------------------------------</div>

              <!-- Block 4: Items Table -->
              <table>
                <thead>
                  <tr>
                    <th style="width: 25px;">NO.</th>
                    <th>ITEM</th>
                    <th class="center-col">QTY</th>
                    <th class="right">PRICE</th>
                    <th class="right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsList
                    .map(
                      (item, idx) => `
                    <tr>
                      <td>${idx + 1}</td>
                      <td>${item.name}</td>
                      <td class="center-col">${item.quantity}</td>
                      <td class="right">₹${Number(item.price || 0).toFixed(2)}</td>
                      <td class="right">₹${(Number(item.price * item.quantity) || 0).toFixed(2)}</td>
                    </tr>
                  `
                    )
                    .join('')}
                </tbody>
              </table>

              <div class="divider">--------------------------------</div>

              <!-- Block 5: Totals Breakdown -->
              <div class="row-flex">
                <span>Sub Total</span>
                <span>₹${itemsSubtotal.toFixed(2)}</span>
              </div>
              <div class="row-flex" style="font-size: 10px; color: #444444;">
                <span>${cgstLabel}</span>
                <span>₹${cgstVal.toFixed(2)}</span>
              </div>
              <div class="row-flex" style="font-size: 10px; color: #444444;">
                <span>${sgstLabel}</span>
                <span>₹${sgstVal.toFixed(2)}</span>
              </div>

              <div class="total-row">
                <span>Grand Total</span>
                <span>₹${grandTotalVal.toFixed(2)}</span>
              </div>

              <div class="divider">--------------------------------</div>

              <!-- Block 6: Footer -->
              <div class="footer">
                Thank You, Order Again!
              </div>
            </div>
          </body>
        </html>
      `;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow || iframe.contentDocument;
        const iframeDoc = doc.document || doc;

        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        setTimeout(() => {
          if (doc.focus) doc.focus();
          if (doc.print) doc.print();
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 1000);
        }, 300);
      } else {
        await Print.printAsync({ html: htmlContent });
      }
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
            {/* Block 1: Restaurant Info Section */}
            <View style={styles.restaurantHeaderSection}>
              <Text style={styles.restaurantNameText}>{restaurantName}</Text>
              <Text style={styles.restaurantSubDetailText}>
                Address: {restaurantAddress}
              </Text>
              <Text style={styles.restaurantSubDetailText}>
                The GSTIN : {gstNumber}
              </Text>
              {restaurantPhone ? (
                <Text style={styles.restaurantSubDetailText}>
                  Phone: {restaurantPhone}
                </Text>
              ) : null}
            </View>

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            {/* Block 2: Order & Delivery Info Section */}
            <View style={styles.receiptOrderInfoSection}>
              <Text style={styles.receiptOrderInfoLine}>
                Order ID: {orderIdVal}
              </Text>
              <Text style={styles.receiptOrderInfoLine}>
                Date: {dateStr}
              </Text>
              <Text style={[styles.receiptOrderInfoLine, { fontWeight: 'bold', marginTop: 4, marginBottom: 2 }]}>
                From Leevon Delivery
              </Text>
            </View>

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            {/* Block 3: Table Header Row */}
            <View style={styles.receiptTableHeaderRow}>
              <Text style={[styles.receiptHeaderCol, { flex: 0.6 }]}>NO.</Text>
              <Text style={[styles.receiptHeaderCol, { flex: 2 }]}>ITEM</Text>
              <Text style={[styles.receiptHeaderCol, { flex: 0.8, textAlign: 'center' }]}>QTY</Text>
              <Text style={[styles.receiptHeaderCol, { flex: 1.2, textAlign: 'right' }]}>PRICE</Text>
              <Text style={[styles.receiptHeaderCol, { flex: 1.2, textAlign: 'right' }]}>AMOUNT</Text>
            </View>

            {/* Table Items */}
            {itemsList.map((item, idx) => (
              <View key={idx} style={styles.receiptTableItemRow}>
                <Text style={[styles.receiptItemNameText, { flex: 0.6 }]}>{idx + 1}</Text>
                <Text style={[styles.receiptItemNameText, { flex: 2 }]}>{item.name}</Text>
                <Text style={[styles.receiptItemQtyText, { flex: 0.8, textAlign: 'center' }]}>{item.quantity}</Text>
                <Text style={[styles.receiptItemPriceText, { flex: 1.2, textAlign: 'right' }]}>
                  ₹{Number(item.price || 0).toFixed(2)}
                </Text>
                <Text style={[styles.receiptItemPriceText, { flex: 1.2, textAlign: 'right' }]}>
                  ₹{(Number(item.price || 0) * Number(item.quantity || 1)).toFixed(2)}
                </Text>
              </View>
            ))}

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            {/* Block 5: Totals */}
            <View style={styles.receiptGrandTotalRow}>
              <Text style={styles.receiptGrandTotalLabel}>Sub Total</Text>
              <Text style={styles.receiptGrandTotalVal}>₹{itemsSubtotal.toFixed(2)}</Text>
            </View>
            <View style={[styles.receiptGrandTotalRow, { paddingLeft: 12 }]}>
              <Text style={[styles.receiptGrandTotalLabel, { fontSize: 13, color: '#555555' }]}>{cgstLabel}</Text>
              <Text style={[styles.receiptGrandTotalVal, { fontSize: 14, color: '#555555' }]}>
                ₹{cgstVal.toFixed(2)}
              </Text>
            </View>
            <View style={[styles.receiptGrandTotalRow, { paddingLeft: 12 }]}>
              <Text style={[styles.receiptGrandTotalLabel, { fontSize: 13, color: '#555555' }]}>{sgstLabel}</Text>
              <Text style={[styles.receiptGrandTotalVal, { fontSize: 14, color: '#555555' }]}>
                ₹{sgstVal.toFixed(2)}
              </Text>
            </View>

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            <View style={styles.receiptGrandTotalRow}>
              <Text style={styles.receiptGrandTotalLabel}>Grand Total</Text>
              <Text style={styles.receiptGrandTotalVal}>
                ₹{Number(grandTotalVal || 0).toFixed(2)}
              </Text>
            </View>

            <Text style={styles.dashedDividerText}>{dashedLine}</Text>

            {/* Block 6: Thank You Footer */}
            <View style={styles.receiptThankYouFooter}>
              <Text style={[styles.receiptThankYouText, { fontWeight: 'bold', fontSize: 14 }]}>
                Thank You, Order Again!
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
