import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { type LocalFile, uploadForm } from '@/lib/files';

export type MediaAsset = {
  _id: string;
  name: string;
  url: string;
  mimeType: string;
  source: 'upload' | 'generated';
  createdAt: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
};

export type StorageUsage = {
  plan: string;
  scope?: string;
  billedTo?: 'organization-owner' | 'user';
  shared?: boolean;
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  usagePercent: number;
};

export type LibraryResponse = {
  assets: MediaAsset[];
  scope: 'organization' | 'personal';
  storage?: StorageUsage;
};

export const libraryKey = (type: 'all' | 'visual' = 'all') => ['library', type] as const;

export function useLibrary(type: 'all' | 'visual' = 'all', enabled = true) {
  return useQuery({
    queryKey: libraryKey(type),
    queryFn: () => api<LibraryResponse>('blog/library', { query: type === 'all' ? undefined : { type } }),
    enabled,
  });
}

/** Large videos can take a while on mobile networks. */
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

export const uploadToLibrary = (file: LocalFile) =>
  api<{ url: string; asset: MediaAsset; storage?: StorageUsage }>('blog/upload', {
    form: uploadForm('file', file),
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });

export const deleteFromLibrary = (id: string) =>
  api<{ storage?: StorageUsage }>(`blog/library/${id}`, { method: 'DELETE' });

export function assetKind(asset: Pick<MediaAsset, 'mimeType' | 'url'>) {
  if (asset.mimeType?.startsWith('image/')) return 'image';
  if (asset.mimeType?.startsWith('video/')) return 'video';
  if (asset.mimeType?.startsWith('audio/')) return 'audio';
  if (/\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(asset.url)) return 'image';
  if (/\.(mp4|mov|m4v|webm)(\?|$)/i.test(asset.url)) return 'video';
  return 'file';
}
