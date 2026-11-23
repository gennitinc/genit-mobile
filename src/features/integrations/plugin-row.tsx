import { Icon } from '@/components/icon';
import { ProCrown } from '@/components/pro-crown';
import { isProPlugin, useIsFreePlan } from '@/lib/plan';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { BrandLogo } from '@/components/brand-logo';
import { Card, Pill } from '@/components/kit';
import { useColors } from '@/lib/theme';

import type { CatalogItem } from './integrations-api';

export function PluginRow({ item, connected, onPress }: { item: CatalogItem; connected: boolean; onPress: () => void }) {
  const colors = useColors();
  // On the free plan, plugins other than Gmail and Outlook carry a gold crown.
  const pro = useIsFreePlan() && isProPlugin(item) && !connected && item.status !== 'soon';
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
      {item.logo ? (
        <Image source={{ uri: item.logo }} style={{ width: 26, height: 26, borderRadius: 6 }} contentFit='contain' />
      ) : (
        <BrandLogo platform={item.appSlug ?? item.platform} size={26} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{item.name}</Text>
          {pro ? <ProCrown /> : null}
        </View>
        <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textMuted }}>
          {item.description}
        </Text>
      </View>
      {connected ? (
        <Icon name='checkmark-circle' size={24} color={colors.success} accessibilityLabel='Connected' />
      ) : item.status === 'soon' ? (
        <Pill label='Soon' />
      ) : pro ? (
        <Pill label='Pro' />
      ) : (
        <Pill label='Add' tone='primary' />
      )}
    </Card>
  );
}
