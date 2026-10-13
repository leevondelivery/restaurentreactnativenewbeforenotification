import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Central API configuration.
 * All network requests use BASE_URL as the back
 * end origin.
 */

// Local backend configuration:
// D:\rest for multiple login\restuarentbackendbeforenotification\server.js
const LOCAL_IP = '10.179.200.192';
const PORT = '5000';

// Production Railway URL (keep for easy switching):
// export const BASE_URL = 'https://restuarentbackendbeforenotification-production.up.railway.app';

const getBaseUrl = () => {
  // If running in web browser or Electron
  if (Platform.OS === 'web') {
    return `http://localhost:${PORT}`;
  }

  // If running via Expo Go / dev client, resolve computer's host IP dynamically
  const hostUri = Constants.expoConfig?.hostUri || Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip) {
      return `http://${ip}:${PORT}`;
    }
  }

  // Fallback for physical devices / emulators
  return `http://${LOCAL_IP}:${PORT}`;
};

export const BASE_URL = getBaseUrl();

