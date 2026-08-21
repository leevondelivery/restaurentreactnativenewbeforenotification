import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import CustomLoader from '@/components/CustomLoader';
import { useOrders } from '@/context/OrdersContext';

import './orders.css';

export const getEffectiveCommissionRate = (orderObj, restCommission) => {
  // 1. Check logged-in restaurant user's commission rate from DB profile (e.g. 5%)
  const userRestRate = Number(restCommission) || 0;
  if (userRestRate > 0) return userRestRate;

  // 2. Check direct explicit commission rate on order document in DB
  if (orderObj && typeof orderObj === 'object') {
    const orderRate = Number(
      orderObj.commissionRate ??
      orderObj.commission ??
      orderObj.commission_rate ??
      orderObj.commissionPercent ??
      orderObj.commission_percent ??
      orderObj.commissionPercentage ??
      orderObj.commission_percentage ??
      0
    );
    if (orderRate > 0) return orderRate;
  }

  // 3. Fallback default for restaurant account
  return 5;
};

export const getDisplayOrderId = (order) => {
  if (!order) return '';
  if (typeof order !== 'object') {
    const str = String(order).trim();
    if (/^[0-9a-fA-F]{24}$/.test(str)) {
      return `#ORD-${str.slice(-6).toUpperCase()}`;
    }
    return str;
  }

  const userIdStr = order.userId ? String(order.userId).trim() : '';

  const candidates = [
    order.displayOrderId,
    order.customOrderId,
    order.orderNumber,
    order.orderId,
    order.order_id,
    order.id,
    order._id,
  ];

  for (const cand of candidates) {
    if (cand !== undefined && cand !== null) {
      const str = String(cand).trim();
      if (!str) continue;
      // Skip if value equals userId
      if (userIdStr && str === userIdStr && order._id && String(order._id).trim() !== userIdStr) continue;

      // If ID is a 24-character hex MongoDB ObjectId (e.g. test orders missing short orderId)
      if (/^[0-9a-fA-F]{24}$/.test(str)) {
        return `#ORD-${str.slice(-6).toUpperCase()}`;
      }

      return str;
    }
  }

  return '';
};

const getSafeAddress = (obj, fallbackAddr = '') => {
  if (!obj || typeof obj !== 'object') {
    return typeof fallbackAddr === 'string' ? fallbackAddr.trim() : '';
  }
  const candidates = [
    obj.restaurantAddress,
    obj.restAddress,
    obj.address,
    obj.restLocation,
    obj.restaurantLocation,
    obj.location,
    fallbackAddr,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  return typeof fallbackAddr === 'string' ? fallbackAddr.trim() : '';
};

const getSafePhone = (obj, fallbackPh = '') => {
  if (!obj || typeof obj !== 'object') {
    return typeof fallbackPh === 'string' ? fallbackPh.trim() : (typeof fallbackPh === 'number' ? String(fallbackPh) : '');
  }
  const candidates = [
    obj.restaurantPhone,
    obj.phone,
    obj.mobileNumber,
    obj.mobile,
    obj.contactNumber,
    obj.restaurantMobile,
    fallbackPh,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
    if (typeof c === 'number') {
      return String(c);
    }
  }
  return typeof fallbackPh === 'string' ? fallbackPh.trim() : (typeof fallbackPh === 'number' ? String(fallbackPh) : '');
};

export default function OrdersScreen() {
  const router = useRouter();
  // Fetch data strictly from 'acceptedbyrestaurent' collection via OrdersContext
  const { acceptedByRestaurantsOrders, loading, fetchGlobalOrders, restaurantInfo, markOrderAsReady } = useOrders();
  const safeOrders = Array.isArray(acceptedByRestaurantsOrders) ? acceptedByRestaurantsOrders : [];
  const [refreshing, setRefreshing] = useState(false);
  const [expandedAccordionMap, setExpandedAccordionMap] = useState({});

  // Receipt Modal State
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState(null);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);

  // 5-Second Background Polling Loop when Orders screen is in focus
  useFocusEffect(
    useCallback(() => {
      fetchGlobalOrders(true);
      const pollingInterval = setInterval(() => {
        fetchGlobalOrders(true);
      }, 5000);

      return () => clearInterval(pollingInterval);
    }, [fetchGlobalOrders])
  );

  // Android Back Button Interception
  useEffect(() => {
    const onBackPress = () => {
      if (invoiceModalVisible) {
        setInvoiceModalVisible(false);
        setSelectedInvoiceOrder(null);
        return true;
      }
      handleBack();
      return true;
    };

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress
    );
    return () => subscription.remove();
  }, [invoiceModalVisible]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchGlobalOrders(false);
    } catch (e) { }
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
    router.replace('/settings');
  };

  const handleOpenInvoiceModal = (orderObj) => {
    setSelectedInvoiceOrder(orderObj);
    setInvoiceModalVisible(true);
  };

  const generateInvoiceHtml = (order) => {
    if (!order || typeof order !== 'object') return '';
    const restName = order.restaurantName || restaurantInfo?.name || '';
    const restAddress = getSafeAddress(order, restaurantInfo?.address);
    const restGstin = order.gstin || restaurantInfo?.gstin || '37AANFL1602Q1ZW';
    const restPhone = getSafePhone(order, restaurantInfo?.phone);
    const orderIdVal = getDisplayOrderId(order);

    const rawDate = order.acceptedAt || order.createdAt || order.orderDate;
    const dateObj = rawDate ? new Date(rawDate) : new Date();
    const dateStr = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let itemsRaw = [];
    if (Array.isArray(order.items)) {
      itemsRaw = order.items;
    } else if (typeof order.items === 'string') {
      try {
        const parsed = JSON.parse(order.items);
        if (Array.isArray(parsed)) itemsRaw = parsed;
      } catch (e) { }
    }

    const itemsList = itemsRaw.map((it) => {
      if (!it || typeof it !== 'object') {
        return { name: String(it || 'Item'), quantity: 1, price: 0 };
      }
      const rawPrice = Number(it.originalPrice ?? it.price ?? 0) || 0;
      return {
        name: it.name || 'Item',
        quantity: Number(it.quantity || it.qty || 1) || 1,
        price: rawPrice,
      };
    });

    const itemsSubtotal = itemsList.reduce(
      (acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0
    );

    const commRate = getEffectiveCommissionRate(order, restaurantInfo?.commission);

    const calculatedNetEarnings = itemsList.reduce(
      (acc, it) => {
        const rp = Number(it.price) || 0;
        const disc = it.priceAfterCommission !== undefined
          ? Number(it.priceAfterCommission) || 0
          : (commRate > 0 ? rp * (1 - commRate / 100) : rp);
        return acc + disc * (Number(it.quantity) || 1);
      },
      0
    );

    const finalTotalPrice = calculatedNetEarnings > 0
      ? calculatedNetEarnings
      : (commRate > 0
          ? itemsSubtotal * (1 - commRate / 100)
          : (Number(order.totalPriceAfterCommission ?? order.netEarnings ?? itemsSubtotal) || itemsSubtotal));

    const rawCommAmount = Number(
      order.commissionAmount ?? order.totalCommissionCut ?? (itemsSubtotal - finalTotalPrice)
    );

    const commissionAmountVal = commRate > 0
      ? Number((itemsSubtotal * (commRate / 100)).toFixed(2))
      : Number((rawCommAmount > 0 ? rawCommAmount : Math.max(0, itemsSubtotal - finalTotalPrice)).toFixed(2));

    const grandTotalVal = Number(finalTotalPrice.toFixed(2));

    return `
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
            <div class="center bold" style="font-size: 15px;">${restName}</div>
            ${restAddress ? `<div class="center" style="font-size: 10px; margin-top: 2px;">Address: ${restAddress}</div>` : ''}
            <div class="center" style="font-size: 10px;">The GSTIN : ${restGstin}</div>
            ${restPhone ? `<div class="center" style="font-size: 10px;">Phone: ${restPhone}</div>` : ''}

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
                    <td class="right">₹${Number(item.price).toFixed(2)}</td>
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
            <div class="row-flex">
              <span>Commission</span>
              <span>₹${commissionAmountVal.toFixed(2)}</span>
            </div>

            <div class="total-row">
              <span>Net Receivable</span>
              <span>₹${grandTotalVal.toFixed(2)}</span>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const printHtmlOnWeb = (htmlContent) => {
    if (typeof window === 'undefined') return;
    try {
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
    } catch (err) {
      console.error('Error printing on web via iframe:', err);
    }
  };

  const handlePrintReceipt = async (order) => {
    try {
      const html = generateInvoiceHtml(order);

      if (Platform.OS === 'web') {
        printHtmlOnWeb(html);
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
            {safeOrders.length > 0 && (
              <View style={styles.countBadgeHighlight}>
                <Text style={styles.countBadgeHighlightText}>{safeOrders.length}</Text>
              </View>
            )}
          </View>
        </View>

        {loading && safeOrders.length === 0 && (
          <CustomLoader
            visible={true}
            title="Loading Orders..."
            subtitle="Fetching active preparing orders"
          />
        )}

        {!loading && safeOrders.length === 0 && (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-clear-outline" size={48} color="#9B8F6E" />
            </View>
            <Text style={styles.emptyTitle}>No Active Orders</Text>
            <Text style={styles.emptySubtitle}>
              Accepted orders being prepared will appear here.
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

        {safeOrders.map((order, orderIdx) => {
          if (!order || typeof order !== 'object') return null;
          const orderIdVal = getDisplayOrderId(order) || `ORD-${orderIdx + 1}`;

          let formattedDate = new Date().toLocaleString();
          if (order.acceptedAt) {
            try {
              const d = new Date(order.acceptedAt);
              if (!isNaN(d.getTime())) {
                formattedDate = d.toLocaleString('en-US', {
                  month: 'numeric',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                });
              }
            } catch (e) { }
          }

          const commRate = getEffectiveCommissionRate(order, restaurantInfo?.commission);

          let itemsRaw = [];
          if (Array.isArray(order.items)) {
            itemsRaw = order.items;
          } else if (typeof order.items === 'string') {
            try {
              const parsed = JSON.parse(order.items);
              if (Array.isArray(parsed)) itemsRaw = parsed;
            } catch (e) { }
          }

          const itemsList = itemsRaw.map((it) => {
            if (!it || typeof it !== 'object') {
              return {
                name: String(it || 'Item'),
                rawPrice: 0,
                discountedPrice: 0,
                qty: 1,
              };
            }
            const rawPrice = Number(it.originalPrice ?? it.price ?? 0) || 0;
            const discountedPrice =
              it.priceAfterCommission !== undefined
                ? Number(it.priceAfterCommission) || 0
                : (commRate > 0 ? rawPrice * (1 - commRate / 100) : rawPrice);
            const qty = Number(it.quantity || it.qty || 1) || 1;
            return {
              ...it,
              name: it.name || 'Item',
              rawPrice,
              discountedPrice,
              qty,
            };
          });

          const totalDistinctItems = itemsList.length;
          const totalQtySum = itemsList.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);

          const itemsSubtotal = itemsList.reduce(
            (acc, it) => acc + (Number(it.rawPrice) || 0) * (Number(it.qty) || 1),
            0
          );

          const grossOrderTotal = Number(
            order.totalPrice ?? order.grossTotal ?? order.subtotal ?? itemsSubtotal
          ) || itemsSubtotal;

          const calculatedNetEarnings = itemsList.reduce(
            (acc, it) => acc + (Number(it.discountedPrice) || 0) * (Number(it.qty) || 1),
            0
          );

          const finalTotalPrice = calculatedNetEarnings > 0
            ? calculatedNetEarnings
            : (commRate > 0
                ? grossOrderTotal * (1 - commRate / 100)
                : (Number(order.totalPriceAfterCommission ?? order.netEarnings ?? grossOrderTotal) || grossOrderTotal));

          // Commission amount calculated directly from DB commission percentage rate
          const commissionAmountVal = commRate > 0
            ? Number((grossOrderTotal * (commRate / 100)).toFixed(2))
            : Number((order.commissionAmount ?? Math.max(0, grossOrderTotal - finalTotalPrice)).toFixed(2));

          const orderKey = String(order._id || orderIdVal || `ord-${orderIdx}`);
          const isExpanded = !!expandedAccordionMap[orderKey];

          return (
            <View key={orderKey} style={styles.orderOuterCard}>
              {/* Card Title & Date Header */}
              <View style={styles.orderHeaderSection}>
                <Text style={styles.orderIdMainTitle}>ORDER ID : {orderIdVal}</Text>
                <Text style={styles.orderHeaderDateText}>{formattedDate}</Text>
              </View>

              <View style={styles.headerDivider} />

              {/* Items Table Header */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.colHeader, { flex: 2, borderRightWidth: 1.5, borderRightColor: '#555555', paddingRight: 6 }]}>ITEMS</Text>
                <Text style={[styles.colHeader, { flex: 1, textAlign: 'center', borderRightWidth: 1.5, borderRightColor: '#555555', paddingHorizontal: 4 }]}>
                  QTY
                </Text>
                <Text style={[styles.colHeader, { flex: 1.2, textAlign: 'right', paddingLeft: 6 }]}>
                  PRICE
                </Text>
              </View>

              {/* Items Rows */}
              {itemsList.map((item, idx) => (
                <View key={idx} style={styles.tableItemRow}>
                  <Text style={[styles.itemNameText, { flex: 2, borderRightWidth: 1.5, borderRightColor: '#555555', paddingRight: 6 }]}>{item.name}</Text>
                  <Text style={[styles.itemQtyText, { flex: 1, textAlign: 'center', borderRightWidth: 1.5, borderRightColor: '#555555', paddingHorizontal: 4 }]}>{item.qty}</Text>

                  <View style={[styles.priceColumnContainer, { flex: 1.2, paddingLeft: 6 }]}>
                    {/* Strikethrough Raw Price & Red Commission Badge */}
                    <View style={styles.strikethroughRow}>
                      <Text style={styles.strikethroughPriceText}>
                        ₹{(Number(item.rawPrice) || 0).toFixed(2)}
                      </Text>
                      <Text style={styles.commissionBadgeText}>
                        {commRate}%
                      </Text>
                    </View>
                    {/* Net Price After Commission */}
                    <Text style={styles.finalNetPriceText}>
                      ₹{(Number(item.discountedPrice) || 0).toFixed(2)}
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

                <View style={styles.totalCol}>
                  <Text style={styles.totalColLabel}>Commission</Text>
                  <Text style={styles.totalColVal}>
                    ₹{commissionAmountVal.toFixed(2)}
                  </Text>
                </View>

                <View style={[styles.totalCol, { alignItems: 'flex-end' }]}>
                  <Text style={styles.totalColLabel}>Total Price</Text>
                  <Text style={styles.totalPriceMainVal}>
                    ₹{(Number(finalTotalPrice) || 0).toFixed(2)}
                  </Text>
                </View>
              </View>

              {/* Action Button: Print Invoice */}
              <View style={styles.cardBottomActionRow}>
                <TouchableOpacity
                  style={styles.printInvoiceCapsuleButton}
                  onPress={() => handleOpenInvoiceModal(order)}
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
                <Ionicons name="close" size={20} color="#333333" />
              </TouchableOpacity>

              <ScrollView style={styles.receiptPaperCard} showsVerticalScrollIndicator={false}>
                {/* Block 1: Restaurant Info */}
                <View style={styles.restaurantHeaderSection}>
                  <Text style={styles.restaurantNameText}>
                    {selectedInvoiceOrder.restaurantName || restaurantInfo?.name || ''}
                  </Text>
                  {getSafeAddress(selectedInvoiceOrder, restaurantInfo?.address) ? (
                    <Text style={styles.restaurantSubText}>
                      Address: {getSafeAddress(selectedInvoiceOrder, restaurantInfo?.address)}
                    </Text>
                  ) : null}
                  <Text style={styles.restaurantSubText}>
                    The GSTIN : {selectedInvoiceOrder.gstin || restaurantInfo?.gstin || '37AANFL1602Q1ZW'}
                  </Text>
                  {getSafePhone(selectedInvoiceOrder, restaurantInfo?.phone) ? (
                    <Text style={styles.restaurantSubText}>
                      Phone: {getSafePhone(selectedInvoiceOrder, restaurantInfo?.phone)}
                    </Text>
                  ) : null}
                </View>

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                {/* Block 2: Order & Delivery Info */}
                <View style={styles.receiptOrderInfoSection}>
                  <Text style={styles.receiptOrderText}>
                    Order ID: {getDisplayOrderId(selectedInvoiceOrder)}
                  </Text>
                  <Text style={styles.receiptOrderText}>
                    Date: {(() => {
                      const rawD = selectedInvoiceOrder.acceptedAt || selectedInvoiceOrder.createdAt || selectedInvoiceOrder.orderDate;
                      const dObj = rawD ? new Date(rawD) : new Date();
                      return !isNaN(dObj.getTime())
                        ? dObj.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                        : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                    })()}
                  </Text>
                  <Text style={[styles.receiptOrderText, { fontWeight: 'bold', marginTop: 4, marginBottom: 2 }]}>
                    From Leevon Delivery
                  </Text>
                </View>

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                {/* Block 3: Items Table Column Headers */}
                <View style={styles.receiptTableHeaderRow}>
                  <Text style={[styles.receiptHeaderCol, { flex: 0.6 }]}>NO.</Text>
                  <Text style={[styles.receiptHeaderCol, { flex: 2 }]}>ITEM</Text>
                  <Text style={[styles.receiptHeaderCol, { flex: 0.8, textAlign: 'center' }]}>QTY</Text>
                  <Text style={[styles.receiptHeaderCol, { flex: 1.2, textAlign: 'right' }]}>PRICE</Text>
                  <Text style={[styles.receiptHeaderCol, { flex: 1.2, textAlign: 'right' }]}>AMOUNT</Text>
                </View>

                {(() => {
                  let modalItems = [];
                  if (Array.isArray(selectedInvoiceOrder.items)) {
                    modalItems = selectedInvoiceOrder.items;
                  } else if (typeof selectedInvoiceOrder.items === 'string') {
                    try {
                      const p = JSON.parse(selectedInvoiceOrder.items);
                      if (Array.isArray(p)) modalItems = p;
                    } catch (e) { }
                  }
                  if (modalItems.length === 0) {
                    modalItems = [{ name: 'Item', quantity: 1, price: 0 }];
                  }

                  return modalItems.map((it, i) => {
                    if (!it || typeof it !== 'object') {
                      return (
                        <View key={i} style={styles.receiptItemRow}>
                          <Text style={[styles.receiptItemText, { flex: 0.6 }]}>{i + 1}</Text>
                          <Text style={[styles.receiptItemText, { flex: 2 }]}>{String(it || 'Item')}</Text>
                          <Text style={[styles.receiptItemText, { flex: 0.8, textAlign: 'center' }]}>1</Text>
                          <Text style={[styles.receiptItemText, { flex: 1.2, textAlign: 'right' }]}>₹0.00</Text>
                          <Text style={[styles.receiptItemText, { flex: 1.2, textAlign: 'right' }]}>₹0.00</Text>
                        </View>
                      );
                    }
                    const rawP = Number(it.originalPrice ?? it.price ?? 0) || 0;
                    const qty = Number(it.quantity || it.qty || 1) || 1;
                    const itemTotal = rawP * qty;

                    return (
                      <View key={i} style={styles.receiptItemRow}>
                        <Text style={[styles.receiptItemText, { flex: 0.6 }]}>{i + 1}</Text>
                        <Text style={[styles.receiptItemText, { flex: 2 }]}>{it.name || 'Item'}</Text>
                        <Text style={[styles.receiptItemText, { flex: 0.8, textAlign: 'center' }]}>{qty}</Text>
                        <Text style={[styles.receiptItemText, { flex: 1.2, textAlign: 'right' }]}>
                          ₹{Number(rawP).toFixed(2)}
                        </Text>
                        <Text style={[styles.receiptItemText, { flex: 1.2, textAlign: 'right' }]}>
                          ₹{Number(itemTotal).toFixed(2)}
                        </Text>
                      </View>
                    );
                  });
                })()}

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                {/* Block 4: Totals Breakdown */}
                {(() => {
                  let modalItems = [];
                  if (Array.isArray(selectedInvoiceOrder.items)) {
                    modalItems = selectedInvoiceOrder.items;
                  } else if (typeof selectedInvoiceOrder.items === 'string') {
                    try {
                      const p = JSON.parse(selectedInvoiceOrder.items);
                      if (Array.isArray(p)) modalItems = p;
                    } catch (e) { }
                  }

                  const itemsSubtotal = modalItems.reduce(
                    (acc, it) => acc + (Number(it?.originalPrice ?? it?.price ?? 0) || 0) * (Number(it?.quantity || it?.qty || 1) || 1),
                    0
                  );

                  const commRate = getEffectiveCommissionRate(selectedInvoiceOrder, restaurantInfo?.commission);

                  const calculatedNetEarnings = modalItems.reduce(
                    (acc, it) => {
                      const rp = Number(it?.originalPrice ?? it?.price ?? 0) || 0;
                      const disc = it?.priceAfterCommission !== undefined
                        ? Number(it.priceAfterCommission) || 0
                        : (commRate > 0 ? rp * (1 - commRate / 100) : rp);
                      return acc + disc * (Number(it?.quantity || it?.qty || 1) || 1);
                    },
                    0
                  );

                  const finalTotalPrice = Number(
                    selectedInvoiceOrder.totalPriceAfterCommission ?? selectedInvoiceOrder.netEarnings ?? (commRate > 0 ? itemsSubtotal * (1 - commRate / 100) : calculatedNetEarnings)
                  ) || calculatedNetEarnings;

                  const rawCommAmount = Number(
                    selectedInvoiceOrder.commissionAmount ?? selectedInvoiceOrder.totalCommissionCut ?? (itemsSubtotal - finalTotalPrice)
                  );

                  const commissionAmountVal = commRate > 0
                    ? Number((itemsSubtotal * (commRate / 100)).toFixed(2))
                    : Number((rawCommAmount > 0 ? rawCommAmount : Math.max(0, itemsSubtotal - finalTotalPrice)).toFixed(2));

                  const grandTotalVal = Number(finalTotalPrice.toFixed(2));

                  return (
                    <>
                      <View style={styles.receiptTotalRow}>
                        <Text style={styles.receiptTotalLabel}>Sub Total</Text>
                        <Text style={styles.receiptTotalValue}>₹{itemsSubtotal.toFixed(2)}</Text>
                      </View>
                      <View style={styles.receiptTotalRow}>
                        <Text style={styles.receiptTotalLabel}>Commission</Text>
                        <Text style={styles.receiptTotalValue}>₹{commissionAmountVal.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.dashedDivider}>---------------------------------------------</Text>
                      <View style={styles.receiptGrandTotalRow}>
                        <Text style={styles.receiptGrandTotalLabel}>Net Receivable</Text>
                        <Text style={styles.receiptGrandTotalVal}>₹{grandTotalVal.toFixed(2)}</Text>
                      </View>
                    </>
                  );
                })()}

              </ScrollView>

              <TouchableOpacity
                style={styles.modalPrintButton}
                onPress={() => {
                  handlePrintReceipt(selectedInvoiceOrder);
                  setInvoiceModalVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="print" size={20} color="#FFFFFF" />
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
    flexGrow: 1,
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
    marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 12) + 8 : 12,
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
  countBadgeHighlight: {
    backgroundColor: '#0AB28D',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 2,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgeHighlightText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    minHeight: 350,
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
    height: 1.5,
    backgroundColor: '#555555',
    marginVertical: 12,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: '#555555',
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
    height: 1.5,
    backgroundColor: '#555555',
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
  receiptOrderInfoSection: {
    marginBottom: 4,
  },
  receiptOrderText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    fontWeight: '600',
    color: '#111111',
  },
  receiptTableHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  receiptHeaderCol: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  receiptItemText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  receiptTotalValue: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  receiptGrandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
  },
  receiptGrandTotalLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  receiptGrandTotalVal: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 17,
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
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
    fontStyle: 'italic',
    color: '#444444',
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
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6F7F3',
    borderWidth: 1,
    borderColor: '#0AB28D',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  readyBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0AB28D',
  },
  itemsReadyActionCapsuleButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#0AB28D',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginRight: 8,
  },
  itemsReadyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
