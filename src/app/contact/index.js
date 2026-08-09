import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import './contact.css';

export default function ContactUsScreen() {
  const router = useRouter();

  const handlePhoneCall = () => {
    Linking.openURL('tel:+917207610235');
  };

  const handleWhatsApp = () => {
    Linking.openURL('https://wa.me/917207610235');
  };

  const handleEmail = () => {
    Linking.openURL('mailto:support@leevondelivery.in');
  };

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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Row with Back Button & Center Contact Us Pill */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButtonCircle}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={20} color="#111111" />
          </TouchableOpacity>

          <View style={styles.topHeaderPill}>
            <Ionicons name="mail" size={20} color="#111111" />
            <Text style={styles.topHeaderText}>Contact Us</Text>
          </View>
        </View>

        {/* Tan Menu Container Card with 3 Contact Items */}
        <View style={styles.menuBoxContainer}>
          {/* Card 1: Phone Call */}
          <TouchableOpacity
            style={styles.contactRowCard}
            onPress={handlePhoneCall}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrapper}>
              <Ionicons name="call" size={22} color="#111111" />
            </View>
            <Text style={styles.contactRowText}>+91 7207610235</Text>
          </TouchableOpacity>

          {/* Card 2: WhatsApp */}
          <TouchableOpacity
            style={styles.contactRowCard}
            onPress={handleWhatsApp}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrapper}>
              <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
            </View>
            <Text style={styles.contactRowText}>WhatsApp</Text>
          </TouchableOpacity>

          {/* Card 3: Email */}
          <TouchableOpacity
            style={styles.contactRowCard}
            onPress={handleEmail}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrapper}>
              <Ionicons name="mail" size={22} color="#111111" />
            </View>
            <Text style={styles.contactRowText}>support@leevondelivery.in</Text>
          </TouchableOpacity>
        </View>
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
    position: 'relative',
    marginTop: 8,
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
  menuBoxContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#E0D6BC',
    borderRadius: 32,
    padding: 16,
    gap: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  contactRowCard: {
    width: '100%',
    height: 64,
    backgroundColor: '#F7F7EB',
    borderRadius: 32,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrapper: {
    width: 28,
    alignItems: 'center',
    marginRight: 14,
  },
  contactRowText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111111',
  },
});
