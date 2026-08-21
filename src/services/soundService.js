import { NativeModules, Platform, AppState } from 'react-native';

const { SoundModule } = NativeModules;
let webAudio = null;
let loopIntervalTimer = null;

// Listen for AppState changes so sound stops instantly if app is closed or sent to background
AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState !== 'active') {
    stopOrderSoundNative();
  }
});

async function playSingleSoundIteration() {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.Audio) {
        if (!webAudio) {
          webAudio = new window.Audio('/ordernotification.wav');
        }
        webAudio.loop = false;
        webAudio.currentTime = 0;
        await webAudio.play();
        console.log('[Web Sound] Played ordernotification.wav (5s loop cycle).');
      }
    } catch (e) {
      console.warn('[Web Sound] Browser playback notice:', e);
    }
    return;
  }

  if (Platform.OS === 'android') {
    try {
      if (SoundModule) {
        await SoundModule.playSound();
        console.log('[Native SoundModule] Played ordernotification.wav (5s loop cycle).');
      } else {
        console.warn('[Native SoundModule] SoundModule is undefined in this build environment.');
      }
    } catch (error) {
      console.error('[Native SoundModule] Failed to play native order sound:', error);
    }
  }
}

export async function playOrderSound() {
  // Play sound immediately on first call
  await playSingleSoundIteration();

  // Start 5-second repeating loop timer if not already running
  if (!loopIntervalTimer) {
    loopIntervalTimer = setInterval(() => {
      playSingleSoundIteration();
    }, 5000);
    console.log('[Sound Loop] Started 5-second repeating order sound interval.');
  }
}

export async function stopOrderSoundNative() {
  // Stop and clear the 5-second repeating timer
  if (loopIntervalTimer) {
    clearInterval(loopIntervalTimer);
    loopIntervalTimer = null;
    console.log('[Sound Loop] Stopped 5-second repeating order sound interval.');
  }

  if (Platform.OS === 'web') {
    if (webAudio) {
      try {
        webAudio.pause();
        webAudio.currentTime = 0;
      } catch (e) {}
    }
    return;
  }

  if (Platform.OS === 'android') {
    try {
      if (SoundModule) {
        await SoundModule.stopSound();
        console.log('[Native SoundModule] Native order sound stopped.');
      }
    } catch (error) {
      console.error('[Native SoundModule] Failed to stop native order sound:', error);
    }
  }
}

export async function isOrderSoundPlaying() {
  if (loopIntervalTimer) return true;
  if (Platform.OS === 'web') {
    return webAudio ? !webAudio.paused : false;
  }
  if (Platform.OS !== 'android' || !SoundModule) return false;
  try {
    return await SoundModule.isPlaying();
  } catch (e) {
    return false;
  }
}
