import { Icon } from '@/components/icon';
import { PullRefresh } from '@/components/pull-refresh';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { ConfirmDrawer } from '@/components/drawer';
import { Card, Empty, IconButton, LoadError, Loading, Page, Pill, SearchField, SectionTitle, Toggle } from '@/components/kit';
import { Banner, Button } from '@/components/ui';
import {
  type AutomationProject,
  automationKeys,
  deleteAutomation,
  getAutomation,
  isEnabled,
  listAutomations,
  pipelineSteps,
  setEnabled,
  TEMPLATES,
} from '@/features/automation/automation-api';
import { errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { openChatById, openNewChat } from '@/features/chat/navigate';
import { space, useColors } from '@/lib/theme';

export default function AutomationScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.trim());
  const [deleting, setDeleting] = useState<AutomationProject | null>(null);

  const list = useInfiniteQuery({
    queryKey: automationKeys.list(term),
    queryFn: ({ pageParam }) => listAutomations(pageParam, term),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.hasNextPage ? last.pagination.currentPage + 1 : undefined),
  });
  const projects = list.data?.pages.flatMap((page) => page.projects) ?? [];
  const total = list.data?.pages[0]?.pagination.totalCount ?? 0;

  return (
    <Page
      title='Automations'
      subtitle={total ? `${total} automation${total === 1 ? '' : 's'}` : undefined}
      back={() => router.back()}
      actions={
        <IconButton
          icon='add'
          label='New automation'
          onPress={() => openNewChat('Help me create a new automation', 'automation')}
        />
      }
    >
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        data={projects}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={<PullRefresh onRefresh={() => list.refetch()} />}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ gap: space.md }}>
            <SearchField value={search} onChange={setSearch} placeholder='Search automations' />
            <Text style={{ fontSize: 13, color: colors.textMuted }}>
              Automations are built with Genit’s AI chat, which opens in the browser. You can switch them on or off here.
            </Text>
          </View>
        }
        ListEmptyComponent={
          list.isLoading ? (
            <Loading />
          ) : list.isError ? (
            <LoadError error={list.error} onRetry={list.refetch} />
          ) : (
            <Empty icon='git-network-outline' title={term ? 'No matches' : 'No automations yet'} message='Start from a template below or describe one to Genit.' />
          )
        }
        renderItem={({ item }) => (
          <AutomationCard
            project={item}
            onConfigure={() => openChatById(item._id, 'automation')}
            onDelete={() => setDeleting(item)}
          />
        )}
        ListFooterComponent={
          <View style={{ gap: space.md, paddingTop: space.lg }}>
            {list.isFetchingNextPage ? <Loading /> : null}
            <SectionTitle title='Templates' />
            {TEMPLATES.map((template) => (
              <Card key={template.title} onPress={() => openNewChat(template.prompt, 'automation')}>
                <Pill label={template.badge} tone='primary' />
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{template.title}</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textMuted }}>{template.description}</Text>
              </Card>
            ))}
          </View>
        }
      />

      <ConfirmDrawer
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title='Delete automation?'
        message={`“${deleting?.title ?? 'This automation'}” stops running and is deleted. This can't be undone.`}
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await deleteAutomation(deleting._id);
          await queryClient.invalidateQueries({ queryKey: ['automations'] });
        }}
      />
    </Page>
  );
}

function AutomationCard({ project, onConfigure, onDelete }: { project: AutomationProject; onConfigure: () => void; onDelete: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const document = useQuery({ queryKey: automationKeys.document(project._id), queryFn: () => getAutomation(project._id) });
  const enabled = document.data ? isEnabled(document.data.data) : project.status !== 'paused';

  const toggle = useMutation({
    mutationFn: (next: boolean) => setEnabled(project._id, next),
    onSettled: () => queryClient.invalidateQueries({ queryKey: automationKeys.document(project._id) }),
  });
  const shown = toggle.isPending && toggle.variables !== undefined ? toggle.variables : enabled;
  const steps = pipelineSteps(document.data?.data);

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
            {project.title}
          </Text>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>Updated {relativeTime(project.updatedAt)}</Text>
        </View>
        <IconButton icon='trash-outline' label='Delete automation' onPress={onDelete} />
      </View>
      {steps.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {steps.map((step, index) => (
            <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {index > 0 ? <Icon name='arrow-forward' size={12} color={colors.textFaint} /> : null}
              <Pill label={step} />
            </View>
          ))}
        </View>
      ) : null}
      {toggle.isError ? <Banner message={errorMessage(toggle.error)} /> : null}
      <Toggle label={shown ? 'Active' : 'Paused'} value={shown} disabled={toggle.isPending || document.isLoading} onChange={(next) => toggle.mutate(next)} />
      <Button title='Configure' variant='secondary' small onPress={onConfigure} />
    </Card>
  );
}
