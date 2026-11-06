import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useState } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '@/lib/config';
import { useColors } from '@/lib/theme';

import { useAuth } from './auth-context';

/** Needs client IDs and a development or store build; Expo Go lacks the native module. */
export const isGoogleAvailable =
  Boolean(GOOGLE_WEB_CLIENT_ID) &&
  (Platform.OS !== 'ios' || Boolean(GOOGLE_IOS_CLIENT_ID)) &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type Props = { onError: (message: string) => void };

export function GoogleButton({ onError }: Props) {
  const colors = useColors();
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

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
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      if (!isSuccessResponse(result)) return;

      if (!result.data.idToken) throw new Error('Google did not return an ID token.');
      await signInWithGoogle(result.data.idToken);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      title='Continue with Google'
      variant='secondary'
      loading={busy}
      onPress={handlePress}
      icon={<Ionicons name='logo-google' size={18} color={colors.text} />}
    />
  );
}
