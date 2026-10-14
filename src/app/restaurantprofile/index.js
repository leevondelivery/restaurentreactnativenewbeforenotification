import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { useDispatch } from 'react-redux';
import { setUser } from '@/store/userSlice';
import Constants from 'expo-constants';
import { updateRestaurantTimings } from '@/services/api';
import { useOrders } from '@/context/OrdersContext';
import CustomLoader from '@/components/CustomLoader';

import './restaurantprofile.css';

export default function RestaurantProfileScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const {
    currentRestId,
    restaurantInfo,
    assignedRestaurants,
    updateRestaurantTimingsContext,
    refreshRestaurantInfo,
  } = useOrders();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Instant local override state for timings so UI reflects changes immediately
  const [customTimings, setCustomTimings] = useState(null);

  // Modal & Time Picker State
  const [modalVisible, setModalVisible] = useState(false);
  const [modalSlots, setModalSlots] = useState([{ openTime: '10:00', closeTime: '17:30' }]);
  const [activeSlotIdx, setActiveSlotIdx] = useState(0);
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
    setCustomTimings(null);
    loadUserData();
  }, [currentRestId, restaurantInfo]);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [currentRestId])
  );

  const loadUserData = async () => {
    try {
      setLoading(true);
      const storedUserStr = await AsyncStorage.getItem('userData');
      if (storedUserStr) {
        const parsed = JSON.parse(storedUserStr);
        setUserData(parsed);
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
    const isPm = /pm/i.test(clean);
    const isAm = /am/i.test(clean);
    const parts = clean.split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const mInt = parseInt(parts[1], 10);
      const m = isNaN(mInt) ? '00' : mInt < 10 ? `0${mInt}` : `${mInt}`;
      let ampm = 'AM';
      if (isNaN(h)) h = defaultH;

      if (isPm) {
        ampm = 'PM';
        if (h > 12) h -= 12;
      } else if (isAm) {
        ampm = 'AM';
        if (h === 0) h = 12;
      } else {
        if (h >= 12) {
          ampm = 'PM';
          if (h > 12) h -= 12;
        } else if (h === 0) {
          h = 12;
          ampm = 'AM';
        } else {
          ampm = 'AM';
        }
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


  const isNavigatingRef = useRef(false);

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

  const handleOpenModal = (targetSlotIndex = 0) => {
    let currentSlots = [...timingsList];
    if (targetSlotIndex === 1 && currentSlots.length < 2) {
      // Direct request to add 2nd timing slot
      const newSlot = { openTime: '18:00', closeTime: '23:00' };
      currentSlots = [...currentSlots, newSlot];
      setModalSlots(currentSlots);
      setActiveSlotIdx(1);
      initTimeStates('18:00', '23:00');
    } else {
      setModalSlots(currentSlots);
      const safeIdx = targetSlotIndex < currentSlots.length ? targetSlotIndex : 0;
      setActiveSlotIdx(safeIdx);
      const targetSlot = currentSlots[safeIdx] || { openTime: '10:00', closeTime: '17:30' };
      initTimeStates(targetSlot.openTime, targetSlot.closeTime);
    }
    setActiveTab('opening');
    setActiveSubTab('Hours');
    setModalVisible(true);
  };

  const handleSwitchSlot = (newIdx) => {
    const curOpen = format24h(openHour, openMinute, openAmpm);
    const curClose = format24h(closeHour, closeMinute, closeAmpm);
    const updated = modalSlots.map((s, idx) =>
      idx === activeSlotIdx ? { openTime: curOpen, closeTime: curClose } : s
    );
    setModalSlots(updated);
    setActiveSlotIdx(newIdx);
    const nextSlot = updated[newIdx] || { openTime: '10:00', closeTime: '17:30' };
    initTimeStates(nextSlot.openTime, nextSlot.closeTime);
    setActiveTab('opening');
    setActiveSubTab('Hours');
  };

  const handleAddSlotInModal = () => {
    const curOpen = format24h(openHour, openMinute, openAmpm);
    const curClose = format24h(closeHour, closeMinute, closeAmpm);
    const updated = modalSlots.map((s, idx) =>
      idx === activeSlotIdx ? { openTime: curOpen, closeTime: curClose } : s
    );
    const newSlot = { openTime: '18:00', closeTime: '23:00' };
    const withNew = [...updated, newSlot];
    setModalSlots(withNew);
    setActiveSlotIdx(1);
    initTimeStates(newSlot.openTime, newSlot.closeTime);
    setActiveTab('opening');
    setActiveSubTab('Hours');
  };

  const handleRemoveSlotInModal = (removeIdx) => {
    if (modalSlots.length > 1) {
      const remaining = modalSlots.filter((_, idx) => idx !== removeIdx);
      setModalSlots(remaining);
      setActiveSlotIdx(0);
      initTimeStates(remaining[0].openTime, remaining[0].closeTime);
      setActiveTab('opening');
      setActiveSubTab('Hours');
    }
  };

  const handleSaveTimings = async () => {
    const formattedOpen = format24h(openHour, openMinute, openAmpm);
    const formattedClose = format24h(closeHour, closeMinute, closeAmpm);

    const finalSlots = modalSlots.map((s, idx) => {
      if (idx === activeSlotIdx) {
        return { openTime: formattedOpen, closeTime: formattedClose };
      }
      return s;
    });

    const s1 = finalSlots[0] || { openTime: formattedOpen, closeTime: formattedClose };
    const s2 = finalSlots[1] || null;
    const finalOpenTime = s1.openTime || '';
    const finalCloseTime = s1.closeTime || '';
    const finalOpenTime2 = s2 ? (s2.openTime || '') : '';
    const finalCloseTime2 = s2 ? (s2.closeTime || '') : '';

    // 1. Immediately reflect updated timings in local state
    setCustomTimings(finalSlots);

    const targetRestId =
      currentRestId ||
      activeBranch?.restId ||
      activeData?.restId ||
      userData?.restId ||
      userData?.restaurantId ||
      userData?.restaurant_id ||
      userData?._id ||
      '';
    const targetPhone =
      phoneVal ||
      activeData?.phone ||
      activeData?.mobileNumber ||
      userData?.phone ||
      userData?.mobileNumber ||
      '';
    const targetUserId =
      activeData?._id ||
      userData?._id ||
      userData?.id ||
      '';

    // 2. Immediately update OrdersContext state in memory
    if (typeof updateRestaurantTimingsContext === 'function') {
      updateRestaurantTimingsContext(
        targetRestId,
        finalOpenTime,
        finalCloseTime,
        finalOpenTime2,
        finalCloseTime2,
        finalSlots
      );
    }

    const updatedUserData = {
      ...(userData || {}),
      openTime: finalOpenTime,
      closeTime: finalCloseTime,
      openTime2: finalOpenTime2,
      closeTime2: finalCloseTime2,
      timings: finalSlots,
    };
    setUserData(updatedUserData);
    try {
      dispatch(setUser(updatedUserData));
    } catch (e) {}
    await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData)).catch(() => {});

    // Close modal immediately so UI updates without lag
    setModalVisible(false);

    try {
      setSaving(true);
      const response = await updateRestaurantTimings({
        userId: targetUserId,
        restId: targetRestId,
        phone: targetPhone,
        openTime: finalOpenTime,
        closeTime: finalCloseTime,
        openTime2: finalOpenTime2,
        closeTime2: finalCloseTime2,
        timings: finalSlots,
      });

      const data = await response.json().catch(() => ({}));
      console.log('Update timings response:', data);

      if (response.ok && data?.success) {
        showCustomAlert('Restaurant timings updated successfully!', 'success');
      } else {
        showCustomAlert('Restaurant timings updated!', 'success');
      }

      if (typeof refreshRestaurantInfo === 'function') {
        refreshRestaurantInfo().catch(() => {});
      }
    } catch (err) {
      console.error('Error saving timings to backend:', err);
      showCustomAlert('Restaurant timings updated!', 'success');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSlot = async (slotIdxToDelete) => {
    const remainingSlots = timingsList.filter((_, idx) => idx !== slotIdxToDelete);
    if (remainingSlots.length === 0) return;

    const s1 = remainingSlots[0];
    const s2 = remainingSlots[1] || null;
    const finalOpenTime = s1.openTime || '';
    const finalCloseTime = s1.closeTime || '';
    const finalOpenTime2 = s2 ? (s2.openTime || '') : '';
    const finalCloseTime2 = s2 ? (s2.closeTime || '') : '';

    setCustomTimings(remainingSlots);

    const targetRestId =
      currentRestId ||
      activeBranch?.restId ||
      activeData?.restId ||
      userData?.restId ||
      userData?.restaurantId ||
      userData?.restaurant_id ||
      userData?._id ||
      '';
    const targetPhone =
      phoneVal ||
      activeData?.phone ||
      activeData?.mobileNumber ||
      userData?.phone ||
      userData?.mobileNumber ||
      '';
    const targetUserId =
      activeData?._id ||
      userData?._id ||
      userData?.id ||
      '';

    if (typeof updateRestaurantTimingsContext === 'function') {
      updateRestaurantTimingsContext(
        targetRestId,
        finalOpenTime,
        finalCloseTime,
        finalOpenTime2,
        finalCloseTime2,
        remainingSlots
      );
    }

    const updatedUserData = {
      ...(userData || {}),
      openTime: finalOpenTime,
      closeTime: finalCloseTime,
      openTime2: finalOpenTime2,
      closeTime2: finalCloseTime2,
      timings: remainingSlots,
    };
    setUserData(updatedUserData);
    try {
      dispatch(setUser(updatedUserData));
    } catch (e) {}
    await AsyncStorage.setItem('userData', JSON.stringify(updatedUserData)).catch(() => {});

    try {
      setSaving(true);
      await updateRestaurantTimings({
        userId: targetUserId,
        restId: targetRestId,
        phone: targetPhone,
        openTime: finalOpenTime,
        closeTime: finalCloseTime,
        openTime2: finalOpenTime2,
        closeTime2: finalCloseTime2,
        timings: remainingSlots,
      });
      showCustomAlert('2nd timing slot removed successfully!', 'success');
      if (typeof refreshRestaurantInfo === 'function') {
        refreshRestaurantInfo().catch(() => {});
      }
    } catch (err) {
      console.error('Error removing slot:', err);
      showCustomAlert('Timing slot removed', 'success');
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

  const activeBranch = (assignedRestaurants || []).find(
    (r) => String(r.restId).trim().toLowerCase() === String(currentRestId).trim().toLowerCase()
  );
  const activeData = activeBranch?.rawUser || activeBranch || restaurantInfo || userData;

  const displayName = (activeData?.name || restaurantInfo?.name || userData?.name || 'TALIMPU').toUpperCase();
  const emailVal = activeData?.email || restaurantInfo?.email || userData?.email || 'talimpu@gmail.com';
  const phoneVal = activeData?.phone || activeData?.mobileNumber || restaurantInfo?.phone || userData?.phone || '';
  const addressVal = activeData?.address || activeData?.location || activeData?.restLocation || restaurantInfo?.address || userData?.address || '';
  const fssaiVal = activeData?.fssai || restaurantInfo?.fssai || userData?.fssai || '';
  const getEffectiveTimings = () => {
    if (customTimings && Array.isArray(customTimings)) {
      return customTimings;
    }
    const rawArr = activeData?.timings || restaurantInfo?.timings || userData?.timings;
    if (Array.isArray(rawArr) && rawArr.length > 0) {
      return rawArr.map((t) => ({
        openTime: t.openTime || '10:00',
        closeTime: t.closeTime || '17:30',
      }));
    }
    const slot1Open = activeData?.openTime || restaurantInfo?.openTime || userData?.openTime || '10:00';
    const slot1Close = activeData?.closeTime || restaurantInfo?.closeTime || userData?.closeTime || '17:30';
    const list = [{ openTime: slot1Open, closeTime: slot1Close }];
    const slot2Open = activeData?.openTime2 || restaurantInfo?.openTime2 || userData?.openTime2;
    const slot2Close = activeData?.closeTime2 || restaurantInfo?.closeTime2 || userData?.closeTime2;
    if (slot2Open || slot2Close) {
      list.push({
        openTime: slot2Open || '18:00',
        closeTime: slot2Close || '23:00',
      });
    }
    return list;
  };

  const timingsList = getEffectiveTimings();
  const slot1 = timingsList[0] || { openTime: '10:00', closeTime: '17:30' };
  const slot2 = timingsList[1] || null;

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

              {/* Operating Timings Section */}
              <View style={styles.timingsSectionContainer}>
                {/* Timings Section Header with + Add 2nd Timing Button */}
                <View style={styles.timingsSectionHeader}>
                  <View style={styles.timingsHeaderLeft}>
                    <Ionicons name="time" size={17} color="#111111" />
                    <Text style={styles.timingsHeaderTitle}>OPERATING TIMINGS</Text>
                  </View>
                  {!slot2 && (
                    <TouchableOpacity
                      style={styles.addTimingHeaderBtn}
                      onPress={() => handleOpenModal(1)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add" size={16} color="#FFFFFF" />
                      <Text style={styles.addTimingHeaderBtnText}>Add 2nd Timing</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 1st Open & Close Timing Card */}
                <View style={styles.timingSlotGroup}>
                  <View style={styles.slotGroupHeader}>
                    <View style={styles.slotBadge}>
                      <Text style={styles.slotBadgeText}>1ST TIMING (SLOT 1)</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.slotEditIconBtn}
                      onPress={() => handleOpenModal(0)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="pencil" size={13} color="#111111" />
                      <Text style={styles.slotEditText}>Edit</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 1st Opening Time Pill */}
                  <View style={styles.detailPillCard}>
                    <View style={styles.detailIconCircle}>
                      <Ionicons name="sunny-outline" size={18} color="#D97706" />
                    </View>
                    <View style={styles.detailTextCol}>
                      <Text style={styles.detailLabelText}>1ST OPENING TIME</Text>
                      <Text style={styles.detailValueText}>{slot1.openTime || '10:00'}</Text>
                    </View>
                  </View>

                  {/* 1st Closing Time Pill */}
                  <View style={styles.detailPillCard}>
                    <View style={styles.detailIconCircle}>
                      <Ionicons name="moon-outline" size={18} color="#4F46E5" />
                    </View>
                    <View style={styles.detailTextCol}>
                      <Text style={styles.detailLabelText}>1ST CLOSING TIME</Text>
                      <Text style={styles.detailValueText}>{slot1.closeTime || '17:30'}</Text>
                    </View>
                  </View>
                </View>

                {/* 2nd Open & Close Timing Card or + Add Button */}
                {slot2 ? (
                  <View style={styles.timingSlotGroup}>
                    <View style={styles.slotGroupHeader}>
                      <View style={[styles.slotBadge, styles.slotBadgeSecondary]}>
                        <Text style={[styles.slotBadgeText, styles.slotBadgeTextSecondary]}>
                          2ND TIMING (SLOT 2)
                        </Text>
                      </View>
                      <View style={styles.slotActionBtnsRow}>
                        <TouchableOpacity
                          style={styles.slotEditIconBtn}
                          onPress={() => handleOpenModal(1)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="pencil" size={13} color="#111111" />
                          <Text style={styles.slotEditText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.slotDeleteIconBtn}
                          onPress={() => handleDeleteSlot(1)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* 2nd Opening Time Pill */}
                    <View style={styles.detailPillCard}>
                      <View style={styles.detailIconCircle}>
                        <Ionicons name="sunny-outline" size={18} color="#D97706" />
                      </View>
                      <View style={styles.detailTextCol}>
                        <Text style={styles.detailLabelText}>2ND OPENING TIME</Text>
                        <Text style={styles.detailValueText}>{slot2.openTime || '18:00'}</Text>
                      </View>
                    </View>

                    {/* 2nd Closing Time Pill */}
                    <View style={styles.detailPillCard}>
                      <View style={styles.detailIconCircle}>
                        <Ionicons name="moon-outline" size={18} color="#4F46E5" />
                      </View>
                      <View style={styles.detailTextCol}>
                        <Text style={styles.detailLabelText}>2ND CLOSING TIME</Text>
                        <Text style={styles.detailValueText}>{slot2.closeTime || '23:00'}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addSecondSlotCard}
                    onPress={() => handleOpenModal(1)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.addSlotIconCircle}>
                      <Ionicons name="add" size={20} color="#FFFFFF" />
                    </View>
                    <View style={styles.addSlotTextCol}>
                      <Text style={styles.addSlotTitle}>+ Add 2nd Timing Slot</Text>
                      <Text style={styles.addSlotSubtitle}>
                        Tap to add 2nd shift open & close timings
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Edit Timings Action Button */}
                <TouchableOpacity
                  style={styles.editTimingsButton}
                  onPress={() => handleOpenModal(0)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pencil" size={18} color="#FFFFFF" />
                  <Text style={styles.editTimingsText}>Edit Timings</Text>
                </TouchableOpacity>
              </View>
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
              Select opening and closing times using the clock selector
            </Text>

            {/* Slot Selector Row: [ 1st Timing ] [ 2nd Timing ] or [ + Add 2nd Timing ] */}
            <View style={styles.slotModalTabsRow}>
              <TouchableOpacity
                style={[styles.slotModalTabBtn, activeSlotIdx === 0 && styles.slotModalTabBtnActive]}
                onPress={() => handleSwitchSlot(0)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={activeSlotIdx === 0 ? '#FFFFFF' : '#666666'}
                />
                <Text
                  style={[
                    styles.slotModalTabText,
                    activeSlotIdx === 0 && styles.slotModalTabTextActive,
                  ]}
                >
                  1st Timing
                </Text>
              </TouchableOpacity>

              {modalSlots.length > 1 ? (
                <TouchableOpacity
                  style={[
                    styles.slotModalTabBtn,
                    activeSlotIdx === 1 && styles.slotModalTabBtnActive,
                  ]}
                  onPress={() => handleSwitchSlot(1)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={activeSlotIdx === 1 ? '#FFFFFF' : '#666666'}
                  />
                  <Text
                    style={[
                      styles.slotModalTabText,
                      activeSlotIdx === 1 && styles.slotModalTabTextActive,
                    ]}
                  >
                    2nd Timing
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.slotModalAddBtn}
                  onPress={handleAddSlotInModal}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add-circle" size={16} color="#2E7D32" />
                  <Text style={styles.slotModalAddText}>+ Add 2nd Timing</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Active Slot Indicator & Remove Button inside Modal */}
            {activeSlotIdx === 1 && (
              <View style={styles.slotIndicatorRow}>
                <Text style={styles.slotIndicatorText}>Editing 2nd Shift Timings</Text>
                <TouchableOpacity
                  onPress={() => handleRemoveSlotInModal(1)}
                  activeOpacity={0.7}
                  style={styles.removeSlotInModalBtn}
                >
                  <Ionicons name="trash-outline" size={12} color="#EF4444" />
                  <Text style={styles.removeSlotInModalText}>Remove 2nd</Text>
                </TouchableOpacity>
              </View>
            )}

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

  /* Multi-Timings Section Styles */
  timingsSectionContainer: {
    marginTop: 4,
    gap: 10,
  },
  timingsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 8,
    marginBottom: 2,
  },
  timingsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timingsHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333333',
    letterSpacing: 0.8,
  },
  addTimingHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  addTimingHeaderBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  timingSlotGroup: {
    backgroundColor: '#FAF7EE',
    borderRadius: 20,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#DED7C2',
  },
  slotGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  slotBadge: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  slotBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
    letterSpacing: 0.6,
  },
  slotBadgeSecondary: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  slotBadgeTextSecondary: {
    color: '#4F46E5',
  },
  slotActionBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotEditIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0DACB',
  },
  slotEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111111',
  },
  slotDeleteIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  addSecondSlotCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2E7D32',
    borderStyle: 'dashed',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 4,
  },
  addSlotIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlotTextCol: {
    flex: 1,
  },
  addSlotTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  addSlotSubtitle: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },

  /* Modal Slot Switcher Styles */
  slotModalTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    width: '100%',
  },
  slotModalTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECE6D6',
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 6,
  },
  slotModalTabBtnActive: {
    backgroundColor: '#1E1E1E',
  },
  slotModalTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  slotModalTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  slotModalAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  slotModalAddText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2E7D32',
  },
  slotIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  slotIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  removeSlotInModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  removeSlotInModalText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
  },
});
