import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setUser } from '@/store/userSlice';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  Platform,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useOrders } from '@/context/OrdersContext';

import './navbar.css';

export default function BottomNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();
  const reduxUserData = useSelector((state) => state.user.userData);
  const [pillWidth, setPillWidth] = useState(340);

  const getDynamicBottom = () => {
    if (Platform.OS === 'android') {
      return insets.bottom > 0 ? insets.bottom + 14 : 28;
    }
    return Math.max(16, insets.bottom + 8);
  };

  const tabs = [
    {
      id: 'home',
      path: '/home',
      iconName: 'home',
      activeIcon: 'home',
    },
    {
      id: 'notifications',
      path: '/notifications',
      iconName: 'notifications',
      activeIcon: 'notifications',
    },
    {
      id: 'tracker',
      path: '/tracker',
      iconName: 'documents',
      activeIcon: 'documents',
    },
    {
      id: 'settings',
      path: '/settings',
      iconName: 'settings',
      activeIcon: 'settings',
    },
  ];

  const getActiveIndex = () => {
    const idx = tabs.findIndex((t) => t.path === pathname);
    return idx; // returns -1 if no tab matches — no active highlight
  };

  const activeIndex = getActiveIndex();

  // Calculate target X position for active circle
  const getTargetX = (index, width) => {
    if (index < 0) return 0;
    const padding = 12;
    const availableWidth = width - padding * 2;
    const tabWidth = availableWidth / tabs.length;
    const circleWidth = 64;
    return padding + index * tabWidth + tabWidth / 2 - circleWidth / 2;
  };

  const translateX = useRef(
    new Animated.Value(getTargetX(activeIndex >= 0 ? activeIndex : 0, 340))
  ).current;

  // Ultra-smooth native 60fps spring animation on route change or resize
  useEffect(() => {
    if (activeIndex >= 0) {
      const targetX = getTargetX(activeIndex, pillWidth);
      Animated.spring(translateX, {
        toValue: targetX,
        damping: 20,
        stiffness: 250,
        mass: 0.7,
        useNativeDriver: true,
      }).start();
    }
  }, [activeIndex, pillWidth]);

  const isNavigatingRef = useRef(false);

  const handlePress = (path) => {
    if (pathname === path) return;
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 250);

    // Pre-load user data into Redux asynchronously without blocking navigation
    if (!reduxUserData) {
      AsyncStorage.getItem('userData')
        .then((storedUser) => {
          if (storedUser) {
            dispatch(setUser(JSON.parse(storedUser)));
          }
        })
        .catch(() => {});
    }

    router.replace(path);
  };

  const onPillLayout = (event) => {
    const { width } = event.nativeEvent.layout;
    if (width && width !== pillWidth) {
      setPillWidth(width);
      if (activeIndex >= 0) {
        translateX.setValue(getTargetX(activeIndex, width));
      }
    }
  };

  const { incomingOrders, acceptedOrders, orders: globalOrders } = useOrders();
  const incomingCount = Array.isArray(incomingOrders) ? incomingOrders.length : 0;
  const trackerList = Array.isArray(acceptedOrders) ? acceptedOrders : Array.isArray(globalOrders) ? globalOrders : [];
  const trackerCount = trackerList.length;

  return (
    <View
      style={[
        styles.navbarContainer,
        { bottom: getDynamicBottom() },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.navbarPill} onLayout={onPillLayout}>
        {/* Active Circle Overlay with Smooth Native Spring Gliding */}
        {activeIndex >= 0 && (() => {
          const activeTabId = tabs[activeIndex]?.id;
          let activeBadgeCount = 0;
          if (activeTabId === 'notifications') activeBadgeCount = incomingCount;
          if (activeTabId === 'tracker') activeBadgeCount = trackerCount;

          return (
            <Animated.View
              style={[
                styles.slidingActiveCircle,
                {
                  transform: [{ translateX }, { translateY: -12 }],
                },
              ]}
            >
              <Ionicons
                name={tabs[activeIndex]?.activeIcon || 'home'}
                size={24}
                color="#000000"
              />
              {activeBadgeCount > 0 && (
                <View style={styles.badgeCircleActive}>
                  <Text style={styles.badgeText}>{activeBadgeCount > 99 ? '99+' : activeBadgeCount}</Text>
                </View>
              )}
            </Animated.View>
          );
        })()}

        {/* Tab Touch Targets */}
        {tabs.map((tab, index) => {
          let badgeCount = 0;
          if (tab.id === 'notifications') badgeCount = incomingCount;
          if (tab.id === 'tracker') badgeCount = trackerCount;

          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.navItem}
              onPress={() => handlePress(tab.path)}
              activeOpacity={0.7}
            >
              <View style={styles.navCircleInactive}>
                <Ionicons name={tab.iconName} size={20} color="#000000" />
                {badgeCount > 0 && (
                  <View style={styles.badgeCircle}>
                    <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navbarContainer: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  navbarPill: {
    width: '90%',
    maxWidth: 380,
    height: 68,
    backgroundColor: '#E0D6BC',
    borderRadius: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  slidingActiveCircle: {
    position: 'absolute',
    top: 3,
    left: 0,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#F7F7EB',
    zIndex: 10,
  },
  navItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  navCircleInactive: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badgeCircle: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#E54B3C',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 20,
  },
  badgeCircleActive: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#E54B3C',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 25,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
});

