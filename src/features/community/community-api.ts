import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

/** A design published to the community gallery (the web's Discover grid). */
export type CommunityItem = {
  id: string;
  src: string;
  alt: string;
  category?: string;
  /** Set for designs made and published by Genit creators. */
  creator?: { id?: string; username: string; avatar?: string; verified: boolean };
};

type RawTemplate = {
  _id?: string;
  assetId?: string;
  mediaUrl: string;
  alt?: string;
  title?: string;
  category?: string;
  author?: string;
  isUserGenerated?: boolean;
  userId?: { _id?: string; username?: string; profilePic?: string; userdp?: string; isVerified?: boolean } | null;
};

type TemplatesPage = { templates: RawTemplate[]; pagination?: { hasNextPage?: boolean } };

const PAGE_SIZE = 30;

function toItem(template: RawTemplate): CommunityItem {
  const username = template.userId?.username || template.author;
  return {
    id: String(template._id || template.assetId || template.mediaUrl),
    src: template.mediaUrl,
    alt: template.alt || template.title || 'Community design',
    category: template.category,
    creator:
      template.isUserGenerated && username
        ? {
            id: template.userId?._id,
            username,
            avatar: template.userId?.profilePic || template.userId?.userdp || undefined,
            verified: !!template.userId?.isVerified,
          }
        : undefined,
  };
}

/** Same feed and paging as the web gallery (`GET templates`). */
export async function fetchCommunityPage(page: number, search: string, limit = PAGE_SIZE) {
  const body = await api<{ data?: TemplatesPage }>('templates', {
    query: { mobile: 1, page, limit, ...(search.trim() ? { search: search.trim() } : {}) },
  });
  const data: TemplatesPage = body.data ?? { templates: [] };
  return {
    items: (data.templates ?? []).filter((template) => template.mediaUrl).map(toItem),
    nextPage: data.pagination?.hasNextPage ? page + 1 : null,
  };
}

export const communityKeys = { all: ['community'] as const };

export function useCommunity(search = '', limit = PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: [...communityKeys.all, search.trim(), limit],
    queryFn: ({ pageParam }) => fetchCommunityPage(pageParam, search, limit),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage,
    staleTime: 5 * 60_000,
  });
}

/** All loaded pages as one list, each image once (the feed repeats some designs). */
export function communityItems(pages: { items: CommunityItem[] }[] | undefined) {
  const seen = new Set<string>();
  const list: CommunityItem[] = [];
  for (const item of (pages ?? []).flatMap((page) => page.items)) {
    if (seen.has(item.src) || seen.has(item.id)) continue;
    seen.add(item.src);
    seen.add(item.id);
    list.push(item);
  }
  return list;
}
