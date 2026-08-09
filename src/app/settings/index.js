import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Linking,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSelector, useDispatch } from 'react-redux';
import { clearUser, setUser } from '@/store/userSlice';

import './settings.css';

export default function SettingsScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  // Read from Redux — instant, no async wait, no blank flash
  const userData = useSelector((state) => state.user.userData);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  // Track whether initial load is done so we never show a blank screen
  const [isLoaded, setIsLoaded] = useState(false);
  const isNavigatingRef = React.useRef(false);

  // Load on mount — fires immediately on first render
  useEffect(() => {
    // If Redux already has data (e.g. from a previous load), mark as loaded instantly
    if (userData) {
      setIsLoaded(true);
      return;
    }
    const loadUser = async () => {
      try {
        const storedUser = await AsyncStorage.getItem('userData');
        if (storedUser) {
          dispatch(setUser(JSON.parse(storedUser)));
        }
      } catch (e) {
        console.warn('Settings mount: failed to load userData', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadUser();
  }, []);

  // Every time settings screen comes into focus (returning from sub-pages,
  // pressing back, etc.) ensure Redux has fresh user data.
  // If Redux already has data, skip the async fetch to avoid blank flash.
  useFocusEffect(
    useCallback(() => {
      isNavigatingRef.current = false;
      // Always mark as loaded immediately so we never show a blank page
      setIsLoaded(true);

      // Only hit AsyncStorage if Redux is empty (e.g. cold start)
      if (userData) return;

      const loadUser = async () => {
        try {
          const storedUser = await AsyncStorage.getItem('userData');
          if (storedUser) {
            dispatch(setUser(JSON.parse(storedUser)));
          }
        } catch (e) {
          console.warn('Settings: failed to load userData', e);
        }
      };
      loadUser();
    }, [dispatch, userData])
  );

  const handleLogout = async () => {
    try {
      await AsyncStorage.clear();
      dispatch(clearUser());
      console.log('AsyncStorage cleared and Redux user cleared on logout.');
      router.replace('/login');
    } catch (error) {
      console.error('Error clearing AsyncStorage on logout:', error);
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('userToken');
      dispatch(clearUser());
      router.replace('/login');
    }
  };

  const handleMenuItemPress = (title) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 400);

    if (title === 'Delete Account') {
      setDeleteModalVisible(true);
    } else if (title === 'Privacy Policy') {
      Linking.openURL('https://privacypolicyrestuarent.vercel.app/');
    } else if (title === 'Contact Us') {
      router.push('/contact');
    } else if (title === 'Rejected Orders') {
      router.push('/rejectedorders');
    } else if (title === 'My Reviews') {
      router.push('/myreviews');
    } else if (title === 'My Orders') {
      router.push('/orders');
    } else if (title === 'Restaurant Profile') {
      router.push('/restaurantprofile');
    } else if (title === 'Payments History') {
      router.push('/payments');
    } else {
      console.log(`Menu item pressed: ${title}`);
    }
  };

  const initialLetter = userData?.name
    ? userData.name.trim().charAt(0).toUpperCase()
    : 'T';
  const displayName = userData?.name || 'Talimpu';
  const displayPhone = userData?.phone || userData?.email || 'Talimpu';

  const menuItems = [
    { id: '1', title: 'Restaurant Profile', icon: 'person' },
    { id: '2', title: 'My Orders', icon: 'archive' },
    { id: '3', title: 'Payments History', icon: 'card' },
    { id: '4', title: 'My Reviews', icon: 'star' },
    { id: '5', title: 'Rejected Orders', icon: 'ban' },
    { id: '6', title: 'Contact Us', icon: 'mail' },
    { id: '7', title: 'Privacy Policy', icon: 'shield-checkmark' },
    { id: '8', title: 'Terms & Conditions', icon: 'document-text' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Pill */}
        <View style={styles.topHeaderPill}>
          <Ionicons name="settings" size={20} color="#111111" />
          <Text style={styles.topHeaderText}>Settings</Text>
        </View>

        {/* User Profile Card */}
        <View style={styles.userProfileCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initialLetter}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userNameText}>{displayName}</Text>
            <View style={styles.userPhoneRow}>
              <Ionicons name="call-outline" size={15} color="#8A8168" />
              <Text style={styles.userPhoneText}>{displayPhone}</Text>
            </View>
          </View>
        </View>

        {/* Tan Menu Container Card */}
        <View style={styles.menuBoxContainer}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuRowItem}
              onPress={() => handleMenuItemPress(item.title)}
              activeOpacity={0.7}
            >
              <View style={styles.menuLeftContent}>
                <View style={styles.iconWrapper}>
                  <Ionicons name={item.icon} size={22} color="#111111" />
                </View>
                <Text style={styles.menuTitleText}>{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#111111" />
            </TouchableOpacity>
          ))}

          {/* Delete Account Item */}
          <TouchableOpacity
            style={styles.menuRowItem}
            onPress={() => setDeleteModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.menuLeftContent}>
              <View style={styles.iconWrapper}>
                <Ionicons name="trash" size={22} color="#DE5335" />
              </View>
              <Text style={[styles.menuTitleText, styles.deleteTitleText]}>
                Delete Account
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#DE5335" />
          </TouchableOpacity>

          {/* Red Filled Logout Button */}
          <TouchableOpacity
            style={styles.logoutButtonItem}
            onPress={() => setLogoutModalVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.menuLeftContent}>
              <View style={styles.iconWrapper}>
                <Ionicons name="exit" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.logoutTitleText}>Logout</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Delete Account Request Custom Modal Overlay */}
      {deleteModalVisible && (
        <View style={styles.deleteModalOverlay} pointerEvents="auto">
          <View style={styles.deleteModalCard}>
            {/* Top Right Close Cross Button */}
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setDeleteModalVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color="#777777" />
            </TouchableOpacity>

            {/* Terracotta Red Circle Trash Badge */}
            <View style={styles.deleteIconCircle}>
              <Ionicons name="trash-outline" size={32} color="#FFFFFF" />
            </View>

            {/* Modal Title */}
            <Text style={styles.deleteModalTitle}>Delete Account Request</Text>

            {/* Modal Body Text Paragraphs */}
            <Text style={styles.deleteModalBodyText}>
              To delete your account and associated data, please email{' '}
              <Text style={styles.boldEmailText}>
                support@leevondelivery.in
              </Text>.
            </Text>

            <Text style={styles.deleteModalBodyText}>
              Your account and data will be permanently deleted within 30 days.
            </Text>

            {/* Got It Dismiss Button */}
            <TouchableOpacity
              style={styles.gotItButton}
              onPress={() => setDeleteModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.gotItButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Logout Confirmation Modal */}
      <Modal
        visible={logoutModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <View style={styles.logoutModalCard}>
            {/* Orange Circle with Exit Icon */}
            <View style={styles.logoutIconCircle}>
              <Ionicons name="exit" size={32} color="#FFFFFF" />
            </View>

            {/* Question Text */}
            <Text style={styles.logoutModalTitle}>
              Are you sure you want to logout?
            </Text>

            {/* Orange Logout Button */}
            <TouchableOpacity
              style={styles.logoutConfirmButton}
              onPress={() => {
                setLogoutModalVisible(false);
                handleLogout();
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.logoutConfirmButtonText}>Logout</Text>
            </TouchableOpacity>

            {/* Not Now Underlined Link */}
            <TouchableOpacity
              onPress={() => setLogoutModalVisible(false)}
              activeOpacity={0.7}
              style={styles.notNowButton}
            >
              <Text style={styles.notNowText}>Not now</Text>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 120,
    alignItems: 'center',
  },
  topHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F7F7EB',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 26,
    marginTop: 8,
    marginBottom: 20,
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
  userProfileCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#E0D6BC',
    borderRadius: 26,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 5,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1F1F1F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 18,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  userNameText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111111',
  },
  userPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  userPhoneText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#555555',
  },
  menuBoxContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#E0D6BC',
    borderRadius: 32,
    padding: 16,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  menuRowItem: {
    width: '100%',
    height: 64,
    backgroundColor: '#F7F7EB',
    borderRadius: 32,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  menuLeftContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    width: 26,
    alignItems: 'center',
  },
  menuTitleText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111111',
    marginLeft: 14,
  },
  deleteTitleText: {
    color: '#DE5335',
  },
  logoutButtonItem: {
    width: '100%',
    height: 64,
    backgroundColor: '#E35436',
    borderRadius: 32,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#E35436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  logoutTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 14,
  },

  /* Delete Account Request Custom Modal Styles */
  deleteModalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 999999,
    elevation: 999999,
  },
  deleteModalCard: {
    width: '85%',
    maxWidth: 320,
    backgroundColor: '#F7F7EB',
    borderRadius: 28,
    paddingTop: 24,
    paddingBottom: 26,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 18,
    zIndex: 10,
  },
  deleteIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E35436',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
    shadowColor: '#E35436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  deleteModalTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 14,
    textAlign: 'center',
  },
  deleteModalBodyText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#444444',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 14,
  },
  boldEmailText: {
    fontWeight: '600',
    color: '#111111',
  },
  gotItButton: {
    backgroundColor: '#E35436',
    borderRadius: 24,
    height: 48,
    width: '88%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#E35436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  gotItButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Logout Confirm Modal Styles */
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoutModalCard: {
    width: '85%',
    maxWidth: 320,
    backgroundColor: '#F7F7EB',
    borderRadius: 28,
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  logoutIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E35436',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#E35436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  logoutModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 28,
  },
  logoutConfirmButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#E35436',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#E35436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoutConfirmButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  notNowButton: {
    paddingVertical: 4,
  },
  notNowText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111111',
    textDecorationLine: 'underline',
  },
});
