import { Stack } from 'expo-router';

import { useColors } from '@/lib/theme';

export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        title: '',
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name='welcome' options={{ headerShown: false }} />
    </Stack>
  );
}
