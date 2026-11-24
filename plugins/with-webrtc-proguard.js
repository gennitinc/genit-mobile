const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Appends R8/ProGuard rules needed by react-native-webrtc so release builds
 * do not fail on missing org.webrtc.Dav1dDecoder$Natives references.
 */
module.exports = function withWebRtcProguardRules(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const proguardPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'proguard-rules.pro'
      );
      const rule = '-dontwarn org.webrtc.Dav1dDecoder$Natives';
      if (fs.existsSync(proguardPath)) {
        const contents = fs.readFileSync(proguardPath, 'utf8');
        if (!contents.includes(rule)) {
          fs.writeFileSync(
            proguardPath,
            `${contents.trimEnd()}\n\n# react-native-webrtc\n${rule}\n`
          );
        }
      }
      return modConfig;
    },
  ]);
};
