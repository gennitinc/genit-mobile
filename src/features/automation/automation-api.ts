import { api, ApiError, apiUrl, authHeaders } from '@/lib/api';

export type AutomationNode = { id: string; type?: string; position?: { x: number; y: number }; data?: Record<string, unknown> };

export type AutomationDocument = {
  nodes: AutomationNode[];
  edges: Record<string, unknown>[];
  viewport?: unknown;
  name?: string;
};

export type AutomationProject = {
  _id: string;
  title: string;
  category?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
};

export type AutomationPage = {
  projects: AutomationProject[];
  pagination: { currentPage: number; hasNextPage: boolean; totalCount: number };
};

export type AutomationIssue = { nodeId: string; errors: string[] };

type AutomationResponse = { data: AutomationDocument; revision?: number; ready?: boolean; validationErrors?: AutomationIssue[] };

export const automationKeys = {
  list: (search: string) => ['automations', 'list', search] as const,
  document: (id: string) => ['automations', 'document', id] as const,
};

export const listAutomations = (page: number, search: string) =>
  api<AutomationPage>('project/myprojects', { query: { type: 'automation', page, limit: 12, search: search || undefined } });

export const getAutomation = (id: string) => api<AutomationResponse>(`apps/automation/${id}`);

/** The graph as the canvas loads it: laid out if needed, with each step's validation issues. */
export const getAutomationGraph = (id: string) => api<AutomationResponse>(`apps/automation/${id}`, { query: { layout: 1 } });

/**
 * Applies `change` to the stored graph and saves it. The save carries the
 * revision it was based on; if the graph changed elsewhere meanwhile (409),
 * reload it and apply the change once more.
 */
export async function updateAutomationGraph(id: string, change: (document: AutomationDocument) => Pick<AutomationDocument, 'nodes' | 'edges'>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, revision } = await getAutomation(id);
    const next = change({ ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] });
    try {
      return await api<AutomationResponse & { message?: string; dropped?: string[] }>(`apps/automation/${id}`, {
        method: 'PUT',
        body: { nodes: next.nodes, edges: next.edges, viewport: data.viewport, baseRevision: revision },
      });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409) || attempt === 1) throw error;
    }
  }
}

export type DryRunResult = { ok: boolean; message: string; errors: string[]; trace: string[] };

function traceLines(trace: any[] = []) {
  return trace.map((step) => {
    if (step.type === 'condition') return step.outcome ? `${step.nodeId}: ${step.outcome} branch` : `${step.nodeId}: ${step.detail || step.status || 'validated'}`;
    if (step.type === 'delay') return `${step.nodeId}: ${step.detail || 'delay validated without waiting'}`;
    return `${step.nodeId}: ${step.status || step.type}`;
  });
}

/**
 * The zero-credit dry run from one step: simulates the workflow without
 * generating or publishing anything. A failed run answers 400 with the issues,
 * which the shared client would drop, so this reads the body itself.
 */
export async function dryRunAutomation(id: string, nodeId: string): Promise<DryRunResult> {
  let response: Response;
  try {
    response = await fetch(apiUrl(`apps/automation/${id}/test-run`), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ nodeId }),
    });
  } catch {
    throw new ApiError(0, "We couldn't reach Genit. Check your connection and try again.");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok && response.status !== 400) throw new ApiError(response.status, body?.message || 'Dry run failed');
  return {
    ok: response.ok && body?.success !== false,
    message: body?.message || (response.ok ? 'Zero-credit dry run passed.' : 'Dry run found issues'),
    errors: Array.isArray(body?.errors) ? body.errors : [],
    trace: traceLines(body?.data?.trace),
  };
}

export const deleteAutomation = (id: string) => api(`project/${id}`, { method: 'DELETE' });

/** An automation runs when it has no triggers yet, or any trigger is active. */
export function isEnabled(document?: AutomationDocument) {
  const triggers = document?.nodes?.filter((node) => node.type === 'trigger') ?? [];
  return triggers.length === 0 || triggers.some((node) => node.data?.isActive !== false);
}

/** Turns every trigger on or off and saves the graph. */
export async function setEnabled(id: string, enabled: boolean) {
  await updateAutomationGraph(id, (document) => ({
    nodes: document.nodes.map((node) => (node.type === 'trigger' ? { ...node, data: { ...node.data, isActive: enabled } } : node)),
    edges: document.edges,
  }));
}

const NODE_LABEL: Record<string, string> = {
  trigger: 'Trigger',
  action: 'Action',
  prompt: 'Prompt',
  ai_generate: 'AI generate',
  condition: 'Condition',
  delay: 'Delay',
  transform: 'Transform',
  http_request: 'HTTP request',
  upload: 'Upload',
};

/** The first few steps, in order, for the card's mini pipeline. */
export function pipelineSteps(document?: AutomationDocument) {
  return (document?.nodes ?? []).slice(0, 4).map((node) => NODE_LABEL[node.type ?? ''] ?? node.type ?? 'Step');
}

export const TEMPLATES = [
  {
    title: 'Cross-Platform Scheduler',
    badge: 'Social Media',
    description: 'Generate and schedule posts to Instagram, X, and LinkedIn automatically when new content is ready.',
    prompt:
      'Create a brand automation workflow that triggers on a content approval event, uses AI to generate customized image posts and captions for Instagram, X, and LinkedIn, and auto-schedules them.',
  },
  {
    title: 'Lead Nurture Campaign',
    badge: 'Email Marketing',
    description: 'Capture new leads from your webhook, delay for a custom grace period, then send a tailored email with Brevo.',
    prompt:
      'Create a lead nurturing workflow that triggers when a webhook receives new sign-up data, delays for 15 minutes, generates a personalized onboarding email template, and sends it using Brevo.',
  },
  {
    title: 'Smart YouTube Repurposer',
    badge: 'AI Workflow',
    description: 'Auto-extract transcripts from YouTube videos to write scripts, summaries, and social promo threads.',
    prompt:
      'Create a content repurposing workflow that triggers on YouTube video uploads, calls the video transcript analyzer, generates a short thread post for X, and saves it in a brand folder.',
  },
];
