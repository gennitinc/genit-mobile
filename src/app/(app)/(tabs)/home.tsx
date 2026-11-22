import { Icon } from '@/components/icon';
import { useTabBarSpace } from '@/components/glass-tab-bar';
import { PullRefresh } from '@/components/pull-refresh';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';

import { BrandLogo } from '@/components/brand-logo';
import { DateField } from '@/components/date-field';
import { Drawer } from '@/components/drawer';
import { Page, SectionTitle } from '@/components/kit';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { IntegrationDrawer } from '@/features/integrations/integration-drawer';
import { PluginRow } from '@/features/integrations/plugin-row';
import {
  CATALOG,
  type CatalogItem,
  connectionsFor,
  effectivePlatform,
  type IntegrationConnection,
  useComposioToolkits,
  useIntegrations,
} from '@/features/integrations/integrations-api';
import { communityItems, useCommunity } from '@/features/community/community-api';
import { CommunityStrip } from '@/features/community/community-grid';
import { MetricsBoard, RangeControl, type RangePreset } from '@/features/home/metrics-board';
import { currentOrganization } from '@/features/orgs/orgs-api';
import { fetchStats, postKeys } from '@/features/posts/posts-api';
import { addDays, localTimeZone, shortDate, startOfDay } from '@/lib/format';
import { platformMeta, POST_PLATFORMS } from '@/lib/platforms';
import { space, useColors } from '@/lib/theme';

/** Mirrors the web Home: first seven catalog entries plus Slack. */
const PLUGIN_CARDS = [...CATALOG.filter((item) => !item.appSlug).slice(0, 7), ...CATALOG.filter((item) => item.appSlug === 'slack')];

export default function HomeScreen() {
  const colors = useColors();
  const tabBarSpace = useTabBarSpace();
  // Loads more as you swipe along the row, like the Community page does as you scroll.
  const communityFeed = useCommunity('', 18);
  const community = { items: communityItems(communityFeed.data?.pages) };
  const loadMoreCommunity = () => {
    if (communityFeed.hasNextPage && !communityFeed.isFetchingNextPage) void communityFeed.fetchNextPage();
  };
  const { user } = useAuth();
  const org = currentOrganization(user);
  const integrations = useIntegrations();

  const [preset, setPreset] = useState<RangePreset>(30);
  const [custom, setCustom] = useState({ from: addDays(new Date(), -29), to: new Date() });
  const [customOpen, setCustomOpen] = useState(false);
  const [plugin, setPlugin] = useState<CatalogItem | null>(null);

  const range = useMemo(() => {
    if (preset === 'custom') {
      const to = new Date(custom.to);
      to.setHours(23, 59, 59, 999);
      return { from: startOfDay(custom.from).toISOString(), to: to.toISOString() };
    }
    return { from: startOfDay(addDays(new Date(), -(preset - 1))).toISOString(), to: new Date().toISOString() };
  }, [preset, custom]);

  const stats = useQuery({
    queryKey: postKeys.stats(range.from.slice(0, 10), range.to.slice(0, 10)),
    queryFn: () => fetchStats(range.from, range.to, localTimeZone()),
    // Keep the last range on screen while the new one loads, instead of blanking the board.
    placeholderData: keepPreviousData,
  });

  const channels = integrations.active.filter((connection) =>
    (POST_PLATFORMS as readonly string[]).includes(effectivePlatform(connection))
  ).length;


  const refresh = () => Promise.all([stats.refetch(), integrations.refetch(), communityFeed.refetch()]);

  return (
    <Page title={`Hello ${org?.businessName || user?.username || 'there'} 👋`} subtitle='Your marketing at a glance'>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        refreshControl={<PullRefresh onRefresh={refresh} />}
        contentContainerStyle={{ gap: space.xl, paddingTop: space.md, paddingBottom: tabBarSpace }}
      >
        {/* Connected channels, stacked like the web dashboard. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.page }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {integrations.active.slice(0, 6).map((connection, index, shown) => (
              // Each logo leans clockwise, like cards tilted on a table.
              <View key={connection._id} style={{ marginLeft: index ? -STACK_OVERLAP : 0, zIndex: shown.length - index, transform: [{ rotate: '8deg' }], ...TILE_SHADOW }}>
                <ConnectionLogo connection={connection} />
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel='Connect an account'
            onPress={() => router.push('/plugins')}
            style={({ pressed }) => ({
              width: TILE,
              height: TILE,
              borderRadius: 10,
              borderWidth: 2,
              borderColor: colors.background,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfacePressed : colors.surface,
            })}
          >
            <Icon name='add' size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: space.page, gap: space.md }}>
          <RangeControl
            preset={preset}
            onPreset={setPreset}
            customLabel={`${shortDate(custom.from)} – ${shortDate(custom.to)}`}
            onCustom={() => setCustomOpen(true)}
          />
          <MetricsBoard stats={stats.data} error={stats.isError ? stats.error : undefined} onRetry={stats.refetch} channels={channels} />
        </View>

        {/* Designs other creators published, like the web's Discover grid. */}
        {community.items.length ? (
          <View style={{ paddingHorizontal: space.page, gap: space.md }}>
            <SectionTitle
              title='Community'
              action={<Button title='See more' variant='ghost' small onPress={() => router.push('/community')} />}
            />
            <CommunityStrip items={community.items} onEndReached={loadMoreCommunity} loadingMore={communityFeed.isFetchingNextPage} />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: space.page, gap: space.md }}>
          <SectionTitle
            title='Plugins'
            action={<Button title='View all' variant='ghost' small onPress={() => router.push('/plugins')} />}
          />
          {PLUGIN_CARDS.map((item) => (
            <PluginRow
              key={item.appSlug ?? item.platform}
              item={item}
              connected={connectionsFor(item, integrations.integrations).some((c) => c.status === 'active')}
              onPress={() => setPlugin(item)}
            />
          ))}
        </View>
      </ScrollView>

      <Drawer
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title='Custom range'
        footer={
          <Button
            title='Apply'
            disabled={custom.from > custom.to}
            onPress={() => {
              setPreset('custom');
              setCustomOpen(false);
            }}
          />
        }
      >
        <DateField label='From' mode='date' value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} />
        <DateField
          label='To'
          mode='date'
          value={custom.to}
          onChange={(to) => setCustom((c) => ({ ...c, to }))}
          error={custom.from > custom.to ? 'The end date is before the start date' : undefined}
        />
      </Drawer>

      <IntegrationDrawer item={plugin} onClose={() => setPlugin(null)} />
    </Page>
  );
}

const TILE = 40;
const STACK_OVERLAP = 8;
/** The soft lift the web tiles have, so overlapping logos stay distinct. */
const TILE_SHADOW = { borderRadius: 10, backgroundColor: '#FFFFFF', shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 };

/** A connected account shown by its platform's logo, filling a rounded tile. */
function ConnectionLogo({ connection }: { connection: IntegrationConnection }) {
  const colors = useColors();
  const toolkits = useComposioToolkits();
  const meta = platformMeta(effectivePlatform(connection));
  // Plugins from the wider catalog have no built-in icon; use the catalog's logo.
  const slug = String(connection.metadata?.toolkitSlug ?? '');
  const logo = meta.icon === 'apps' ? (toolkits.data ?? []).find((toolkit) => toolkit.slug === slug)?.logo : undefined;
  const name = meta.icon === 'apps' ? String(connection.metadata?.toolkitName ?? meta.label) : meta.label;
  return (
    <View
      accessibilityLabel={`${name}: ${connection.accountName}`}
      style={{
        width: TILE,
        height: TILE,
        borderRadius: 10,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        // A ring in the page color keeps overlapping tiles apart.
        borderWidth: 2,
        borderColor: colors.background,
        backgroundColor: '#FFFFFF',
      }}
    >
      {logo ? (
        <Image source={{ uri: logo }} style={{ width: '100%', height: '100%' }} contentFit='cover' />
      ) : (
        <BrandLogo platform={effectivePlatform(connection)} size={TILE - 12} />
      )}
    </View>
  );
}
