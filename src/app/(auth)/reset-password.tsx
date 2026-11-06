import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';

import { Banner, Button, Heading, OtpInput, PasswordField, Screen, type TextInputRef, TextLink } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, passwordError } from '@/features/auth/validation';
import { useResendCooldown } from '@/features/auth/use-resend-cooldown';
import { api, errorMessage } from '@/lib/api';

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const confirmInput = useRef<TextInputRef>(null);
  const [step, setStep] = useState<'code' | 'password'>('code');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const resend = useResendCooldown();

  const verifyCode = async (value: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('auth/verifypasswordresetoken', { body: { token: value } });
      setStep('password');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleCode = (value: string) => {
    setCode(value);
    if (value.length === 6 && !busy) void verifyCode(value);
  };

  const resendCode = () =>
    resend.run(async () => {
      setError('');
      setNotice('');
      try {
        await api('auth/forgot-password', { body: { email } });
        setCode('');
        setNotice('A new reset code is on its way.');
      } catch (caught) {
        setError(errorMessage(caught));
        throw caught;
      }
    });

  const updatePassword = async () => {
    const invalid = {
      password: passwordError(password),
      confirm: password === confirm ? undefined : 'Passwords do not match',
    };
    setErrors(invalid);
    setError('');
    if (invalid.password || invalid.confirm) return;
    setBusy(true);
    try {
      await api('auth/updatepassword', { body: { token: code, newPassword: password } });
      router.dismissAll();
      router.replace({
        pathname: '/sign-in',
        params: { notice: 'Password updated. Sign in with your new password.' },
      });
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  if (step === 'code') {
    return (
      <Screen underHeader>
        <Heading
          title='Check your email'
          subtitle={`Enter the 6-digit code sent to ${email}. It expires in 10 minutes.`}
        />
        <Banner message={error} />
        <Banner tone='success' message={notice} />
        <OtpInput value={code} onChange={handleCode} disabled={busy} />
        <Button
          title='Verify code'
          loading={busy}
          disabled={code.length !== 6}
          onPress={() => verifyCode(code)}
        />
        <TextLink title={resend.label} disabled={resend.disabled} onPress={resendCode} />
      </Screen>
    );
  }

  return (
    <Screen underHeader>
      <Heading title='Choose a new password' subtitle={`Use at least ${MIN_PASSWORD_LENGTH} characters.`} />
      <Banner message={error} />
      <PasswordField
        label='New password'
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        autoComplete='new-password'
        textContentType='newPassword'
        returnKeyType='next'
        onSubmitEditing={() => confirmInput.current?.focus()}
        submitBehavior='submit'
      />
      <PasswordField
        ref={confirmInput}
        label='Confirm password'
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        placeholder='Repeat your new password'
        autoComplete='new-password'
        textContentType='newPassword'
        returnKeyType='go'
        onSubmitEditing={updatePassword}
      />
      <Button title='Update password' loading={busy} onPress={updatePassword} />
    </Screen>
  );
}
