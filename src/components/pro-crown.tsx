import { Icon } from '@/components/icon';
import { PRO_GOLD } from '@/lib/plan';

/** The gold crown that marks a Pro plugin or feature. */
export function ProCrown({ size = 14 }: { size?: number }) {
  return <Icon name='crown' size={size} color={PRO_GOLD} accessibilityLabel='Pro' />;
}
