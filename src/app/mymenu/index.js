import { updateMenuItemStatus as apiUpdateMenuItemStatus, fetchMenu } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  BackHandler,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import CustomLoader from '@/components/CustomLoader';
import './mymenu.css';

export default function MyMenuScreen() {
  const router = useRouter();
  const reduxUserData = useSelector((state) => state.user.userData);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(reduxUserData || null);
  const [collectionName, setCollectionName] = useState('');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      let userObj = reduxUserData;
      if (!userObj) {
        const storedUser = await AsyncStorage.getItem('userData');
        if (storedUser) {
          userObj = JSON.parse(storedUser);
        }
      }
      if (userObj) {
        setUserData(userObj);
      }

      const targetRestId = String(
        userObj?.restId ||
        userObj?.restaurantId ||
        userObj?.restaurant_id ||
        userObj?._id ||
        ''
      ).trim();
      const targetName = userObj?.name || '';

      // Instant Cache Read — 0ms wait for the user
      const cacheKey = 'cached_menu_items_' + (targetRestId || 'default');
      try {
        const cachedStr = await AsyncStorage.getItem(cacheKey);
        if (cachedStr) {
          const cachedItems = JSON.parse(cachedStr);
          if (Array.isArray(cachedItems) && cachedItems.length > 0) {
            setMenuItems(cachedItems);
            setLoading(false);
          }
        }
      } catch (cacheErr) {}

      await fetchMenuItems(targetRestId, targetName, cacheKey);
    } catch (error) {
      console.error('Error loading user data or menu items:', error);
      setLoading(false);
    }
  };

  const fetchMenuItems = async (targetRestId, targetName, cacheKey) => {
    let response = null;
    let attempts = 0;

    // Try up to 2 times automatically in case of temporary network glitch or slow cold-start
    while (attempts < 2 && !response) {
      attempts++;
      try {
        response = await fetchMenu(targetRestId, targetName);
      } catch (err) {
        console.warn(`[Menu Fetch] Attempt ${attempts} notice:`, err?.message || err);
        if (attempts < 2) {
          await new Promise((res) => setTimeout(res, 600));
        }
      }
    }

    try {
      if (response && response.ok) {
        const data = await response.json();
        console.log('Menu fetch response:', data);

        if (data.success && Array.isArray(data.items)) {
          setMenuItems(data.items);
          if (cacheKey) {
            AsyncStorage.setItem(cacheKey, JSON.stringify(data.items)).catch(() => {});
          }
        }
        if (data.collectionName) {
          setCollectionName(data.collectionName);
        }
      } else if (!response) {
        console.warn('[Menu Fetch] Network fetch could not connect; keeping cached items if available.');
      }
    } catch (err) {
      console.warn('Error processing menu items response:', err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleItemStatus = async (targetItem) => {
    if (!targetItem) return;
    const newStatus = !targetItem.itemStatus;

    // 1. Optimistic UI update by item identity / _id
    let updatedList = [];
    setMenuItems((prevItems) => {
      updatedList = prevItems.map((item) => {
        const isMatch =
          (item._id && targetItem._id && item._id === targetItem._id) ||
          item === targetItem;
        if (isMatch) {
          return { ...item, itemStatus: newStatus };
        }
        return item;
      });
      return updatedList;
    });

    // Update local cache
    const targetRestId = userData?.restId || userData?.restaurantId || userData?.restaurant_id || userData?._id || '';
    const cacheKey = 'cached_menu_items_' + (targetRestId || 'default');
    AsyncStorage.setItem(cacheKey, JSON.stringify(updatedList)).catch(() => {});

    // 2. Update MongoDB restuarents collection via API
    try {
      const response = await apiUpdateMenuItemStatus(targetItem.collectionName || collectionName, targetItem._id, newStatus);
      const data = await response.json();
      console.log('Update itemStatus response:', data);
    } catch (err) {
      console.error('Error updating itemStatus in MongoDB:', err);
    }
  };

  const isNavigatingRef = React.useRef(false);

  const handleBack = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/home');
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

  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];
  const filteredItems = safeMenuItems.filter((item) =>
    item?.name?.toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Row with Back Button & Center "My Menu" Pill */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButtonCircle}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#111111" />
          </TouchableOpacity>

          <View style={styles.topHeaderPill}>
            <Ionicons name="restaurant" size={18} color="#111111" />
            <Text style={styles.topHeaderText}>My Menu</Text>
          </View>
        </View>

        {/* Search Input Bar */}
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={20} color="#777777" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu items..."
            placeholderTextColor="#888888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {loading ? (
          <CustomLoader
            visible={loading}
            title="Loading Menu..."
            subtitle={null}
          />
        ) : filteredItems.length === 0 ? (
          /* Empty State Beige Card */
          <View style={styles.emptyCardContainer}>
            <View style={styles.infoIconCircle}>
              <Ionicons name="information-circle" size={44} color="#6B6453" />
            </View>
            <Text style={styles.emptyText}>
              No menu items found for this restaurant.
            </Text>
          </View>
        ) : (
          /* Main Outer Beige Card Container */
          <View style={styles.outerMenuCard}>
            {filteredItems.map((item, index) => {
              if (!item) return null;
              return (
                <View key={item._id || index} style={styles.menuItemCard}>
                  <View style={styles.itemInfoCol}>
                    <Text style={styles.menuItemName}>{item.name}</Text>
                    <Text style={styles.menuItemPrice}>₹ {item.price}</Text>
                  </View>

                  {/* Custom Styled Switch Toggle for itemStatus */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleToggleItemStatus(item)}
                    style={[
                      styles.toggleSwitchPill,
                      item.itemStatus ? styles.toggleActivePill : styles.toggleInactivePill,
                    ]}
                  >
                    <View
                      style={[
                        styles.toggleCircle,
                        item.itemStatus ? styles.toggleCircleRight : styles.toggleCircleLeft,
                      ]}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
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
    backgroundColor: '#E6DFD0',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 22,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  topHeaderText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },

  /* Search Bar */
  searchBarContainer: {
    width: '100%',
    maxWidth: 400,
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E6DFD1',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111111',
    height: '100%',
  },

  /* Empty State Beige Card */
  emptyCardContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#E6DFD0',
    borderRadius: 28,
    paddingVertical: 44,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  infoIconCircle: {
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B6453',
    textAlign: 'center',
    lineHeight: 22,
  },

  /* Main Outer Beige Card Container */
  outerMenuCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#E6DFD0',
    borderRadius: 28,
    padding: 14,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },

  /* Menu Item Cards inside Outer Beige Card */
  menuItemCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  itemInfoCol: {
    flex: 1,
    marginRight: 12,
  },
  menuItemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 4,
  },
  menuItemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },

  /* Custom Pill Toggle Switch for itemStatus */
  toggleSwitchPill: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: 'center',
  },
  toggleActivePill: {
    backgroundColor: '#00B78B',
  },
  toggleInactivePill: {
    backgroundColor: '#E35436',
  },
  toggleCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleCircleRight: {
    alignSelf: 'flex-end',
  },
  toggleCircleLeft: {
    alignSelf: 'flex-start',
  },
});
