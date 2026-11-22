import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BarList } from '@/components/charts';
import { Drawer } from '@/components/drawer';
import { Avatar, Empty, Loading, Segmented } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { platformMeta } from '@/lib/platforms';
import { space, useColors } from '@/lib/theme';

import {
  createComment,
  fetchAnalytics,
  fetchComments,
  metricsOf,
  replyToComment,
  type SocialCapability,
  type SocialComment,
  type SocialPost,
} from './posts-api';

type Tab = 'analytics' | 'comments';

export function PostDetailDrawer({
  post,
  capabilities,
  onClose,
}: {
  post: SocialPost | null;
  capabilities: SocialCapability[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('analytics');
  const integrationId = post?.integration ? String(post.integration) : '';
  const externalId = post?.externalId ?? '';
  const hasAnalytics = capabilities.includes('analytics');
  const hasComments = capabilities.includes('listComments');

  const analytics = useQuery({
    queryKey: ['social-posts', 'analytics', integrationId, externalId],
    queryFn: () => fetchAnalytics(integrationId, externalId),
    enabled: !!post && hasAnalytics && tab === 'analytics',
  });

  const metrics = metricsOf({ metrics: { ...post?.metrics, ...analytics.data } });

  return (
    <Drawer
      visible={!!post}
      onClose={onClose}
      title='Post details'
      tall
      footer={
        post?.permalink ? (
          <Button title='View live post' variant='secondary' onPress={() => WebBrowser.openBrowserAsync(post.permalink!)} />
        ) : undefined
      }
    >
      {post ? <PostSummary post={post} /> : null}
      {hasComments ? (
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'analytics', label: 'Analytics' },
            { value: 'comments', label: 'Comments' },
          ]}
        />
      ) : null}
      {tab === 'analytics' ? (
        analytics.isLoading ? (
          <Loading />
        ) : (
          <>
            {analytics.isError ? <Banner message={errorMessage(analytics.error)} /> : null}
            <BarList
              items={[
                { label: 'Impressions', value: metrics.impressions },
                { label: 'Views', value: metrics.views },
                { label: 'Likes', value: metrics.likes },
                { label: 'Comments', value: metrics.comments },
                { label: 'Shares', value: metrics.shares },
                { label: 'Clicks', value: metrics.clicks },
              ]}
            />
            {hasAnalytics ? (
              <Button title='Refresh' variant='ghost' small loading={analytics.isFetching} onPress={() => analytics.refetch()} />
            ) : null}
          </>
        )
      ) : post ? (
        <Comments integrationId={integrationId} externalId={externalId} />
      ) : null}
    </Drawer>
  );
}

function PostSummary({ post }: { post: SocialPost }) {
  const colors = useColors();
  const meta = platformMeta(post.platform);
  return (
    <View style={{ gap: space.xs }}>
      <Text style={{ fontSize: 13, color: colors.textMuted }}>
        {meta.label}
        {post.accountName ? ` · @${post.accountName}` : ''}
        {post.publishedAt ? ` · ${relativeTime(post.publishedAt)}` : ''}
      </Text>
      {post.title ? <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{post.title}</Text> : null}
      <Text numberOfLines={4} style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>
        {post.content}
      </Text>
    </View>
  );
}

function Comments({ integrationId, externalId }: { integrationId: string; externalId: string }) {
  const queryClient = useQueryClient();
  const key = ['social-posts', 'comments', integrationId, externalId];
  const comments = useQuery({ queryKey: key, queryFn: () => fetchComments(integrationId, externalId) });
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<SocialComment | null>(null);

  const send = useMutation({
    mutationFn: () =>
      replyTo
        ? replyToComment(integrationId, externalId, replyTo.id, text.trim())
        : createComment(integrationId, externalId, text.trim()),
    onSuccess: () => {
      setText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: key });
    },
  });

  if (comments.isLoading) return <Loading />;
  if (comments.isError) return <Banner message={errorMessage(comments.error)} />;
  const data = comments.data!;
  const canWrite = replyTo ? data.canReply : data.canComment;

  return (
    <View style={{ gap: space.md }}>
      {data.comments.length === 0 ? (
        <Empty icon='chatbubble-outline' title='No comments yet' />
      ) : (
        data.comments.map((comment) => (
          <CommentItem key={comment.id} comment={comment} onReply={data.canReply ? () => setReplyTo(comment) : undefined} />
        ))
      )}
      {send.isError ? <Banner message={errorMessage(send.error)} /> : null}
      {canWrite ? (
        <View style={{ gap: space.sm }}>
          <Field
            label={replyTo ? `Reply to ${replyTo.authorName ?? 'comment'}` : 'Add a comment'}
            value={text}
            onChangeText={setText}
            placeholder='Write a comment'
            multiline
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {replyTo ? <Button title='Cancel reply' variant='ghost' small flex onPress={() => setReplyTo(null)} /> : null}
            <Button title='Send' small flex disabled={!text.trim()} loading={send.isPending} onPress={() => send.mutate()} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CommentItem({ comment, onReply, depth = 0 }: { comment: SocialComment; onReply?: () => void; depth?: number }) {
  const colors = useColors();
  return (
    <View style={{ gap: space.xs, marginLeft: depth * space.xl }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Avatar uri={comment.authorAvatar} name={comment.authorName} size={28} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
            {comment.authorName ?? 'Someone'}{' '}
            <Text style={{ fontWeight: '400', color: colors.textFaint }}>{relativeTime(comment.createdAt)}</Text>
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>{comment.text}</Text>
          {onReply && depth === 0 ? (
            <Pressable accessibilityRole='button' onPress={onReply} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>Reply</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {comment.replies?.map((reply) => <CommentItem key={reply.id} comment={reply} depth={depth + 1} />)}
    </View>
  );
}
