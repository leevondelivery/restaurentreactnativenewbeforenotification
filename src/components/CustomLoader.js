import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  Animated,
  Easing,
  Modal,
  Platform,
} from 'react-native';

export default function CustomLoader({
  visible = true,
  title = 'Loading...',
  subtitle = 'Please wait',
  overlay = true,
  timeoutMs = 6000,
}) {
  const spinValue = useRef(new Animated.Value(0)).current;
  const [autoDismissed, setAutoDismissed] = useState(false);

  useEffect(() => {
    if (visible) {
      setAutoDismissed(false);
      spinValue.setValue(0);
      const animation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== 'web',
        })
      );
      animation.start();

      // Absolute safety timeout: never stay stuck for more than timeoutMs (default 6000ms)
      const timer = setTimeout(() => {
        setAutoDismissed(true);
      }, timeoutMs);

      return () => {
        animation.stop();
        clearTimeout(timer);
      };
    } else {
      setAutoDismissed(false);
    }
  }, [visible, timeoutMs]);

  if (!visible || autoDismissed) return null;

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const loaderContent = (
    <View style={styles.loaderContentContainer}>
      {/* Outer Spinner Container */}
      <View style={styles.ringWrapper}>
        {/* Static Light Track Ring */}
        <View style={styles.trackRing} />

        {/* SINGLE Rotating Golden Spinner Segment */}
        <Animated.View
          style={[
            styles.goldenSpinner,
            { transform: [{ rotate: spin }] },
          ]}
        />

        {/* Static Inner Black Circle Emblem with Golden Logo */}
        <View style={styles.blackCircleEmblem}>
          <Image
            source={require('@/assets/images/leevon-logo.png')}
            style={styles.logoIcon}
            resizeMode="contain"
          />
        </View>
      </View>

      {/* Loading Title & Subtitle */}
      {title ? <Text style={styles.titleText}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitleText}>{subtitle}</Text> : null}
    </View>
  );

  if (overlay) {
    if (Platform.OS === 'web') {
      return (
        <View
          style={[
            styles.overlayContainer,
            StyleSheet.absoluteFillObject,
            { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999999 },
          ]}
          pointerEvents="auto"
        >
          {loaderContent}
        </View>
      );
    }

    return (
      <Modal transparent animationType="fade" visible={true} onRequestClose={() => {}}>
        <View style={styles.overlayContainer} pointerEvents="auto">
          {loaderContent}
        </View>
      </Modal>
    );
  }

  return loaderContent;
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: '#F7F7EB',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 999999,
    elevation: 999999,
  },
  loaderContentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrapper: {
    width: 88,
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#EFE8D8',
  },
  goldenSpinner: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: '#C5A059',
    borderRightColor: '#C5A059',
  },
  blackCircleEmblem: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  logoIcon: {
    width: 36,
    height: 36,
  },
  titleText: {
    fontSize: 21,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 18,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subtitleText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666666',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
});
