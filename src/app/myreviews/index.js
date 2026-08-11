import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  BackHandler,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { fetchReviews as apiFetchReviews } from '@/services/api';

import CustomLoader from '@/components/CustomLoader';
import { getDisplayOrderId } from '../orders';

import './myreviews.css';

export default function MyReviewsScreen() {
  const router = useRouter();
  const [reviews, setReviews] = useState([]);
  const safeReviews = Array.isArray(reviews) ? reviews : [];
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
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
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await apiFetchReviews(targetRestId, controller.signal);

      clearTimeout(timeoutId);
      const data = await response.json();

      if (response.ok && data.success && Array.isArray(data.reviews)) {
        const matchingReviews = data.reviews.filter((rev) => {
          if (!targetRestId) return false;
          const revRestId = String(
            rev.restaurant_id || rev.restaurantId || rev.restId || rev.storeId || rev.vendorId || rev.restaurant || ''
          ).trim();
          return revRestId === String(targetRestId).trim();
        });
        setReviews(matchingReviews);
      } else {
        setReviews([]);
      }
    } catch (err) {
      console.error('Error fetching reviews:', err);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  const getIstDateTime = (rev) => {
    if (rev.date && rev.time) {
      return `${rev.date}, ${rev.time}`;
    }
    const rawDate = rev.createdAt || rev.date;
    if (!rawDate) {
      return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    }

    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return String(rawDate);

    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getItemsList = (rev) => {
    if (Array.isArray(rev.items) && rev.items.length > 0) {
      return rev.items.map((it) => ({
        name: typeof it === 'string' ? it : it.name || 'Item',
        quantity: typeof it === 'object' ? it.quantity || 1 : 1,
        price: typeof it === 'object' ? it.price || 200 : 200,
      }));
    }
    if (typeof rev.items === 'string' && rev.items.trim()) {
      return [{ name: rev.items, quantity: 1, price: 200 }];
    }
    return [{ name: 'Chicken Biryani', quantity: 1, price: 200 }];
  };

  const renderStars = (rating) => {
    const num = Math.round(Number(rating) || 5);
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= num ? 'star' : 'star-outline'}
          size={18}
          color="#FFB800"
        />
      );
    }
    return stars;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Row with Back Button & Center My Reviews Pill */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButtonCircle}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#111111" />
          </TouchableOpacity>

          <View style={styles.topHeaderPill}>
            <Ionicons name="star" size={20} color="#111111" />
            <Text style={styles.topHeaderText}>My Reviews</Text>
          </View>
        </View>

        {loading && (
          <CustomLoader
            visible={loading}
            title="Loading Reviews..."
            subtitle="Fetching customer reviews"
          />
        )}

        {/* Stats Row: Average Rating & Total Reviews */}
        {!loading && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>AVERAGE RATING</Text>
              <View style={styles.statValueRow}>
                <Text style={styles.statValue}>
                  {safeReviews.length === 0
                    ? '0.0'
                    : (safeReviews.reduce((sum, r) => sum + (r?.restaurantRating || r?.rating || 0), 0) / safeReviews.length).toFixed(1)}
                </Text>
                <Ionicons name="star" size={18} color="#C8A84B" style={{ marginLeft: 4 }} />
              </View>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>TOTAL REVIEWS</Text>
              <Text style={styles.statValue}>{safeReviews.length}</Text>
            </View>
          </View>
        )}

        {/* Empty state */}
        {!loading && safeReviews.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="star-outline" size={64} color="#B0A080" />
            <Text style={styles.emptyTitle}>No Reviews Yet</Text>
            <Text style={styles.emptySubtitle}>
              Customer reviews and ratings for your{`\n`}food will appear here.
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={fetchReviews}
              activeOpacity={0.8}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {safeReviews.map((rev) => {
            if (!rev) return null;
            const orderIdVal = getDisplayOrderId(rev);
            const istDateStr = getIstDateTime(rev);
            const itemsList = getItemsList(rev);
            const ratingVal = rev.restaurantRating || rev.rating || 5;
            const commentText =
              rev.restaurantReview || rev.review || 'No review comment provided.';

            return (
              <View key={rev._id || orderIdVal} style={styles.reviewOuterCard}>
                {/* Top Order Strip */}
                <View style={styles.reviewTopStrip}>
                  <Text style={styles.reviewOrderIdText}>ORDER ID: {orderIdVal}</Text>
                  <Text style={styles.reviewIstDateText}>{istDateStr}</Text>
                </View>

                {/* 1st: Table Headers for ITEM, QTY, PRICE */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCol, { flex: 2, borderRightWidth: 1.5, borderRightColor: '#555555', paddingRight: 6 }]}>ITEM</Text>
                  <Text style={[styles.tableHeaderCol, { flex: 1, textAlign: 'center', borderRightWidth: 1.5, borderRightColor: '#555555', paddingHorizontal: 4 }]}>
                    QTY
                  </Text>
                  <Text style={[styles.tableHeaderCol, { flex: 1, textAlign: 'right', paddingLeft: 6 }]}>
                    PRICE
                  </Text>
                </View>

                {/* Table Items */}
                {itemsList.map((item, idx) => (
                  <View key={idx} style={styles.tableItemRow}>
                    <Text style={[styles.itemNameText, { flex: 2, borderRightWidth: 1.5, borderRightColor: '#555555', paddingRight: 6 }]}>{item.name}</Text>
                    <Text style={[styles.itemQtyText, { flex: 1, textAlign: 'center', borderRightWidth: 1.5, borderRightColor: '#555555', paddingHorizontal: 4 }]}>x{item.quantity}</Text>
                    <Text style={[styles.itemPriceText, { flex: 1, textAlign: 'right', paddingLeft: 6 }]}>₹{item.price}</Text>
                  </View>
                ))}

                <View style={styles.orderDivider} />

                {/* 2nd: Rating Stars Row */}
                <View style={styles.ratingRow}>
                  <View style={styles.ratingStarsRow}>{renderStars(ratingVal)}</View>
                  <Text style={styles.ratingValText}>{ratingVal} / 5</Text>
                </View>

                {/* 3rd: Customer Review Quote Box */}
                <View style={styles.reviewCommentBox}>
                  <Text style={styles.reviewCommentText}>"{commentText}"</Text>
                </View>
              </View>
            );
          })
        }
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
  loadingContainer: {
    paddingVertical: 40,
  },
  reviewOuterCard: {
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
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 3,
  },
  reviewTopStrip: {
    width: '100%',
    backgroundColor: '#E0D6BC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  reviewOrderIdText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  reviewIstDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555555',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 4,
  },
  tableHeaderCol: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555555',
    letterSpacing: 0.5,
  },
  tableItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemNameText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
    flex: 2,
  },
  itemQtyText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333333',
    flex: 1,
    textAlign: 'center',
  },
  itemPriceText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    flex: 1,
    textAlign: 'right',
  },
  orderDivider: {
    height: 1.5,
    backgroundColor: '#555555',
    marginVertical: 10,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ratingStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingValText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    marginLeft: 6,
  },
  reviewCommentBox: {
    backgroundColor: '#EFE8D8',
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
  },
  reviewCommentText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#222222',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    marginTop: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#E8E2D0',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    letterSpacing: 0.8,
    marginBottom: 6,
    textAlign: 'center',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 32,
    minHeight: 300,
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
