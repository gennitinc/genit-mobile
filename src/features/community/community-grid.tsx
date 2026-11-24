import { useQueryClient } from '@tanstack/react-query';
import { ReportButton } from '@/features/safety/report-button';
import { api, errorMessage } from '@/lib/api';
import { communityKeys } from './community-api';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Drawer } from '@/components/drawer';
import { Icon } from '@/components/icon';
import { VerifiedBadge } from '@/components/verified-badge';
import { Banner, Button } from '@/components/ui';
import { radius, space, useColors } from '@/lib/theme';

import type { CommunityItem } from './community-api';

/** Until a picture reports its size, tiles hold this shape (the web's 4:5 placeholder). */
const DEFAULT_RATIO = 4 / 5;

/**
 * Two-column masonry of community designs, each at its own aspect ratio.
 * Tapping one opens it in a drawer, where it can be remixed in a new chat.
 */
export function CommunityGrid({ items }: { items: CommunityItem[] }) {
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<CommunityItem | null>(null);

  const visible = items;
  // Each tile goes to the shorter column, so the columns end at about the same height.
  const columns: CommunityItem[][] = [[], []];
  const heights = [0, 0];
  for (const item of visible) {
    const column = heights[0] <= heights[1] ? 0 : 1;
    columns[column].push(item);
    heights[column] += 1 / (ratios[item.id] ?? DEFAULT_RATIO);
  }

  return (
    <>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {columns.map((column, index) => (
          <View key={index} style={{ flex: 1, gap: space.sm }}>
            {column.map((item) => (
              <Tile
                key={item.id}
                item={item}
                ratio={ratios[item.id] ?? DEFAULT_RATIO}
                onSize={(ratio) => setRatios((current) => (current[item.id] === ratio ? current : { ...current, [item.id]: ratio }))}
                onPress={() => setOpen(item)}
              />
            ))}
          </View>
        ))}
      </View>
      <CommunityPreview item={open} onClose={() => setOpen(null)} ratio={open ? (ratios[open.id] ?? DEFAULT_RATIO) : DEFAULT_RATIO} />
    </>
  );
}

/**
 * Home's community row: a horizontal masonry. Two rows of equal height, each
 * design as wide as its own shape, so nothing is cropped and no slot is left
 * empty. Nearing the end loads the next batch.
 */
export function CommunityStrip({
  items,
  onEndReached,
  loadingMore,
}: {
  items: CommunityItem[];
  onEndReached?: () => void;
  loadingMore?: boolean;
}) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<CommunityItem | null>(null);

  // Rows are as tall as a 4:5 design about 2.3-across, so designs read clearly.
  const rowHeight = width ? (width - space.sm * 2) / 2.3 / DEFAULT_RATIO : 0;
  const widthOf = (item: CommunityItem) => Math.round(rowHeight * (ratios[item.id] ?? DEFAULT_RATIO));

  // Each design joins the shorter row, so both rows run about the same length.
  const rows: CommunityItem[][] = [[], []];
  const lengths = [0, 0];
  for (const item of items) {
    const row = lengths[0] <= lengths[1] ? 0 : 1;
    rows[row].push(item);
    lengths[row] += widthOf(item) + space.sm;
  }

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Runs to the screen edge while lining up with the page margin.
          style={{ marginHorizontal: -space.page }}
          contentContainerStyle={{ paddingHorizontal: space.page, gap: space.sm }}
          scrollEventThrottle={200}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            if (contentOffset.x + layoutMeasurement.width >= contentSize.width - width) onEndReached?.();
          }}
        >
          <View style={{ gap: space.sm }}>
            {rows.map((row, index) => (
              <View key={index} style={{ flexDirection: 'row', gap: space.sm, height: rowHeight }}>
                {row.map((item) => (
                  <View key={item.id} style={{ width: widthOf(item), height: rowHeight }}>
                    <Tile
                      item={item}
                      ratio={ratios[item.id] ?? DEFAULT_RATIO}
                      compact
                      onSize={(ratio) => setRatios((current) => (current[item.id] === ratio ? current : { ...current, [item.id]: ratio }))}
                      onPress={() => setOpen(item)}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
          {loadingMore ? (
            <View style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      <CommunityPreview item={open} onClose={() => setOpen(null)} ratio={open ? (ratios[open.id] ?? DEFAULT_RATIO) : DEFAULT_RATIO} />
    </View>
  );
}

function Tile({
  item,
  ratio,
  compact,
  onSize,
  onPress,
}: {
  item: CommunityItem;
  ratio: number;
  /** Small square tiles (Home): no creator strip, it wouldn't fit. */
  compact?: boolean;
  onSize: (ratio: number) => void;
  onPress: () => void;
}) {
  const colors = useColors();
  // A picture that fails (often a dropped connection) shows a placeholder;
  // tapping it tries again instead of opening the design.
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={failed ? `${item.alt}. Couldn't load, tap to retry` : item.alt}
      onPress={() => {
        if (!failed) return onPress();
        setFailed(false);
        setAttempt((count) => count + 1);
      }}
      style={({ pressed }) => ({ borderRadius: radius.md, overflow: 'hidden', opacity: pressed ? 0.85 : 1, backgroundColor: colors.surface })}
    >
      <Image
        key={attempt}
        source={{ uri: item.src }}
        style={{ width: '100%', aspectRatio: ratio }}
        contentFit='cover'
        transition={150}
        recyclingKey={`${item.id}:${attempt}`}
        onLoad={(event) => {
          const { width, height } = event.source;
          if (width && height) onSize(width / height);
        }}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: space.xs }}>
          <Icon name='refresh' size={22} color={colors.textMuted} />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>Tap to retry</Text>
        </View>
      ) : null}
      {item.creator && !compact ? <CreatorChip creator={item.creator} overlay /> : null}
    </Pressable>
  );
}

function CreatorChip({ creator, overlay }: { creator: NonNullable<CommunityItem['creator']>; overlay?: boolean }) {
  const colors = useColors();
  const text = overlay ? '#FFFFFF' : colors.text;
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 6 },
        overlay && {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: space.sm,
          paddingVertical: 6,
          backgroundColor: 'rgba(0,0,0,0.45)',
        },
      ]}
    >
      {creator.avatar ? (
        <Image source={{ uri: creator.avatar }} style={{ width: overlay ? 16 : 28, height: overlay ? 16 : 28, borderRadius: 14 }} />
      ) : (
        <View
          style={{
            width: overlay ? 16 : 28,
            height: overlay ? 16 : 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: overlay ? 'rgba(255,255,255,0.25)' : colors.surfacePressed,
          }}
        >
          <Icon name='person' size={overlay ? 10 : 16} color={text} />
        </View>
      )}
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: overlay ? 11 : 15, fontWeight: '600', color: text }}>
        {creator.username}
      </Text>
      {creator.verified ? <VerifiedBadge size={overlay ? 13 : 17} /> : null}
    </View>
  );
}

/** The design at full width, its creator, and a way to make your own version. */
function CommunityPreview({ item, ratio, onClose }: { item: CommunityItem | null; ratio: number; onClose: () => void }) {
  const colors = useColors();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [blocking, setBlocking] = useState(false);
  const block = async () => {
    if (!item?.creator?.id) return;
    setBlocking(true); setError('');
    try {
      await api(`safety/blocks/${item.creator.id}`, { method: 'POST' });
      await client.invalidateQueries({ queryKey: communityKeys.all });
      onClose();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBlocking(false); }
  };
  const remix = () => {
    if (!item) return;
    onClose();
    // The new chat starts with this design attached as the reference, like the web's Edit.
    router.push({ pathname: '/chat', params: { reference: item.src } });
  };
  return (
    <Drawer
      visible={!!item}
      onClose={onClose}
      title='Community design'
      footer={<Button title='Make my version' onPress={remix} />}
    >
      {item ? (
        <View style={{ gap: space.md }}>
          <Image
            source={{ uri: item.src }}
            style={{ width: '100%', aspectRatio: ratio, maxHeight: 460, borderRadius: radius.md, backgroundColor: colors.surface }}
            contentFit='contain'
          />
          {item.creator ? <CreatorChip creator={item.creator} /> : null}
          <ReportButton key={item.id} kind='community' contentId={item.id} />
          {item.creator?.id ? <Button small variant='ghost' title='Block creator' loading={blocking} onPress={block} /> : null}
          <Banner message={error} />
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textMuted }}>
            Start a chat with this design as your reference, and Genit will make a version for your brand.
          </Text>
        </View>
      ) : null}
    </Drawer>
  );
}
