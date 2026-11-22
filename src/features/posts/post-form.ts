import { platformMeta, type PostPlatform } from '@/lib/platforms';

import type { PostPayload, SocialPost, SocialPostMedia } from './posts-api';

export type PostWhen = 'draft' | 'scheduled' | 'published';
export type YoutubePrivacy = 'public' | 'unlisted' | 'private';

export type PostForm = {
  title: string;
  content: string;
  media: SocialPostMedia[];
  platforms: PostPlatform[];
  integrationIds: Partial<Record<PostPlatform, string>>;
  providerTargetIds: Partial<Record<PostPlatform, string>>;
  tiktokPrivacyLevel: string;
  youtubePlaylistId: string;
  youtubePlaylistTitle: string;
  youtubePlaylistDescription: string;
  youtubePlaylistPrivacyStatus: YoutubePrivacy;
  /** A new playlist is created on publish from the title and description above. */
  youtubeNewPlaylist: boolean;
  youtubePrivacyStatus: YoutubePrivacy;
  youtubeMadeForKids: boolean;
  when: PostWhen;
  scheduledFor: Date | null;
  campaignId: string;
};

export const EMPTY_FORM: PostForm = {
  title: '',
  content: '',
  media: [],
  platforms: [],
  integrationIds: {},
  providerTargetIds: {},
  tiktokPrivacyLevel: 'SELF_ONLY',
  youtubePlaylistId: '',
  youtubePlaylistTitle: '',
  youtubePlaylistDescription: '',
  youtubePlaylistPrivacyStatus: 'public',
  youtubeNewPlaylist: false,
  youtubePrivacyStatus: 'public',
  youtubeMadeForKids: false,
  when: 'draft',
  scheduledFor: null,
  campaignId: '',
};

type Rule = {
  summary: string;
  media: 'optional' | 'required' | 'image' | 'video';
  content: 'optional' | 'required' | 'content-or-media';
  contentMax?: number;
  titleRequired?: boolean;
  titleMax?: number;
};

/** Mirrors PLATFORM_RULES in gennit-app's post-editor-dialog.tsx. */
export const PLATFORM_RULES: Record<string, Rule> = {
  facebook: { summary: 'Caption, image, or video. At least one is required.', media: 'optional', content: 'content-or-media' },
  instagram: {
    summary: 'Requires an image or video; the caption is optional (2,200 characters max).',
    contentMax: 2200,
    media: 'required',
    content: 'optional',
  },
  threads: {
    summary: 'Caption, image, or video. Captions can be up to 500 characters.',
    contentMax: 500,
    media: 'optional',
    content: 'content-or-media',
  },
  linkedin: { summary: 'Requires post text (3,000 characters max).', contentMax: 3000, media: 'optional', content: 'required' },
  x: { summary: 'Requires post text (280 characters max).', contentMax: 280, media: 'optional', content: 'required' },
  tiktok: { summary: 'Requires a video and a caption (2,200 characters max).', contentMax: 2200, media: 'video', content: 'required' },
  youtube: {
    summary: 'Requires a video and a title (100 characters max); the description is optional.',
    titleRequired: true,
    titleMax: 100,
    media: 'video',
    content: 'optional',
  },
  pinterest: {
    summary: 'Requires an image. Title is optional (100 characters max).',
    titleMax: 100,
    contentMax: 800,
    media: 'image',
    content: 'optional',
  },
};

export const TARGET_LABEL: Partial<Record<PostPlatform, string>> = {
  facebook: 'Page',
  instagram: 'Instagram account',
  linkedin: 'Publish as',
  pinterest: 'Board',
};

function mediaKind(item: SocialPostMedia) {
  const type = item.mimeType ?? '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  const path = item.url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mp4|mov|webm|m4v)$/.test(path)) return 'video';
  if (/\.(jpe?g|png|webp|gif|heic)$/.test(path)) return 'image';
  return 'unknown';
}

export function validatePost(form: PostForm): string[] {
  if (!form.platforms.length) return ['Choose at least one destination.'];
  const content = form.content.trim();
  const title = form.title.trim();
  const kinds = form.media.map(mediaKind);
  const hasMedia = kinds.length > 0;
  const errors = new Set<string>();

  for (const platform of form.platforms) {
    const label = platformMeta(platform).label;
    const rule = PLATFORM_RULES[platform];
    if (!form.integrationIds[platform]) errors.add(`Choose a ${label} account.`);
    if (!rule) continue;
    if (rule.content === 'required' && !content) errors.add(`${label} requires a caption.`);
    if (rule.content === 'content-or-media' && !content && !hasMedia) errors.add(`${label} requires a caption or media.`);
    if (rule.media !== 'optional' && !hasMedia) {
      errors.add(`${label} requires ${rule.media === 'required' ? 'an image or video' : `a ${rule.media}`}.`);
    }
    if (hasMedia && rule.media === 'image' && !kinds.includes('image')) errors.add(`${label} requires an image.`);
    if (hasMedia && rule.media === 'video' && !kinds.includes('video')) errors.add(`${label} requires a video.`);
    if (rule.contentMax && content.length > rule.contentMax) {
      errors.add(`${label} captions cannot exceed ${rule.contentMax.toLocaleString()} characters.`);
    }
    if (rule.titleRequired && !title) errors.add(`${label} requires a title.`);
    if (rule.titleMax && title.length > rule.titleMax) errors.add(`${label} titles cannot exceed ${rule.titleMax} characters.`);
  }
  if (form.platforms.includes('youtube') && form.youtubeNewPlaylist && !form.youtubePlaylistTitle.trim()) {
    errors.add('Name the new YouTube playlist.');
  }
  if (form.when === 'scheduled') {
    if (!form.scheduledFor) errors.add('Choose a publish time for a scheduled post.');
    else if (form.scheduledFor.getTime() <= Date.now()) errors.add('Choose a publish time in the future.');
  }
  return [...errors];
}

function providerTargetMetadata(form: PostForm, platform: PostPlatform) {
  const id = form.providerTargetIds[platform];
  return {
    ...(id ? { providerTargetId: id } : {}),
    ...(platform === 'linkedin' && id ? { linkedInAuthorUrn: id } : {}),
    ...(platform === 'pinterest' && id ? { pinterestBoardId: id } : {}),
    ...(platform === 'tiktok' ? { tiktokPrivacyLevel: form.tiktokPrivacyLevel } : {}),
  };
}

/** Publishing "now" saves a draft first, then publishes it. */
export function toPayload(form: PostForm): PostPayload {
  return {
    title: form.title,
    content: form.content,
    mediaUrl: form.media[0]?.url,
    media: form.media,
    metadata: {
      youtubePlaylistId: form.youtubeNewPlaylist ? undefined : form.youtubePlaylistId || undefined,
      youtubePlaylistTitle: form.youtubePlaylistTitle || undefined,
      youtubePlaylistDescription: form.youtubePlaylistDescription || undefined,
      youtubePlaylistPrivacyStatus: form.youtubePlaylistPrivacyStatus,
      youtubePrivacyStatus: form.youtubePrivacyStatus,
      youtubeMadeForKids: form.youtubeMadeForKids,
      campaignId: form.campaignId || undefined,
    },
    status: form.when === 'scheduled' ? 'scheduled' : 'draft',
    scheduledFor: form.when === 'scheduled' ? form.scheduledFor?.toISOString() : undefined,
    targets: form.platforms.map((platform) => ({
      platform,
      integrationId: form.integrationIds[platform] || undefined,
      metadata: providerTargetMetadata(form, platform),
    })),
  };
}

function metaString(post: SocialPost, key: string) {
  const value = post.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function privacy(value: string): YoutubePrivacy {
  return value === 'private' || value === 'unlisted' ? value : 'public';
}

export function formFromPost(post: SocialPost): PostForm {
  const platform = post.platform as PostPlatform;
  return {
    ...EMPTY_FORM,
    title: post.title ?? '',
    content: post.content,
    media: post.media?.length ? post.media : post.mediaUrl ? [{ url: post.mediaUrl }] : [],
    platforms: [platform],
    integrationIds: post.integration ? { [platform]: String(post.integration) } : {},
    providerTargetIds: {
      [platform]: metaString(post, 'providerTargetId') || metaString(post, 'linkedInAuthorUrn') || metaString(post, 'pinterestBoardId'),
    },
    tiktokPrivacyLevel: metaString(post, 'tiktokPrivacyLevel') || 'SELF_ONLY',
    youtubePlaylistId: metaString(post, 'youtubePlaylistId'),
    youtubePlaylistTitle: metaString(post, 'youtubePlaylistTitle'),
    youtubePlaylistDescription: metaString(post, 'youtubePlaylistDescription'),
    youtubePlaylistPrivacyStatus: privacy(metaString(post, 'youtubePlaylistPrivacyStatus')),
    youtubeNewPlaylist: !metaString(post, 'youtubePlaylistId') && !!metaString(post, 'youtubePlaylistTitle'),
    youtubePrivacyStatus: privacy(metaString(post, 'youtubePrivacyStatus')),
    youtubeMadeForKids: post.metadata?.youtubeMadeForKids === true,
    when: post.status === 'scheduled' ? 'scheduled' : 'draft',
    scheduledFor: post.scheduledFor ? new Date(post.scheduledFor) : null,
    campaignId: metaString(post, 'campaignId'),
  };
}
