import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { IntegrationConnection } from '@/features/integrations/integrations-api';
import { platformMeta } from '@/lib/platforms';

import type { InboxConversation } from './inbox-api';

export const INBOX_PLATFORMS = new Set(['instagram', 'linkedin', 'x', 'gmail', 'outlook', 'whatsapp', 'messenger', 'telegram']);

/** Managed rows report the platform they act for in metadata. */
export function inboxPlatform(account: IntegrationConnection) {
  return String(
    account.platform === 'composio' ? account.metadata?.nativePlatform || account.metadata?.toolkitSlug || 'composio' : account.platform
  ).toLowerCase();
}

export function accountLabel(account: IntegrationConnection) {
  const platform = inboxPlatform(account);
  const name = account.accountName?.trim();
  const generic = !name || [account.platform, platform, account.metadata?.toolkitSlug].some((value) => String(value ?? '').toLowerCase() === name.toLowerCase());
  return generic ? platformMeta(platform).label : name;
}

/** Accounts that can open a brand-new conversation (not just reply). */
export function canStartConversation(account: IntegrationConnection) {
  const platform = inboxPlatform(account);
  return (
    ['gmail', 'email', 'outlook', 'instagram', 'messenger', 'whatsapp'].includes(platform) ||
    (platform === 'telegram' && account.metadata?.telegramMode !== 'business_bot') ||
    (platform === 'x' && account.scopes.includes('dm.write'))
  );
}

type ConversationPage = { conversations: InboxConversation[]; nextOffset: number | null };

/** The conversation as last seen in any loaded list, so the thread opens instantly. */
export function cachedConversation(queryClient: QueryClient, id: string) {
  const lists = queryClient.getQueriesData<InfiniteData<ConversationPage>>({ queryKey: ['inbox', 'conversations'] });
  for (const [, data] of lists) {
    for (const page of data?.pages ?? []) {
      const match = page.conversations.find((conversation) => conversation._id === id);
      if (match) return match;
    }
  }
  return undefined;
}

/** Integration platforms `inbox/sync` accepts. */
export const SYNC_PLATFORMS = new Set(['gmail', 'outlook', 'instagram', 'linkedin', 'messenger', 'whatsapp', 'telegram', 'x', 'composio']);

/** Channels with older history to import; WhatsApp and Telegram are live-only. */
export const HISTORY_PLATFORMS = new Set(['gmail', 'outlook', 'instagram', 'linkedin', 'messenger', 'x']);

/** The account's pending history cursor, or '' when its history is fully imported. */
export function historyCursor(account: IntegrationConnection) {
  const metadata = account.metadata ?? {};
  const cursor =
    metadata.composioInboxNextPageToken ||
    metadata.gmailNextPageToken ||
    metadata.outlookNextPageToken ||
    metadata.metaNextPageToken ||
    metadata.xMentionNextPageToken ||
    metadata.xDmNextPageToken;
  return cursor ? `${account._id}:${cursor}` : '';
}

/**
 * "Instagram (ourcityvibe)", or just "Slack" when the account has no name of its own.
 * Older servers report failed plugins as "composio", so the connected account says which platform it is.
 */
export function syncChannelLabel(result: { platform: string; accountName: string }, account?: IntegrationConnection) {
  const reported = result.platform.toLowerCase();
  const platform = account ? inboxPlatform(account) : reported === 'composio' ? result.accountName.toLowerCase() : reported;
  const label = platformMeta(platform).label;
  const name = result.accountName?.trim();
  return name && name.toLowerCase() !== platform ? `${label} (${name})` : label;
}

export type SyncIssueKind = 'reconnect' | 'rate_limited' | 'too_large' | 'temporary' | 'unknown';

/** What went wrong for one channel, as one short sentence. */
export type SyncIssue = { integrationId: string; kind: SyncIssueKind; message: string };

/**
 * One short sentence for a channel that failed to sync. Newer servers already
 * send this; older ones send the provider's raw response (JSON, trace ids).
 */
export function syncIssue(raw: string, channel: string): Omit<SyncIssue, 'integrationId'> {
  const text = raw.toLowerCase();
  if (/\b401\b|oauthexception|"code":\s*190|access token|session key|token (has )?expired|invalid_auth|token_revoked|unauthori[sz]ed|reconnect/.test(text)) {
    return { kind: 'reconnect', message: `${channel} needs to be reconnected.` };
  }
  if (/ratelimit|rate limit|rate_limited|\b429\b|too many requests|limiting requests/.test(text)) {
    return { kind: 'rate_limited', message: `${channel} is limiting requests. It will catch up on the next sync.` };
  }
  if (/\b413\b|payloadtoolarge|too large|too much at once/.test(text)) {
    return { kind: 'too_large', message: `${channel} sent too much at once. Try syncing again.` };
  }
  if (/unknown error|temporar|timeout|timed out|\b5\d\d\b|unavailable/.test(text)) {
    return { kind: 'temporary', message: `${channel} had a temporary problem. Try again shortly.` };
  }
  return { kind: 'unknown', message: `${channel} couldn't sync right now.` };
}

/** Whether any of these accounts synced within the last `withinMs`. */
export function syncedRecently(accounts: IntegrationConnection[], withinMs: number) {
  const last = Math.max(0, ...accounts.map((account) => Date.parse(String(account.metadata?.lastInboxSyncAt ?? '')) || 0));
  return Date.now() - last < withinMs;
}

/** Notes about plugins that simply have no inbox (Drive, Calendar…), which aren't problems. */
export function isNoInboxNote(text: string) {
  return /has no managed inbox feed/i.test(text);
}
