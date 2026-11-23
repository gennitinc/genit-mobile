import { StyleSheet, View } from 'react-native';

import { space, useColors } from '@/lib/theme';

/** A thin full-width line between a screen's sections, with room above and below. */
export function SectionDivider() {
  const colors = useColors();
  return (
    <View accessibilityElementsHidden importantForAccessibility='no-hide-descendants' style={{ paddingVertical: space.sm }}>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
    </View>
  );
}
