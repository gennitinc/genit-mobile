import { GenitMark } from '@/components/genit-mark';
import { router, usePathname, useSegments } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/glass-tab-bar';
import { space, useColors } from '@/lib/theme';

const SIZE = 56;

/** Floating shortcut to Genit's AI chat, shown everywhere except the inbox. */
export function ChatFab() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const segments = useSegments() as string[];
  const tabBarSpace = useTabBarSpace();

  // Hidden in the inbox (it has its own composer), inside the chat itself, and on
  // flows with a pinned Save bar it would cover (brand identity, new organization).
  if (/^\/(inbox|chat|history|brand)(\/|$)/.test(pathname) || pathname === '/organizations/new') return null;


  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel='Open chat'
      onPress={() => router.push('/chat')}
      style={({ pressed }) => ({
        position: 'absolute',
        right: space.lg,
        bottom: segments.includes('(tabs)') ? tabBarSpace : insets.bottom + space.lg,
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.primaryPressed : colors.primary,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      })}
    >
      {/* White, like the sparkles it replaced, so it reads on the purple button. */}
      <GenitMark size={30} color={colors.onPrimary} />
    </Pressable>
  );
}
