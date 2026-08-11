import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import notifee from '@notifee/react-native';

export default function BatteryOptimizationModal({ visible: forceVisible, onClose }) {
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    checkBatteryOptimization();

    // Automatically check battery status when user returns to app from Settings
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkBatteryOptimization();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [forceVisible]);

  const checkBatteryOptimization = async () => {
    if (Platform.OS !== 'android') {
      setModalVisible(false);
      return;
    }

    try {
      const isEnabled = await notifee.isBatteryOptimizationEnabled();
      if (isEnabled) {
        setModalVisible(true);
      } else {
        setModalVisible(false);
        if (onClose) onClose();
      }
    } catch (e) {
      console.warn('Error checking battery optimization:', e);
    }
  };

  const handleOpenBatterySettings = async () => {
    try {
      // 1. Primary: Native Android battery optimization settings
      await notifee.openBatteryOptimizationSettings();
    } catch (err1) {
      try {
        // 2. Secondary: Power manager settings for Xiaomi, Samsung, Oppo, Vivo, Realme, etc.
        await notifee.openPowerManagerSettings();
      } catch (err2) {
        try {
          // 3. Fallback: Open general app settings
          await Linking.openSettings();
        } catch (err3) {
          console.error('Failed to open settings:', err3);
        }
      }
    }
  };

  if (!modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent={true}
      animationType="fade"
      hardwareAccelerated={true}
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Top Icon Circle */}
          <View style={styles.iconCircle}>
            <Ionicons name="battery-charging" size={34} color="#FFFFFF" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Enable Unrestricted Battery Usage</Text>

          {/* Subtitle / Instructions */}
          <Text style={styles.subtitle}>
            To ensure incoming order notification alerts ring when your phone is locked or in the background, please set battery usage to <Text style={styles.boldText}>"Unrestricted"</Text>.
          </Text>

          {/* Instructions Box */}
          <View style={styles.stepsBox}>
            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
              <Text style={styles.stepText}>Tap <Text style={styles.boldText}>"Open Battery Settings"</Text> below.</Text>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
              <Text style={styles.stepText}>Select <Text style={styles.boldText}>"Unrestricted"</Text> or <Text style={styles.boldText}>"No restrictions"</Text>.</Text>
            </View>

            <View style={styles.stepRow}>
              <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
              <Text style={styles.stepText}>Return to app and the screen will automatically unlock.</Text>
            </View>
          </View>

          {/* SINGLE ONLY Action Button - Open Settings */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleOpenBatterySettings}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>OPEN BATTERY SETTINGS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 99999,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#F7F7EB',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#E6DFD1',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E35436',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#E35436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  subtitle: {
    fontSize: 14,
    color: '#444444',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  boldText: {
    fontWeight: '700',
    color: '#E35436',
  },
  stepsBox: {
    width: '100%',
    backgroundColor: '#E0D6BC',
    borderRadius: 18,
    padding: 16,
    marginBottom: 22,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#111111',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    fontSize: 13.5,
    color: '#222222',
    flex: 1,
    lineHeight: 18,
  },
  primaryButton: {
    width: '100%',
    height: 52,
    backgroundColor: '#E35436',
    borderRadius: 26,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#E35436',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
