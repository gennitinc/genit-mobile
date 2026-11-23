import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { radius, space, useColors } from '@/lib/theme';

type Bubble = { mine: boolean; width: DimensionValue; lines: number; media?: boolean };

// A plausible back-and-forth: short and long messages, one photo, both sides.
const CHAT: Bubble[] = [
  { mine: false, width: '62%', lines: 2 },
  { mine: false, width: '40%', lines: 1 },
  { mine: true, width: '55%', lines: 1 },
  { mine: false, width: '58%', lines: 0, media: true },
  { mine: true, width: '70%', lines: 3 },
  { mine: false, width: '48%', lines: 1 },
  { mine: true, width: '36%', lines: 1 },
];

// Emails are full-width cards, so they get a few wide blocks instead of bubbles.
const EMAIL: Bubble[] = [
  { mine: false, width: '100%', lines: 5 },
  { mine: true, width: '100%', lines: 3 },
  { mine: false, width: '100%', lines: 4 },
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

/** Placeholder thread shown while a conversation's messages load. */
export function ChatSkeleton({ email }: { email?: boolean }) {
  const colors = useColors();
  const pulse = usePulse();
  const block = colors.surfacePressed;
  const rows = email ? EMAIL : CHAT;

  return (
    <View
      accessible
      accessibilityRole='progressbar'
      accessibilityLabel='Loading messages'
      style={{ flex: 1, justifyContent: 'flex-end', padding: space.lg, gap: space.md, overflow: 'hidden' }}
    >
      <Animated.View style={[{ gap: space.md }, pulse]}>
        {rows.map((row, index) => (
          <View key={index} style={{ alignItems: row.mine ? 'flex-end' : 'flex-start', gap: 6 }}>
            <View
              style={{
                width: row.width,
                padding: space.md,
                gap: 8,
                borderRadius: email ? radius.md : radius.lg,
                borderBottomRightRadius: !email && row.mine ? 4 : email ? radius.md : radius.lg,
                borderBottomLeftRadius: !email && !row.mine ? 4 : email ? radius.md : radius.lg,
                backgroundColor: colors.surface,
              }}
            >
              {row.media ? <View style={{ height: 150, borderRadius: radius.md, backgroundColor: block }} /> : null}
              {Array.from({ length: row.lines }, (_, line) => (
                <View
                  key={line}
                  style={{
                    height: 11,
                    borderRadius: 6,
                    // The last line of a paragraph is shorter, like real text.
                    width: line === row.lines - 1 && row.lines > 1 ? '60%' : '100%',
                    backgroundColor: block,
                  }}
                />
              ))}
            </View>
            <View style={{ width: 34, height: 8, borderRadius: 4, backgroundColor: colors.surface }} />
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
