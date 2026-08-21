import { useOrders } from '@/context/OrdersContext';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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

import { getDisplayOrderId, getEffectiveCommissionRate } from '../orders';
import './tracker.css';

// Live Preparation Countdown Badge Component for Tracker Screen
function TrackerPrepTimerBadge({ order, onMarkReady }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const targetEndTimeRef = useRef(0);

  const statusStr = String(order?.status || order?.orderStatus || '').toLowerCase();
  const isExplicitReady = statusStr === 'ready' || order?.isReady === true || Number(order?.preparationTime ?? order?.prepTime) === 0;

  useEffect(() => {
    if (!order || isExplicitReady) return;
    const acceptedAtMs = order?.acceptedAt
      ? new Date(order.acceptedAt).getTime()
      : Date.now();

    const prepMins = Number(order?.preparationTime ?? order?.prepTime ?? 15);
    const estimatedPrepEndTimeMs = order?.estimatedPrepEndTime
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
        if (onMarkReady && typeof onMarkReady === 'function') {
          onMarkReady(order._id || order.orderId);
        }
      } else {
        setSecondsLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [order?.acceptedAt, order?.estimatedPrepEndTime, order?.preparationTime, isExplicitReady]);

  if (!order) return null;

  if (isExplicitReady || secondsLeft <= 0) {
    return (
      <View style={styles.readyBadgePill}>
        <Ionicons name="checkmark-circle" size={15} color="#0AB28D" />
        <Text style={styles.readyBadgeText}>Items Ready</Text>
      </View>
    );
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <View style={styles.prepBadgePill}>
      <Ionicons name="time-outline" size={15} color="#E4583D" />
      <Text style={styles.prepBadgeText}>Prep: {formattedTime}</Text>
    </View>
  );
}

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

export default function TrackerScreen() {
  const router = useRouter();
  // Fetch data strictly from 'acceptedorders' collection via OrdersContext
  const { acceptedOrders, loading: globalLoading, fetchGlobalOrders, restaurantInfo, markOrderAsReady } = useOrders();
  const rawTrackerList = Array.isArray(acceptedOrders) ? acceptedOrders : [];
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const isNavigatingRef = useRef(false);

  // Receipt Modal State
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState(null);
  const [invoiceModalVisible, setInvoiceModalVisible] = useState(false);

  // KOT Modal State
  const [selectedKotOrder, setSelectedKotOrder] = useState(null);
  const [kotModalVisible, setKotModalVisible] = useState(false);

  // Device level Back Button / Gesture Navigation Compatibility
  useEffect(() => {
    const onBackPress = () => {
      if (invoiceModalVisible) {
        setInvoiceModalVisible(false);
        setSelectedInvoiceOrder(null);
        return true;
      }
      if (kotModalVisible) {
        setKotModalVisible(false);
        setSelectedKotOrder(null);
        return true;
      }
      router.replace('/home');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [router, invoiceModalVisible, kotModalVisible]);

  // 1-second clock for countdown timers
  useEffect(() => {
    const timerInterval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timerInterval);
  }, []);

  // 5-Second Background Polling Loop when Tracker screen is in focus
  useFocusEffect(
    useCallback(() => {
      isNavigatingRef.current = false;
      fetchGlobalOrders(true);

      const pollingInterval = setInterval(() => {
        fetchGlobalOrders(true);
      }, 5000);

      return () => clearInterval(pollingInterval);
    }, [fetchGlobalOrders])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGlobalOrders(false);
    setRefreshing(false);
  };

  const orders = rawTrackerList.map((ord, idx) => ({
    ...ord,
    startTime: ord.createdAt
      ? new Date(ord.createdAt).getTime()
      : ord.orderDate
        ? new Date(ord.orderDate).getTime()
        : Date.now() - idx * 180000,
  }));
  const loading = globalLoading && orders.length === 0;

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

    const customerName = order.customerName || order.userName || order.user?.name || '';

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

    const totalQtySum = itemsList.reduce(
      (acc, it) => acc + (Number(it.quantity) || 1),
      0
    );

    const itemsSubtotal = itemsList.reduce(
      (acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 1),
      0
    );

    // Extract GST from order DB record & split into CGST and SGST
    const rawCgst = Number(order.cgst ?? order.cgstAmount ?? 0);
    const rawSgst = Number(order.sgst ?? order.sgstAmount ?? 0);

    const rawGst = Number(
      order.gst ??
      order.gstAmount ??
      order.tax ??
      order.taxAmount ??
      order.gstVal ??
      order.taxes ??
      (rawCgst + rawSgst)
    );

    const storedGstRate = Number(order.gstPercentage ?? order.gstRate ?? order.gstPercent ?? 0);
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
            <div class="center" style="font-size: 10px; margin-top: 2px;">Address: ${restAddress}</div>
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

  const handleOpenKotModal = (orderObj) => {
    setSelectedKotOrder(orderObj);
    setKotModalVisible(true);
  };

  const generateKotHtml = (order) => {
    if (!order || typeof order !== 'object') return '';
    const restName = order.restaurantName || restaurantInfo?.name || '';
    const restAddress = getSafeAddress(order, restaurantInfo?.address);
    const orderIdVal = getDisplayOrderId(order);

    const rawDate = order.acceptedAt || order.createdAt || order.orderDate;
    const dateObj = rawDate ? new Date(rawDate) : new Date();
    const dateStr = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const customerName = order.customerName || order.userName || order.user?.name || '';

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
        return { name: String(it || 'Item'), quantity: 1, instruction: '' };
      }
      return {
        name: it.name || 'Item',
        quantity: Number(it.quantity || it.qty || 1) || 1,
        instruction: it.instruction || it.notes || it.specialInstructions || '',
      };
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
          <title>KOT - ${orderIdVal}</title>
          <style>
            @page {
              size: auto;
              margin: 0mm;
            }
            @media print {
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
              font-size: 12px;
              line-height: 1.3;
            }
            .kot-wrapper {
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
              padding: 4px 0;
              font-size: 12px;
              word-break: break-word;
            }
            th { text-align: left; font-weight: bold; border-bottom: 1px dashed #444444; font-size: 13px; }
            .center-col { text-align: center; }
            .footer { margin-top: 14px; font-size: 13px; color: #000000; text-align: center; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="kot-wrapper">
            <div class="center bold" style="font-size: 16px;">KITCHEN ORDER TICKET</div>
            ${restName ? `<div class="center bold" style="font-size: 13px; margin-top: 2px;">${restName}</div>` : ''}
            ${restAddress ? `<div class="center" style="font-size: 10px; margin-top: 2px;">Address: ${restAddress}</div>` : ''}

            <div class="divider">--------------------------------</div>

            <div style="font-size: 12px;"><strong>Order ID:</strong> ${orderIdVal}</div>
            <div style="font-size: 12px;"><strong>Date:</strong> ${dateStr}</div>
            <div class="bold" style="font-size: 12px; margin-top: 4px; margin-bottom: 2px;">From Leevon Delivery</div>

            <div class="divider">--------------------------------</div>

            <table>
              <thead>
                <tr>
                  <th style="width: 30px;">NO.</th>
                  <th>ITEM NAME</th>
                  <th class="center-col" style="width: 45px;">QTY</th>
                </tr>
              </thead>
              <tbody>
                ${itemsList
        .map(
          (item, idx) => `
                  <tr>
                    <td style="font-weight: bold;">${idx + 1}</td>
                    <td style="font-weight: bold; font-size: 13px;">${item.name}${item.instruction ? `<br/><span style="font-size: 10px; font-style: italic; font-weight: normal;">Note: ${item.instruction}</span>` : ''}</td>
                    <td class="center-col bold" style="font-size: 14px;">${item.quantity}</td>
                  </tr>
                `
        )
        .join('')}
              </tbody>
            </table>

            <div class="divider">--------------------------------</div>

            <div class="footer">
              *** KITCHEN COPY ***
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const handlePrintKot = async (order) => {
    try {
      const html = generateKotHtml(order);

      if (Platform.OS === 'web') {
        printHtmlOnWeb(html);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Print.printAsync({ uri });
      }
    } catch (err) {
      console.error('Error printing KOT:', err);
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
          {orders.length > 0 && (
            <View style={styles.countBadgeHighlight}>
              <Text style={styles.countBadgeHighlightText}>{orders.length}</Text>
            </View>
          )}
        </View>

        {orders.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#736B5E" />
            <Text style={styles.emptyTitle}>No Accepted Orders</Text>
            <Text style={styles.emptySubtitle}>
              Accepted orders being prepared will appear here.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={onRefresh}
              activeOpacity={0.8}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {orders.map((order, orderIdx) => {
          if (!order || typeof order !== 'object') return null;
          const orderIdVal = getDisplayOrderId(order) || `ORD-${orderIdx + 1}`;
          let formattedDate = new Date().toLocaleString();
          if (order.acceptedAt || order.createdAt) {
            try {
              const d = new Date(order.acceptedAt || order.createdAt);
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
            const discountedPrice = commRate > 0
              ? rawPrice * (1 - commRate / 100)
              : (it.priceAfterCommission !== undefined ? Number(it.priceAfterCommission) || 0 : rawPrice);
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

          const calculatedNetEarnings = itemsList.reduce(
            (acc, it) => acc + (Number(it.discountedPrice) || 0) * (Number(it.qty) || 1),
            0
          );

          const finalTotalPrice = commRate > 0
            ? calculatedNetEarnings
            : (Number(order.totalPriceAfterCommission ?? order.netEarnings ?? calculatedNetEarnings) || calculatedNetEarnings);

          const orderKey = `${order._id || order.orderId || orderIdVal || 'track'}_${orderIdx}`;

          return (
            <View key={orderKey} style={styles.orderOuterCard}>
              {/* Card Title & Date Header */}
              <View style={styles.orderHeaderSection}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderIdMainTitle}>ORDER ID : {orderIdVal}</Text>
                  <Text style={styles.orderHeaderDateText}>{formattedDate}</Text>
                </View>
                <TrackerPrepTimerBadge order={order} onMarkReady={markOrderAsReady} />
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
              {itemsList.map((item, itemIdx) => (
                <View key={itemIdx} style={styles.tableItemRow}>
                  <Text style={[styles.itemNameText, { flex: 2, borderRightWidth: 1.5, borderRightColor: '#555555', paddingRight: 6 }]}>{item.name}</Text>
                  <Text style={[styles.itemQtyText, { flex: 1, textAlign: 'center', borderRightWidth: 1.5, borderRightColor: '#555555', paddingHorizontal: 4 }]}>{item.qty}</Text>

                  <View style={[styles.priceColumnContainer, { flex: 1.2, paddingLeft: 6 }]}>
                    {/* Strikethrough Raw Price & Red Commission Badge */}
                    <View style={styles.strikethroughRow}>
                      <Text style={styles.strikethroughPriceText}>
                        ₹{item.rawPrice}
                      </Text>
                      <Text style={styles.commissionBadgeText}>
                        {commRate}%
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

              {/* Action Buttons: Items Ready, KOT Print & Print Invoice */}
              <View style={styles.cardBottomActionRow}>
                {String(order.status || order.orderStatus || '').toLowerCase() !== 'ready' && !order.isReady && Number(order.preparationTime ?? order.prepTime) !== 0 && (
                  <TouchableOpacity
                    style={styles.itemsReadyActionCapsuleButton}
                    onPress={() => markOrderAsReady(order)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.itemsReadyActionButtonText}>Items Ready</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.kotPrintCapsuleButton}
                  onPress={() => handleOpenKotModal(order)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="restaurant-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.kotPrintButtonText}>KOT Print</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.printInvoiceCapsuleButton}
                  onPress={() => handleOpenInvoiceModal(order)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="print" size={16} color="#FFFFFF" />
                  <Text style={styles.printInvoiceButtonText}>Print Invoice</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Printable Receipt Modal */}
      {selectedInvoiceOrder && (
        <Modal
          visible={invoiceModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setInvoiceModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.receiptModalCard}>
              <TouchableOpacity
                style={styles.closeCrossCircle}
                onPress={() => setInvoiceModalVisible(false)}
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

                {/* Block 5: Totals Breakdown */}
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

                  const totalQtySum = modalItems.reduce(
                    (acc, it) => acc + (Number(it?.quantity || it?.qty || 1) || 1),
                    0
                  );

                  const itemsSubtotal = modalItems.reduce(
                    (acc, it) => acc + (Number(it?.originalPrice ?? it?.price ?? 0) || 0) * (Number(it?.quantity || it?.qty || 1) || 1),
                    0
                  );

                  const rawCgst = Number(selectedInvoiceOrder.cgst ?? selectedInvoiceOrder.cgstAmount ?? 0);
                  const rawSgst = Number(selectedInvoiceOrder.sgst ?? selectedInvoiceOrder.sgstAmount ?? 0);

                  const rawGst = Number(
                    selectedInvoiceOrder.gst ??
                    selectedInvoiceOrder.gstAmount ??
                    selectedInvoiceOrder.tax ??
                    selectedInvoiceOrder.taxAmount ??
                    selectedInvoiceOrder.gstVal ??
                    selectedInvoiceOrder.taxes ??
                    (rawCgst + rawSgst)
                  );

                  const storedGstRate = Number(selectedInvoiceOrder.gstPercentage ?? selectedInvoiceOrder.gstRate ?? selectedInvoiceOrder.gstPercent ?? 0);
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

                  return (
                    <>
                      <View style={styles.receiptTotalRow}>
                        <Text style={styles.receiptTotalLabel}>Sub Total</Text>
                        <Text style={styles.receiptTotalValue}>₹{itemsSubtotal.toFixed(2)}</Text>
                      </View>
                      <View style={[styles.receiptTotalRow, { paddingLeft: 12 }]}>
                        <Text style={[styles.receiptTotalLabel, { fontSize: 13, color: '#555555' }]}>{cgstLabel}</Text>
                        <Text style={[styles.receiptTotalValue, { fontSize: 14, color: '#555555' }]}>₹{cgstVal.toFixed(2)}</Text>
                      </View>
                      <View style={[styles.receiptTotalRow, { paddingLeft: 12 }]}>
                        <Text style={[styles.receiptTotalLabel, { fontSize: 13, color: '#555555' }]}>{sgstLabel}</Text>
                        <Text style={[styles.receiptTotalValue, { fontSize: 14, color: '#555555' }]}>₹{sgstVal.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.dashedDivider}>---------------------------------------------</Text>
                      <View style={styles.receiptGrandTotalRow}>
                        <Text style={styles.receiptGrandTotalLabel}>Grand Total</Text>
                        <Text style={styles.receiptGrandTotalVal}>₹{grandTotalVal.toFixed(2)}</Text>
                      </View>
                    </>
                  );
                })()}

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                {/* Block 6: Footer */}
                <View style={styles.receiptThankYouFooter}>
                  <Text style={[styles.receiptThankYouText, { fontWeight: 'bold', fontSize: 14 }]}>Thank You, Order Again!</Text>
                </View>
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

      {/* KOT (Kitchen Order Ticket) Modal */}
      {selectedKotOrder && (
        <Modal
          visible={kotModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setKotModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.receiptModalCard}>
              <TouchableOpacity
                style={styles.closeCrossCircle}
                onPress={() => setKotModalVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#111111" />
              </TouchableOpacity>

              <ScrollView style={styles.receiptPaperCard} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.restaurantHeaderSection}>
                  <Text style={[styles.restaurantNameText, { fontSize: 18, letterSpacing: 0.5 }]}>
                    KITCHEN ORDER TICKET
                  </Text>
                  <Text style={[styles.restaurantSubText, { fontWeight: '700', marginTop: 2 }]}>
                    {selectedKotOrder.restaurantName || restaurantInfo?.name || ''}
                  </Text>
                  {getSafeAddress(selectedKotOrder, restaurantInfo?.address) ? (
                    <Text style={styles.restaurantSubText}>
                      Address: {getSafeAddress(selectedKotOrder, restaurantInfo?.address)}
                    </Text>
                  ) : null}
                </View>

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                {/* Order & Customer Info */}
                <View style={styles.receiptOrderInfoSection}>
                  <Text style={styles.receiptOrderText}>
                    Order ID: {getDisplayOrderId(selectedKotOrder)}
                  </Text>
                  <Text style={styles.receiptOrderText}>
                    Date: {(() => {
                      const rawD = selectedKotOrder.acceptedAt || selectedKotOrder.createdAt || selectedKotOrder.orderDate;
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

                {/* Items Table Headers */}
                <View style={styles.receiptTableHeaderRow}>
                  <Text style={[styles.receiptHeaderCol, { flex: 0.8 }]}>NO.</Text>
                  <Text style={[styles.receiptHeaderCol, { flex: 3.2 }]}>ITEM NAME</Text>
                  <Text style={[styles.receiptHeaderCol, { flex: 1, textAlign: 'center' }]}>QTY</Text>
                </View>

                {/* Items List */}
                {(() => {
                  let modalItems = [];
                  if (Array.isArray(selectedKotOrder.items)) {
                    modalItems = selectedKotOrder.items;
                  } else if (typeof selectedKotOrder.items === 'string') {
                    try {
                      const p = JSON.parse(selectedKotOrder.items);
                      if (Array.isArray(p)) modalItems = p;
                    } catch (e) { }
                  }
                  if (modalItems.length === 0) {
                    modalItems = [{ name: 'Item', quantity: 1 }];
                  }

                  return modalItems.map((it, i) => {
                    const name = typeof it === 'object' ? (it.name || 'Item') : String(it || 'Item');
                    const qty = typeof it === 'object' ? (Number(it.quantity || it.qty || 1) || 1) : 1;
                    const instruction = typeof it === 'object' ? (it.instruction || it.notes || it.specialInstructions || '') : '';

                    return (
                      <View key={i} style={[styles.receiptItemRow, { alignItems: 'flex-start', paddingVertical: 5 }]}>
                        <Text style={[styles.receiptItemText, { flex: 0.8, fontWeight: '700' }]}>{i + 1}</Text>
                        <View style={{ flex: 3.2 }}>
                          <Text style={[styles.receiptItemText, { fontWeight: '700', fontSize: 14 }]}>{name}</Text>
                          {instruction ? (
                            <Text style={{ fontSize: 11, fontStyle: 'italic', color: '#555555', marginTop: 2 }}>
                              Note: {instruction}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={[styles.receiptItemText, { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 15 }]}>{qty}</Text>
                      </View>
                    );
                  });
                })()}

                <Text style={styles.dashedDivider}>---------------------------------------------</Text>

                {/* Footer */}
                <View style={styles.receiptThankYouFooter}>
                  <Text style={[styles.receiptThankYouText, { fontWeight: 'bold', fontSize: 14 }]}>
                    *** KITCHEN COPY ***
                  </Text>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={[styles.modalPrintButton, { backgroundColor: '#E65100' }]}
                onPress={() => {
                  handlePrintKot(selectedKotOrder);
                  setKotModalVisible(false);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="restaurant-outline" size={20} color="#FFFFFF" />
                <Text style={styles.modalPrintButtonText}>Print KOT</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
    width: '100%',
  },
  kotPrintCapsuleButton: {
    flex: 1,
    height: 46,
    backgroundColor: '#E65100',
    borderRadius: 23,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  kotPrintButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  printInvoiceCapsuleButton: {
    flex: 1,
    height: 46,
    backgroundColor: '#0066FF',
    borderRadius: 23,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  printInvoiceButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
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
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 4,
  },
  restaurantSubText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#555555',
    marginBottom: 2,
  },
  dashedDivider: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'center',
    color: '#888888',
    marginVertical: 6,
    letterSpacing: 1,
  },
  receiptOrderInfoSection: {
    marginVertical: 4,
    gap: 3,
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
    width: '100%',
    height: 48,
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  modalPrintButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  prepBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDEAE6',
    borderWidth: 1,
    borderColor: '#E4583D',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  prepBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E4583D',
  },
  readyBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E6F7F3',
    borderWidth: 1,
    borderColor: '#0AB28D',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  readyBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0AB28D',
  },
  itemsReadyActionCapsuleButton: {
    flex: 1,
    height: 46,
    backgroundColor: '#0AB28D',
    borderRadius: 23,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  itemsReadyActionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
