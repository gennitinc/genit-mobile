import { Icon } from '@/components/icon';
import { ConversationListSkeleton } from '@/features/inbox/chat-skeleton';
import { ProCrown } from '@/components/pro-crown';
import { useIsFreePlan } from '@/lib/plan';
import { useTabBarSpace } from '@/components/glass-tab-bar';
import { PullRefresh } from '@/components/pull-refresh';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { BrandLogo } from '@/components/brand-logo';
import { Chip, ChipRow, Empty, IconButton, LoadError, Page, SearchField } from '@/components/kit';
import { Banner, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { ConversationActions } from '@/features/inbox/conversation-actions';
import { ConversationRow, type SwipeAction } from '@/features/inbox/conversation-row';
import { haptic } from '@/features/inbox/haptics';
import {
  accountLabel,
  HISTORY_PLATFORMS,
  historyCursor,
  INBOX_PLATFORMS,
  inboxPlatform,
  isNoInboxNote,
  SYNC_PLATFORMS,
  syncChannelLabel,
  syncedRecently,
  type SyncIssue,
  syncIssue,
  type SyncIssueKind,
} from '@/features/inbox/inbox-accounts';
import { SyncIssues } from '@/features/inbox/sync-issues';
import {
  deleteConversation,
  EMAIL_FOLDERS,
  type EmailFolder,
  fetchConversations,
  type InboxConversation,
  type InboxFilters,
  type InboxSyncResult,
  inboxKeys,
  isEmail,
  markAllRead,
  markRead,
  syncInbox,
  updateConversation,
} from '@/features/inbox/inbox-api';
import { NewConversationDrawer } from '@/features/inbox/new-conversation-drawer';
import { useInboxRealtime } from '@/features/inbox/use-inbox-realtime';
import { type IntegrationConnection, useIntegrations } from '@/features/integrations/integrations-api';
import { currentOrganization } from '@/features/orgs/orgs-api';
import { errorMessage } from '@/lib/api';
import { platformMeta } from '@/lib/platforms';
import { radius, space, useColors } from '@/lib/theme';

type Status = NonNullable<InboxFilters['status']>;
type Sort = NonNullable<InboxFilters['sort']>;
type Bulk = 'read' | 'open' | 'resolved' | 'snoozed' | 'delete';

const STATUS: { value: Status; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'snoozed', label: 'Snoozed' },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'unread', label: 'Unread first' },
];

/** Organizations already synced on first open this app session (the web does this once per page load). */
const syncedOrgs = new Set<string>();

/** Opening the inbox again soon after a sync doesn't sync again (and run into provider rate limits). */
const AUTO_SYNC_GAP_MS = 5 * 60_000;

function syncSummary(results: InboxSyncResult[], continueHistory: boolean, accounts: IntegrationConnection[]) {
  const label = (result: InboxSyncResult) => syncChannelLabel(result, accounts.find((item) => item._id === result.integrationId));
  const threads = results.reduce((total, result) => total + result.threadsProcessed, 0);
  const more = results.some((result) => result.nextPageToken);
  const issues: SyncIssue[] = [];
  for (const result of results) {
    const raw = result.error || (result.warning && !isNoInboxNote(result.warning) ? result.warning : '');
    if (!raw) continue;
    const issue = syncIssue(raw, label(result));
    issues.push({
      integrationId: result.integrationId,
      kind: (result.errorKind as SyncIssueKind | undefined) ?? issue.kind,
      // Newer servers already send a plain sentence.
      message: result.errorKind ? raw : issue.message,
    });
  }
  const failed = results.filter((result) => result.error).length;
  const notice =
    failed === results.length
      ? ''
      : continueHistory
        ? `${threads} older conversation${threads === 1 ? '' : 's'} imported. ${more ? 'Scroll down to keep going.' : 'History is up to date.'}`
        : `Synced: ${threads} conversation${threads === 1 ? '' : 's'} checked.`;
  return { notice, issues };
}

export default function InboxScreen() {
  const colors = useColors();
  const tabBarSpace = useTabBarSpace();
  const freePlan = useIsFreePlan();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const org = currentOrganization(user);
  const { active } = useIntegrations();
  useInboxRealtime(org?._id);

  const accounts = active.filter((account) => INBOX_PLATFORMS.has(inboxPlatform(account)));
  const [accountId, setAccountId] = useState('all');
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [folder, setFolder] = useState<EmailFolder>('inbox');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [picker, setPicker] = useState<'account' | 'sort' | 'folder' | 'menu' | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [actionsFor, setActionsFor] = useState<InboxConversation | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [syncIssues, setSyncIssues] = useState<SyncIssue[]>([]);

  const account = accounts.find((item) => item._id === accountId);
  const filters: InboxFilters = {
    integrationId: account?._id,
    platform: account && account.platform !== 'composio' ? inboxPlatform(account) : undefined,
    status,
    search: deferredSearch || undefined,
    sort,
    folder: account && isEmail(inboxPlatform(account)) ? folder : undefined,
  };

  const conversations = useInfiniteQuery({
    queryKey: inboxKeys.conversations(filters),
    queryFn: ({ pageParam }) => fetchConversations(filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    refetchInterval: 15_000,
  });
  const list = conversations.data?.pages.flatMap((page) => page.conversations) ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: inboxKeys.all });

  const syncable = accounts.filter((item) => SYNC_PLATFORMS.has(item.platform));
  const withHistory = syncable.filter((item) => HISTORY_PLATFORMS.has(inboxPlatform(item)));

  const sync = useMutation({
    mutationFn: ({ continueHistory }: { continueHistory: boolean; quiet?: boolean }) => {
      // Only scope to the chosen account when that account can do what was asked.
      const scoped = account && (continueHistory ? withHistory : syncable).some((item) => item._id === account._id) ? account : undefined;
      return syncInbox({ integrationId: scoped?._id, platform: scoped?.platform, continueHistory });
    },
    onSuccess: (results, { continueHistory, quiet }) => {
      const summary = syncSummary(results, continueHistory, active);
      // Automatic syncs only raise what you can fix (a reconnect); passing
      // provider hiccups are reported when you sync yourself.
      setSyncIssues(quiet ? summary.issues.filter((issue) => issue.kind === 'reconnect') : summary.issues);
      if (!quiet) setNotice(summary.notice);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (caught, { quiet }) => {
      if (!quiet) setError(errorMessage(caught));
    },
  });

  // Pull fresh messages from every connected channel the first time the inbox opens.
  const orgId = org?._id;
  useEffect(() => {
    if (!orgId || !syncable.length || syncedOrgs.has(orgId)) return;
    syncedOrgs.add(orgId);
    if (syncedRecently(syncable, AUTO_SYNC_GAP_MS)) return;
    sync.mutate({ continueHistory: false, quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, syncable.length]);

  // At the end of the list, import older provider history (once per cursor) like the web does.
  const cursorKey = (account ? withHistory.filter((item) => item._id === account._id) : withHistory)
    .map((item) => historyCursor(item))
    .filter(Boolean)
    .join('|');
  const requestedCursor = useRef('');
  const reachedEnd = () => {
    if (conversations.isFetchingNextPage || sync.isPending) return;
    if (conversations.hasNextPage) return void conversations.fetchNextPage();
    // Older history is a Pro import, so free plans stop at what's already synced.
    if (!freePlan && cursorKey && requestedCursor.current !== cursorKey) {
      requestedCursor.current = cursorKey;
      sync.mutate({ continueHistory: true, quiet: true });
    }
  };

  const onSwipeAction = async (conversation: InboxConversation, action: SwipeAction) => {
    if (action === 'more') {
      setActionsFor(conversation);
      return setActionsOpen(true);
    }
    setError('');
    try {
      if (action === 'read') await markRead(conversation._id);
      if (action === 'pin') await updateConversation(conversation._id, { isPinned: !conversation.isPinned });
      if (action === 'resolve' || action === 'reopen') await updateConversation(conversation._id, { status: action === 'resolve' ? 'resolved' : 'open' });
      haptic.success();
    } catch (caught) {
      haptic.error();
      setError(errorMessage(caught));
    }
    invalidate();
  };

  const readAll = useMutation({ mutationFn: markAllRead, onSuccess: invalidate, onError: (caught) => setError(errorMessage(caught)) });

  const bulk = useMutation({
    mutationFn: async (action: Bulk) => {
      for (const id of selected) {
        if (action === 'read') await markRead(id);
        else if (action === 'delete') await deleteConversation(id);
        else await updateConversation(id, { status: action });
      }
    },
    onSuccess: () => haptic.success(),
    onSettled: () => {
      setSelected(new Set());
      setSelecting(false);
      invalidate();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const unread = list.reduce((total, conversation) => total + conversation.unreadCount, 0);

  return (
    <Page
      title='Inbox'
      subtitle={unread ? `${unread} unread` : 'All caught up'}
      actions={
        <>
          <IconButton icon='create-outline' label='New conversation' onPress={() => setComposeOpen(true)} />
          <IconButton icon='ellipsis-horizontal' label='Inbox actions' onPress={() => setPicker('menu')} />
        </>
      }
    >
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        data={list}
        keyExtractor={(item) => item._id}
        onEndReached={reachedEnd}
        onEndReachedThreshold={0.5}
        refreshControl={
          <PullRefresh
            onRefresh={() => {
              // Show what's stored now; the channel sync lands over the socket when it finishes.
              if (syncable.length && !sync.isPending) sync.mutate({ continueHistory: false, quiet: true });
              return conversations.refetch();
            }}
          />
        }
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingBottom: space.sm }}>
            <View style={{ paddingHorizontal: space.page, gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <SearchField value={search} onChange={setSearch} placeholder='Search people or messages' />
                </View>
                <Pressable
                  accessibilityRole='button'
                  accessibilityLabel={`Account: ${account ? accountLabel(account) : 'All accounts'}`}
                  accessibilityState={{ selected: !!account }}
                  onPress={() => setPicker('account')}
                  style={({ pressed }) => ({
                    width: 52,
                    height: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: account ? colors.primary : colors.border,
                    backgroundColor: account ? colors.selected : pressed ? colors.surfacePressed : colors.background,
                  })}
                >
                  {account ? <BrandLogo platform={inboxPlatform(account)} size={24} /> : <Icon name='filter' size={20} color={colors.text} />}
                </Pressable>
              </View>
              <Banner tone='success' message={notice} />
              <Banner message={error} />
              <SyncIssues issues={syncIssues} onDismiss={() => setSyncIssues([])} />
            </View>
            <ChipRow>
              {STATUS.map((option) => (
                <Chip key={option.value} label={option.label} active={status === option.value} onPress={() => setStatus(option.value)} />
              ))}
              {account?.isPrimary ? <Chip label='Primary' active onPress={() => setPicker('account')} /> : null}
              <Chip label={SORTS.find((s) => s.value === sort)!.label} onPress={() => setPicker('sort')} icon={<Icon name='swap-vertical' size={14} color={colors.textMuted} />} />
              {account && isEmail(inboxPlatform(account)) ? (
                <Chip label={EMAIL_FOLDERS.find((f) => f.value === folder)!.label} onPress={() => setPicker('folder')} icon={<Icon name='folder-outline' size={14} color={colors.textMuted} />} />
              ) : null}
            </ChipRow>
            {selecting ? (
              <View style={{ paddingHorizontal: space.page, gap: space.sm }}>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <Button
                    title={selected.size === list.length ? 'Clear' : 'Select all'}
                    variant='secondary'
                    small
                    flex
                    onPress={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((c) => c._id)))}
                  />
                  <Button title='Done' variant='ghost' small onPress={() => (setSelecting(false), setSelected(new Set()))} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {(['read', 'open', 'resolved', 'snoozed'] as const).map((action) => (
                    <Button
                      key={action}
                      title={{ read: 'Mark read', open: 'Open', resolved: 'Resolve', snoozed: 'Snooze' }[action]}
                      variant='secondary'
                      small
                      disabled={!selected.size || bulk.isPending}
                      onPress={() => bulk.mutate(action)}
                    />
                  ))}
                  <Button title='Delete' variant='danger' small disabled={!selected.size || bulk.isPending} onPress={() => setConfirmBulkDelete(true)} />
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          conversations.isLoading ? (
            <ConversationListSkeleton />
          ) : conversations.isError ? (
            <LoadError error={conversations.error} onRetry={conversations.refetch} />
          ) : accounts.length === 0 ? (
            <Empty
              icon='chatbubbles-outline'
              title='Connect a channel'
              message='Bring Instagram, WhatsApp, Gmail and more into one inbox.'
              action={{ label: 'Connect channels', onPress: () => router.push('/plugins') }}
            />
          ) : (
            <Empty icon='mail-open-outline' title='No conversations' message={search ? 'Nothing matches your search.' : 'New messages will show up here.'} />
          )
        }
        ListFooterComponent={conversations.isFetchingNextPage || (sync.isPending && list.length > 0) ? <ConversationListSkeleton rows={2} /> : undefined}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            selecting={selecting}
            selected={selected.has(item._id)}
            onPress={() => (selecting ? toggle(item._id) : router.push({ pathname: '/inbox/[id]', params: { id: item._id } }))}
            onLongPress={() => {
              haptic.select();
              setSelecting(true);
              toggle(item._id);
            }}
            onSwipeAction={(action) => void onSwipeAction(item, action)}
          />
        )}
      />

      <OptionsDrawer
        visible={picker === 'account'}
        onClose={() => setPicker(null)}
        title='Account'
        value={accountId}
        options={[
          { value: 'all', label: 'All accounts' },
          ...accounts.map((item) => ({
            value: item._id,
            label: accountLabel(item),
            description: [platformMeta(inboxPlatform(item)).label, item.isPrimary ? 'Primary' : null].filter(Boolean).join(' · '),
            icon: <BrandLogo platform={inboxPlatform(item)} size={24} />,
          })),
        ]}
        onSelect={setAccountId}
      />
      <OptionsDrawer visible={picker === 'sort'} onClose={() => setPicker(null)} title='Sort' value={sort} options={SORTS} onSelect={setSort} />
      <OptionsDrawer visible={picker === 'folder'} onClose={() => setPicker(null)} title='Folder' value={folder} options={EMAIL_FOLDERS} onSelect={setFolder} />
      <OptionsDrawer
        visible={picker === 'menu'}
        onClose={() => setPicker(null)}
        title='Inbox'
        options={[
          // A sync can take a couple of minutes, so the menu stays usable and says it's running.
          ...(syncable.length
            ? [
                {
                  value: 'sync',
                  label: sync.isPending ? 'Syncing…' : 'Sync connected channels',
                  description: sync.isPending ? 'Your channels are syncing now' : account ? accountLabel(account) : 'All accounts',
                },
              ]
            : []),
          ...(withHistory.length && !sync.isPending
            ? [
                {
                  value: 'history',
                  label: 'Import older history',
                  // A Pro feature: free plans keep syncing recent messages.
                  description: freePlan ? 'Pro · Pull earlier messages from your channels' : 'Pull earlier messages where the channel allows it',
                  icon: freePlan ? <ProCrown size={20} /> : undefined,
                },
              ]
            : []),
          ...(unread ? [{ value: 'readAll', label: 'Mark all as read' }] : []),
          { value: 'select', label: 'Select conversations' },
          { value: 'channels', label: 'Manage channels' },
        ]}
        onSelect={(action) => {
          setNotice('');
          if (action === 'sync' && !sync.isPending) sync.mutate({ continueHistory: false });
          if (action === 'history') {
            if (freePlan) router.push('/billing');
            else sync.mutate({ continueHistory: true });
          }
          if (action === 'readAll') readAll.mutate();
          if (action === 'select') setSelecting(true);
          if (action === 'channels') router.push('/plugins');
        }}
      />

      <ConfirmDrawer
        visible={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        title={`Delete ${selected.size} conversation${selected.size === 1 ? '' : 's'}?`}
        message="They'll be removed from Genit's inbox. This can't be undone."
        confirmLabel='Delete'
        destructive
        onConfirm={() => bulk.mutateAsync('delete')}
      />

      {actionsFor ? (
        <ConversationActions
          conversation={list.find((item) => item._id === actionsFor._id) ?? actionsFor}
          visible={actionsOpen}
          onClose={() => setActionsOpen(false)}
          onError={setError}
        />
      ) : null}

      <NewConversationDrawer
        visible={composeOpen}
        onClose={() => setComposeOpen(false)}
        accounts={accounts}
        onCreated={(conversation) => router.push({ pathname: '/inbox/[id]', params: { id: conversation._id } })}
      />
    </Page>
  );
}
