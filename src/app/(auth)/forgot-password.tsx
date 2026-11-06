import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Banner, Button, Field, Heading, Screen } from '@/components/ui';
import { normalizeEmail } from '@/features/auth/auth-context';
import { emailError } from '@/features/auth/validation';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const invalid = emailError(email);
    setFieldError(invalid);
    setError('');
    if (invalid) return;
    setBusy(true);
    try {
      const normalized = normalizeEmail(email);
      await api('auth/forgot-password', { body: { email: normalized } });
      router.push({ pathname: '/reset-password', params: { email: normalized } });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen underHeader>
      <Heading
        title='Reset your password'
        subtitle="Enter your account's email and we'll send you a 6-digit reset code."
      />
      <Banner message={error} />
      <Field
        label='Email'
        value={email}
        onChangeText={setEmail}
        error={fieldError}
        placeholder='you@company.com'
        keyboardType='email-address'
        autoCapitalize='none'
        autoCorrect={false}
        autoComplete='email'
        returnKeyType='send'
        onSubmitEditing={submit}
      />
      <Button title='Send reset code' loading={busy} onPress={submit} />
    </Screen>
  );
}
