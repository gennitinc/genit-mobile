import { useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Heading, Logo, OtpInput, Screen, TextLink } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { useResendCooldown } from '@/features/auth/use-resend-cooldown';
import { api, errorMessage } from '@/lib/api';
import { space } from '@/lib/theme';

export default function VerifyEmailScreen() {
  const { user, refreshUser, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const resend = useResendCooldown();

  const verify = async (value: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('auth/verify-email', { body: { verificationCode: value } });
      await refreshUser(); // Moves the user on to onboarding.
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  const handleCode = (value: string) => {
    setCode(value);
    if (value.length === 6 && !busy) void verify(value);
  };

  const resendCode = () =>
    resend.run(async () => {
      setError('');
      setNotice('');
      try {
        await api('auth/verify-email', { body: { email: user?.email } });
        setCode('');
        setNotice('A new code is on its way.');
      } catch (caught) {
        setError(errorMessage(caught));
        throw caught;
      }
    });

  return (
    <Screen>
      <View style={{ marginTop: space.xl }}>
        <Logo />
      </View>
      <Heading title='Verify your email' subtitle={`Enter the 6-digit code sent to ${user?.email}.`} />
      <Banner message={error} />
      <Banner tone='success' message={notice} />
      <OtpInput value={code} onChange={handleCode} disabled={busy} />
      <Button title='Verify email' loading={busy} disabled={code.length !== 6} onPress={() => verify(code)} />
      <TextLink title={resend.label} disabled={resend.disabled} onPress={resendCode} />
      <Button title='Use a different account' variant='ghost' onPress={signOut} />
    </Screen>
  );
}
