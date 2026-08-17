const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to:
 * 1. Inject default FCM channel ID, custom sound metadata with tools:replace="android:value", and full-screen permissions into AndroidManifest.xml
 * 2. Automatically copy assets/ordernotification.wav into android/app/src/main/res/raw/ordernotification.wav during build
 */
module.exports = function withAndroidNotificationManifest(config) {
  // 1. Copy raw sound asset & notification icons into android/app/src/main/res/ during build
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const rawResDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'raw');
      const drawableResDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'drawable');

      if (!fs.existsSync(rawResDir)) {
        fs.mkdirSync(rawResDir, { recursive: true });
      }
      if (!fs.existsSync(drawableResDir)) {
        fs.mkdirSync(drawableResDir, { recursive: true });
      }

      // Copy sound
      const soundSource = path.join(projectRoot, 'assets', 'ordernotification.wav');
      if (fs.existsSync(soundSource)) {
        fs.copyFileSync(soundSource, path.join(rawResDir, 'ordernotification.wav'));
        console.log('Successfully copied ordernotification.wav');
      }

      // Copy golden L logo for notification icon
      const logoSource = path.join(projectRoot, 'assets', 'images', 'leevon-logo.png');
      if (fs.existsSync(logoSource)) {
        fs.copyFileSync(logoSource, path.join(drawableResDir, 'ic_notification_large.png'));
        fs.copyFileSync(logoSource, path.join(drawableResDir, 'ic_stat_notification.png'));
        console.log('Successfully copied golden L logo notification icons');
      }

      // Copy google-services.json to android/app/google-services.json
      const gsSource = path.join(projectRoot, 'google-services.json');
      const gsTarget = path.join(projectRoot, 'android', 'app', 'google-services.json');
      if (fs.existsSync(gsSource)) {
        fs.copyFileSync(gsSource, gsTarget);
      }
      return config;
    },
  ]);

  // 2. Inject permissions & meta-data into AndroidManifest.xml
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    if (!androidManifest.manifest['uses-permission']) {
      androidManifest.manifest['uses-permission'] = [];
    }

    const permissionsToAdd = [
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.VIBRATE',
      'android.permission.WAKE_LOCK',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.POST_NOTIFICATIONS',
    ];

    permissionsToAdd.forEach((permName) => {
      const exists = androidManifest.manifest['uses-permission'].some(
        (p) => p.$ && p.$['android:name'] === permName
      );
      if (!exists) {
        androidManifest.manifest['uses-permission'].push({
          $: { 'android:name': permName },
        });
      }
    });

    const mainApplication = androidManifest.manifest.application[0];
    mainApplication.$['android:allowBackup'] = 'false';
    mainApplication.$['tools:replace'] = mainApplication.$['tools:replace']
      ? `${mainApplication.$['tools:replace']},android:allowBackup`
      : 'android:allowBackup';
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    const channelMetaExists = mainApplication['meta-data'].some(
      (m) => m.$ && m.$['android:name'] === 'com.google.firebase.messaging.default_notification_channel_id'
    );
    if (!channelMetaExists) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.google.firebase.messaging.default_notification_channel_id',
          'android:value': 'order_incoming_channel_v3',
          'tools:replace': 'android:value',
        },
      });
    }

    const soundMetaExists = mainApplication['meta-data'].some(
      (m) => m.$ && m.$['android:name'] === 'com.google.firebase.messaging.default_notification_sound'
    );
    if (!soundMetaExists) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.google.firebase.messaging.default_notification_sound',
          'android:value': 'ordernotification',
          'tools:replace': 'android:value',
        },
      });
    }

    const iconMetaExists = mainApplication['meta-data'].some(
      (m) => m.$ && m.$['android:name'] === 'com.google.firebase.messaging.default_notification_icon'
    );
    if (!iconMetaExists) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.google.firebase.messaging.default_notification_icon',
          'android:resource': '@drawable/ic_stat_notification',
          'tools:replace': 'android:resource',
        },
      });
    }

    return config;
  });
};
