import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { Platform, View, useColorScheme } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from './auth-context';

export function AppleButton({ onError }: { onError: (message: string) => void }) {
  const dark = useColorScheme() === 'dark';
  const { signInWithApple } = useAuth();
  const [busy, setBusy] = useState(false);
  if (Platform.OS !== 'ios') return null;
  const signIn = async () => {
    if (busy) return;
    setBusy(true); onError('');
    try {
      const { nonce } = await api<{ nonce: string }>('auth/apple/challenge', { method: 'POST' });
      const credential = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce });
      if (!credential.identityToken || !credential.authorizationCode) throw new Error('Apple did not return sign-in credentials.');
      await signInWithApple(credential.identityToken, credential.authorizationCode, nonce);
    } catch (error: any) { if (error?.code !== 'ERR_REQUEST_CANCELED') onError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <View pointerEvents={busy ? 'none' : 'auto'} style={{ opacity: busy ? 0.6 : 1 }}>
    <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={12} style={{ width: '100%', height: 52 }} onPress={signIn} />
  </View>;
}
