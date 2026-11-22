import { useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { useColors } from '@/lib/theme';

type PullRefreshProps = Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & {
  onRefresh: () => unknown;
};

/**
 * Pull-to-refresh whose spinner shows only while the user's own pull is loading.
 * Tying it to a query's background refetches made the spinner appear unasked
 * and stick at the top of the screen on iOS.
 */
export function PullRefresh({ onRefresh, ...rest }: PullRefreshProps) {
  const colors = useColors();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <RefreshControl
      tintColor={colors.primary}
      {...rest}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }}
    />
  );
}
