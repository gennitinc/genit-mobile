import { Icon } from '@/components/icon';
import { useTabBarSpace } from '@/components/glass-tab-bar';
import { PullRefresh } from '@/components/pull-refresh';
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { BrandLogo } from '@/components/brand-logo';
import { Empty, IconButton, LoadError, Loading, Page, Pill, SearchField, Segmented } from '@/components/kit';
import { Banner } from '@/components/ui';
import { useIntegrations } from '@/features/integrations/integrations-api';
import { type ComposerTarget, PostComposer } from '@/features/posts/post-composer';
import { PostDetailDrawer } from '@/features/posts/post-detail';
import {
  deletePost,
  deleteRemotePost,
  fetchConnections,
  fetchPosts,
  fetchRemotePosts,
  isVideo,
  metricsOf,
  postKeys,
  postMedia,
  type SocialCapability,
  type SocialPost,
} from '@/features/posts/posts-api';
import { compactNumber, dateTime, relativeTime } from '@/lib/format';
import { platformMeta, POST_PLATFORMS } from '@/lib/platforms';
import { radius, space, useColors } from '@/lib/theme';

type View_ = 'live' | 'scheduled' | 'drafts';
type DisplayPost = SocialPost & { remote?: boolean };

export default function PostsScreen() {
  const colors = useColors();
  const tabBarSpace = useTabBarSpace();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ compose?: string; campaignId?: string }>();
  const { active } = useIntegrations();

  const [view, setView] = useState<View_>('drafts');
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [composer, setComposer] = useState<ComposerTarget | null>(null);
  const [detail, setDetail] = useState<DisplayPost | null>(null);
  const [menuPost, setMenuPost] = useState<DisplayPost | null>(null);
  const [deleting, setDeleting] = useState<DisplayPost | null>(null);

  // Deep link from a campaign: /posts?compose=1&campaignId=<id>
  const deepLink = params.compose === '1' ? params.campaignId ?? '' : null;
  const [handledLink, setHandledLink] = useState<string | null>(null);
  if (deepLink !== null && deepLink !== handledLink) {
    setHandledLink(deepLink);
    setComposer({ mode: 'create', campaignId: deepLink || undefined });
  }
  useEffect(() => {
    if (params.compose === '1') router.setParams({ compose: undefined, campaignId: undefined });
  }, [params.compose]);

  const posts = useInfiniteQuery({
    queryKey: postKeys.list(),
    queryFn: ({ pageParam }) => fetchPosts(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.hasNextPage ? last.pagination.page + 1 : undefined),
  });

  const connections = useQuery({ queryKey: postKeys.connections, queryFn: fetchConnections });
  const connectionById = useMemo(
    () => new Map((connections.data ?? []).map((connection) => [connection._id, connection])),
    [connections.data]
  );
  const activeIds = useMemo(() => new Set(active.map((connection) => connection._id)), [active]);
  const liveConnections = (connections.data ?? []).filter((c) => c.capabilities.includes('listPosts'));

  const remote = useQueries({
    queries: liveConnections.map((connection) => ({
      queryKey: postKeys.remote(connection._id),
      queryFn: () => fetchRemotePosts(connection._id),
      enabled: view === 'live',
    })),
  });

  const workspace = useMemo(() => posts.data?.pages.flatMap((page) => page.posts) ?? [], [posts.data]);

  const live = useMemo(() => {
    const combined: DisplayPost[] = [
      ...remote.flatMap((query) => (query.data ?? []).map((post) => ({ ...post, remote: true }))),
      ...workspace.filter((post) => post.status === 'published' && post.integration && activeIds.has(String(post.integration))),
    ].filter((post) => !post.integration || activeIds.has(String(post.integration)));
    // The same post can come back from the platform and from Genit's own record.
    const seen = new Set<string>();
    return combined.filter((post) => {
      const key = post.externalId ? `${post.platform}:${post.integration}:${post.externalId}` : post._id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [remote, workspace, activeIds]);

  const failures = remote
    .map((query, index) => (query.isError ? { connection: liveConnections[index], error: query.error } : null))
    .filter((item) => item !== null);

  const scheduled = workspace.filter((post) => post.status === 'scheduled');
  const drafts = workspace.filter((post) => post.status !== 'published' && post.status !== 'scheduled');
  const source: DisplayPost[] = view === 'live' ? live : view === 'scheduled' ? scheduled : drafts;

  const needle = search.trim().toLowerCase();
  const visible = source.filter(
    (post) =>
      (platformFilter === 'all' || post.platform === platformFilter) &&
      (!needle ||
        post.title?.toLowerCase().includes(needle) ||
        post.content.toLowerCase().includes(needle) ||
        post.accountName?.toLowerCase().includes(needle))
  );

  const can = (post: DisplayPost | null, capability: SocialCapability) =>
    !!post?.integration && !!post.externalId && !!connectionById.get(String(post.integration))?.capabilities.includes(capability);
  const canEdit = (post: DisplayPost) => (!post.remote && post.status !== 'published') || can(post, 'updatePost');
  const canDelete = (post: DisplayPost) => !post.remote || can(post, 'deletePost');

  const remove = useMutation({
    mutationFn: async (post: DisplayPost) => {
      // Published posts are removed from the platform; drafts only exist in Genit.
      if (can(post, 'deletePost')) return deleteRemotePost(String(post.integration), post.externalId!);
      return deletePost(post._id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: postKeys.all }),
  });

  const refresh = () => Promise.all([posts.refetch(), connections.refetch(), ...remote.map((query) => query.refetch())]);

  const platformLabel = platformFilter === 'all' ? 'All platforms' : platformMeta(platformFilter).label;

  return (
    <Page
      title='Posts'
      actions={<IconButton icon='add' label='New post' onPress={() => setComposer({ mode: 'create' })} />}
    >
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        data={visible}
        keyExtractor={(post) => `${post._id}-${post.externalId ?? ''}`}
        contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: tabBarSpace, gap: space.md }}
        refreshControl={<PullRefresh onRefresh={refresh} />}
        onEndReached={() => posts.hasNextPage && !posts.isFetchingNextPage && posts.fetchNextPage()}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingBottom: space.sm }}>
            <Segmented<View_>
              value={view}
              onChange={setView}
              options={[
                { value: 'live', label: 'Live' },
                { value: 'scheduled', label: 'Scheduled', count: scheduled.length },
                { value: 'drafts', label: 'Drafts', count: drafts.length },
              ]}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <SearchField value={search} onChange={setSearch} placeholder='Search posts' />
              </View>
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={`Filter by platform: ${platformLabel}`}
                accessibilityState={{ selected: platformFilter !== 'all' }}
                onPress={() => setFilterOpen(true)}
                style={({ pressed }) => ({
                  width: 52,
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: platformFilter !== 'all' ? colors.primary : colors.border,
                  backgroundColor: platformFilter !== 'all' ? colors.selected : pressed ? colors.surfacePressed : colors.background,
                })}
              >
                <Icon name='filter' size={20} color={platformFilter !== 'all' ? colors.selectedText : colors.text} />
              </Pressable>
            </View>
            {view === 'live' && failures.length ? (
              <Banner
                message={`Couldn't load posts from ${failures
                  .map((failure) => failure.connection?.accountName ?? 'an account')
                  .join(', ')}. Pull down to try again.`}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          posts.isLoading ? (
            <Loading />
          ) : posts.isError ? (
            <LoadError error={posts.error} onRetry={posts.refetch} />
          ) : (
            <Empty
              icon='images-outline'
              title={view === 'live' ? 'No live posts' : view === 'scheduled' ? 'Nothing scheduled' : 'No drafts'}
              message={view === 'live' ? 'Posts you publish to connected accounts show up here.' : 'Create a post to get started.'}
              action={view === 'live' ? undefined : { label: 'New post', onPress: () => setComposer({ mode: 'create' }) }}
            />
          )
        }
        ListFooterComponent={posts.isFetchingNextPage ? <Loading /> : undefined}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() => (item.status === 'published' || item.remote ? setDetail(item) : canEdit(item) && setComposer({ mode: 'edit', post: item, remote: false }))}
            onMore={canEdit(item) || canDelete(item) ? () => setMenuPost(item) : undefined}
          />
        )}
      />

      <OptionsDrawer
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title='Platform'
        value={platformFilter}
        options={[
          { value: 'all', label: 'All platforms', icon: <Icon name='apps' size={22} color={colors.textMuted} /> },
          ...POST_PLATFORMS.map((platform) => ({
            value: platform,
            label: platformMeta(platform).label,
            // Softened a touch so the list reads calmly.
            icon: (
              <View style={{ opacity: 0.85 }}>
                <BrandLogo platform={platform} size={22} />
              </View>
            ),
          })),
        ]}
        onSelect={setPlatformFilter}
      />

      <OptionsDrawer
        visible={!!menuPost}
        onClose={() => setMenuPost(null)}
        title='Post'
        options={[
          ...(menuPost && canEdit(menuPost) ? [{ value: 'edit' as const, label: 'Edit' }] : []),
          ...(menuPost && (menuPost.remote || menuPost.status === 'published') ? [{ value: 'details' as const, label: 'Analytics and comments' }] : []),
          ...(menuPost && canDelete(menuPost) ? [{ value: 'delete' as const, label: 'Delete' }] : []),
        ]}
        onSelect={(action) => {
          const post = menuPost;
          if (!post) return;
          if (action === 'edit') setComposer({ mode: 'edit', post, remote: !!post.remote || post.status === 'published' });
          if (action === 'details') setDetail(post);
          if (action === 'delete') setDeleting(post);
        }}
      />

      <ConfirmDrawer
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title='Delete post?'
        message={
          deleting && can(deleting, 'deletePost')
            ? `This removes the post from ${platformMeta(deleting.platform).label} too. It can't be undone.`
            : "This deletes the post from Genit. It can't be undone."
        }
        confirmLabel='Delete'
        destructive
        onConfirm={() => deleting && remove.mutateAsync(deleting)}
      />

      <PostComposer target={composer} onClose={() => setComposer(null)} />
      <PostDetailDrawer
        post={detail}
        capabilities={detail?.integration ? (connectionById.get(String(detail.integration))?.capabilities ?? []) : []}
        onClose={() => setDetail(null)}
      />
    </Page>
  );
}

const STATUS_TONE = { draft: 'neutral', scheduled: 'primary', published: 'success', failed: 'danger' } as const;

function PostCard({ post, onPress, onMore }: { post: DisplayPost; onPress: () => void; onMore?: () => void }) {
  const colors = useColors();
  const meta = platformMeta(post.platform);
  const media = postMedia(post)[0];
  const metrics = metricsOf(post);
  const when =
    post.status === 'scheduled'
      ? `Scheduled ${dateTime(post.scheduledFor)}`
      : post.publishedAt
        ? relativeTime(post.publishedAt)
        : `Edited ${relativeTime(post.updatedAt)}`;

  return (
    <Pressable
      accessibilityRole='button'
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
      })}
    >
      {media ? (
        isVideo(media) ? (
          <View style={{ height: 160, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed }}>
            <Icon name='play-circle' size={44} color={colors.textMuted} />
          </View>
        ) : (
          <Image source={{ uri: media.url }} style={{ height: 200 }} contentFit='cover' />
        )
      ) : null}
      <View style={{ padding: space.lg, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <BrandLogo platform={post.platform} size={18} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.textMuted }}>
            {post.accountName ? `@${post.accountName}` : meta.label} · {when}
          </Text>
          <Pill label={post.status} tone={STATUS_TONE[post.status]} />
          {onMore ? <IconButton icon='ellipsis-horizontal' label='Post actions' onPress={onMore} /> : null}
        </View>
        {post.title ? (
          <Text numberOfLines={2} style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
            {post.title}
          </Text>
        ) : null}
        {post.content ? (
          <Text numberOfLines={3} style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>
            {post.content}
          </Text>
        ) : null}
        {post.status === 'failed' && post.metadata?.failureReason ? (
          <Text style={{ fontSize: 13, color: colors.danger }}>{String(post.metadata.failureReason)}</Text>
        ) : null}
        {post.status === 'published' || post.remote ? (
          <View style={{ flexDirection: 'row', gap: space.lg }}>
            <Metric icon='eye-outline' value={metrics.views || metrics.impressions} />
            <Metric icon='heart-outline' value={metrics.likes} />
            <Metric icon='chatbubble-outline' value={metrics.comments} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function Metric({ icon, value }: { icon: 'eye-outline' | 'heart-outline' | 'chatbubble-outline'; value: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={14} color={colors.textMuted} />
      <Text style={{ fontSize: 13, color: colors.textMuted }}>{compactNumber(value)}</Text>
    </View>
  );
}
