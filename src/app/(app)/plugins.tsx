import { Icon } from '@/components/icon';
import { ProCrown } from '@/components/pro-crown';
import { isProPlugin, useIsFreePlan } from '@/lib/plan';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { IconButton, LoadError } from '@/components/kit';
import { IntegrationDrawer } from '@/features/integrations/integration-drawer';
import {
  CATEGORIES,
  type CatalogCategory,
  type CatalogItem,
  connectionsFor,
  useIntegrations,
  usePluginCatalog,
} from '@/features/integrations/integrations-api';
import { WEB_URL } from '@/lib/config';
import { radius, space, useColors } from '@/lib/theme';

type Filter = 'All' | CatalogCategory;

/** Shorter tab labels, as on the web page. */
const TAB_LABEL: Partial<Record<Filter, string>> = { 'Ads Campaigns': 'Ads', 'Email Campaigns': 'Email' };

const TILE = 48;

/** The plugin's logo in a soft bordered tile, as on the web Plugins page. */
function LogoTile({ item }: { item: CatalogItem }) {
  const colors = useColors();
  const glyph = 26;
  return (
    <View
      style={{
        width: TILE,
        height: TILE,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md - 2,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      {item.logo ? (
        <Image source={{ uri: item.logo }} style={{ width: glyph, height: glyph, borderRadius: 4 }} contentFit='contain' />
      ) : (
        <BrandLogo platform={item.appSlug ?? item.platform} size={glyph} />
      )}
    </View>
  );
}

function PluginListRow({ item, connected, onPress }: { item: CatalogItem; connected: boolean; onPress: () => void }) {
  const colors = useColors();
  // On the free plan, plugins other than Gmail and Outlook carry a gold crown.
  const pro = useIsFreePlan() && isProPlugin(item) && !connected;
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`${item.name}, ${connected ? 'connected' : 'not connected'}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: space.md + 2,
        paddingHorizontal: space.page,
        backgroundColor: pressed ? colors.surfacePressed : 'transparent',
      })}
    >
      <LogoTile item={item} />
      <View style={{ flex: 1, paddingLeft: space.md, paddingRight: space.sm, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: colors.text }}>
            {item.name}
          </Text>
          {pro ? <ProCrown /> : null}
        </View>
        <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, color: colors.textMuted }}>
          {item.description}
        </Text>
      </View>
      {connected ? (
        <View style={{ padding: space.sm }}>
          <Icon name='ellipsis-horizontal' size={20} color={colors.textMuted} />
        </View>
      ) : (
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={`Connect ${item.name}`}
          onPress={onPress}
          style={({ pressed }) => ({
            paddingHorizontal: space.md,
            paddingVertical: 7,
            borderRadius: radius.sm - 2,
            backgroundColor: pressed ? colors.primaryPressed : colors.primary,
          })}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.onPrimary }}>{pro ? 'Upgrade' : 'Connect'}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

/** Mirrors the web Plugins page: added plugins, search, category tabs and a grouped list. */
export default function PluginsScreen() {
  const colors = useColors();
  const integrations = useIntegrations();
  const catalog = usePluginCatalog();
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim().toLowerCase());
  const [filter, setFilter] = useState<Filter>('All');

  const isConnected = (item: CatalogItem) => connectionsFor(item, integrations.integrations).some((c) => c.status === 'active');

  // Plugins that can't be connected yet aren't listed.
  const available = catalog.items.filter((item) => item.status === 'available');
  const added = available.filter(isConnected);

  const sections = useMemo(() => {
    const matches = catalog.items.filter(
      (item) =>
        item.status === 'available' &&
        (filter === 'All' || item.category === filter) &&
        (!query ||
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query))
    );
    return CATEGORIES.map((category) => ({ title: category, data: matches.filter((item) => item.category === category) })).filter(
      (section) => section.data.length > 0
    );
  }, [catalog.items, filter, query]);

  const filtered = filter !== 'All' || !!search;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {/* Title, count and tagline */}
      <View style={{ paddingHorizontal: space.page, paddingTop: space.sm, gap: space.md }}>
        <IconButton icon='chevron-back' label='Back' onPress={() => router.back()} />
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text accessibilityRole='header' style={{ fontSize: 30, fontWeight: '700', letterSpacing: -0.6, color: colors.text }}>
              Plugins
            </Text>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text style={{ fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'], color: colors.textMuted }}>
                {available.length.toLocaleString()} plugins
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Work with Genit across your favorite tools</Text>
        </View>
      </View>

      {/* Search, reset and category tabs stay put while the list scrolls. */}
      <View style={{ paddingTop: space.lg, borderBottomWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.page }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              height: 44,
              paddingHorizontal: space.md,
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Icon name='search' size={16} color={colors.textFaint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder='Search plugins and skills'
              placeholderTextColor={colors.textFaint}
              autoCapitalize='none'
              autoCorrect={false}
              returnKeyType='search'
              clearButtonMode='while-editing'
              style={{ flex: 1, fontSize: 15, color: colors.text }}
            />
          </View>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel='Clear search and filters'
            accessibilityState={{ disabled: !filtered }}
            disabled={!filtered}
            onPress={() => {
              setSearch('');
              setFilter('All');
            }}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfacePressed : colors.surface,
            })}
          >
            <Icon name='options-outline' size={18} color={filtered ? colors.text : colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.page, paddingVertical: space.md }}
        >
          {(['All', ...CATEGORIES] as Filter[]).map((category) => {
            const active = filter === category;
            return (
              <Pressable
                key={category}
                accessibilityRole='tab'
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(category)}
                style={{ paddingHorizontal: space.md, paddingVertical: 7, borderRadius: radius.sm, backgroundColor: active ? colors.text : 'transparent' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: active ? colors.background : colors.textMuted }}>
                  {TAB_LABEL[category] ?? category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {integrations.isError ? (
        <LoadError error={integrations.error} onRetry={integrations.refetch} />
      ) : (
        <SectionList
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          sections={sections}
          keyExtractor={(item) => item.appSlug ?? item.platform}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='on-drag'
          initialNumToRender={20}
          ListHeaderComponent={
            added.length && !filtered ? (
              <View style={{ paddingHorizontal: space.page, paddingTop: space.xl, gap: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: colors.textMuted }}>Added</Text>
                  <Text accessibilityRole='button' onPress={() => setSelected(added[0])} style={{ fontSize: 13, color: colors.textFaint }}>
                    Manage
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
                  {added.map((item) => (
                    <Pressable
                      key={item.appSlug ?? item.platform}
                      accessibilityRole='button'
                      accessibilityLabel={`Manage ${item.name}`}
                      onPress={() => setSelected(item)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <LogoTile item={item} />
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : undefined
          }
          renderSectionHeader={({ section }) => (
            <View style={{ marginHorizontal: space.page, marginTop: space.xxl, paddingBottom: space.md, borderBottomWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.text }}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, index, section }) => (
            <View>
              <PluginListRow item={item} connected={isConnected(item)} onPress={() => setSelected(item)} />
              {index < section.data.length - 1 ? (
                <View style={{ height: 1, marginLeft: space.page + TILE + space.md, backgroundColor: colors.border, opacity: 0.6 }} />
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ paddingVertical: 64, textAlign: 'center', fontSize: 14, color: colors.textMuted }}>
              {search ? `No plugins match “${search}”.` : 'No plugins in this category.'}
            </Text>
          }
          ListFooterComponent={
            <View style={{ paddingHorizontal: space.page, paddingTop: space.xxl, alignItems: 'center', gap: space.lg }}>
              {catalog.loadingMore ? (
                <Text style={{ fontSize: 13, color: colors.textMuted }}>Loading more plugins…</Text>
              ) : catalog.moreError ? (
                <Text style={{ fontSize: 13, textAlign: 'center', color: colors.textMuted }}>Couldn’t load the full catalog. The plugins above still work.</Text>
              ) : null}
              <View style={{ alignItems: 'center', gap: space.md }}>
                <Text style={{ fontSize: 14, color: colors.textMuted }}>Need another plugin?</Text>
                <Pressable
                  accessibilityRole='button'
                  onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/contact`)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.sm,
                    paddingHorizontal: space.lg,
                    paddingVertical: 10,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                  })}
                >
                  <Icon name='add' size={18} color={colors.text} />
                  <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>Request plugin</Text>
                </Pressable>
              </View>
              <Text style={{ fontSize: 12, textAlign: 'center', color: colors.textMuted }}>
                Need to disconnect or delete your data?{' '}
                <Text
                  accessibilityRole='link'
                  onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/plugin/removal-instructions`)}
                  style={{ color: colors.text, textDecorationLine: 'underline' }}
                >
                  Removal instructions
                </Text>
                .
              </Text>
            </View>
          }
        />
      )}
      <IntegrationDrawer item={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
