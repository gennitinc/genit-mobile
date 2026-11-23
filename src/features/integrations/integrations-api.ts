import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export type IntegrationStatus = 'active' | 'expired' | 'revoked' | 'error';

export type IntegrationConnection = {
  _id: string;
  platform: string;
  accountId: string;
  accountName: string;
  accountAvatar?: string;
  scopes: string[];
  status: IntegrationStatus;
  expiresAt?: string;
  isPrimary?: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export type CatalogStatus = 'available' | 'soon';

export type CatalogItem = {
  platform: string;
  /** Generic Composio apps (Slack) connect by toolkit slug instead of platform. */
  appSlug?: string;
  name: string;
  category: CatalogCategory;
  description: string;
  status: CatalogStatus;
  /** Logo for apps from the wider catalog, which have no built-in icon. */
  logo?: string;
};

export const CATEGORIES = ['Socials', 'Ads Campaigns', 'Email Campaigns', 'Messaging', 'Productivity', 'More Plugins'] as const;
export type CatalogCategory = (typeof CATEGORIES)[number];

/** Mirrors INTEGRATIONS in gennit-app/app/integrations/integrations-explorer.tsx. */
export const CATALOG: CatalogItem[] = [
  { platform: 'facebook', name: 'Facebook', category: 'Socials', status: 'available', description: 'Publish posts, reels and stories. Manage comments and Page DMs.' },
  { platform: 'instagram', name: 'Instagram', category: 'Socials', status: 'available', description: 'Schedule reels, carousels and stories. Pull insights and reply to DMs.' },
  { platform: 'threads', name: 'Threads', category: 'Socials', status: 'soon', description: 'Meta Threads is not available yet.' },
  { platform: 'linkedin', name: 'LinkedIn', category: 'Socials', status: 'available', description: 'Post to your profile and company pages. Read comments and analytics.' },
  { platform: 'x', name: 'X (Twitter)', category: 'Socials', status: 'available', description: 'Compose posts and threads. Pull mentions, replies and analytics.' },
  { platform: 'tiktok', name: 'TikTok', category: 'Socials', status: 'available', description: 'Publish videos, track per-video metrics and read comments.' },
  { platform: 'youtube', name: 'YouTube', category: 'Socials', status: 'available', description: 'Upload videos, moderate comments and see channel analytics.' },
  { platform: 'pinterest', name: 'Pinterest', category: 'Socials', status: 'available', description: 'Create pins on your boards and pull pin analytics.' },
  { platform: 'snapchat', name: 'Snapchat Ads', category: 'Ads Campaigns', status: 'available', description: 'Manage Snap ad campaigns and read performance.' },
  { platform: 'meta_ads', name: 'Meta Ads', category: 'Ads Campaigns', status: 'available', description: 'Campaigns, ad sets and creatives, optimized by agents.' },
  { platform: 'google_ads', name: 'Google Ads', category: 'Ads Campaigns', status: 'available', description: 'List campaigns across accounts and pull performance.' },
  { platform: 'tiktok_ads', name: 'TikTok Ads', category: 'Ads Campaigns', status: 'soon', description: 'TikTok Ads is not available yet.' },
  { platform: 'linkedin_ads', name: 'LinkedIn Ads', category: 'Ads Campaigns', status: 'available', description: 'Target by job, industry and seniority.' },
  { platform: 'x_ads', name: 'X Ads', category: 'Ads Campaigns', status: 'soon', description: 'X Ads is not available yet.' },
  { platform: 'gmail', name: 'Gmail', category: 'Email Campaigns', status: 'available', description: 'Send broadcasts and replies in your brand voice.' },
  { platform: 'outlook', name: 'Outlook', category: 'Email Campaigns', status: 'available', description: 'Microsoft email and calendar for your workspace.' },
  { platform: 'mailchimp', name: 'Mailchimp', category: 'Email Campaigns', status: 'available', description: 'Newsletters, automations and drip sequences.' },
  { platform: 'brevo', name: 'Brevo', category: 'Email Campaigns', status: 'available', description: 'Transactional email, contacts and delivery stats.' },
  { platform: 'whatsapp', name: 'WhatsApp Business', category: 'Messaging', status: 'available', description: 'AI customer chats, broadcasts and automatic replies.' },
  { platform: 'messenger', name: 'Messenger', category: 'Messaging', status: 'available', description: 'Automate Messenger replies and handle DMs.' },
  { platform: 'telegram', name: 'Telegram Business', category: 'Messaging', status: 'available', description: 'Manage customer chats from Telegram Business.' },
  { platform: 'google_calendar', name: 'Google Calendar', category: 'Productivity', status: 'available', description: 'List and create events on your calendars.' },
  { platform: 'google_drive', name: 'Google Drive', category: 'Productivity', status: 'available', description: 'Browse, upload and share files on Drive.' },
  { platform: 'google_meet', name: 'Google Meet', category: 'Productivity', status: 'available', description: 'Schedule and launch video meetings.' },
  { platform: 'google_sheets', name: 'Google Sheets', category: 'Productivity', status: 'available', description: 'Create, edit and read spreadsheets.' },
  { platform: 'google_slides', name: 'Google Slides', category: 'Productivity', status: 'available', description: 'Generate and edit presentations.' },
  { platform: 'google_docs', name: 'Google Docs', category: 'Productivity', status: 'available', description: 'Create and edit documents.' },
  { platform: 'google_forms', name: 'Google Forms', category: 'Productivity', status: 'available', description: 'Create forms and collect responses.' },
  { platform: 'composio', appSlug: 'slack', name: 'Slack', category: 'Productivity', status: 'available', description: 'Read channels, send messages and let Genit act in your workspace.' },
];

/** Mirrors COMPOSIO_TOOLKIT_BY_PLATFORM in gennit-v1-server/src/services/integration-approval.ts. */
export const TOOLKIT_BY_PLATFORM: Record<string, string> = {
  facebook: 'facebook',
  instagram: 'instagram',
  meta_ads: 'metaads',
  whatsapp: 'whatsapp',
  messenger: 'facebook',
  linkedin: 'linkedin',
  linkedin_ads: 'linkedin_ads',
  x: 'twitter',
  tiktok: 'tiktok',
  youtube: 'youtube',
  pinterest: 'pinterest',
  snapchat: 'snapchat',
  google_ads: 'googleads',
  telegram: 'telegram',
  gmail: 'gmail',
  outlook: 'outlook',
  mailchimp: 'mailchimp',
  brevo: 'brevo',
  google_calendar: 'googlecalendar',
  google_drive: 'googledrive',
  google_meet: 'googlemeet',
  google_sheets: 'googlesheets',
  google_slides: 'googleslides',
  google_docs: 'googledocs',
};

/** Managed (Composio) rows report the platform they act for in metadata. */
export function effectivePlatform(connection: IntegrationConnection) {
  if (connection.platform !== 'composio') return connection.platform;
  const configured = String(connection.metadata?.nativePlatform || connection.metadata?.toolkitSlug || '').toLowerCase();
  const native = configured === 'twitter' ? 'x' : configured;
  return native && native in TOOLKIT_BY_PLATFORM ? native : connection.platform;
}

export function connectionsFor(item: CatalogItem, connections: IntegrationConnection[]) {
  if (item.appSlug) {
    return connections.filter(
      (connection) =>
        connection.metadata?.toolkitSlug === item.appSlug || connection.metadata?.appSlug === item.appSlug
    );
  }
  return connections.filter((connection) => effectivePlatform(connection) === item.platform);
}

export type IntegrationsResponse = {
  integrations: IntegrationConnection[];
  identities: unknown[];
};

/**
 * Social plugins an organization can connect only one account of (the server
 * refuses a second). Mail, storage and other tools can have several.
 */
export const SINGLE_ACCOUNT_PLATFORMS = new Set([
  'facebook',
  'instagram',
  'messenger',
  'linkedin',
  'x',
  'tiktok',
  'youtube',
  'pinterest',
  'snapchat',
  'threads',
  'whatsapp',
  'telegram',
]);

export const integrationsKey = ['integrations'] as const;

export function useIntegrations() {
  const query = useQuery({
    queryKey: integrationsKey,
    queryFn: () => api<IntegrationsResponse>('integrations'),
  });
  const integrations = query.data?.integrations ?? [];
  const active = integrations.filter((connection) => connection.status === 'active');
  return {
    ...query,
    integrations,
    active,
    /** Active connections that act for the given platform. */
    activeFor: (platform: string) => active.filter((connection) => effectivePlatform(connection) === platform),
  };
}

export type ComposioToolkit = {
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  categories: { id: string; name: string }[];
};

/** Toolkits with their own card above; discovery would list them twice. */
const FIRST_CLASS_TOOLKITS = new Set([...Object.values(TOOLKIT_BY_PLATFORM), 'googleforms', 'slack']);

/**
 * Every plugin: the built-in catalog, then apps already connected through the
 * wider catalog, then the rest of that catalog. Mirrors the web Plugins page.
 */
/** The wider plugin catalog (Composio toolkits), cached for an hour. */
export function useComposioToolkits() {
  return useQuery({
    queryKey: ['integrations', 'toolkits'],
    queryFn: () => api<{ toolkits: ComposioToolkit[] }>('integrations/composio/toolkits').then((data) => data.toolkits),
    staleTime: 60 * 60_000,
  });
}

/** Matches a label like "Connect HubSpot CRM" to a toolkit, as the web chat does. */
export function normalizePluginLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/^(?:re)?connect\s+(?:to\s+)?(?:your\s+)?/, '')
    .replace(/^authorize\s+(?:your\s+)?/, '')
    .replace(/\b(?:account|integration|plugin)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/crm$/, '');
}

export function resolveToolkit<T extends Pick<ComposioToolkit, 'slug' | 'name'>>(label: string, toolkits: T[]) {
  const target = normalizePluginLabel(label);
  if (!target) return undefined;
  return toolkits.find((toolkit) => target === normalizePluginLabel(toolkit.slug) || target === normalizePluginLabel(toolkit.name));
}

export function usePluginCatalog() {
  const { integrations } = useIntegrations();
  const toolkits = useComposioToolkits();

  const items: CatalogItem[] = [...CATALOG];
  const known = new Set(items.map((item) => item.appSlug).filter(Boolean));
  for (const connection of integrations) {
    if (connection.platform !== 'composio') continue;
    const slug = String(connection.metadata?.toolkitSlug ?? '');
    if (!slug || known.has(slug)) continue;
    if (connection.metadata?.nativePlatform && items.some((item) => item.platform === connection.metadata?.nativePlatform)) continue;
    known.add(slug);
    const name = String(connection.metadata?.toolkitName ?? slug);
    items.push({ platform: 'composio', appSlug: slug, name, category: 'More Plugins', status: 'available', description: `Use ${name} tools from your Genit agent.`, logo: connection.accountAvatar });
  }
  for (const toolkit of toolkits.data ?? []) {
    if (known.has(toolkit.slug) || FIRST_CLASS_TOOLKITS.has(toolkit.slug)) continue;
    known.add(toolkit.slug);
    items.push({
      platform: 'composio',
      appSlug: toolkit.slug,
      name: toolkit.name,
      category: 'More Plugins',
      status: 'available',
      description: toolkit.description || `Connect ${toolkit.name} and use its tools from Genit.`,
      logo: toolkit.logo,
    });
  }
  return { items, loadingMore: toolkits.isLoading, moreError: toolkits.error };
}

export const disconnectIntegration = (id: string) => api(`integrations/${id}`, { method: 'DELETE' });
export const setPrimaryIntegration = (id: string) => api(`integrations/${id}/primary`, { method: 'POST' });

export type InboxSettings = {
  autoReplyEnabled?: boolean;
  commentAutoReplyEnabled?: boolean;
  autoReplyInstruction?: string;
};

export const updateInboxSettings = (id: string, settings: InboxSettings) =>
  api(`integrations/${id}/inbox-settings`, { method: 'PATCH', body: settings });

export const updateTelegramSettings = (id: string, settings: { autoReplyEnabled: boolean }) =>
  api(`integrations/telegram/${id}/settings`, { method: 'PATCH', body: settings });
