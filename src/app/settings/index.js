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
  BackHandler,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSelector, useDispatch } from 'react-redux';
import { clearUser, setUser } from '@/store/userSlice';
import notifee from '@notifee/react-native';

import './settings.css';

export default function SettingsScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  // Read from Redux — instant, no async wait, no blank flash
  const userData = useSelector((state) => state.user.userData);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  // Track whether initial load is done so we never show a blank screen
  const [isLoaded, setIsLoaded] = useState(false);
  const isNavigatingRef = React.useRef(false);

  // Hardware Back Button Handler — Dismisses Modals or Navigates to Home
  useEffect(() => {
    const onBackPress = () => {
      if (deleteModalVisible) {
        setDeleteModalVisible(false);
        return true;
      }
      if (logoutModalVisible) {
        setLogoutModalVisible(false);
        return true;
      }
      if (termsModalVisible) {
        setTermsModalVisible(false);
        return true;
      }
      router.replace('/home');
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [deleteModalVisible, logoutModalVisible, termsModalVisible, router]);

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
      setLogoutModalVisible(false);
      dispatch(clearUser());
      await AsyncStorage.clear();
      console.log('AsyncStorage and Redux session completely cleared on logout.');
    } catch (error) {
      console.error('Error clearing AsyncStorage on logout:', error);
      try {
        await AsyncStorage.multiRemove([
          'userData',
          'userToken',
          'restId',
          'restaurantInfo',
          'fcmToken',
          'isLoggedIn',
          'lastActiveTimestamp',
        ]);
      } catch (_e) {}
      dispatch(clearUser());
    } finally {
      router.replace('/login');
    }
  };

  const handleMenuItemPress = async (title) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 400);

    if (title === 'Battery Optimization Settings') {
      try {
        await notifee.openBatteryOptimizationSettings();
      } catch (e) {
        try {
          await notifee.openPowerManagerSettings();
        } catch (err) {
          Linking.openSettings();
        }
      }
    } else if (title === 'Delete Account') {
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
    } else if (title === 'Terms & Conditions') {
      setTermsModalVisible(true);
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
    { id: '6', title: 'Battery Optimization Settings', icon: 'battery-charging' },
    { id: '7', title: 'Contact Us', icon: 'mail' },
    { id: '8', title: 'Privacy Policy', icon: 'shield-checkmark' },
    { id: '9', title: 'Terms & Conditions', icon: 'document-text' },
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

      {/* Terms & Conditions Modal */}
      <Modal
        visible={termsModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setTermsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.termsCard}>
            {/* Header with Title & Close 'X' Button */}
            <View style={styles.termsHeader}>
              <Text style={styles.termsHeaderTitle}>Terms & Conditions</Text>
              <TouchableOpacity
                onPress={() => setTermsModalVisible(false)}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#111111" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Terms Content */}
            <ScrollView
              style={styles.termsScroll}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.termsScrollContent}
            >
              <Text style={styles.termsTitle}>Restaurant Partner Terms & Conditions</Text>
              <Text style={styles.termsSub}>Effective Date: January 2026</Text>

              <Text style={styles.sectionTitle}>1. Relationship & Engagement</Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner acknowledges and agrees that its engagement with the Company is on a principal-to-principal basis and shall not be deemed to create any partnership, joint venture, agency, franchise, or employer–employee relationship between the Restaurant Partner and the Company. The Company operates solely as a technology platform and marketplace facilitator that enables listing, discovery, order placement, payment facilitation, and delivery coordination, and does not own, manage, or control the Restaurant Partner’s business operations, food preparation processes, pricing decisions, staffing, or premises. The Restaurant Partner shall have no authority to bind, represent, or incur any obligation on behalf of the Company.
              </Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner shall remain solely responsible for the quality, quantity, safety, hygiene, packaging, and legality of food items, and for compliance with all “Applicable Laws” (which shall mean all provincial, state, national, central, local, and municipal laws, statutes, ordinances, rules, regulations, guidelines, notifications, policies, and judgements issued by any governmental, statutory, or regulatory authority in India, including the Government of India and the Government of Andhra Pradesh, as amended, updated, or replaced from time to time). This engagement is governed by Applicable Laws regarding contracts, and the Restaurant Partner acknowledges that no exclusivity, employment, or agency relationship is intended or created unless expressly agreed in writing.
              </Text>

              <Text style={styles.sectionTitle}>2. Eligibility & Onboarding</Text>
              <Text style={styles.sectionParagraph}>
                To be eligible to register and operate as a Restaurant Partner on the Company’s platform, the restaurant must be a legally established business entity or sole proprietorship capable of entering into a binding contract under Applicable Laws. The Restaurant Partner must hold and maintain all required licenses, registrations, and approvals necessary to prepare and sell food, including a valid food safety license in accordance with Applicable Laws, as well as any applicable local municipal trade licenses.
              </Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner must provide accurate, complete, and up-to-date information and documentation during the onboarding process, including business details, bank account information for settlements, menu listings, pricing, and operating hours. The Company reserves the right to verify submitted information, conduct inspections or audits where permitted by law, and approve, suspend, or reject any Restaurant Partner application at its sole discretion. Continued access to the platform is subject to ongoing compliance with eligibility requirements, platform policies, and Applicable Laws, and failure to meet such requirements may result in suspension or termination of the Restaurant Partner’s account without prejudice to any other rights or remedies available to the Company under law.
              </Text>

              <Text style={styles.sectionTitle}>3. Food Quality & Compliance</Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner shall be solely responsible for ensuring that all food items listed, prepared, packaged, and supplied through the platform are of merchantable quality, safe for human consumption, hygienically prepared, and compliant with all applicable food safety and health standards under Applicable Laws. The Restaurant Partner agrees to strictly comply with the provisions of all Applicable Laws, abide by the law and shall not do any act which is forbidden by law, and all relevant rules, notifications, and guidelines issued thereunder under the Government of India and by the Government of Andhra Pradesh, including requirements relating to food handling, storage, preparation, packaging, and labeling.
              </Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner shall ensure that all food ingredients used are fresh, permitted under law, and sourced from authorized suppliers, and that food is prepared in clean premises by trained staff following proper hygiene practices. The Restaurant Partner shall promptly address any food quality complaints, safety issues, or regulatory notices and shall fully cooperate with the Company and also with delivery agents and relevant authorities in the event of inspections or investigations. The Company reserves the right to suspend or delist the Restaurant Partner or specific food items from the platform in case of non-compliance, customer complaints, or potential health and safety risks, without prejudice to any other rights or remedies available under Applicable Laws.
              </Text>

              <Text style={styles.sectionTitle}>4. Availability</Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner shall maintain accurate and updated operating hours, service areas, and item availability on the platform and shall ensure that it is operational and capable of fulfilling customer orders during the declared availability periods. The Restaurant Partner agrees to promptly accept, prepare, and hand over orders in accordance with the timelines communicated through the platform and to immediately mark itself as unavailable or update the platform in the event of temporary closure, stock unavailability, technical issues, or any circumstances that may impact order fulfillment.
              </Text>
              <Text style={styles.sectionParagraph}>
                Repeated failure to maintain availability, excessive order cancellations, or delayed order preparation may adversely affect the Restaurant Partner’s performance metrics and may result in temporary suspension or delisting from the platform. The Company reserves the right to modify, restrict, or disable the Restaurant Partner’s availability on the platform in case of operational issues, customer complaints, non-compliance with platform policies, or as required under Applicable Laws, without prejudice to any other rights or remedies available to the Company.
              </Text>

              <Text style={styles.sectionTitle}>5. Orders & Fulfilment</Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner agrees to promptly receive, confirm, prepare, and fulfill customer orders placed through the platform in accordance with the order details, preparation timelines, and quality standards communicated via the platform. Upon acceptance of an order, the Restaurant Partner shall ensure that the food items are prepared accurately, packaged securely, and made ready for pickup within the stipulated time to avoid delays or cancellations. The Restaurant Partner shall not cancel accepted orders except in exceptional circumstances such as force majeure events or genuine unavailability of ingredients, and shall immediately notify the Company through the platform in such cases.
              </Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner shall promptly liaison and coordinate with the delivery agent and shall not delay or hinder the delivery process in any manner. The Restaurant Partner shall cooperate with Delivery Partners for timely handover of orders and ensure proper labeling and order verification at the time of pickup. Repeated order delays, inaccuracies, or cancellations may result in customer complaints, penalties, reduced platform visibility, suspension, or termination of the Restaurant Partner’s access to the platform, without prejudice to the Company’s rights under Applicable Laws.
              </Text>

              <Text style={styles.sectionTitle}>6. Taxes</Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner shall be solely responsible for the determination, collection, reporting, and payment of all applicable taxes, duties, levies, and statutory charges arising from the sale of food and beverages through the platform, including but not limited to Goods and Services Tax (GST), in accordance with Applicable Laws.
              </Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner shall ensure that all prices, tax rates, and tax classifications displayed on the platform are accurate and compliant with Applicable Laws and shall issue valid tax invoices wherever required. The Company acts only as a technology platform and marketplace facilitator and shall not be liable for any tax obligations of the Restaurant Partner, except to the extent expressly required under Applicable Laws. Any tax demands, penalties, interest, or liabilities arising due to incorrect tax treatment, non-compliance, or misreporting by the Restaurant Partner shall be borne solely by the Restaurant Partner, and the Company reserves the right to recover any losses or amounts incurred due to such non-compliance.
              </Text>

              <Text style={styles.sectionTitle}>7. Delivery</Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner agrees to prepare, package, and hand over customer orders in a timely manner to the assigned Delivery Partner or logistics service provider as notified through the platform. The Restaurant Partner shall ensure that all orders are securely packed, properly sealed, and labeled to prevent spillage, contamination, or tampering during transit. The Restaurant Partner shall cooperate with Delivery Partners to facilitate smooth pickup, including order verification and timely handover.
              </Text>
              <Text style={styles.sectionParagraph}>
                While the Company facilitates delivery coordination through the platform, the Restaurant Partner remains responsible for ensuring that the food is fit for delivery at the time of handover. The Company shall not be liable for any due negligence caused by the restaurant, i.e., delays or failures in delivery arising from incorrect order preparation, improper packaging, or delayed handover by the Restaurant Partner.
              </Text>

              <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner acknowledges that all intellectual property rights related to the Company’s platform, including but not limited to software, applications, trademarks, logos, trade names, domain names, designs, content, user interfaces, and proprietary technology, are and shall remain the exclusive property of the Company. Nothing in this agreement shall be construed as transferring or assigning any ownership rights in the Company’s intellectual property to the Restaurant Partner.
              </Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner grants the Company a limited, non-exclusive, royalty-free, revocable license to use the Restaurant Partner’s name, trademarks, logos, menu details, images, and other brand materials solely for the purpose of listing, promoting, marketing, and facilitating orders through the platform. The Restaurant Partner represents and warrants that it owns or has lawful rights to use such materials and that their use by the Company will not infringe any third-party rights.
              </Text>
              <Text style={styles.sectionParagraph}>
                The Restaurant Partner shall not copy, modify, reverse engineer, misuse, or create derivative works from the Company’s platform or intellectual property and shall not use the Company’s trademarks or branding except as expressly permitted in writing. Any unauthorized use or infringement of intellectual property rights may result in immediate suspension or termination of the Restaurant Partner’s access to the platform, without prejudice to the Company’s rights and remedies under all Applicable Laws.
              </Text>

              <Text style={styles.sectionTitle}>9. Litigation and Dispute Resolution</Text>
              <Text style={styles.sectionParagraph}>
                Any dispute arising between the Company (application operator) and the Restaurant Partner shall be resolved through arbitration. An arbitrator shall be appointed with the mutual consent of both the Company and the Restaurant Partner. The arbitration proceedings shall be conducted in accordance with the provisions of Applicable Laws governing arbitration.
              </Text>
              <Text style={styles.sectionParagraph}>
                Notwithstanding the above, both the Company and the Restaurant Partner shall have the right to approach the appropriate civil court for resolution of disputes, where applicable under Applicable Laws.
              </Text>

              <Text style={styles.sectionTitle}>10. Liability</Text>
              <Text style={styles.sectionParagraph}>
                The responsibility for the preparation, cooking, packaging, and all other related aspects of the food rests solely with the restaurant. In the event that a consumer is affected by food poisoning, health-related issues, or any adverse effects arising from the consumption of the food or products provided by the restaurant, the restaurant shall be fully and exclusively liable.
              </Text>
              <Text style={styles.sectionParagraph}>
                The company (application operator) shall not be held responsible for any such incidents or grievances raised by the consumer. All liabilities, including civil damages and any criminal proceedings, shall be borne entirely by the restaurant, in accordance with the compliance standards of all Applicable Laws.
              </Text>
            </ScrollView>
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
    backgroundColor: '#E0D6BC',
    borderRadius: 26,
    paddingVertical: 12,
    paddingHorizontal: 26,
    marginTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 12) + 8 : 12,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  topHeaderText: {
    fontSize: 18,
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

  /* Terms & Conditions Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  termsCard: {
    width: '90%',
    maxWidth: 420,
    height: '80%',
    maxHeight: 650,
    backgroundColor: '#FAF6EC',
    borderRadius: 24,
    padding: 20,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  termsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E6DFD1',
    marginBottom: 12,
  },
  termsHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E1E1D',
  },
  closeButton: {
    padding: 4,
  },
  termsScroll: {
    flex: 1,
  },
  termsScrollContent: {
    paddingBottom: 20,
  },
  termsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E1E1D',
    marginBottom: 4,
  },
  termsSub: {
    fontSize: 13,
    fontWeight: '600',
    color: '#777777',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E1E1D',
    marginTop: 14,
    marginBottom: 6,
  },
  sectionParagraph: {
    fontSize: 13.5,
    color: '#4A4945',
    lineHeight: 20,
    marginBottom: 10,
    textAlign: 'justify',
  },
});
