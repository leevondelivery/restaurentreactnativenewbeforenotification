import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  PanResponder,
  Platform,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { updateRestaurantTimings } from '@/services/api';

import CustomLoader from '@/components/CustomLoader';

import './restaurantprofile.css';

export default function RestaurantProfileScreen() {
  const router = useRouter();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal & Time Picker State
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState('success'); // 'success' | 'error'

  const showCustomAlert = (message, type = 'success') => {
    setAlertMessage(message);
    setAlertType(type);
    setAlertVisible(true);
  };

  // Active Tab inside Modal ('opening' | 'closing')
  const [activeTab, setActiveTab] = useState('opening');
  // Active Sub-Tab ('Hours' | 'Minutes')
  const [activeSubTab, setActiveSubTab] = useState('Hours');

  // Opening Time state
  const [openHour, setOpenHour] = useState(10);
  const [openMinute, setOpenMinute] = useState('00');
  const [openAmpm, setOpenAmpm] = useState('AM');

  // Closing Time state
  const [closeHour, setCloseHour] = useState(5);
  const [closeMinute, setCloseMinute] = useState('30');
  const [closeAmpm, setCloseAmpm] = useState('PM');

  // Refs for current state inside PanResponder
  const activeTabRef = useRef(activeTab);
  const activeSubTabRef = useRef(activeSubTab);
  activeTabRef.current = activeTab;
  activeSubTabRef.current = activeSubTab;

  const hourNumbers = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minuteNumbers = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const storedUserStr = await AsyncStorage.getItem('userData');
      if (storedUserStr) {
        const parsed = JSON.parse(storedUserStr);
        setUserData(parsed);
        initTimeStates(parsed.openTime || '10:00', parsed.closeTime || '17:30');
      } else {
        initTimeStates('10:00', '17:30');
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const parseTime = (timeStr, defaultH = 10, defaultM = '00', defaultAmpm = 'AM') => {
    if (!timeStr) return { hour: defaultH, minute: defaultM, ampm: defaultAmpm };
    const clean = timeStr.trim();
    const parts = clean.split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const mInt = parseInt(parts[1], 10);
      const m = isNaN(mInt) ? '00' : mInt < 10 ? `0${mInt}` : `${mInt}`;
      let ampm = 'AM';
      if (isNaN(h)) h = defaultH;
      if (h >= 12) {
        ampm = 'PM';
        if (h > 12) h -= 12;
      } else if (h === 0) {
        h = 12;
      }
      return { hour: h, minute: m, ampm };
    }
    return { hour: defaultH, minute: defaultM, ampm: defaultAmpm };
  };

  const initTimeStates = (openStr, closeStr) => {
    const parsedOpen = parseTime(openStr, 10, '00', 'AM');
    setOpenHour(parsedOpen.hour);
    setOpenMinute(parsedOpen.minute);
    setOpenAmpm(parsedOpen.ampm);

    const parsedClose = parseTime(closeStr, 5, '30', 'PM');
    setCloseHour(parsedClose.hour);
    setCloseMinute(parsedClose.minute);
    setCloseAmpm(parsedClose.ampm);
  };

  const format24h = (h, m, ampm) => {
    let hourNum = h;
    if (ampm === 'PM' && hourNum < 12) hourNum += 12;
    if (ampm === 'AM' && hourNum === 12) hourNum = 0;
    const hStr = hourNum < 10 ? `0${hourNum}` : `${hourNum}`;
    return `${hStr}:${m}`;
  };


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

  const handleOpenModal = () => {
    initTimeStates(userData?.openTime || '10:00', userData?.closeTime || '17:30');
    setActiveTab('opening');
    setActiveSubTab('Hours');
    setModalVisible(true);
  };

  const handleSaveTimings = async () => {
    const formattedOpen = format24h(openHour, openMinute, openAmpm);
    const formattedClose = format24h(closeHour, closeMinute, closeAmpm);

    try {
      setSaving(true);

      const targetRestId =
        userData?.restId ||
        userData?.restaurantId ||
        userData?.restaurant_id ||
        userData?._id ||
        '';
      const targetPhone = userData?.phone || userData?.mobileNumber || '';

      const response = await updateRestaurantTimings({
        userId: userData?._id,
        restId: targetRestId,
        phone: targetPhone,
        openTime: formattedOpen,
        closeTime: formattedClose,
      });

      const data = await response.json();
      console.log('Update timings response:', data);

      const updatedUserData = {
        ...(userData || {}),
        openTime: formattedOpen,
        closeTime: formattedClose,
      };
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));
      setUserData(updatedUserData);
      setModalVisible(false);

      if (response.ok && data.success) {
        showCustomAlert('Restaurant timings updated successfully!', 'success');
      } else {
        showCustomAlert('Restaurant timings updated!', 'success');
      }
    } catch (err) {
      console.error('Error saving timings:', err);
      const updatedUserData = {
        ...(userData || {}),
        openTime: formattedOpen,
        closeTime: formattedClose,
      };
      await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData));
      setUserData(updatedUserData);
      setModalVisible(false);

      showCustomAlert('Restaurant timings updated!', 'success');
    } finally {
      setSaving(false);
    }
  };

  // Clock calculations & getters
  const curHour = activeTab === 'opening' ? openHour : closeHour;
  const curMinute = activeTab === 'opening' ? openMinute : closeMinute;
  const curAmpm = activeTab === 'opening' ? openAmpm : closeAmpm;

  const setCurHour = (h) => {
    if (activeTabRef.current === 'opening') setOpenHour(h);
    else setCloseHour(h);
  };

  const setCurMinute = (m) => {
    if (activeTabRef.current === 'opening') setOpenMinute(m);
    else setCloseMinute(m);
  };

  const setCurAmpm = (a) => {
    if (activeTab === 'opening') setOpenAmpm(a);
    else setCloseAmpm(a);
  };

  // Touch gesture handler for drag & tap on the clock face
  const handleDialTouch = (evt) => {
    const { locationX, locationY } = evt.nativeEvent;
    const dx = locationX - 110;
    const dy = locationY - 110;
    const rad = Math.atan2(dy, dx);
    let deg = (rad * 180) / Math.PI;
    let normalized = (deg + 90 + 360) % 360;
    let idx = Math.round(normalized / 30) % 12;

    if (activeSubTabRef.current === 'Hours') {
      const selectedH = hourNumbers[idx];
      setCurHour(selectedH);
    } else {
      const selectedM = minuteNumbers[idx];
      setCurMinute(selectedM);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => handleDialTouch(evt),
      onPanResponderMove: (evt) => handleDialTouch(evt),
    })
  ).current;

  // Position of selected item for clock hand
  let selectedIndex = 0;
  if (activeSubTab === 'Hours') {
    selectedIndex = hourNumbers.indexOf(curHour);
  } else {
    selectedIndex = minuteNumbers.indexOf(curMinute);
  }
  if (selectedIndex === -1) selectedIndex = 0;

  // Angle calculation for hand
  const angleDeg = selectedIndex * 30 - 90;
  const handRadius = 70;

  const displayName = (userData?.name || 'TALIMPU').toUpperCase();
  const emailVal = userData?.email || 'talimpu@gmail.com';
  const phoneVal = userData?.phone || userData?.mobileNumber || 'Talimpu';
  const addressVal = userData?.address || userData?.restLocation || 'Nandyal Road';
  const fssaiVal = userData?.fssai || '1234567';
  const openTimeVal = userData?.openTime || '10:00';
  const closeTimeVal = userData?.closeTime || '17:30';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Row with Back Button & Center Restaurant Profile Pill */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButtonCircle}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#111111" />
          </TouchableOpacity>

          <View style={styles.topHeaderPill}>
            <Ionicons name="person" size={20} color="#111111" />
            <Text style={styles.topHeaderText}>Restaurant Profile</Text>
          </View>
        </View>

        {loading ? (
          <CustomLoader
            visible={loading}
            title="Loading Profile..."
            subtitle="Fetching restaurant details"
          />
        ) : (
          <>
            {/* Top Outlet Details Card */}
            <View style={styles.outletCard}>
              <View style={styles.outletIconCircle}>
                <Ionicons name="restaurant" size={28} color="#FFFFFF" />
              </View>
              <View style={styles.outletInfoCol}>
                <Text style={styles.outletNameText}>{displayName}</Text>
                <Text style={styles.outletSubtitleText}>Outlet Details</Text>
              </View>
            </View>

            {/* Main Outer Beige Card Container */}
            <View style={styles.detailsOuterCard}>
              {/* Contact Email Pill */}
              <View style={styles.detailPillCard}>
                <View style={styles.detailIconCircle}>
                  <Ionicons name="mail" size={18} color="#111111" />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={styles.detailLabelText}>CONTACT EMAIL</Text>
                  <Text style={styles.detailValueText}>{emailVal}</Text>
                </View>
              </View>

              {/* Phone Number Pill */}
              <View style={styles.detailPillCard}>
                <View style={styles.detailIconCircle}>
                  <Ionicons name="call" size={18} color="#111111" />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={styles.detailLabelText}>PHONE NUMBER</Text>
                  <Text style={styles.detailValueText}>{phoneVal}</Text>
                </View>
              </View>

              {/* Address Pill */}
              <View style={styles.detailPillCard}>
                <View style={styles.detailIconCircle}>
                  <Ionicons name="home" size={18} color="#111111" />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={styles.detailLabelText}>ADDRESS</Text>
                  <Text style={styles.detailValueText}>{addressVal}</Text>
                </View>
              </View>

              {/* FSSAI Number Pill */}
              <View style={styles.detailPillCard}>
                <View style={styles.detailIconCircle}>
                  <Ionicons name="options" size={18} color="#111111" />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={styles.detailLabelText}>FSSAI NUMBER</Text>
                  <Text style={styles.detailValueText}>{fssaiVal}</Text>
                </View>
              </View>

              {/* Opening Time Pill */}
              <View style={styles.detailPillCard}>
                <View style={styles.detailIconCircle}>
                  <Ionicons name="time-outline" size={18} color="#111111" />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={styles.detailLabelText}>OPENING TIME</Text>
                  <Text style={styles.detailValueText}>{openTimeVal}</Text>
                </View>
              </View>

              {/* Closing Time Pill */}
              <View style={styles.detailPillCard}>
                <View style={styles.detailIconCircle}>
                  <Ionicons name="time-outline" size={18} color="#111111" />
                </View>
                <View style={styles.detailTextCol}>
                  <Text style={styles.detailLabelText}>CLOSING TIME</Text>
                  <Text style={styles.detailValueText}>{closeTimeVal}</Text>
                </View>
              </View>

              {/* Edit Timings Action Button */}
              <TouchableOpacity
                style={styles.editTimingsButton}
                onPress={handleOpenModal}
                activeOpacity={0.8}
              >
                <Ionicons name="pencil" size={18} color="#FFFFFF" />
                <Text style={styles.editTimingsText}>Edit Timings</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Custom Styled Alert Modal */}
      <Modal
        visible={alertVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAlertVisible(false)}
      >
        <View style={styles.customAlertOverlay}>
          <View style={styles.customAlertCard}>
            {/* Icon Circle */}
            <View
              style={[
                styles.customAlertIconCircle,
                alertType === 'success'
                  ? styles.customAlertIconSuccess
                  : styles.customAlertIconError,
              ]}
            >
              <Ionicons
                name={alertType === 'success' ? 'checkmark' : 'close'}
                size={34}
                color="#FFFFFF"
              />
            </View>

            {/* Alert Message */}
            <Text style={styles.customAlertMessage}>{alertMessage}</Text>

            {/* OK Button */}
            <TouchableOpacity
              style={styles.customAlertButton}
              onPress={() => setAlertVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.customAlertButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Interactive Analog Clock Edit Timings Modal Popup */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.clockModalCard}>
            {/* Modal Close Icon */}
            <TouchableOpacity
              style={styles.clockModalCloseBtn}
              onPress={() => setModalVisible(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color="#666666" />
            </TouchableOpacity>

            {/* Top Clock Icon Circle */}
            <View style={styles.modalClockCircle}>
              <Ionicons name="time-outline" size={24} color="#FFFFFF" />
            </View>

            {/* Modal Heading & Subtitle */}
            <Text style={styles.clockModalTitle}>Edit Timings</Text>
            <Text style={styles.clockModalSubtitle}>
              Select opening and closing times using the scroll selectors
            </Text>

            {/* Top Tab Switcher: Opening vs Closing */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'opening' && styles.tabButtonActive]}
                onPress={() => setActiveTab('opening')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'opening' && styles.tabTextActive]}>
                  Opening ({format24h(openHour, openMinute, openAmpm)})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'closing' && styles.tabButtonActive]}
                onPress={() => setActiveTab('closing')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'closing' && styles.tabTextActive]}>
                  Closing ({format24h(closeHour, closeMinute, closeAmpm)})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Digital Display Box: [ 10 ] : [ 00 ] */}
            <View style={styles.digitalDisplayBox}>
              <TouchableOpacity
                style={[styles.digitalBoxItem, activeSubTab === 'Hours' && styles.digitalBoxActive]}
                onPress={() => setActiveSubTab('Hours')}
                activeOpacity={0.8}
              >
                <Text style={[styles.digitalNumText, activeSubTab === 'Hours' && styles.digitalNumActive]}>
                  {curHour < 10 ? `0${curHour}` : curHour}
                </Text>
              </TouchableOpacity>

              <Text style={styles.digitalColon}>:</Text>

              <TouchableOpacity
                style={[styles.digitalBoxItem, activeSubTab === 'Minutes' && styles.digitalBoxActive]}
                onPress={() => setActiveSubTab('Minutes')}
                activeOpacity={0.8}
              >
                <Text style={[styles.digitalNumText, activeSubTab === 'Minutes' && styles.digitalNumActive]}>
                  {curMinute}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sub-Selectors Row: [ Hours | Minutes ] and [ AM | PM ] */}
            <View style={styles.subSelectorsRow}>
              {/* Hours / Minutes Toggle */}
              <View style={styles.subToggleContainer}>
                <TouchableOpacity
                  style={[styles.subToggleBtn, activeSubTab === 'Hours' && styles.subToggleBtnActive]}
                  onPress={() => setActiveSubTab('Hours')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subToggleText, activeSubTab === 'Hours' && styles.subToggleTextActive]}>
                    Hours
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.subToggleBtn, activeSubTab === 'Minutes' && styles.subToggleBtnActive]}
                  onPress={() => setActiveSubTab('Minutes')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.subToggleText, activeSubTab === 'Minutes' && styles.subToggleTextActive]}>
                    Minutes
                  </Text>
                </TouchableOpacity>
              </View>

              {/* AM / PM Toggle */}
              <View style={styles.ampmToggleContainer}>
                <TouchableOpacity
                  style={[styles.ampmBtn, curAmpm === 'AM' && styles.ampmBtnActive]}
                  onPress={() => setCurAmpm('AM')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.ampmText, curAmpm === 'AM' && styles.ampmTextActive]}>
                    AM
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.ampmBtn, curAmpm === 'PM' && styles.ampmBtnActive]}
                  onPress={() => setCurAmpm('PM')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.ampmText, curAmpm === 'PM' && styles.ampmTextActive]}>
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Interactive Analog Clock Face with PanResponder Touch Drag & Tap */}
            <View style={styles.clockDialContainer} {...panResponder.panHandlers}>
              {/* Center Dot */}
              <View style={styles.clockCenterDot} pointerEvents="none" />

              {/* Clock Hand Line */}
              <View
                style={[
                  styles.clockHandLine,
                  {
                    left: 110,
                    top: 110,
                    width: handRadius,
                    transform: [{ rotate: `${angleDeg}deg` }],
                  },
                ]}
                pointerEvents="none"
              />

              {/* Numbers on the dial (12 positions) */}
              {(activeSubTab === 'Hours' ? hourNumbers : minuteNumbers).map((val, idx) => {
                const angle = (idx * 30 - 90) * (Math.PI / 180);
                const r = 74;
                const itemX = 110 + r * Math.cos(angle) - 18;
                const itemY = 110 + r * Math.sin(angle) - 18;
                const isSelected = activeSubTab === 'Hours' ? curHour === val : curMinute === val;

                return (
                  <View
                    key={idx}
                    style={[
                      styles.clockNumberItem,
                      { left: itemX, top: itemY },
                      isSelected && styles.clockNumberSelected,
                    ]}
                    pointerEvents="none"
                  >
                    <Text style={[styles.clockNumberText, isSelected && styles.clockNumberTextSelected]}>
                      {val}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Save Changes Action Button */}
            <TouchableOpacity
              style={styles.saveChangesButton}
              onPress={handleSaveTimings}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveChangesText}>Save Changes</Text>
              )}
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
  outletCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  outletIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  outletInfoCol: {
    flex: 1,
  },
  outletNameText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  outletSubtitleText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999999',
  },
  detailsOuterCard: {
    backgroundColor: '#E8E2D0',
    borderRadius: 24,
    padding: 16,
    gap: 12,
  },
  detailPillCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F5F0E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  detailTextCol: {
    flex: 1,
  },
  detailLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999999',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  detailValueText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  editTimingsButton: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  editTimingsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Clock Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  clockModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#F7F4EC',
    borderRadius: 32,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  clockModalCloseBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalClockCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  clockModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  clockModalSubtitle: {
    fontSize: 13,
    color: '#777777',
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 12,
    lineHeight: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECE6D6',
    borderRadius: 20,
    padding: 4,
    marginBottom: 16,
    width: '100%',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#777777',
  },
  tabTextActive: {
    color: '#111111',
    fontWeight: '700',
  },
  digitalDisplayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFEAD8',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  digitalBoxItem: {
    width: 64,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitalBoxActive: {
    backgroundColor: '#1E1E1E',
    borderWidth: 2,
    borderColor: '#2E7D32',
  },
  digitalNumText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  digitalNumActive: {
    color: '#2E7D32',
  },
  digitalColon: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111111',
  },
  subSelectorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  subToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECE6D6',
    borderRadius: 16,
    padding: 3,
  },
  subToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  subToggleBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  subToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#777777',
  },
  subToggleTextActive: {
    color: '#2E7D32',
    fontWeight: '700',
  },
  ampmToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECE6D6',
    borderRadius: 16,
    padding: 3,
  },
  ampmBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  ampmBtnActive: {
    backgroundColor: '#2E7D32',
  },
  ampmText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#777777',
  },
  ampmTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  clockDialContainer: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#F3EFE0',
    borderWidth: 1,
    borderColor: '#E2DABF',
    position: 'relative',
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockCenterDot: {
    position: 'absolute',
    left: 106,
    top: 106,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
    zIndex: 5,
  },
  clockHandLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#2E7D32',
    transformOrigin: 'left center',
    zIndex: 4,
  },
  clockNumberItem: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },
  clockNumberSelected: {
    backgroundColor: '#2E7D32',
  },
  clockNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#444444',
  },
  clockNumberTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  saveChangesButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  saveChangesText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Custom Alert Modal Styles */
  customAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  customAlertCard: {
    width: '85%',
    maxWidth: 310,
    backgroundColor: '#F7F7EB',
    borderRadius: 28,
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  customAlertIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  customAlertIconSuccess: {
    backgroundColor: '#2E7D32',
    shadowColor: '#2E7D32',
  },
  customAlertIconError: {
    backgroundColor: '#F85353',
    shadowColor: '#F85353',
  },
  customAlertMessage: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  customAlertButton: {
    backgroundColor: '#000000',
    borderRadius: 24,
    height: 48,
    width: '85%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customAlertButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
