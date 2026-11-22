import { File } from 'expo-file-system';

import { api } from '@/lib/api';
import type { LocalFile } from '@/lib/files';

// ─── Agent runs ───────────────────────────────────────────────────────────────

export type AgentTaskStatus = 'pending' | 'running' | 'done' | 'failed';
export type AgentRunStatus = 'running' | 'awaiting_input' | 'awaiting_integration' | 'completed' | 'failed' | 'cancelled';

export type AgentErrorCode =
  | 'genit_feature_missing'
  | 'provider_action_unavailable'
  | 'provider_plan_required'
  | 'provider_quota_limited'
  | 'provider_authentication_required'
  | 'provider_permission_denied'
  | 'provider_temporarily_unavailable'
  | 'request_invalid'
  | 'resource_not_found'
  | 'execution_incomplete'
  | 'verification_failed'
  | 'unknown';

export type AgentTask = { id: string; title: string; status: AgentTaskStatus; detail?: string };

export type AgentToolCall = {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: {
    ok: boolean;
    data?: any;
    error?: string;
    errorCode?: AgentErrorCode;
    provider?: string;
    verification?: { status: 'verified'; evidence: string[]; checkedAt: string };
  };
  render?: string;
};

export type ElicitationOption = {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  connected?: boolean;
};

export type AgentElicitation = {
  question: string;
  options?: ElicitationOption[];
  presentation?: 'buttons' | 'image_size' | 'video_size' | 'video_duration' | 'plugin_choice';
  allowOther?: boolean;
  multiple?: boolean;
};

export type AgentIntegrationRequired = {
  platform: string;
  platformName: string;
  reason: string;
  toolkitSlug?: string;
};

export type AgentAttachedFile = { name: string; type: string; url: string; size?: number };

export type AgentRun = {
  runId: string;
  prompt: string;
  attachedFiles?: AgentAttachedFile[];
  status: AgentRunStatus;
  plan: AgentTask[];
  thinking: string;
  thinkingActive: boolean;
  toolCalls: AgentToolCall[];
  text: string;
  elicitation?: AgentElicitation;
  integrationRequired?: AgentIntegrationRequired;
  error?: string;
  errorCode?: AgentErrorCode;
  errorProvider?: string;
  createdAt: number;
};

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

/** The server accepts images, videos, PDFs and Office files (docx, xlsx, pptx). */
export function isSupportedAttachment(file: LocalFile) {
  const type = (file.mimeType ?? '').toLowerCase();
  const name = (file.name ?? file.uri).toLowerCase();
  if (type.startsWith('image/') || type.startsWith('video/')) return true;
  return ['.pdf', '.docx', '.xlsx', '.pptx'].some((ext) => name.endsWith(ext)) && (!type || DOCUMENT_TYPES.includes(type) || type === 'application/octet-stream');
}

export const DOCUMENT_PICKER_TYPES = ['image/*', 'video/*', ...DOCUMENT_TYPES];

/** Uploads up to four local files and returns the hosted copies the agent can read. */
export async function uploadAgentFiles(files: LocalFile[]) {
  const form = new FormData();
  for (const file of files) form.append('files', new File(file.uri));
  const data = await api<{ files: AgentAttachedFile[] }>('agents/upload', { form, timeoutMs: 180_000 });
  return data.files;
}

export function newRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const startAgentRun = (input: {
  projectId: string;
  prompt: string;
  requestId?: string;
  attachedFiles?: AgentAttachedFile[];
  useBrandIdentity?: boolean;
  agentModelId?: string;
}) => api<{ success: boolean; runId: string }>('agents/run', { body: input }).then((data) => data.runId);

export const answerAgent = (
  runId: string,
  value: string,
  metadata?: { isOther: boolean; attachedFiles?: AgentAttachedFile[] }
) =>
  api(`agents/${runId}/resume`, {
    body: { kind: 'user_input', value, isOther: metadata?.isOther, attachedFiles: metadata?.attachedFiles },
  });

export const resumeAfterConnect = (runId: string, platform: string) =>
  api(`agents/${runId}/resume`, { body: { kind: 'integration_connected', platform } });

export const stopAgentRun = (runId: string) => api(`agents/${runId}/stop`, { method: 'POST' });
export const continueAgentRun = (runId: string) => api(`agents/${runId}/continue`, { method: 'POST' });
export const deleteAgentRun = (runId: string) => api(`agents/${runId}`, { method: 'DELETE' });

export const listAgentRuns = (projectId: string) =>
  api<{ runs: AgentRun[] }>(`agents/project/${projectId}`).then((data) =>
    data.runs
      .map((run) => ({
        ...run,
        plan: run.plan ?? [],
        toolCalls: run.toolCalls ?? [],
        thinking: run.thinking ?? '',
        thinkingActive: false,
        text: run.text ?? '',
        createdAt: typeof run.createdAt === 'number' ? run.createdAt : Date.parse(String(run.createdAt)) || 0,
      }))
      .sort((a, b) => a.createdAt - b.createdAt)
  );

/** Tells the server-side browser the size of the screen showing its live view. */
export const resizeAgentBrowser = (projectId: string, width: number, height: number) =>
  api('agents/browser/viewport', { body: { projectId, width, height } });

// ─── Projects (a chat is a design project) ────────────────────────────────────

export type GenerationItem = {
  id: string;
  name?: string;
  status?: 'generated' | 'edited' | 'stopped' | 'error' | 'generating';
  type?: string;
  timestamp?: string;
  filePath?: string;
  url?: string;
  text?: string;
  publishStatus?: 'published' | 'pending' | 'rejected' | null;
  isActive?: boolean;
  /** Canvas snapshots (type application/json+automation or +workflow). */
  data?: { nodes?: unknown[]; edges?: unknown[] };
  /** A Remotion composition the web plays in its player. */
  videoConfig?: unknown;
};

export type GenerationGroup = {
  _id?: string;
  id?: string;
  title?: string;
  timestamp?: string;
  items: GenerationItem[];
};

export type MessageFile = { id?: string; name?: string; type?: string; url?: string; filePath?: string; size?: number };

export type ProjectMessage = {
  _id?: string;
  id?: string;
  role?: string;
  type?: string;
  text?: string;
  analysis?: string;
  parts?: { type: string; text?: string; options?: string[]; results?: { image: string; alt?: string }[]; query?: string }[];
  totalTime?: number;
  fileAttachments?: MessageFile[];
  attachedFiles?: MessageFile[];
  generationGroups?: GenerationGroup[];
  feedback?: { like?: number; dislike?: number; userReaction?: 'like' | 'dislike' | null };
  isHidden?: boolean;
  createdAt?: string;
};

export type ChatProject = {
  _id: string;
  title: string;
  status: string;
  category?: string;
  type?: string;
  userId: string;
  messages: ProjectMessage[];
  metadata?: {
    selectedInspirationUrl?: string;
    finalizedSelections?: { useBrandIdentity?: boolean };
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
};

export const projectKey = (id: string) => ['chat', 'project', id] as const;
export const runsKey = (id: string) => ['chat', 'runs', id] as const;

export const getProject = (id: string) => api<{ project: ChatProject }>(`project/${id}`).then((data) => data.project);

export function createChatProject(input: {
  prompt: string;
  userId: string;
  userName: string;
  category?: string;
  useBrandIdentity: boolean;
}) {
  return api<{ project: ChatProject }>('project/create', {
    body: {
      title: stripTimeContext(input.prompt).slice(0, 200),
      status: 'active',
      userId: input.userId,
      userName: input.userName,
      collaborators: [],
      messages: [],
      category: input.category ?? 'auto',
      metadata: { finalizedSelections: { useBrandIdentity: input.useBrandIdentity } },
      tags: [],
    },
  }).then((data) => data.project);
}

/**
 * Sends a message through the saved-message pipeline, as the web's option
 * chips do. Replies stream back over the project socket (textDelta, newMessage).
 */
export function generateProjectMessage(projectId: string, prompt: string, metadata: { useBrandIdentity: boolean }) {
  const form = new FormData();
  form.append('prompt', withTimeContext(prompt));
  form.append('mediaType', 'image');
  form.append('metadata', JSON.stringify(metadata));
  return api(`project/generate/${projectId}`, { form, timeoutMs: 180_000 });
}

export const enhancePrompt = (prompt: string) =>
  // The server's AI rewrite can take a while, so this allows more than the usual 30 seconds.
  api<{ prompt: string }>('project/enhance-prompt', { body: { prompt }, timeoutMs: 90_000 }).then((data) => data.prompt);

/** Deletes a message and everything after it, as the web chat does. */
export const deleteProjectMessages = (projectId: string, messageId: string) =>
  api(`project/${projectId}/messages`, { method: 'DELETE', body: { messageId } });

export const editProjectMessage = (projectId: string, messageId: string, text: string) =>
  api(`project/${projectId}/messages/${messageId}`, { method: 'PUT', body: { text } });

export const addReaction = (projectId: string, messageId: string, type: 'like' | 'dislike') =>
  api(`project/${projectId}/messages/${messageId}/reactions`, { body: { type } });

export const removeReaction = (projectId: string, messageId: string, type: 'like' | 'dislike') =>
  api(`project/${projectId}/messages/${messageId}/reactions/${type}`, { method: 'DELETE' });

export const setActiveGeneration = (projectId: string, generationGroupId: string, itemId: string) =>
  api(`project/${projectId}/set-active-generation`, { body: { generationGroupId, itemId } });

export const deleteGenerationItem = (projectId: string, generationGroupId: string, itemId: string) =>
  api(`project/${projectId}/generation-item`, { method: 'DELETE', body: { generationGroupId, itemId } });

/** Repaints the white area of `maskUri` (a PNG the size of the image) following `prompt`. */
export function inpaint(projectId: string, input: { imageUrl: string; maskUri: string; prompt: string; generationGroupId: string }) {
  const form = new FormData();
  form.append('originalImageUrl', input.imageUrl);
  form.append('files', new File(input.maskUri));
  form.append('prompt', input.prompt);
  form.append('generationGroupId', input.generationGroupId);
  return api<{ success: boolean; message?: string }>(`project/${projectId}/inpaint`, { form, timeoutMs: 180_000 });
}

export const saveInspiration = (projectId: string, inspirationUrl: string | null) =>
  api(`project/${projectId}/inspiration`, { method: 'PATCH', body: { inspirationUrl } });

export const publishToInspiration = (input: {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  prompt: string;
  category: string;
  title: string;
}) => api<{ success: boolean; message?: string }>('templates/publish', { body: { ...input, thumbnailUrl: input.mediaUrl }, timeoutMs: 60_000 });

export const unpublishFromInspiration = (mediaUrl: string) =>
  api<{ success: boolean; message?: string }>('templates/unpublish', { body: { mediaUrl }, timeoutMs: 30_000 });

// ─── Agent models ─────────────────────────────────────────────────────────────

export type AgentModel = {
  _id: string;
  modelId?: string;
  name: string;
  description?: string;
  icon?: string;
  type: string;
  isDefault?: boolean;
};

export const listAgentModels = () =>
  api<{ success: boolean; data: AgentModel[] }>('inspire/models', { query: { type: 'general' } }).then((data) =>
    (Array.isArray(data.data) ? data.data : []).filter((model) => model.type === 'general')
  );

export const trackModelUse = (id: string) => api(`inspire/models/${id}/use`, { method: 'POST' }).catch(() => undefined);

// ─── Prompt helpers ───────────────────────────────────────────────────────────

/** Appends the device's time and zone, which the agent uses to read "today" or "next Friday". */
export function withTimeContext(prompt: string) {
  if (prompt.includes('[SystemTimeContext:')) return prompt;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  return `${prompt}\n\n[SystemTimeContext: ${now.toLocaleString()} | TZ: ${zone} | TS: ${now.getTime()}]`;
}

export function stripTimeContext(text: string) {
  return text.replace(/\s*\[SystemTimeContext:[^\]]*\]\s*/g, ' ').trim();
}

export function validatePrompt(value: string, attachmentCount: number) {
  const trimmed = value.trim();
  if (!trimmed && attachmentCount === 0) return 'Type a message or attach a file.';
  if (trimmed && trimmed.length < 2) return 'Add a little more detail (at least 2 characters).';
  if (trimmed.length > 5000) return 'That message is too long (5,000 characters at most).';
  return null;
}
