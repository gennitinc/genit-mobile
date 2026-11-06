import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Google Sign-In needs the reversed iOS client ID as a URL scheme, so its config
 * plugin is added only when that client ID is set. Without it the app still runs
 * (including in Expo Go) and simply hides the Google button.
 */
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleIosUrlScheme = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace('.apps.googleusercontent.com', '')}`
  : undefined;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Genit',
  slug: 'genit',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'genit',
  userInterfaceStyle: 'automatic',
  platforms: ['ios', 'android'],
  ios: {
    bundleIdentifier: 'com.trygenit.app',
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: 'com.trygenit.app',
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/images/android-icon-foreground.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission: 'Genit uses your photo library so you can upload your brand logo.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#000000',
        image: './assets/images/splash-icon.png',
        imageWidth: 200,
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
