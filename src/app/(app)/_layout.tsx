import { Stack } from 'expo-router';
import { View } from 'react-native';

import { ChatFab } from '@/features/chat/chat-fab';
import { CallBar } from '@/features/inbox/calls/call-bar';
import { useIntegrations } from '@/features/integrations/integrations-api';
import { useColors } from '@/lib/theme';

export default function AppLayout() {
  const colors = useColors();
  // Live-call polling only matters once a WhatsApp number is connected.
  const hasWhatsApp = useIntegrations().activeFor('whatsapp').length > 0;
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name='(tabs)' />
      </Stack>
      <ChatFab />
      {hasWhatsApp ? <CallBar /> : null}
    </View>
  );
}
