import * as Haptics from 'expo-haptics';

// Feedback is a nicety: a device without a haptic engine must never break an action.
const quietly = (run: () => Promise<void>) => void run().catch(() => undefined);

export const haptic = {
  /** A selection changed (entering select mode, toggling a row). */
  select: () => quietly(() => Haptics.selectionAsync()),
  /** A swipe action crossed its threshold. */
  impact: () => quietly(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
