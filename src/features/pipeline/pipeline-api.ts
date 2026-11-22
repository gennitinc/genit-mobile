import { api } from '@/lib/api';

export const LEAD_STAGES = ['new', 'engaged', 'qualified', 'booked', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: 'New',
  engaged: 'In conversation',
  qualified: 'Qualified',
  booked: 'Booked',
  won: 'Won',
  lost: 'Lost',
};

export const STAGE_COLOR: Record<LeadStage, string> = {
  new: '#A1A1AA',
  engaged: '#0EA5E9',
  qualified: '#8B5CF6',
  booked: '#F59E0B',
  won: '#10B981',
  lost: '#F87171',
};

export const SOURCE_LABEL: Record<string, string> = {
  inbox: 'Inbox',
  meta_lead_ads: 'Meta lead ad',
  website_form: 'Website form',
  webhook: 'Webhook',
  manual: 'Added manually',
  import: 'Import',
  apollo: 'Apollo',
  pdl: 'People Data Labs',
  hunter: 'Hunter',
};

export const STOP_REASON: Record<string, string> = {
  booked: 'Booked',
  won: 'Won',
  lost: 'Lost',
  handoff: 'Handed to a teammate',
  human_replied: 'A teammate replied',
  customer_replied: 'Customer replied',
  not_interested: 'Not interested',
  window_closed: 'Messaging window closed',
  sequence_done: 'Sequence finished',
  plan_limit: 'Plan limit reached',
  ai_replies_off: 'AI replies are off for this channel',
  no_email_integration: 'No email sender connected',
  suppressed: 'Unsubscribed',
  stopped_by_user: 'Stopped by you',
  disabled: 'Follow-ups are off',
  error: 'Sending failed',
};

export type QualifyingQuestion = { key: string; label: string; ask: string; required: boolean };

export type PipelineLead = {
  _id: string;
  fullName: string;
  email?: string;
  phone?: string;
  company?: string;
  source: string;
  channel?: string;
  stage?: LeadStage;
  stageChangedAt?: string;
  stageHistory?: { stage: LeadStage; at: string; by: 'agent' | 'user' | 'system'; note?: string }[];
  dealValue?: number;
  currency?: string;
  lostReason?: string;
  notes?: string;
  score: number;
  qualification?: { vertical?: string; answers?: Record<string, string>; missing?: string[]; intent?: string; summary?: string };
  booking?: { status: 'booked' | 'cancelled' | 'completed' | 'no_show'; start: string; end: string; timezone?: string; eventLink?: string };
  followUp?: { count: number; nextAt?: string; stoppedReason?: string };
  conversation?: string;
  agentSkippedReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type LeadMessage = { _id: string; senderType: 'customer' | 'agent' | 'bot'; content?: string; createdAt: string };

export type FunnelBucket = {
  captured: number;
  engaged: number;
  qualified: number;
  booked: number;
  won: number;
  lost: number;
  wonValue: number;
  bookingRate: number;
  winRate: number;
};

export type PipelineReport = {
  days: number;
  totals: FunnelBucket;
  steps: { stage: LeadStage; count: number; ofCaptured: number; fromPrevious: number }[];
  speedToLead: { medianMinutes: number | null; within5MinutesPct: number; responded: number; unanswered: number };
  bySource: (FunnelBucket & { name: string })[];
  byChannel: (FunnelBucket & { name: string })[];
  upcomingBookings: Pick<PipelineLead, '_id' | 'fullName' | 'channel' | 'booking' | 'stage'>[];
};

export type SalesAgentSettings = {
  enabled: boolean;
  captureChats: boolean;
  captureEmail: boolean;
  vertical: string;
  customQuestions: QualifyingQuestion[];
  qualifyThreshold: number;
  currency: string;
  booking: {
    enabled: boolean;
    calendarIntegrationId?: string;
    meetingName?: string;
    durationMinutes: number;
    bufferMinutes: number;
    timezone: string;
    days: number[];
    startHour: number;
    endHour: number;
    minNoticeHours: number;
    horizonDays: number;
    location?: string;
  };
  followUp: { enabled: boolean; delaysHours: number[] };
  formKey: string;
  emailIntegrationId?: string;
};

export type PipelineSettingsResponse = {
  settings: SalesAgentSettings;
  capacity: { plan: string; month: string; used: number; limit: number | null; remaining: number | null };
  formEndpoint: string;
  verticals: { key: string; name: string; meetingName: string; questions: QualifyingQuestion[] }[];
  calendars: { id: string; name: string }[];
  emailSenders: { id: string; platform: string; name: string }[];
};

export type LeadPatch = {
  stage?: LeadStage;
  stageNote?: string;
  dealValue?: number;
  currency?: string;
  notes?: string;
  lostReason?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  answers?: Record<string, string>;
  followUp?: 'stop' | 'resume';
};

export const pipelineKeys = {
  all: ['pipeline'] as const,
  list: (q: string) => ['pipeline', 'list', q] as const,
  lead: (id: string) => ['pipeline', 'lead', id] as const,
  report: (days: number) => ['pipeline', 'report', days] as const,
  settings: ['pipeline', 'settings'] as const,
};

export const listLeads = (q?: string) => api<{ leads: PipelineLead[] }>('gtm/pipeline', { query: { q } }).then((data) => data.leads);

export const getLead = (id: string) =>
  api<{ lead: PipelineLead; messages: LeadMessage[]; questions: QualifyingQuestion[] }>(`gtm/pipeline/leads/${id}`);

export const updateLead = (id: string, patch: LeadPatch) =>
  api<{ lead: PipelineLead }>(`gtm/pipeline/leads/${id}`, { method: 'PATCH', body: patch }).then((data) => data.lead);

export const addLead = (body: { name: string; email?: string; phone?: string; dealValue?: number; notes?: string; startFollowUp?: boolean }) =>
  api<{ lead: PipelineLead; created: boolean }>('gtm/pipeline/leads', { body });

export const getReport = (days = 30) => api<{ report: PipelineReport }>('gtm/pipeline/report', { query: { days } }).then((data) => data.report);

export const getSettings = () => api<PipelineSettingsResponse>('gtm/pipeline/settings');

export const saveSettings = (patch: Partial<SalesAgentSettings> & { rotateFormKey?: boolean }) =>
  api<PipelineSettingsResponse>('gtm/pipeline/settings', { method: 'PUT', body: patch });

export const leadStage = (lead: Pick<PipelineLead, 'stage'>): LeadStage => lead.stage ?? 'new';

export function formatMinutes(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 6) / 10} h`;
  return `${Math.round(minutes / 1440)} d`;
}
