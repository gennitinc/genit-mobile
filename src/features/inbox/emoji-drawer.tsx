import { View } from 'react-native';
import { EmojiKeyboard } from 'rn-emoji-keyboard';

import { Drawer } from '@/components/drawer';
import { useColors } from '@/lib/theme';

import { haptic } from './haptics';

/** Height of the picker area: search, the emoji grid and the category bar. */
const PICKER_HEIGHT = 500;

/**
 * Emoji picker as a bottom-sheet drawer, built on rn-emoji-keyboard's inline
 * keyboard (its own picker is a modal, which the app doesn't use). It has every
 * emoji, search, categories, skin tones and recently used. The drawer stays
 * open so several emoji can be added in a row; each pick goes to `onPick`,
 * which inserts it at the cursor.
 */
export function EmojiDrawer({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (emoji: string) => void }) {
  const colors = useColors();
  return (
    <Drawer visible={visible} onClose={onClose} title='Emoji' noScroll>
      <View style={{ height: PICKER_HEIGHT }}>
        {visible ? (
          <EmojiKeyboard
            onEmojiSelected={(selected) => {
              haptic.select();
              onPick(selected.emoji);
            }}
            enableSearchBar
            enableRecentlyUsed
            categoryPosition='bottom'
            emojiSize={28}
            disableSafeArea
            styles={{ container: { flex: 1, borderRadius: 0, shadowOpacity: 0, elevation: 0 } }}
            theme={{
              container: colors.background,
              header: colors.textMuted,
              knob: colors.borderStrong,
              skinTonesContainer: colors.surface,
              category: {
                icon: colors.textMuted,
                iconActive: colors.primary,
                container: colors.surface,
                containerActive: colors.surfacePressed,
              },
              search: {
                background: colors.surface,
                text: colors.text,
                placeholder: colors.textFaint,
                icon: colors.textMuted,
              },
              emoji: { selected: colors.surfacePressed },
            }}
          />
        ) : null}
      </View>
    </Drawer>
  );
}
