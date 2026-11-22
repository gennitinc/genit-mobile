import { Text, View } from 'react-native';

import { IconButton } from '@/components/kit';
import { space, useColors } from '@/lib/theme';

/** Header for the brand steps when they're used outside onboarding. */
export function FlowHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <IconButton icon='chevron-back' label='Back' onPress={onBack} />
      <Text accessibilityRole='header' style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
        {title}
      </Text>
    </View>
  );
}
