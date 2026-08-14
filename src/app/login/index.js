import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useDispatch } from 'react-redux';
import { setUser, clearUser } from '@/store/userSlice';
import { loginUser } from '@/services/api';
import { initFCMToken } from '@/services/NotificationService';
import messaging from '@react-native-firebase/messaging';

import CustomLoader from '@/components/CustomLoader';
import './login.css';

export default function LoginScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Custom Alert Modal State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('Please fill in all fields');
  const [alertButtonText, setAlertButtonText] = useState('Try Again');

  const showAlert = (message, buttonText = 'Try Again') => {
    setAlertMessage(message);
    setAlertButtonText(buttonText);
    setAlertVisible(true);
  };

  // Check if user is already logged in whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      checkLoggedInUser();
    }, [])
  );

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  const checkLoggedInUser = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('userData');
      const lastActiveStr = await AsyncStorage.getItem('lastActiveTimestamp');

      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        const now = Date.now();
        const lastActive = Number(lastActiveStr || 0);

        // 1. Check if session has exceeded 30 days of inactivity
        if (lastActive > 0 && now - lastActive > THIRTY_DAYS_MS) {
          console.log('[Auth] Session expired (over 30 days inactive). Logging out user...');
          await AsyncStorage.multiRemove([
            'userData',
            'userToken',
            'restId',
            'restaurantInfo',
            'lastActiveTimestamp',
            'isLoggedIn',
          ]);
          dispatch(clearUser());
          setIsCheckingAuth(false);
          return; // Remain on login screen
        }

        // 2. Session is valid — slide/extend 30-day window from today!
        if (parsed && (parsed.restId || parsed.restaurantId || parsed.email || parsed._id || parsed.phone)) {
          await AsyncStorage.setItem('lastActiveTimestamp', now.toString());
          dispatch(setUser(parsed));
          initFCMToken(parsed);

          let targetRoute = '/home';
          if (Platform.OS !== 'web') {
            try {
              const notifeeModule = require('@notifee/react-native').default;
              const initialNotifee = await notifeeModule.getInitialNotification();
              const initialFCM = await messaging().getInitialNotification();
              if (initialNotifee || initialFCM) {
                console.log('[Auth Navigation] App opened from notification -> routing directly to /notifications');
                targetRoute = '/notifications';
              }
            } catch (e) {
              console.warn('[Auth Navigation] Error checking initial notification:', e);
            }
          }

          router.replace(targetRoute);
          return;
        } else {
          await AsyncStorage.multiRemove(['userData', 'userToken', 'restId', 'lastActiveTimestamp']);
          dispatch(clearUser());
          setIsCheckingAuth(false);
        }
      } else {
        dispatch(clearUser());
        setIsCheckingAuth(false);
      }
    } catch (err) {
      console.error('Error checking stored user session:', err);
      dispatch(clearUser());
      setIsCheckingAuth(false);
    }
  };


  const handleLogin = async () => {
    if (!email.trim() && !password.trim()) {
      showAlert('Please enter your email and password to log in');
      return;
    }
    if (!email.trim()) {
      showAlert('Please enter your email address');
      return;
    }
    if (!password.trim()) {
      showAlert('Please enter your password');
      return;
    }

    setIsLoading(true);

    try {
      let currentFcmToken = '';
      try {
        currentFcmToken = (await messaging().getToken()) || '';
      } catch (e) {}

      const response = await loginUser(email.trim(), password.trim(), currentFcmToken);
      const data = await response.json();

      if (response.ok && data.success) {
        // Save user fields and session to AsyncStorage
        const effectiveRestId = String(
          data.user?.restId ||
          data.user?.restaurantId ||
          data.user?.restaurant_id ||
          data.user?._id ||
          data.user?.id ||
          ''
        ).trim();

        const userObj = {
          _id: data.user?._id || data.user?.id || '',
          name: data.user?.name || '',
          email: data.user?.email || email.trim(),
          phone: data.user?.phone || data.user?.mobileNumber || '',
          restId: effectiveRestId,
          restLocation: data.user?.restLocation || '',
          address: data.user?.address || '',
          fssai: data.user?.fssai || '',
          openTime: data.user?.openTime || '',
          closeTime: data.user?.closeTime || '',
          restaurantLocation: data.user?.restaurantLocation || '',
          commission: data.user?.commission || 0,
        };

        await AsyncStorage.setItem('userData', JSON.stringify(userObj));
        await AsyncStorage.setItem('lastActiveTimestamp', Date.now().toString());
        await AsyncStorage.removeItem('battery_prompt_dismissed');
        if (effectiveRestId) {
          await AsyncStorage.setItem('restId', effectiveRestId);
        }
        if (data.token) {
          await AsyncStorage.setItem('userToken', data.token);
        }

        // Dispatch to Redux — makes userData instantly available everywhere
        dispatch(setUser(userObj));

        // Initialize FCM & Send device token to backend
        await initFCMToken(userObj);

        setIsLoading(false);
        router.replace('/home');
      } else {
        setIsLoading(false);
        showAlert(data.message || 'Email and password is incorrect');
      }
    } catch (error) {
      setIsLoading(false);
      console.error('Login request error:', error);
      if (error.name === 'AbortError') {
        showAlert('Server request timed out. Please check your connection and try again.');
      } else {
        showAlert('Unable to connect to backend server. Please check your network connection.');
      }
    }
  };

  if (isCheckingAuth) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />
        <CustomLoader
          visible={true}
          title="Loading..."
          subtitle="Please wait"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7EB" />

      {/* Dual-Tone Background Split */}
      <View style={styles.backgroundSplit}>
        <View style={styles.leftBackground} />
        <View style={styles.rightBackground} />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Center Floating Card with Logo & Brand Name */}
            <View style={styles.cardContainer}>
              <Image
                source={require('@/assets/images/leevon-logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={styles.brandTitle}>Leevon Delivery</Text>
            </View>

            {/* Input Form Section */}
            <View style={styles.formContainer}>
              {/* Email Input */}
              <View style={styles.inputPill}>
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color="#9E9E9E"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#A5A5A5"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password Input */}
              <View style={styles.inputPill}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#DE5335"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, styles.passwordInputText]}
                  placeholder="Password"
                  placeholderTextColor="#DE5335"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={20}
                    color="#DE5335"
                  />
                </TouchableOpacity>
              </View>

              {/* Login Button */}
              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleLogin}
                activeOpacity={0.8}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <Text style={styles.loginButtonText}>Login</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Custom Golden Brand Loader */}
      <CustomLoader
        visible={isLoading}
        title="Logging in..."
        subtitle="Verifying your credentials"
      />

      {/* Red Circle Pop-Up Alert Modal */}
      {alertVisible && (
        <View style={styles.modalOverlay} pointerEvents="auto">
          <View style={styles.modalCard}>
            {/* Red Circle with White Cross */}
            <View style={styles.alertIconCircle}>
              <Ionicons name="close" size={34} color="#FFFFFF" />
            </View>

            {/* Alert Message */}
            <Text style={styles.alertMessageText}>{alertMessage}</Text>

            {/* Try Again Button */}
            <TouchableOpacity
              style={styles.alertButton}
              onPress={() => setAlertVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.alertButtonText}>{alertButtonText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7EB',
  },
  backgroundSplit: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  leftBackground: {
    width: '50%',
    height: '100%',
    backgroundColor: '#F7F7EB',
  },
  rightBackground: {
    width: '50%',
    height: '100%',
    backgroundColor: '#E0D6BC',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  cardContainer: {
    width: '77%',
    maxWidth: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingVertical: 27,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 28,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 13,
    elevation: 5,
  },
  logoImage: {
    width: 105,
    height: 96,
    marginBottom: 10,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  formContainer: {
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    gap: 18,
  },
  inputPill: {
    width: '100%',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 19,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 9,
    elevation: 4,
  },
  inputIcon: {
    marginRight: 11,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333333',
    height: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none', outlineWidth: 0 } : {}),
  },
  passwordInputText: {
    color: '#DE5335',
  },
  eyeIcon: {
    padding: 4,
  },
  loginButton: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    height: 49,
    paddingHorizontal: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    elevation: 4,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    zIndex: 999999,
    elevation: 999999,
  },
  modalCard: {
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
  alertIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F85353',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#F85353',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  alertMessageText: {
    fontSize: 19,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 26,
  },
  alertButton: {
    backgroundColor: '#000000',
    borderRadius: 24,
    height: 48,
    width: '85%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
