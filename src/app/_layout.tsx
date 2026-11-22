import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { LogBox, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, Logo } from '@/components/ui';
// Applies the saved light/dark choice as early as possible.
import '@/lib/appearance';
import { accountStage, AuthProvider, useAuth } from '@/features/auth/auth-context';
import { queryClient, QueryProvider } from '@/lib/query';
import { disconnectSocket } from '@/lib/socket';
import { space, useColors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

// @gorhom/bottom-sheet passes dependency lists to Reanimated hooks, which
// Reanimated 4 ignores on iOS/Android and warns about on every drawer. Harmless.
LogBox.ignoreLogs(['[Reanimated] Dependencies should only be used on the web']);

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <QueryProvider>
            <AuthProvider>
              <BottomSheetModalProvider>
                <StatusBar style='auto' />
                <RootNavigator />
              </BottomSheetModalProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { status, user } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  // Leaving the workspace (sign out, account switch) must not leave another
  // account's cached data or realtime connection behind.
  const inWorkspace = accountStage(user) === 'app';
  useEffect(() => {
    if (!inWorkspace) {
      queryClient.clear();
      disconnectSocket();
    }
  }, [inWorkspace]);

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
  const { retry, unreachableReason } = useAuth();
  const offline = unreachableReason?.offline ?? true;
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.lg,
        padding: space.page,
        backgroundColor: colors.background,
      }}
    >
      <Logo />
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>
        {offline ? 'Can’t connect to Genit' : 'Genit couldn’t load your account'}
      </Text>
      <Text style={{ fontSize: 15, textAlign: 'center', color: colors.textMuted }}>
        {offline
          ? 'Check your internet connection or VPN, then try again. You’re still signed in.'
          : `The server answered with an error: ${unreachableReason?.message || 'unknown error'}. You’re still signed in, so try again in a moment.`}
      </Text>
      <View style={{ alignSelf: 'stretch' }}>
        <Button title='Try again' onPress={retry} />
      </View>
    </View>
  );
}
