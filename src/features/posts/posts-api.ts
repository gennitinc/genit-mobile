import { api } from '@/lib/api';

export type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export type SocialPostMetrics = {
  impressions: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
};

export type SocialPostMedia = { url: string; mimeType?: string };

export type SocialPost = {
  _id: string;
  integration?: string;
  project?: string;
  platform: string;
  accountName?: string;
  title?: string;
  content: string;
  mediaUrl?: string;
  media?: SocialPostMedia[];
  metadata?: Record<string, any>;
  permalink?: string;
  externalId?: string;
  source: 'visuals' | 'chat' | 'integration';
  status: SocialPostStatus;
  scheduledFor?: string;
  publishedAt?: string;
  metrics?: Partial<SocialPostMetrics>;
  createdAt: string;
  updatedAt: string;
};

export type SocialCapability =
  | 'listPosts'
  | 'updatePost'
  | 'deletePost'
  | 'listComments'
  | 'createComment'
  | 'replyToComment'
  | 'analytics';

export type SocialConnection = {
  _id: string;
  platform: string;
  accountName: string;
  accountAvatar?: string;
  accountId: string;
  provider: 'managed' | 'native';
  capabilities: SocialCapability[];
  updatedAt?: string;
};

export type SocialComment = {
  id: string;
  text: string;
  authorName?: string;
  authorAvatar?: string;
  createdAt?: string;
  likeCount?: number;
  replyCount?: number;
  replies?: SocialComment[];
};

export type ConnectionOptions = {
  platform: string;
  targets: { id: string; name: string; description?: string }[];
  privacyLevels: { value: string; label: string }[];
};

export type PostTarget = { platform: string; integrationId?: string; metadata?: Record<string, unknown> };

export type PostPayload = {
  title?: string;
  content: string;
  mediaUrl?: string;
  media: SocialPostMedia[];
  metadata: Record<string, unknown>;
  status: 'draft' | 'scheduled';
  scheduledFor?: string;
  targets: PostTarget[];
};

export type PostStats = {
  drafted: number;
  activeProjects: number;
  engagement: number;
  activity: { date: string; drafted: number; published: number; projects: number; engagement: number }[];
};

export type Pagination = { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean };

export const postKeys = {
  all: ['social-posts'] as const,
  list: (campaignId?: string) => ['social-posts', 'list', campaignId ?? 'all'] as const,
  connections: ['social-posts', 'connections'] as const,
  remote: (integrationId: string) => ['social-posts', 'remote', integrationId] as const,
  stats: (from: string, to: string) => ['social-posts', 'stats', from, to] as const,
};

export const fetchPosts = (page: number, campaignId?: string) =>
  api<{ posts: SocialPost[]; pagination: Pagination }>('social-posts', {
    query: { page, limit: 50, campaignId },
  });

export const fetchConnections = () =>
  api<{ connections: SocialConnection[] }>('social-posts/connections').then((data) => data.connections);

export const fetchRemotePosts = (integrationId: string) =>
  api<{ posts: SocialPost[] }>(`social-posts/connections/${integrationId}/posts`, { query: { limit: 50 } }).then(
    (data) => data.posts
  );

export const fetchStats = (from: string, to: string, timeZone: string) =>
  api<{ stats: PostStats }>('social-posts/stats', { query: { from, to, timeZone } }).then((data) => data.stats);

export const fetchOptions = (integrationId: string) =>
  api<{ options: ConnectionOptions }>(`social-posts/connections/${integrationId}/options`).then((data) => data.options);

export const createPosts = (payload: PostPayload) =>
  api<{ posts: SocialPost[] }>('social-posts', { body: payload }).then((data) => data.posts);

export const updatePost = (id: string, payload: PostPayload) =>
  api<{ post: SocialPost; posts?: SocialPost[] }>(`social-posts/${id}`, { method: 'PATCH', body: payload });

/** Publishes one at a time and holds the request open until all are done. */
export const publishPosts = (ids: string[]) =>
  api<{ posts: SocialPost[] }>('social-posts/publish', { body: { ids }, timeoutMs: 120_000 }).then(
    (data) => data.posts
  );

export const deletePost = (id: string) => api(`social-posts/${id}`, { method: 'DELETE' });

const remotePath = (integrationId: string, externalId: string) =>
  `social-posts/connections/${integrationId}/posts/${encodeURIComponent(externalId)}`;

export const updateRemotePost = (integrationId: string, externalId: string, body: { content: string; title?: string }) =>
  api(remotePath(integrationId, externalId), { method: 'PATCH', body });

export const deleteRemotePost = (integrationId: string, externalId: string) =>
  api(remotePath(integrationId, externalId), { method: 'DELETE' });

export const fetchAnalytics = (integrationId: string, externalId: string) =>
  api<{ metrics: Partial<SocialPostMetrics> }>(`${remotePath(integrationId, externalId)}/analytics`).then(
    (data) => data.metrics
  );

export const fetchComments = (integrationId: string, externalId: string) =>
  api<{ comments: SocialComment[]; canComment: boolean; canReply: boolean }>(
    `${remotePath(integrationId, externalId)}/comments`
  );

export const createComment = (integrationId: string, externalId: string, text: string) =>
  api(`${remotePath(integrationId, externalId)}/comments`, { body: { text } });

export const replyToComment = (integrationId: string, externalId: string, commentId: string, text: string) =>
  api(`${remotePath(integrationId, externalId)}/comments/${encodeURIComponent(commentId)}/replies`, { body: { text } });

export const enhanceText = (body: {
  field: 'title' | 'content';
  title: string;
  content: string;
  platforms: string[];
  media: SocialPostMedia[];
}) => api<{ text: string; cost?: number }>('social-posts/ai-text', { body: { mode: 'enhance', ...body }, timeoutMs: 90_000 });

/** A published post's metrics, with zeros where the platform reports nothing. */
export function metricsOf(post: Pick<SocialPost, 'metrics'>): SocialPostMetrics {
  return {
    impressions: post.metrics?.impressions ?? 0,
    views: post.metrics?.views ?? 0,
    likes: post.metrics?.likes ?? 0,
    comments: post.metrics?.comments ?? 0,
    shares: post.metrics?.shares ?? 0,
    clicks: post.metrics?.clicks ?? 0,
  };
}

export function postMedia(post: Pick<SocialPost, 'media' | 'mediaUrl'>): SocialPostMedia[] {
  if (post.media?.length) return post.media;
  return post.mediaUrl ? [{ url: post.mediaUrl }] : [];
}

export function isVideo(media: SocialPostMedia) {
  return media.mimeType?.startsWith('video/') || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(media.url);
}
