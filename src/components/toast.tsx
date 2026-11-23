import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { radius, space, useColors } from '@/lib/theme';

type Toast = { id: number; message: string; icon?: IconName };

let listener: ((toast: Toast) => void) | null = null;
let nextId = 1;

/** A short message at the top of the screen that goes away on its own. */
export function showToast(message: string, icon?: IconName) {
  listener?.({ id: nextId++, message, icon });
}

/** Mounted once at the app root; shows whatever showToast sends. */
export function ToastHost() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    listener = setToast;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  return (
    <View pointerEvents='none' style={{ position: 'absolute', top: insets.top + space.sm, left: space.page, right: space.page, alignItems: 'center' }}>
      <Animated.View
        key={toast.id}
        entering={FadeInUp.duration(220)}
        exiting={FadeOutUp.duration(180)}
        accessibilityLiveRegion='polite'
        accessibilityRole='alert'
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          maxWidth: 420,
          paddingHorizontal: space.lg,
          paddingVertical: space.md,
          borderRadius: radius.full,
          backgroundColor: colors.text,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        {toast.icon ? <Icon name={toast.icon} size={18} color={colors.background} /> : null}
        <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', color: colors.background }}>{toast.message}</Text>
      </Animated.View>
    </View>
  );
}
