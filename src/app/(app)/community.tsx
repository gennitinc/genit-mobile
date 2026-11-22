import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Empty, LoadError, Loading, Page, SearchField } from '@/components/kit';
import { PullRefresh } from '@/components/pull-refresh';
import { communityItems, useCommunity } from '@/features/community/community-api';
import { CommunityGrid } from '@/features/community/community-grid';
import { space, useColors } from '@/lib/theme';

/** Every design the community has published, newest first, like the web gallery. */
export default function CommunityScreen() {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  // Search after typing pauses, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const feed = useCommunity(search);
  const items = communityItems(feed.data?.pages);

  const loadMore = () => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  };

  return (
    <Page title='Community' back={() => (router.canGoBack() ? router.back() : router.replace('/home'))}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
        refreshControl={<PullRefresh onRefresh={() => feed.refetch()} />}
        scrollEventThrottle={200}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 600) loadMore();
        }}
        contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.md }}
      >
        <SearchField value={query} onChange={setQuery} placeholder='Search designs' />
        {feed.isLoading ? (
          <Loading />
        ) : feed.isError && !items.length ? (
          <LoadError error={feed.error} onRetry={() => feed.refetch()} />
        ) : !items.length ? (
          <Empty icon='images-outline' title={search ? 'No designs match' : 'Nothing published yet'} message={search ? 'Try another word.' : undefined} />
        ) : (
          <CommunityGrid items={items} />
        )}
        {feed.isFetchingNextPage ? (
          <View style={{ paddingVertical: space.lg }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}
      </ScrollView>
    </Page>
  );
}
