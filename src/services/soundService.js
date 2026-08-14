import { NativeModules, Platform, AppState } from 'react-native';

const { SoundModule } = NativeModules;

// Listen for AppState changes so sound stops instantly if app is closed or sent to background
AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState !== 'active') {
    stopOrderSoundNative();
  }
});

export async function playOrderSound() {
  if (Platform.OS !== 'android') return;
  try {
    if (SoundModule) {
      await SoundModule.playSound();
      console.log('[Native SoundModule] Playing ordernotification.wav loop in foreground.');
    }
  } catch (error) {
    console.error('[Native SoundModule] Failed to play native order sound:', error);
  }
}

export async function stopOrderSoundNative() {
  if (Platform.OS !== 'android') return;
  try {
    if (SoundModule) {
      await SoundModule.stopSound();
      console.log('[Native SoundModule] Native order sound stopped.');
    }
  } catch (error) {
    console.error('[Native SoundModule] Failed to stop native order sound:', error);
  }
}

export async function isOrderSoundPlaying() {
  if (Platform.OS !== 'android' || !SoundModule) return false;
  try {
    return await SoundModule.isPlaying();
  } catch (e) {
    return false;
  }
}
