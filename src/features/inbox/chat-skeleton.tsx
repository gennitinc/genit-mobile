import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { radius, space, useColors } from '@/lib/theme';

// Two kinds of row, alternating like a real conversation: the customer on the
// left with an avatar, your replies on the right in the accent colour.
type Row = { mine: boolean; width: DimensionValue; lines: number };

const ROWS: Row[] = [
  { mine: false, width: '68%', lines: 2 },
  { mine: true, width: '58%', lines: 1 },
  { mine: false, width: '52%', lines: 1 },
  { mine: true, width: '72%', lines: 2 },
  { mine: false, width: '64%', lines: 2 },
  { mine: true, width: '46%', lines: 1 },
  { mine: false, width: '56%', lines: 1 },
];

/** One shared pulse, so every block fades in step. Holds still when Reduce Motion is on. */
function usePulse() {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.45, { duration: 850, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity, reduceMotion]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/** Placeholder thread shown while a conversation's messages load, filled from the top. */
export function ChatSkeleton() {
  const colors = useColors();
  const pulse = usePulse();

  return (
    <View
      accessible
      accessibilityRole='progressbar'
      accessibilityLabel='Loading messages'
      style={{ flex: 1, justifyContent: 'flex-start', padding: space.lg, overflow: 'hidden' }}
    >
      <Animated.View style={[{ gap: space.lg }, pulse]}>
        {ROWS.map((row, index) => (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: row.mine ? 'flex-end' : 'flex-start', gap: space.sm }}>
            {row.mine ? null : <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfacePressed }} />}
            <View
              style={{
                width: row.width,
                paddingHorizontal: space.md,
                paddingVertical: 12,
                gap: 8,
                borderRadius: radius.lg,
                borderBottomLeftRadius: row.mine ? radius.lg : 4,
                borderBottomRightRadius: row.mine ? 4 : radius.lg,
                backgroundColor: row.mine ? colors.primary : colors.surface,
                opacity: row.mine ? 0.3 : 1,
              }}
            >
              {Array.from({ length: row.lines }, (_, line) => (
                <View
                  key={line}
                  style={{
                    height: 10,
                    borderRadius: 5,
                    // The last line of a paragraph is shorter, like real text.
                    width: row.lines > 1 && line === row.lines - 1 ? '55%' : '100%',
                    backgroundColor: row.mine ? 'rgba(255,255,255,0.7)' : colors.surfacePressed,
                  }}
                />
              ))}
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

/** Placeholder header (avatar, name, channel) for a conversation that hasn't loaded yet. */
export function ChatHeaderSkeleton() {
  const colors = useColors();
  const pulse = usePulse();
  return (
    <Animated.View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }, pulse]}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfacePressed }} />
      <View style={{ gap: 6 }}>
        <View style={{ width: 120, height: 12, borderRadius: 6, backgroundColor: colors.surfacePressed }} />
        <View style={{ width: 80, height: 9, borderRadius: 5, backgroundColor: colors.surface }} />
      </View>
    </Animated.View>
  );
}

/** Conversation rows' shapes: name width, whether a subject line shows, preview line widths. */
const LIST_ROWS: { name: DimensionValue; subject: boolean; preview: DimensionValue[] }[] = [
  { name: '42%', subject: true, preview: ['92%', '64%'] },
  { name: '30%', subject: false, preview: ['78%'] },
  { name: '50%', subject: true, preview: ['88%', '52%'] },
  { name: '36%', subject: false, preview: ['70%'] },
  { name: '46%', subject: true, preview: ['94%', '58%'] },
  { name: '28%', subject: false, preview: ['66%'] },
  { name: '40%', subject: false, preview: ['82%'] },
];

/**
 * Placeholder inbox list while conversations load: the same layout as a
 * conversation row (photo with its platform badge, name and time, subject,
 * two-line preview), pulsing together.
 */
export function ConversationListSkeleton({ rows = LIST_ROWS.length }: { rows?: number }) {
  const colors = useColors();
  const pulse = usePulse();
  const block = colors.surfacePressed;
  return (
    <Animated.View accessible accessibilityRole='progressbar' accessibilityLabel='Loading conversations' style={pulse}>
      {LIST_ROWS.slice(0, rows).map((row, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: space.md, paddingHorizontal: space.page, paddingVertical: space.md }}>
          <View style={{ width: 48, height: 48 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: block }} />
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: colors.background, backgroundColor: block }} />
          </View>
          <View style={{ flex: 1, gap: 8, paddingTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ width: row.name, height: 13, borderRadius: 6, backgroundColor: block }} />
              <View style={{ width: 28, height: 10, borderRadius: 5, backgroundColor: block }} />
            </View>
            {row.subject ? <View style={{ width: '58%', height: 11, borderRadius: 5, backgroundColor: block }} /> : null}
            {row.preview.map((width, line) => (
              <View key={line} style={{ width, height: 10, borderRadius: 5, backgroundColor: block, opacity: 0.8 }} />
            ))}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}
