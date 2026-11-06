import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Divider, Field, Heading, PasswordField, Screen, type TextInputRef, TextLink } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { GoogleButton, isGoogleAvailable } from '@/features/auth/google-button';
import { emailError } from '@/features/auth/validation';
import { errorMessage } from '@/lib/api';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const passwordInput = useRef<TextInputRef>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const invalid = emailError(email);
    setFieldError(invalid);
    setError('');
    if (invalid) return;
    if (!password) {
      setError('Enter your password');
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <Screen underHeader>
      <Heading title='Welcome back' subtitle='Sign in to your Genit account.' />
      {!error ? <Banner tone='success' message={notice} /> : null}
      <Banner message={error} />
      {isGoogleAvailable ? (
        <>
          <GoogleButton onError={setError} />
          <Divider label='or' />
        </>
      ) : null}
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
        placeholder='Your password'
        autoComplete='current-password'
        textContentType='password'
        returnKeyType='go'
        onSubmitEditing={submit}
      />
      <View style={{ alignSelf: 'flex-end' }}>
        <TextLink
          title='Forgot password?'
          onPress={() =>
            router.push({ pathname: '/forgot-password', params: { email: email.trim() } })
          }
        />
      </View>
      <Button title='Sign in' loading={busy} onPress={submit} />
      <TextLink title='New to Genit? Create an account' onPress={() => router.replace('/sign-up')} />
    </Screen>
  );
}
