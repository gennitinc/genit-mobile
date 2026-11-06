import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, Logo } from '@/components/ui';
import { accountStage, AuthProvider, useAuth } from '@/features/auth/auth-context';
import { space, useColors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <StatusBar style='auto' />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { status, user } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return null;
  if (status === 'unreachable') return <Unreachable />;

  // A relaunch resumes at the right step, and nothing can navigate past a required one.
  const stage = accountStage(user);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name='index' />
      <Stack.Protected guard={stage === 'auth'}>
        <Stack.Screen name='(auth)' />
      </Stack.Protected>
      <Stack.Protected guard={stage === 'verify'}>
        <Stack.Screen name='verify-email' />
      </Stack.Protected>
      <Stack.Protected guard={stage === 'onboarding'}>
        <Stack.Screen name='onboarding' />
      </Stack.Protected>
      <Stack.Protected guard={stage === 'app'}>
        <Stack.Screen name='(app)' />
      </Stack.Protected>
    </Stack>
  );
}

function Unreachable() {
  const colors = useColors();
  const { retry } = useAuth();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        padding: space.xl,
        backgroundColor: colors.background,
      }}
    >
      <Logo />
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>You&apos;re offline</Text>
      <Text style={{ fontSize: 15, textAlign: 'center', color: colors.textMuted }}>
        We couldn&apos;t reach Genit. You&apos;re still signed in, so try again when you&apos;re back online.
      </Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button title='Try again' onPress={retry} />
      </View>
    </View>
  );
}
