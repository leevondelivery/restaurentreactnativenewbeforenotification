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

      // Automatically ensure android/local.properties contains sdk.dir
      const localPropsPath = path.join(projectRoot, 'android', 'local.properties');
      const userHome = process.env.USERPROFILE || 'C:\\Users\\saihe';
      const defaultSdkPath = path.join(userHome, 'AppData', 'Local', 'Android', 'Sdk');
      const escapedSdkDir = defaultSdkPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
      try {
        fs.writeFileSync(localPropsPath, `sdk.dir=${escapedSdkDir}\n`, 'utf8');
        console.log('Successfully created android/local.properties with SDK path');
      } catch (e) {}

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

      // Copy small monochrome icon for status bar & device notification icon targets
      const monoSource = path.join(projectRoot, 'assets', 'images', 'android-icon-monochrome.png');
      const logoSource = path.join(projectRoot, 'assets', 'images', 'leevon-logo-padded.png');
      const iconSource = path.join(projectRoot, 'assets', 'images', 'icon.png');
      const bestSmallSource = fs.existsSync(monoSource)
        ? monoSource
        : fs.existsSync(logoSource)
        ? logoSource
        : iconSource;

      if (fs.existsSync(bestSmallSource)) {
        const smallIconTargets = [
          'ic_stat_notification.png',
          'ic_notification.png',
          'notification_icon.png',
          'shell_notification_icon.png',
        ];
        smallIconTargets.forEach((targetName) => {
          try {
            fs.copyFileSync(bestSmallSource, path.join(drawableResDir, targetName));
          } catch (e) {}
        });
        console.log('Successfully copied monochrome notification small icons to drawable directory');
      }

      // Overwrite density-specific drawable & mipmap folders (excluding -v26/anydpi XML directories)
      const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
      if (fs.existsSync(resDir)) {
        // Clean invalid PNGs from mipmap-anydpi-v26 to prevent Android 8+ AAPT2 resource loader failures
        const anydpiDir = path.join(resDir, 'mipmap-anydpi-v26');
        if (fs.existsSync(anydpiDir)) {
          try {
            const files = fs.readdirSync(anydpiDir);
            files.forEach((f) => {
              if (f.endsWith('.png')) {
                fs.unlinkSync(path.join(anydpiDir, f));
              }
            });
          } catch (e) {}
        }

        const resFolders = fs
          .readdirSync(resDir)
          .filter(
            (f) =>
              (f.startsWith('drawable') || f.startsWith('mipmap')) &&
              !f.includes('v26') &&
              !f.includes('anydpi')
          );

        resFolders.forEach((folder) => {
          const folderPath = path.join(resDir, folder);
          if (fs.lstatSync(folderPath).isDirectory()) {
            if (fs.existsSync(bestSmallSource)) {
              const targets = [
                'ic_stat_notification.png',
                'ic_notification.png',
                'notification_icon.png',
                'shell_notification_icon.png',
              ];
              targets.forEach((targetName) => {
                try {
                  fs.copyFileSync(bestSmallSource, path.join(folderPath, targetName));
                } catch (e) {}
              });
            }

            const bestLargeSource = fs.existsSync(logoSource) ? logoSource : iconSource;
            if (fs.existsSync(bestLargeSource)) {
              try {
                fs.copyFileSync(bestLargeSource, path.join(folderPath, 'ic_notification_large.png'));
              } catch (e) {}
            }

            // Sync app launcher icons to mipmap folders using full-color Leevon logo
            if (folder.startsWith('mipmap') && fs.existsSync(logoSource)) {
              try {
                // Delete stale webp icons that may contain old Expo default logo
                ['ic_launcher.webp', 'ic_launcher_background.webp', 'ic_launcher_foreground.webp', 'ic_launcher_round.webp', 'ic_launcher_monochrome.webp'].forEach((w) => {
                  const wPath = path.join(folderPath, w);
                  if (fs.existsSync(wPath)) fs.unlinkSync(wPath);
                });
                // Copy Leevon logo as PNG launcher icons
                ['ic_launcher.png', 'ic_launcher_foreground.png', 'ic_launcher_round.png'].forEach((p) => {
                  fs.copyFileSync(logoSource, path.join(folderPath, p));
                });
                if (fs.existsSync(bestSmallSource)) {
                  fs.copyFileSync(bestSmallSource, path.join(folderPath, 'ic_launcher_monochrome.png'));
                }
              } catch (e) {}
            }
          }
        });
        console.log('Successfully updated density folders with small monochrome icon and Leevon app launcher icons');
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

    const metaItems = [
      {
        name: 'com.google.firebase.messaging.default_notification_channel_id',
        attr: 'android:value',
        val: 'order_incoming_channel_v5',
      },
      {
        name: 'com.google.firebase.messaging.default_notification_sound',
        attr: 'android:value',
        val: 'ordernotification',
      },
      {
        name: 'com.google.firebase.messaging.default_notification_icon',
        attr: 'android:resource',
        val: '@drawable/ic_stat_notification',
      },
      {
        name: 'com.google.firebase.messaging.default_notification_color',
        attr: 'android:resource',
        val: '@color/notification_icon_color',
      },
      {
        name: 'expo.modules.notifications.default_notification_icon',
        attr: 'android:resource',
        val: '@drawable/ic_stat_notification',
      },
      {
        name: 'expo.modules.notifications.default_notification_color',
        attr: 'android:resource',
        val: '@color/notification_icon_color',
      },
    ];

    metaItems.forEach(({ name, attr, val }) => {
      const exists = mainApplication['meta-data'].some((m) => m.$ && m.$['android:name'] === name);
      if (!exists) {
        const item = { $: { 'android:name': name, 'tools:replace': attr } };
        item.$[attr] = val;
        mainApplication['meta-data'].push(item);
      }
    });

    return config;
  });
};
