import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { Text } from 'react-native';

import { Banner, Button, Divider, Field, Heading, PasswordField, Screen, type TextInputRef, TextLink } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { GoogleButton, isGoogleAvailable } from '@/features/auth/google-button';
import { emailError, MIN_PASSWORD_LENGTH, passwordError } from '@/features/auth/validation';
import { errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/config';
import { useColors } from '@/lib/theme';

export default function SignUpScreen() {
  const colors = useColors();
  const { signUp } = useAuth();
  // Referral links carry the creator's handle, e.g. genit://sign-up?creator=@name
  const { creator } = useLocalSearchParams<{ creator?: string }>();
  const passwordInput = useRef<TextInputRef>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const invalid = { email: emailError(email), password: passwordError(password) };
    setErrors(invalid);
    setError('');
    if (invalid.email || invalid.password) return;
    setBusy(true);
    try {
      await signUp({ email, password, referralCode: creator?.replace(/^@/, '') });
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  const openLegal = (path: string) => WebBrowser.openBrowserAsync(`${WEB_URL}/legal/${path}`);

  return (
    <Screen underHeader>
      <Heading title='Create your account' subtitle='Start building your brand with Genit.' />
      <Banner message={error} />
      {isGoogleAvailable ? (
        <>
          <GoogleButton onError={setError} referralCode={creator?.replace(/^@/, '')} />
          <Divider label='or' />
        </>
      ) : null}
      <Field
        label='Email'
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        placeholder='you@company.com'
        keyboardType='email-address'
        autoCapitalize='none'
        autoCorrect={false}
        autoComplete='email'
        textContentType='username'
        returnKeyType='next'
        onSubmitEditing={() => passwordInput.current?.focus()}
        submitBehavior='submit'
      />
      <PasswordField
        ref={passwordInput}
        label='Password'
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        autoComplete='new-password'
        textContentType='newPassword'
        returnKeyType='go'
        onSubmitEditing={submit}
      />
      <Button title='Create account' loading={busy} onPress={submit} />
      <Text style={{ fontSize: 13, lineHeight: 19, textAlign: 'center', color: colors.textMuted }}>
        By continuing you agree to our{' '}
        <Text style={{ color: colors.primary }} onPress={() => openLegal('terms-of-service')}>
          Terms of Service
        </Text>{' '}
        and{' '}
        <Text style={{ color: colors.primary }} onPress={() => openLegal('privacy-policy')}>
          Privacy Policy
        </Text>
        .
      </Text>
      <TextLink
        prefix='Already have an account?'
        title='Sign in'
        onPress={() => router.replace('/sign-in')}
      />
    </Screen>
  );
}
