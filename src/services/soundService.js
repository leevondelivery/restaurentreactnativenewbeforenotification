import { NativeModules, Platform, AppState } from 'react-native';

const { SoundModule } = NativeModules;
let webAudio = null;
let loopIntervalTimer = null;
let isAudioUnlocked = false;
let pendingPlayRequest = false;

// Web Audio API Synthesizer fallback in case wav file is buffering or blocked
function playSynthesizedChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  } catch (_) {}
}

// Automatic Web Browser Autoplay Unlocker
if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
  const unlockAudio = async () => {
    isAudioUnlocked = true;
    try {
      if (!webAudio && window.Audio) {
        webAudio = new window.Audio('/ordernotification.wav');
        webAudio.preload = 'auto';
      }
      if (webAudio && webAudio.paused && !loopIntervalTimer && !pendingPlayRequest) {
        webAudio.muted = true;
        const p = webAudio.play();
        if (p !== undefined) {
          await p;
          webAudio.pause();
          webAudio.currentTime = 0;
          webAudio.muted = false;
        }
      }
    } catch (_) {}

    if (pendingPlayRequest || loopIntervalTimer) {
      pendingPlayRequest = false;
      playSingleSoundIteration();
    }
  };

  document.addEventListener('click', unlockAudio, { passive: true });
  document.addEventListener('touchstart', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio, { passive: true });
}

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
          webAudio.preload = 'auto';
        }
        webAudio.volume = 1.0;
        webAudio.loop = true;
        if (webAudio.paused) {
          webAudio.currentTime = 0;
          const p = webAudio.play();
          if (p !== undefined) {
            await p;
          }
          console.log('[Web Sound] Continuously playing ordernotification.wav');
        }
      }
    } catch (e) {
      console.warn('[Web Sound] Autoplay blocked, queuing until user click:', e?.message || e);
      pendingPlayRequest = true;
      playSynthesizedChime();
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
    pendingPlayRequest = false;
    if (webAudio) {
      try {
        webAudio.loop = false;
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
