import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Google Sign-In needs the reversed iOS client ID as a URL scheme, so its config
 * plugin is added only when that client ID is set. Without it the app still runs
 * (including in Expo Go) and simply hides the Google button.
 */
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  ?.replace(/^["']|["']$/g, '')
  .trim();
const googleIosUrlScheme = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Genit',
  slug: 'genit',
  owner: 'templeajuzie',
  extra: {
    ...config.extra,
    eas: {
      ...config.extra?.eas,
      projectId: '834a1781-5a0e-47b8-a350-2874ba9dc4e2',
    },
  },
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'genit',
  userInterfaceStyle: 'automatic',
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: 'com.genit.app',
    supportsTablet: true,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: 'com.genit.app',
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/images/android-icon-foreground.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-apple-authentication',
    'expo-secure-store',
    'expo-video',
    [
      '@config-plugins/react-native-webrtc',
      {
        microphonePermission: 'Genit uses the microphone for WhatsApp calls with your customers.',
        cameraPermission: 'Genit uses the camera for video calls with your customers.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Genit uses your photo library so you can upload your logo, post media and attachments.',
        // Camera and microphone wording comes from the WebRTC plugin above; false here would remove it.
        cameraPermission: 'Genit uses the camera for video calls with your customers.',
        microphonePermission: 'Genit uses the microphone for WhatsApp calls with your customers.',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#000000',
        image: './assets/images/splash-icon.png',
        imageWidth: 100,
      },
    ],
    ...(googleIosUrlScheme
      ? ([
          ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }],
        ] as [string, Record<string, string>][])
      : []),
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
