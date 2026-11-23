import { Image } from 'expo-image';
import { useColorScheme } from 'react-native';

const LIGHT = require('../../assets/images/genit-mark.png');
// The web shows the same mark with `dark:invert`; this is that inverted version.
const DARK = require('../../assets/images/genit-mark-dark.png');

/** Genit's mark, the avatar the web chat shows beside Genit's replies. */
/** `color` draws the mark in one flat color, for coloured backgrounds such as the chat button. */
export function GenitMark({ size = 24, inverted, color }: { size?: number; inverted?: boolean; color?: string }) {
  const dark = useColorScheme() === 'dark';
  return (
    <Image
      source={dark !== !!inverted ? DARK : LIGHT}
      style={{ width: size, height: size }}
      contentFit='contain'
      tintColor={color}
      accessibilityLabel='Genit'
    />
  );
}
