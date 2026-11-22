import { Icon } from '@/components/icon';
import { PullRefresh } from '@/components/pull-refresh';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { Empty, IconButton, LoadError, Loading, Page, Pill, SearchField } from '@/components/kit';
import { Banner, Button } from '@/components/ui';
import { archiveChat, type ChatProject, deleteChat, historyKey, kindLabel, listChats, preview } from '@/features/history/history-api';
import { errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { openChatById, openNewChat } from '@/features/chat/navigate';
import { radius, space, useColors } from '@/lib/theme';

export default function HistoryScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.trim());
  const [menu, setMenu] = useState<ChatProject | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const list = useInfiniteQuery({
    queryKey: historyKey(term),
    queryFn: ({ pageParam }) => listChats(pageParam, term),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.hasNextPage ? last.pagination.currentPage + 1 : undefined),
  });
  const projects = list.data?.pages.flatMap((page) => page.projects) ?? [];
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['history'] });

  const archive = useMutation({
    mutationFn: archiveChat,
    onSuccess: () => {
      setNotice('Archived.');
      refresh();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const removeMany = async (ids: string[]) => {
    // Delete what can be deleted and report the rest, like the web page does.
    const results = await Promise.allSettled(ids.map(deleteChat));
    const failed = results.filter((result) => result.status === 'rejected').length;
    setSelected(new Set());
    setSelecting(false);
    await refresh();
    if (failed) throw new Error(`${failed} of ${ids.length} couldn't be deleted. Please try again.`);
    setNotice(`Deleted ${ids.length} conversation${ids.length === 1 ? '' : 's'}.`);
  };

  const open = (project: ChatProject) => openChatById(project._id);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Page
      title='History'
      subtitle='Your chats with Genit'
      back={() => router.back()}
      actions={
        <IconButton
          icon='create-outline'
          label='New chat'
          onPress={() => openNewChat()}
        />
      }
    >
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        data={projects}
        keyExtractor={(item) => item._id}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={<PullRefresh onRefresh={() => list.refetch()} />}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps='handled'
        ListHeaderComponent={
          <View style={{ paddingHorizontal: space.page, paddingBottom: space.sm, gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <SearchField value={search} onChange={setSearch} placeholder='Search by title or prompt' />
              </View>
              {projects.length ? (
                <Pressable
                  accessibilityRole='button'
                  accessibilityLabel={selecting ? 'Done selecting' : 'Select chats'}
                  onPress={() => (selecting ? (setSelecting(false), setSelected(new Set())) : setSelecting(true))}
                  style={({ pressed }) => ({
                    width: 52,
                    height: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: selecting ? colors.primary : colors.border,
                    backgroundColor: selecting ? colors.selected : pressed ? colors.surfacePressed : colors.background,
                  })}
                >
                  <Icon name={selecting ? 'close' : 'checkbox'} size={20} color={selecting ? colors.selectedText : colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <Banner tone='success' message={notice} />
            <Banner message={error} />
            {projects.length && selecting ? (
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button
                    title={selected.size === projects.length ? 'Clear' : 'Select all'}
                    variant='secondary'
                    small
                    flex
                    onPress={() => setSelected(selected.size === projects.length ? new Set() : new Set(projects.map((p) => p._id)))}
                  />
                  <Button
                    title={selected.size ? `Delete ${selected.size}` : 'Delete'}
                    variant='danger'
                    small
                    flex
                    disabled={!selected.size}
                    onPress={() => setDeleting([...selected])}
                  />
                </View>
            ) : null}
          </View>
        }
        // A hairline between chats, almost invisible.
        ItemSeparatorComponent={() => <View style={{ height: 1, marginHorizontal: space.page, backgroundColor: colors.border, opacity: 0.3 }} />}
        ListEmptyComponent={
          list.isLoading ? (
            <Loading />
          ) : list.isError ? (
            <LoadError error={list.error} onRetry={list.refetch} />
          ) : (
            <Empty icon='chatbubbles-outline' title={term ? 'No results found' : 'No conversations yet'} message={term ? undefined : 'Start a chat with Genit to see it here.'} />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Loading /> : undefined}
        renderItem={({ item }) => {
          const isSelected = selected.has(item._id);
          return (
            <Pressable
              accessibilityRole='button'
              accessibilityState={{ selected: isSelected }}
              accessibilityHint={selecting ? undefined : 'Opens the chat. Long press for more.'}
              onPress={() => (selecting ? toggle(item._id) : open(item))}
              onLongPress={() => (selecting ? toggle(item._id) : setMenu(item))}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingHorizontal: space.page,
                paddingVertical: space.md,
                backgroundColor: pressed || isSelected ? colors.surfacePressed : 'transparent',
              })}
            >
              {selecting ? (
                <Icon name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={isSelected ? colors.primary : colors.borderStrong} />
              ) : null}
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text }}>
                    {item.title || 'Untitled chat'}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textFaint }}>{relativeTime(item.updatedAt)}</Text>
                </View>
                {preview(item) ? (
                  <Text numberOfLines={2} style={{ fontSize: 14, color: colors.textMuted }}>
                    {preview(item)}
                  </Text>
                ) : null}
                {kindLabel(item) !== 'Chat' ? <Pill label={kindLabel(item)} /> : null}
              </View>
              {!selecting ? <IconButton icon='ellipsis-horizontal' color={colors.textMuted} label={`Actions for ${item.title}`} onPress={() => setMenu(item)} /> : null}
            </Pressable>
          );
        }}
      />

      <OptionsDrawer
        visible={!!menu}
        onClose={() => setMenu(null)}
        title={menu?.title || 'Chat'}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'archive', label: 'Archive' },
          { value: 'delete', label: 'Delete' },
        ]}
        onSelect={(action) => {
          const project = menu;
          if (!project) return;
          setNotice('');
          setError('');
          if (action === 'open') open(project);
          if (action === 'archive') archive.mutate(project._id);
          if (action === 'delete') setDeleting([project._id]);
        }}
      />

      <ConfirmDrawer
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={deleting && deleting.length > 1 ? `Delete ${deleting.length} conversations?` : 'Delete conversation?'}
        message="The chat and everything in it is deleted. This can't be undone."
        confirmLabel='Delete'
        destructive
        onConfirm={() => deleting && removeMany(deleting)}
      />
    </Page>
  );
}
