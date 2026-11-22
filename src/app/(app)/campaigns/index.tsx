import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { PullRefresh } from '@/components/pull-refresh';
import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { ConfirmDrawer } from '@/components/drawer';
import { Card, Chip, ChipRow, Empty, IconButton, LoadError, Loading, Page, Pill, SearchField, Stat } from '@/components/kit';
import { campaignKeys, deleteCampaign, type GtmCampaign, listCampaigns, STATUS_TONE } from '@/features/campaigns/campaigns-api';
import { compactNumber, shortDate } from '@/lib/format';
import { openNewChat } from '@/features/chat/navigate';
import { space, useColors } from '@/lib/theme';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Drafts' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
];

export default function CampaignsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.trim());
  const [deleting, setDeleting] = useState<GtmCampaign | null>(null);

  const list = useInfiniteQuery({
    queryKey: campaignKeys.list(status, term),
    queryFn: ({ pageParam }) => listCampaigns(pageParam, status, term),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.hasNextPage ? last.pagination.page + 1 : undefined),
  });
  const campaigns = list.data?.pages.flatMap((page) => page.campaigns) ?? [];
  const summary = list.data?.pages[0]?.summary;

  const create = () => openNewChat('Help me create a new GTM campaign.');

  return (
    <Page title='Campaigns' back={() => router.back()} actions={<IconButton icon='add' label='New campaign' onPress={create} />}>
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        data={campaigns}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingBottom: space.xxl, gap: space.md }}
        refreshControl={<PullRefresh onRefresh={() => list.refetch()} />}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <View style={{ paddingHorizontal: space.page, gap: space.md }}>
              {summary ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  <Stat label='Running' value={summary.activeCampaigns} />
                  <Stat label='Drafts' value={summary.draftCampaigns} />
                  <Stat label='Attributed revenue' value={compactNumber(summary.pipelineValue)} />
                  <Stat label='Conversions' value={summary.conversions} />
                  <Stat label='Without a follow-up sequence' value={Math.max(0, summary.totalCampaigns - summary.sequencesReady)} />
                </View>
              ) : null}
              <SearchField value={search} onChange={setSearch} placeholder='Search campaigns' />
            </View>
            <ChipRow>
              {FILTERS.map((filter) => (
                <Chip key={filter.value} label={filter.label} active={status === filter.value} onPress={() => setStatus(filter.value)} />
              ))}
            </ChipRow>
          </View>
        }
        ListEmptyComponent={
          list.isLoading ? (
            <Loading />
          ) : list.isError ? (
            <LoadError error={list.error} onRetry={list.refetch} />
          ) : (
            <Empty
              icon='megaphone-outline'
              title={term ? 'No matches' : 'No campaigns yet'}
              message='Campaigns are planned with Genit’s AI, which opens in the browser.'
              action={{ label: 'New campaign', onPress: create }}
            />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : undefined}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: space.page }}>
            <Card onPress={() => router.push({ pathname: '/campaigns/[id]', params: { id: item._id } })}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={2} style={{ fontSize: 13, color: colors.textMuted }}>
                    {item.objective}
                  </Text>
                </View>
                <IconButton icon='trash-outline' label='Delete campaign' onPress={() => setDeleting(item)} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
                <Pill label={item.status} tone={STATUS_TONE[item.status]} />
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  {[item.channels.join(', '), `${item.conversions.length} conversion${item.conversions.length === 1 ? '' : 's'}`, shortDate(item.createdAt)].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Card>
          </View>
        )}
      />
      <ConfirmDrawer
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title='Delete campaign?'
        message={`“${deleting?.name ?? 'This campaign'}” is deleted along with its leads, recipients and scheduled outreach. This can't be undone.`}
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await deleteCampaign(deleting._id);
          await queryClient.invalidateQueries({ queryKey: campaignKeys.all });
        }}
      />
    </Page>
  );
}
