import { setUser } from '@/store/userSlice';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';

import './navbar.css';

export default function BottomNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useDispatch();
  const reduxUserData = useSelector((state) => state.user.userData);
  const [pillWidth, setPillWidth] = useState(340);

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
    const padding = 12;
    const availableWidth = width - padding * 2;
    const tabWidth = availableWidth / tabs.length;
    const circleWidth = 64;
    return padding + index * tabWidth + tabWidth / 2 - circleWidth / 2;
  };

  const translateX = useRef(
    new Animated.Value(getTargetX(activeIndex, 340))
  ).current;

  // Animate smoothly to active index on route change or pill width change
  useEffect(() => {
    const targetX = getTargetX(activeIndex, pillWidth);
    Animated.timing(translateX, {
      toValue: targetX,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, pillWidth]);

  const isNavigatingRef = useRef(false);

  const handlePress = async (path) => {
    if (pathname === path) return;
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 400);

    // Pre-load userData into Redux before navigating
    // so every page opens with data already available — no flash
    if (!reduxUserData) {
      try {
        const storedUser = await AsyncStorage.getItem('userData');
        if (storedUser) {
          dispatch(setUser(JSON.parse(storedUser)));
        }
      } catch (e) {
        console.warn('Navbar: failed to preload userData into Redux', e);
      }
    }

    router.replace(path);
  };

  const onPillLayout = (event) => {
    const { width } = event.nativeEvent.layout;
    if (width && width !== pillWidth) {
      setPillWidth(width);
      translateX.setValue(getTargetX(activeIndex, width));
    }
  };

  return (
    <View style={styles.navbarContainer} pointerEvents="box-none">
      <View style={styles.navbarPill} onLayout={onPillLayout}>
        {/* Zero-Flicker Bumped Active Circle Overlay — hidden when no tab matches */}
        {activeIndex >= 0 && (
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
          </Animated.View>
        )}

        {/* Tab Touch Targets */}
        {tabs.map((tab) => {
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.navItem}
              onPress={() => handlePress(tab.path)}
              activeOpacity={0.8}
            >
              <View style={styles.navCircleInactive}>
                <Ionicons name={tab.iconName} size={20} color="#000000" />
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
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
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
});
