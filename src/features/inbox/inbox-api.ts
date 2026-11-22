import { api } from '@/lib/api';
import { type LocalFile, uploadForm } from '@/lib/files';

export type ConversationStatus = 'open' | 'resolved' | 'snoozed';

export type InboxAttachment = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'file';
  providerMessageId?: string;
  providerAttachmentId?: string;
};

export type InboxConversation = {
  _id: string;
  organization: string;
  integration?: string;
  platform: string;
  platformConversationId: string;
  customerName: string;
  customerId?: string;
  customerAvatar?: string;
  customerHandle?: string;
  subject?: string;
  labels: string[];
  notes?: string;
  metadata?: Record<string, any>;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  status: ConversationStatus;
  isPinned: boolean;
  isMuted: boolean;
  isBlocked: boolean;
  /** Set while AI auto-reply has handed the conversation to a person. */
  ai?: { handoffAt?: string; handoffReason?: string; handoffUntil?: string; lastError?: string };
  createdAt: string;
  updatedAt: string;
};

export type InboxMessage = {
  _id: string;
  conversationId: string;
  platformMessageId?: string;
  senderType: 'customer' | 'agent' | 'bot';
  content: string;
  attachments: InboxAttachment[];
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string;
  sentAt?: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
};

export type InboxSyncResult = {
  integrationId: string;
  accountName: string;
  platform: string;
  threadsProcessed: number;
  messagesImported: number;
  nextPageToken?: string;
  liveOnly?: boolean;
  error?: string;
  /** Set by newer servers, whose error is already a plain sentence. */
  errorKind?: string;
  warning?: string;
};

export type WhatsAppTemplate = {
  id: string;
  name: string;
  status?: string;
  language?: string;
  category?: string;
  components?: { type?: string; text?: string }[];
};

export type InboxFilters = {
  platform?: string;
  integrationId?: string;
  status?: 'all' | ConversationStatus;
  search?: string;
  sort?: 'newest' | 'oldest' | 'unread';
  folder?: EmailFolder;
};

export type EmailFolder =
  | 'inbox'
  | 'primary'
  | 'promotions'
  | 'social'
  | 'updates'
  | 'forums'
  | 'sent'
  | 'archive'
  | 'spam'
  | 'trash'
  | 'drafts';

/** The mailbox views the server can filter email conversations by. */
export const EMAIL_FOLDERS: { value: EmailFolder; label: string }[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'primary', label: 'Primary' },
  { value: 'promotions', label: 'Promotions' },
  { value: 'social', label: 'Social' },
  { value: 'updates', label: 'Updates' },
  { value: 'forums', label: 'Forums' },
  { value: 'sent', label: 'Sent' },
  { value: 'archive', label: 'Archive' },
  { value: 'spam', label: 'Spam' },
  { value: 'trash', label: 'Trash' },
  { value: 'drafts', label: 'Drafts' },
];

export type ConversationPatch = Partial<
  Pick<InboxConversation, 'status' | 'customerName' | 'customerAvatar' | 'subject' | 'labels' | 'notes' | 'isPinned' | 'isMuted' | 'isBlocked'>
> & {
  /** Ends an AI handoff so auto-reply answers this conversation again. */
  resumeAi?: boolean;
};

export const inboxKeys = {
  all: ['inbox'] as const,
  conversations: (filters: InboxFilters) => ['inbox', 'conversations', filters] as const,
  messages: (id: string) => ['inbox', 'messages', id] as const,
  templates: (id: string) => ['inbox', 'templates', id] as const,
  calls: (id: string) => ['inbox', 'calls', id] as const,
  liveCalls: ['inbox', 'live-calls'] as const,
};

const PAGE = 50;

export const fetchConversations = (filters: InboxFilters, offset: number) =>
  api<{ conversations: InboxConversation[]; nextOffset: number | null }>('inbox/conversations', {
    query: {
      ...filters,
      status: filters.status === 'all' ? undefined : filters.status,
      limit: PAGE,
      offset,
    },
  });

export const fetchConversation = async (id: string) => {
  // There's no single-conversation endpoint, so look it up by id among recent ones.
  const { conversations } = await fetchConversations({}, 0);
  return conversations.find((conversation) => conversation._id === id) ?? null;
};

export const MESSAGE_PAGE = 50;

/** Oldest-first messages; `before` (an ISO date) pages back through history. */
export const fetchMessages = (id: string, before?: string) =>
  api<{ messages: InboxMessage[] }>(`inbox/conversations/${id}/messages`, { query: { limit: MESSAGE_PAGE, before } }).then(
    (data) => data.messages
  );

export const sendMessage = (id: string, content: string, attachments: InboxAttachment[]) =>
  api<{ message: InboxMessage }>(`inbox/conversations/${id}/messages`, { body: { content, attachments } }).then((data) => data.message);

export const uploadAttachment = (file: LocalFile) =>
  api<{ attachment: InboxAttachment }>('inbox/attachments', { form: uploadForm('file', file), timeoutMs: 120_000 }).then(
    (data) => data.attachment
  );

export const createConversation = (body: {
  integrationId: string;
  platform: string;
  customerName: string;
  customerId?: string;
  customerHandle?: string;
  subject?: string;
}) => api<{ conversation: InboxConversation }>('inbox/conversations', { body }).then((data) => data.conversation);

export const syncInbox = (body: { integrationId?: string; platform?: string; continueHistory?: boolean } = {}) =>
  api<{ results: InboxSyncResult[] }>('inbox/sync', { body, timeoutMs: 120_000 }).then((data) => data.results);

export const aiDraft = (id: string, instruction?: string) =>
  api<{ draft: string }>(`inbox/conversations/${id}/ai-draft`, { body: { instruction }, timeoutMs: 90_000 }).then((data) => data.draft);

export const retryMessage = (messageId: string) => api<{ message: InboxMessage }>(`inbox/messages/${messageId}/retry`, { method: 'POST' });
export const editMessage = (messageId: string, content: string) => api(`inbox/messages/${messageId}`, { method: 'PATCH', body: { content } });
export const deleteMessage = (messageId: string) => api(`inbox/messages/${messageId}`, { method: 'DELETE' });

export const markRead = (id: string) => api(`inbox/conversations/${id}/read`, { method: 'PATCH' });
export const markAllRead = () => api('inbox/conversations/read-all', { method: 'PATCH' });

export const updateConversation = (id: string, patch: ConversationPatch) =>
  api<{ conversation: InboxConversation }>(`inbox/conversations/${id}`, { method: 'PATCH', body: patch }).then((data) => data.conversation);

export const deleteConversation = (id: string) => api(`inbox/conversations/${id}`, { method: 'DELETE' });
export const clearConversation = (id: string) => api(`inbox/conversations/${id}/messages`, { method: 'DELETE' });
export const exportPath = (id: string) => `inbox/conversations/${id}/export`;
export const gmailAttachmentPath = (attachment: InboxAttachment) =>
  `inbox/gmail-attachments/${encodeURIComponent(attachment.providerMessageId!)}/${encodeURIComponent(attachment.providerAttachmentId!)}`;

export const fetchTemplates = (id: string) =>
  api<{ templates: WhatsAppTemplate[] }>(`inbox/conversations/${id}/whatsapp-templates`).then((data) => data.templates);

export const sendTemplate = (
  id: string,
  body: { name: string; language: string; components?: { type: string; parameters: { type: 'text'; text: string }[] }[] }
) => api<{ message: InboxMessage }>(`inbox/conversations/${id}/whatsapp-templates`, { body });

const DAY = 24 * 60 * 60 * 1000;

function lastInboundOlderThanADay(conversation: InboxConversation) {
  const last = conversation.metadata?.lastInboundAt;
  return !last || Date.now() - Date.parse(String(last)) > DAY;
}

/** WhatsApp only allows free text within 24 hours of the customer's last message. */
export const whatsappWindowClosed = (c: InboxConversation) => c.platform === 'whatsapp' && lastInboundOlderThanADay(c);

export const telegramWindowClosed = (c: InboxConversation) =>
  c.platform === 'telegram' && !!c.metadata?.telegramBusiness && lastInboundOlderThanADay(c);

/** Public X replies are capped; DMs are not. */
export const replyMaxLength = (c: InboxConversation) =>
  ['x', 'twitter'].includes(c.platform) && c.metadata?.kind !== 'dm' ? 280 : undefined;

export const supportsAttachments = (c: InboxConversation) => !['x', 'twitter', 'linkedin'].includes(c.platform);

export const isEmail = (platform: string) => ['gmail', 'email', 'outlook'].includes(platform);

/** The server only lets you edit or delete messages the provider never accepted. */
export const canEditMessage = (message: InboxMessage) =>
  message.senderType !== 'customer' && (!message.platformMessageId || message.status === 'failed');

export const NEEDS_HUMAN_LABEL = 'Needs human';

const HANDOFF_REASONS: Record<string, string> = {
  customer_asked_for_human: 'The customer asked for a person.',
  model_handoff: 'The AI decided a person should answer.',
  low_confidence: "The AI wasn't confident enough to reply.",
  reply_limit: 'The AI reached its hourly reply limit.',
  ai_error: 'The AI ran into an error.',
};

/** Why auto-reply stopped answering this conversation, or null if it hasn't. */
export function aiHandoff(conversation: InboxConversation) {
  const handedOff = !!conversation.ai?.handoffAt || conversation.labels.includes(NEEDS_HUMAN_LABEL);
  if (!handedOff) return null;
  return HANDOFF_REASONS[conversation.ai?.handoffReason ?? ''] ?? 'This conversation needs a person.';
}

export function templateVariableSections(template?: WhatsAppTemplate) {
  return (template?.components ?? [])
    .map((component) => ({
      type: component.type?.toLowerCase() || 'body',
      count: Math.max(0, ...Array.from((component.text ?? '').matchAll(/\{\{(\d+)\}\}/g), (match) => Number(match[1]))),
    }))
    .filter((section) => section.count > 0);
}

export function templateBody(template?: WhatsAppTemplate) {
  return template?.components?.find((component) => component.type?.toUpperCase() === 'BODY')?.text ?? '';
}

const HTML_PATTERN = /<\s*(?:!doctype|html|head|body|table|div|p|br|img|a|h[1-6]|span|strong|em|ul|ol|li|section|article|center|font)\b/i;

export const isHtml = (value: string) => HTML_PATTERN.test(value);

/** Plain text for list previews of HTML emails. */
export function textPreview(value: string) {
  if (!isHtml(value)) return value;
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Where the quoted earlier message starts in a plain-text email, or -1. */
export function quotedTextStart(text: string) {
  const markers = [/(?:^|\n)\s*On .+ wrote:\s*(?:\n|$)/i, /(?:^|\n)\s*>/, /(?:^|\n)\s*-{2,}\s*(?:Original|Forwarded) Message\s*-{2,}/i];
  const indexes = markers.map((marker) => marker.exec(text)?.index).filter((index): index is number => index !== undefined);
  const lines = text.split('\n');
  const outlook = lines.findIndex((line, index) => {
    if (!/^\s*From:/i.test(line)) return false;
    const block = lines.slice(index, index + 8).join('\n').toLowerCase();
    return ['from:', 'sent:', 'to:', 'subject:'].every((label) => block.includes(label));
  });
  if (outlook >= 0) indexes.push(lines.slice(0, outlook).join('\n').length);
  return indexes.length ? Math.min(...indexes) : -1;
}

/** Personal mail providers, whose logo says nothing about the sender. */
const PERSONAL_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'zoho.com', 'yandex.com',
]);

/**
 * For email from a company (LinkedIn, Medium, Bolt…), its logo stands in when
 * the sender has no photo. The domain is looked up with Google's favicon service.
 */
export function senderLogo(conversation: Pick<InboxConversation, 'platform' | 'customerHandle'>) {
  if (!['gmail', 'outlook', 'email'].includes(conversation.platform)) return undefined;
  const domain = conversation.customerHandle?.split('@')[1]?.trim().toLowerCase();
  if (!domain || PERSONAL_MAIL.has(domain) || /^yahoo\./.test(domain)) return undefined;
  const parts = domain.split('.');
  // mail.bolt.eu → bolt.eu, but keep news.bbc.co.uk → bbc.co.uk
  const keep = parts.length > 2 && parts[parts.length - 2].length <= 3 ? 3 : 2;
  const site = parts.slice(-keep).join('.');
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site)}&sz=128`;
}
