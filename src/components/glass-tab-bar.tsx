import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, useColors } from '@/lib/theme';

const BAR_HEIGHT = 66;
const INSET = 5;
const SPRING = { damping: 18, stiffness: 190, mass: 0.9 };

/** Room a tab screen leaves at the bottom so its last items clear the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return barBottom(insets.bottom) + BAR_HEIGHT + space.lg;
}

function barBottom(safeBottom: number) {
  return Math.max(safeBottom - 10, space.md);
}

/**
 * The floating pill tab bar. On iOS 26 it is Liquid Glass, and the highlight
 * behind the active tab is a second glass lens that springs (and briefly
 * stretches) to the tab you pick. Elsewhere it falls back to a frosted look.
 */
export function GlassTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const colors = useColors();
  const dark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const glass = isLiquidGlassAvailable();
  const [width, setWidth] = useState(0);

  const count = state.routes.length;
  const tabWidth = width ? (width - INSET * 2) / count : 0;

  const x = useSharedValue(0);
  const stretch = useSharedValue(1);

  useEffect(() => {
    if (!tabWidth) return;
    x.value = withSpring(state.index * tabWidth, SPRING);
    // A quick stretch while it travels reads as liquid rather than a sliding box.
    stretch.value = withSequence(withTiming(1.12, { duration: 110 }), withSpring(1, SPRING));
  }, [state.index, tabWidth, x, stretch]);

  const lens = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scaleX: stretch.value }, { scaleY: 2 - stretch.value }],
  }));

  const frosted = dark ? 'rgba(28,28,32,0.92)' : 'rgba(250,250,252,0.94)';

  return (
    <View pointerEvents='box-none' style={[StyleSheet.absoluteFill, { top: undefined, paddingHorizontal: space.page, bottom: barBottom(insets.bottom) }]}>
      <Shadow background={glass ? undefined : frosted}>
        <GlassView
          glassEffectStyle='regular'
          colorScheme={dark ? 'dark' : 'light'}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          style={{
            height: BAR_HEIGHT,
            borderRadius: BAR_HEIGHT / 2,
            overflow: 'hidden',
            flexDirection: 'row',
            padding: INSET,
            backgroundColor: glass ? undefined : frosted,
            borderWidth: glass ? 0 : StyleSheet.hairlineWidth,
            borderColor: colors.borderStrong,
          }}
        >
          {tabWidth ? (
            <Animated.View
              pointerEvents='none'
              style={[{ position: 'absolute', top: INSET, left: INSET, width: tabWidth, bottom: INSET }, lens]}
            >
              <GlassView
                glassEffectStyle='clear'
                isInteractive
                tintColor={dark ? 'rgba(0,0,0,0.45)' : 'rgba(79,70,229,0.10)'}
                colorScheme={dark ? 'dark' : 'light'}
                style={{
                  flex: 1,
                  borderRadius: (BAR_HEIGHT - INSET * 2) / 2,
                  backgroundColor: glass ? undefined : dark ? 'rgba(0,0,0,0.55)' : 'rgba(79,70,229,0.10)',
                }}
              />
            </Animated.View>
          ) : null}

          {state.routes.map((route, index) => {
            const focused = index === state.index;
            const { options } = descriptors[route.key];
            const label = typeof options.title === 'string' ? options.title : route.name;
            const tint = focused ? colors.primary : colors.text;
            const press = () => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                void Haptics.selectionAsync();
                navigateToTab(route.key);
              }
            };
            return (
              <Pressable
                key={route.key}
                accessibilityRole='tab'
                accessibilityState={{ selected: focused }}
                accessibilityLabel={`${label}, tab, ${index + 1} of ${count}`}
                onPress={press}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }}
              >
                {(options.tabBarIcon?.({ focused, color: tint, size: 24 }) as ReactNode) ?? null}
                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: focused ? '700' : '600', color: tint }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </GlassView>
      </Shadow>
    </View>
  );
}

/** Soft lift under the frosted fallback. Liquid Glass draws its own depth. */
function Shadow({ background, children }: { background?: string; children: ReactNode }) {
  if (!background) return children;
  return (
    <View
      style={{
        borderRadius: BAR_HEIGHT / 2,
        backgroundColor: background,
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 10,
      }}
    >
      {children}
    </View>
  );
}
