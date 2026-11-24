import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useRef, useState } from 'react';
import { Platform, View, useColorScheme } from 'react-native';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from './auth-context';

export function AppleButton({ onError }: { onError: (message: string) => void }) {
  const dark = useColorScheme() === 'dark';
  const { signInWithApple } = useAuth();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    if (Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(value => { if (active) setAvailable(value); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  if (!available) return null;
  const signIn = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); onError('');
    try {
      const { nonce } = await api<{ nonce: string }>('auth/apple/challenge', { method: 'POST' });
      const credential = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL], nonce });
      if (!credential.identityToken || !credential.authorizationCode) throw new Error('Apple did not return sign-in credentials.');
      await signInWithApple(credential.identityToken, credential.authorizationCode, nonce);
    } catch (error: unknown) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED')) onError(errorMessage(error));
    } finally { pending.current = false; setBusy(false); }
  };
  return <View pointerEvents={busy ? 'none' : 'auto'} accessibilityState={{ busy }} style={{ opacity: busy ? 0.6 : 1 }}>
    <AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={12} style={{ width: '100%', height: 52 }} onPress={signIn} />
  </View>;
}
