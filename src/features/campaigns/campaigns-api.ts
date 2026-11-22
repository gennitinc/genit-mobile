import { api } from '@/lib/api';

export type OutreachChannel = 'gmail' | 'outlook' | 'brevo' | 'whatsapp' | 'messenger' | 'instagram' | 'telegram' | 'x' | 'slack';

export const OUTREACH_CHANNELS: { value: OutreachChannel; label: string }[] = [
  { value: 'gmail', label: 'Gmail' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'brevo', label: 'Brevo' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'messenger', label: 'Messenger' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'x', label: 'X' },
  { value: 'slack', label: 'Slack' },
];

export const EMAIL_CHANNELS: OutreachChannel[] = ['gmail', 'outlook', 'brevo'];

export type OutreachVariant = {
  id: string;
  channel: OutreachChannel;
  name: string;
  content: string;
  subject?: string;
  templateName?: string;
  templateLanguage?: string;
  weight: number;
};

export type RecipientStatus = 'pending' | 'scheduled' | 'sent' | 'delivered' | 'read' | 'replied' | 'suppressed' | 'failed';

export type CampaignRecipient = {
  _id: string;
  channel: OutreachChannel;
  address: string;
  name: string;
  consent: { status: 'opted_in' | 'unknown' | 'opted_out'; source?: string };
  status: RecipientStatus;
  lastError?: string;
  sentAt?: string;
};

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

export const STATUS_TONE = { active: 'success', draft: 'neutral', paused: 'primary', completed: 'neutral' } as const;

export type Recommendation = { title: string; action: string; priority: 'high' | 'medium' | 'low'; status: 'open' | 'done' | 'dismissed' };

export type GtmCampaign = {
  _id: string;
  chatId?: string;
  name: string;
  objective: string;
  audience?: string;
  offer?: string;
  budget?: number;
  timeline?: string;
  successMetric?: string;
  research?: { summary: string; sources: { title: string; url: string; insight?: string }[] };
  status: CampaignStatus;
  channels: string[];
  plan: {
    summary: string;
    funnel: { stage: string; goal: string; actions: string[] }[];
    calendar: { day: number; channel: string; action: string }[];
    kpis: string[];
  };
  email: { steps: { delayDays: number; subject: string; body: string; status: string }[] };
  outreach: {
    status: 'draft' | 'running' | 'paused' | 'completed';
    throttlePerMinute: number;
    integrations: Partial<Record<OutreachChannel, string>>;
    variants: OutreachVariant[];
    launchedAt?: string;
  };
  conversions: { value: number; source?: string; medium?: string }[];
  recommendations: Recommendation[];
  lastOptimizedAt?: string;
  createdAt: string;
};

export type CampaignPage = {
  campaigns: GtmCampaign[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean };
  summary: { totalCampaigns: number; activeCampaigns: number; draftCampaigns: number; pipelineValue: number; conversions: number; sequencesReady: number };
};

export type Attribution = {
  metrics: { impressions: number; views: number; likes: number; comments: number; shares: number; clicks: number };
  conversions: number;
  conversionValue: number;
  spend: number;
  roi: number | null;
  postCount: number;
};

export type OutreachSnapshot = {
  campaign: GtmCampaign;
  recipients: CampaignRecipient[];
  recipientPagination: CampaignPage['pagination'];
  stats: Partial<Record<RecipientStatus, number>>;
};

export const campaignKeys = {
  all: ['campaigns'] as const,
  list: (status: string, search: string) => ['campaigns', 'list', status, search] as const,
  detail: (id: string) => ['campaigns', 'detail', id] as const,
  attribution: (id: string) => ['campaigns', 'attribution', id] as const,
  outreach: (id: string, page: number, status: string) => ['campaigns', 'outreach', id, page, status] as const,
};

export const listCampaigns = (page: number, status: string, search: string) =>
  api<CampaignPage>('gtm/campaigns', { query: { page, limit: 12, status: status === 'all' ? undefined : status, search: search || undefined } });

export const getCampaign = (id: string) => api<{ campaign: GtmCampaign }>(`gtm/campaigns/${id}`).then((data) => data.campaign);
export const updateCampaign = (id: string, patch: Partial<GtmCampaign>) =>
  api<{ campaign: GtmCampaign }>(`gtm/campaigns/${id}`, { method: 'PATCH', body: patch }).then((data) => data.campaign);
export const deleteCampaign = (id: string) => api(`gtm/campaigns/${id}`, { method: 'DELETE' });
export const getAttribution = (id: string) => api<Attribution>(`gtm/campaigns/${id}/attribution`);
export const runOptimizer = (id: string) => api<{ campaign: GtmCampaign }>(`gtm/campaigns/${id}/optimize`, { method: 'POST', timeoutMs: 120_000 });
export const scheduleOptimizer = (id: string) => api(`gtm/campaigns/${id}/optimizer/schedule`, { body: { cadenceDays: 7 } });
export const recordConversion = (id: string, body: { value: number; source?: string; medium?: string }) =>
  api(`gtm/campaigns/${id}/conversions`, { body });
export const buildUtm = (id: string, body: { url: string; source?: string; medium?: string }) =>
  api<{ url: string }>(`gtm/campaigns/${id}/utm`, { body }).then((data) => data.url);
export const exportReport = (id: string) =>
  api<{ report: { url: string; fileName: string } }>(`gtm/campaigns/${id}/report`, { method: 'POST', timeoutMs: 120_000 }).then((data) => data.report);

export const getOutreach = (id: string, page: number, status: string) =>
  api<OutreachSnapshot>(`gtm/campaigns/${id}/outreach`, { query: { page, limit: 25, status: status === 'all' ? undefined : status } });
export const saveOutreach = (id: string, body: { throttlePerMinute: number; integrations: Partial<Record<OutreachChannel, string>>; variants: OutreachVariant[] }) =>
  api(`gtm/campaigns/${id}/outreach`, { method: 'PATCH', body });
export const addRecipients = (
  id: string,
  recipients: { channel: OutreachChannel; address: string; name?: string; consentStatus: 'opted_in'; consentSource?: string }[]
) => api(`gtm/campaigns/${id}/outreach/recipients`, { body: { recipients } });
export const launchOutreach = (id: string) =>
  api<{ scheduled: number; rejected: { address?: string; reason?: string }[] }>(`gtm/campaigns/${id}/outreach/launch`, { method: 'POST' });
export const pauseOutreach = (id: string) => api(`gtm/campaigns/${id}/outreach/pause`, { method: 'POST' });
export const suppressRecipient = (id: string, recipientId: string) =>
  api(`gtm/campaigns/${id}/outreach/recipients/${recipientId}/suppress`, { method: 'POST' });

export function readiness(campaign: GtmCampaign, linkedPosts: number) {
  const steps = [
    { id: 'plan', label: 'Plan approved', done: campaign.plan.funnel.length > 0 },
    { id: 'content', label: 'Content linked', done: linkedPosts > 0 },
    { id: 'outreach', label: 'Outreach configured', done: campaign.email.steps.length > 0 || campaign.outreach.variants.length > 0 },
    { id: 'tracking', label: 'Conversions tracked', done: campaign.conversions.length > 0 },
  ] as const;
  return { steps, completed: steps.filter((step) => step.done).length, next: steps.find((step) => !step.done) };
}

export function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
