import Constants from 'expo-constants';
import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { errorMessage } from '@/lib/api';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '@/lib/config';
import { radius, space } from '@/lib/theme';

import { useAuth } from './auth-context';

/**
 * Google Sign-In requires the @react-native-google-signin native module, which is
 * unavailable in plain Expo Go but IS available in dev builds (expo-dev-client),
 * preview, and production builds.
 *
 * expo-constants 58+ reports both Expo Go AND dev-client builds as "storeClient",
 * so we can't use ExecutionEnvironment to distinguish them. Instead we detect plain
 * Expo Go by the presence of Constants.expoGoConfig (only set inside Expo Go).
 */
const isPlainExpoGo = Boolean((Constants as any).expoGoConfig);

export const isGoogleAvailable =
  Boolean(GOOGLE_WEB_CLIENT_ID) &&
  (Platform.OS !== 'ios' || Boolean(GOOGLE_IOS_CLIENT_ID)) &&
  !isPlainExpoGo;

export function GoogleColorIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox='0 0 24 24'>
      <Path
        fill='#4285F4'
        d='M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z'
      />
      <Path
        fill='#34A853'
        d='M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z'
      />
      <Path
        fill='#FBBC05'
        d='M5.28 14.27a7.18 7.18 0 0 1 0-4.54V6.58H1.25a11.97 11.97 0 0 0 0 10.84l4.03-3.15z'
      />
      <Path
        fill='#EA4335'
        d='M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z'
      />
    </Svg>
  );
}

type Props = {
  onError: (message: string) => void;
  referralCode?: string;
};

export function GoogleButton({ onError, referralCode }: Props) {
  const isDark = useColorScheme() === 'dark';
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const buttonBg = isDark ? '#131314' : '#FFFFFF';
  const buttonPressedBg = isDark ? '#202124' : '#F8F9FA';
  const borderColor = isDark ? '#3C4043' : '#DADCE0';
  const textColor = isDark ? '#E8EAED' : '#3C4043';

  const handlePress = async () => {
    setBusy(true);
    onError('');
    try {
      // Loaded on demand because importing it throws where the native module is absent.
      const { GoogleSignin, isSuccessResponse } = await import(
        '@react-native-google-signin/google-signin'
      );
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        scopes: ['openid', 'profile', 'email'],
      });
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      const result = await GoogleSignin.signIn();
      if (!isSuccessResponse(result)) return;

      if (!result.data.idToken) throw new Error('Google did not return an ID token.');
      await signInWithGoogle(result.data.idToken, referralCode);
    } catch (error: any) {
      if (error?.code === 'SIGN_IN_CANCELLED' || error?.code === '12501') {
        return;
      }
      if (error?.code === 'PLAY_SERVICES_NOT_AVAILABLE') {
        onError('Google Play Services is not available or up to date on this device.');
        return;
      }
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel='Continue with Google'
      disabled={busy}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? buttonPressedBg : buttonBg,
          borderColor,
          opacity: busy ? 0.7 : 1,
        },
        !isDark && styles.shadow,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          <GoogleColorIcon size={20} />
          <Text style={[styles.text, { color: textColor }]}>
            Continue with Google
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
