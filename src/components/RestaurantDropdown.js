import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOrders } from '@/context/OrdersContext';
import { playOrderSound, stopOrderSoundNative } from '@/services/soundService';

export default function RestaurantDropdown() {
  const {
    assignedRestaurants,
    currentRestId,
    currentRestaurantName,
    switchRestaurant,
    pendingCountsByRestId,
    hasPendingOtherRestaurantOrders,
    hasMultipleRestaurants,
  } = useOrders();

  const [modalVisible, setModalVisible] = useState(false);
  const [isTestingSound, setIsTestingSound] = useState(false);

  const handleTestSound = async () => {
    if (isTestingSound) {
      await stopOrderSoundNative();
      setIsTestingSound(false);
    } else {
      setIsTestingSound(true);
      await playOrderSound();
      setTimeout(async () => {
        await stopOrderSoundNative();
        setIsTestingSound(false);
      }, 5000);
    }
  };

  // If user only has 1 restaurant, do not show the dropdown selector
  if (!hasMultipleRestaurants) {
    return null;
  }

  const activeName = currentRestaurantName || `Branch #${currentRestId}`;

  const handleSelect = (restId) => {
    setModalVisible(false);
    if (String(restId).trim() !== String(currentRestId).trim()) {
      switchRestaurant(restId);
    }
  };

  return (
    <View style={styles.wrapper}>
      {/* ── Top-Left Trigger Button Pill ── */}
      <TouchableOpacity
        style={styles.triggerButton}
        activeOpacity={0.8}
        onPress={() => setModalVisible(true)}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="storefront" size={14} color="#1E1E1E" />
        </View>

        <Text style={styles.triggerText} numberOfLines={1} ellipsizeMode="tail">
          {activeName}
        </Text>

        <Ionicons name="chevron-down" size={14} color="#555555" style={styles.chevron} />

        {/* ── Glowing Red Dot indicator if any other assigned restaurant has pending incoming orders ── */}
        {hasPendingOtherRestaurantOrders && (
          <View style={styles.redDotBadgeContainer}>
            <View style={styles.redDotPulseRing} />
            <View style={styles.redDotSolid} />
          </View>
        )}
      </TouchableOpacity>

      {/* ── Dropdown Modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View style={styles.headerTitleRow}>
                    <View style={styles.headerIconBox}>
                      <Ionicons name="business" size={18} color="#1E1E1E" />
                    </View>
                    <View>
                      <Text style={styles.modalTitle}>Select Restaurant</Text>
                      <Text style={styles.modalSubtitle}>
                        Switch branch to view & manage orders
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setModalVisible(false)}
                    style={styles.closeBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={20} color="#777777" />
                  </TouchableOpacity>
                </View>

                <View style={styles.divider} />

                {/* List of Assigned Restaurants */}
                <FlatList
                  data={assignedRestaurants}
                  keyExtractor={(item) => String(item.restId)}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isSelected =
                      String(item.restId).trim().toLowerCase() ===
                      String(currentRestId).trim().toLowerCase();
                    const pendingCount = pendingCountsByRestId[item.restId] || 0;
                    const hasPending = pendingCount > 0;

                    return (
                      <TouchableOpacity
                        style={[
                          styles.optionCard,
                          isSelected && styles.optionCardSelected,
                        ]}
                        activeOpacity={0.75}
                        onPress={() => handleSelect(item.restId)}
                      >
                        <View style={styles.optionLeft}>
                          <View
                            style={[
                              styles.optionIconCircle,
                              isSelected && styles.optionIconCircleSelected,
                            ]}
                          >
                            <Ionicons
                              name={isSelected ? 'checkmark' : 'storefront-outline'}
                              size={18}
                              color={isSelected ? '#FFFFFF' : '#444444'}
                            />
                          </View>
                          <View style={styles.optionInfo}>
                            <Text
                              style={[
                                styles.optionName,
                                isSelected && styles.optionNameSelected,
                              ]}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            <Text style={styles.optionIdText}>
                              Branch ID: {item.restId}
                            </Text>
                          </View>
                        </View>

                        {/* Right Indicator: Red Order Badge or Active Tag */}
                        <View style={styles.optionRight}>
                          {hasPending ? (
                            <View style={styles.pendingBadgePill}>
                              <View style={styles.pendingRedDot} />
                              <Text style={styles.pendingBadgeText}>
                                {pendingCount} NEW ORDER{pendingCount > 1 ? 'S' : ''}
                              </Text>
                            </View>
                          ) : isSelected ? (
                            <View style={styles.activePill}>
                              <Text style={styles.activePillText}>ACTIVE</Text>
                            </View>
                          ) : (
                            <Ionicons name="chevron-forward" size={16} color="#B0A898" />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />

                {/* ── Test Alert Sound Button ── */}
                <TouchableOpacity
                  style={[styles.testSoundBtn, isTestingSound && styles.testSoundBtnActive]}
                  onPress={handleTestSound}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isTestingSound ? 'volume-high' : 'volume-medium-outline'}
                    size={16}
                    color={isTestingSound ? '#FFFFFF' : '#1E1E1E'}
                  />
                  <Text style={[styles.testSoundText, isTestingSound && styles.testSoundTextActive]}>
                    {isTestingSound ? 'Playing Alert Sound... (Tap to stop)' : 'Test Ringing Sound'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    zIndex: 100,
  },
  triggerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6DFD0',
    borderRadius: 22,
    paddingVertical: 7,
    paddingLeft: 8,
    paddingRight: 14,
    borderWidth: 1.2,
    borderColor: '#D4CBB8',
    position: 'relative',
    maxWidth: 240,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#D7CEBE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E1E1E',
    letterSpacing: 0.3,
    flexShrink: 1,
    marginRight: 6,
  },
  chevron: {
    marginLeft: 2,
  },

  /* ── Red Dot Badge ── */
  redDotBadgeContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redDotPulseRing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(227, 84, 54, 0.4)',
  },
  redDotSolid: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#E35436',
    borderWidth: 1.2,
    borderColor: '#FFFFFF',
  },

  /* ── Modal Overlay ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#F7F7EB',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E6DFD0',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E6DFD0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E1E1E',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#777777',
    marginTop: 2,
    marginBottom: 12,
  },
  closeBtn: {
    padding: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#E6DFD0',
    marginBottom: 14,
  },
  listContent: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: '#EBE6DC',
  },
  optionCardSelected: {
    borderColor: '#05B686',
    backgroundColor: '#F0FAF6',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  optionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4EFE6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionIconCircleSelected: {
    backgroundColor: '#05B686',
  },
  optionInfo: {
    flex: 1,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E1E1E',
  },
  optionNameSelected: {
    color: '#05B686',
  },
  optionIdText: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  optionRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  activePill: {
    backgroundColor: '#E6F8F2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A0E4CD',
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#05B686',
    letterSpacing: 0.5,
  },
  pendingBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEECE8',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F8B4A6',
  },
  pendingRedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E35436',
    marginRight: 5,
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E35436',
    letterSpacing: 0.5,
  },
  testSoundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: '#F3EFE6',
    borderWidth: 1,
    borderColor: '#DFD8C8',
  },
  testSoundBtnActive: {
    backgroundColor: '#E35436',
    borderColor: '#E35436',
  },
  testSoundText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E1E1E',
  },
  testSoundTextActive: {
    color: '#FFFFFF',
  },
});
