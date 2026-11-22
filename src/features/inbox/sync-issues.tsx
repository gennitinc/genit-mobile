import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { radius, space, useColors } from '@/lib/theme';

import type { SyncIssue } from './inbox-accounts';

/**
 * Channels that didn't sync, one short line each. A channel that needs
 * reconnecting gets a button to do it; the whole box can be dismissed.
 */
export function SyncIssues({ issues, onDismiss }: { issues: SyncIssue[]; onDismiss: () => void }) {
  const colors = useColors();
  if (!issues.length) return null;
  const unique = issues.filter((issue, index) => issues.findIndex((other) => other.message === issue.message) === index);
  return (
    <View
      accessibilityRole='alert'
      style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.dangerSurface }}
    >
      <Icon name='alert-circle' size={18} color={colors.danger} />
      <View style={{ flex: 1, gap: space.sm }}>
        {unique.map((issue) => (
          <View key={`${issue.integrationId}:${issue.message}`} style={{ gap: space.xs }}>
            <Text style={{ fontSize: 14, lineHeight: 20, color: colors.danger }}>{issue.message}</Text>
            {issue.kind === 'reconnect' ? (
              <Pressable accessibilityRole='button' onPress={() => router.push('/plugins')} hitSlop={8}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger, textDecorationLine: 'underline' }}>Reconnect</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      <Pressable accessibilityRole='button' accessibilityLabel='Dismiss' onPress={onDismiss} hitSlop={10}>
        <Icon name='close' size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
}
