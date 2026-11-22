import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Logo } from '@/components/ui';
import { space, useColors } from '@/lib/theme';

export default function WelcomeScreen() {
  const colors = useColors();
  return (
    <SafeAreaView style={{ flex: 1, padding: space.page, backgroundColor: colors.background }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
        <Logo size={72} />
        <View style={{ gap: space.md }}>
          <Text style={{ fontSize: 38, lineHeight: 44, fontWeight: '700', letterSpacing: -1, color: colors.text }}>
            Your AI marketing team, in your pocket.
          </Text>
          <Text style={{ fontSize: 17, lineHeight: 25, color: colors.textMuted }}>
            Create content, run campaigns, and grow your brand with Genit.
          </Text>
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Button title='Create account' onPress={() => router.push('/sign-up')} />
        <Button title='Sign in' variant='secondary' onPress={() => router.push('/sign-in')} />
      </View>
    </SafeAreaView>
  );
}
