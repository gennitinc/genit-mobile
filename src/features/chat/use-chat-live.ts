import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getSocket } from '@/lib/socket';

import { type AgentRun, type ChatProject, listAgentRuns, projectKey, runsKey } from './chat-api';

type AnyEvent = { runId: string; projectId: string; [key: string]: any };

function blankRun(runId: string, prompt = ''): AgentRun {
  return {
    runId,
    prompt,
    status: 'running',
    plan: [],
    thinking: '',
    thinkingActive: false,
    toolCalls: [],
    text: '',
    createdAt: Date.now(),
  };
}

/** Applies `change` to one run in the cache, adding the run if it isn't there yet. */
export function updateRun(queryClient: QueryClient, projectId: string, runId: string, change: (run: AgentRun) => AgentRun, prompt?: string) {
  queryClient.setQueryData<AgentRun[]>(runsKey(projectId), (runs = []) => {
    const index = runs.findIndex((run) => run.runId === runId);
    if (index === -1) return [...runs, change(blankRun(runId, prompt))];
    const next = [...runs];
    next[index] = change(next[index]);
    return next;
  });
}

/**
 * The project's agent runs, kept live. Socket events stream each step as it
 * happens; while a run is working, a refetch every 5 seconds closes any gap
 * from a reconnect or a missed event, exactly as the web chat does.
 */
export function useAgentRuns(projectId: string) {
  const queryClient = useQueryClient();
  const runs = useQuery({
    queryKey: runsKey(projectId),
    queryFn: () => listAgentRuns(projectId),
    refetchInterval: (query) => (query.state.data?.some((run) => run.status === 'running') ? 5000 : false),
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const mine = (event: AnyEvent) => event?.projectId === projectId;
    const patch = (event: AnyEvent, change: (run: AgentRun) => AgentRun, prompt?: string) => {
      if (mine(event)) updateRun(queryClient, projectId, event.runId, change, prompt);
    };
    const refetch = () => queryClient.invalidateQueries({ queryKey: runsKey(projectId) });

    const join = () => {
      socket.emit('joinProject', projectId, () => refetch());
    };

    const handlers: Record<string, (event: AnyEvent) => void> = {
      'agent:run:start': (e) => patch(e, (run) => ({ ...run, prompt: e.prompt ?? run.prompt, status: 'running' }), e.prompt),
      'agent:plan': (e) => patch(e, (run) => ({ ...run, plan: e.tasks ?? [] })),
      'agent:task:update': (e) =>
        patch(e, (run) => ({
          ...run,
          plan: run.plan.map((task) =>
            task.id === e.taskId ? { ...task, status: e.status, detail: e.status === 'done' ? undefined : (e.detail ?? task.detail) } : task
          ),
        })),
      'agent:thinking:delta': (e) => patch(e, (run) => ({ ...run, thinking: run.thinking + (e.delta || ''), thinkingActive: true })),
      'agent:thinking:end': (e) => patch(e, (run) => ({ ...run, thinkingActive: false })),
      'agent:tool:call': (e) =>
        patch(e, (run) => ({
          ...run,
          toolCalls: [...run.toolCalls.filter((call) => call.id !== e.toolCallId), { id: e.toolCallId, name: e.name, args: e.args ?? {} }],
        })),
      'agent:tool:result': (e) =>
        patch(e, (run) => ({
          ...run,
          toolCalls: run.toolCalls.map((call) =>
            call.id === e.toolCallId
              ? {
                  ...call,
                  result: { ok: !!e.ok, data: e.data, error: e.error, errorCode: e.errorCode, provider: e.provider, verification: e.verification },
                  render: e.render,
                }
              : call
          ),
        })),
      'agent:elicit': (e) =>
        patch(e, (run) => ({
          ...run,
          status: 'awaiting_input',
          elicitation: { question: e.question, options: e.options, presentation: e.presentation, allowOther: e.allowOther, multiple: e.multiple },
        })),
      'agent:integration_required': (e) =>
        patch(e, (run) => ({
          ...run,
          status: 'awaiting_integration',
          integrationRequired: { platform: e.platform, platformName: e.platformName, reason: e.reason, toolkitSlug: e.toolkitSlug },
        })),
      'agent:text:delta': (e) => patch(e, (run) => ({ ...run, text: run.text + (e.delta || '') })),
      'agent:run:resume': (e) =>
        patch(e, (run) => ({
          ...run,
          status: 'running',
          thinkingActive: false,
          text: run.status === 'cancelled' ? '' : run.text,
          error: undefined,
          errorCode: undefined,
          errorProvider: undefined,
          plan: run.plan.map((task) => (task.status === 'failed' || task.status === 'running' ? { ...task, status: 'pending', detail: undefined } : task)),
          elicitation: undefined,
          integrationRequired: undefined,
        })),
      'agent:run:end': (e) => {
        patch(e, (run) => ({
          ...run,
          status: e.status,
          thinkingActive: false,
          text: e.finalText || run.text,
          error: e.error,
          errorCode: e.errorCode,
          errorProvider: e.provider,
          ...(e.status === 'completed' ? { elicitation: undefined, integrationRequired: undefined } : {}),
        }));
        if (mine(e)) {
          refetch();
          // A finished run may have used credits or changed the project.
          queryClient.invalidateQueries({ queryKey: projectKey(projectId) });
        }
      },
    };

    socket.on('connect', join);
    for (const [name, handler] of Object.entries(handlers)) socket.on(name, handler);
    if (socket.connected) join();

    return () => {
      socket.emit('leaveProject', projectId);
      socket.off('connect', join);
      for (const [name, handler] of Object.entries(handlers)) socket.off(name, handler);
    };
  }, [projectId, queryClient]);

  return runs;
}

/**
 * Older chats stored replies as project messages. The server still pushes
 * project updates and streamed text for them over the socket.
 */
export type LiveDesign = { id: string; filePath: string; name: string; prompt: string };

export function useProjectLive(projectId: string) {
  const queryClient = useQueryClient();
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [liveNodes, setLiveNodes] = useState<LiveDesign[]>([]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const mine = (event: { projectId?: string; project_id?: string; _id?: string } | undefined) => {
      const id = event?.projectId || event?.project_id || event?._id;
      return !id || id === projectId;
    };

    const onNewMessage = (project: ChatProject) => {
      if (!project || project._id !== projectId || !Array.isArray(project.messages)) return;
      queryClient.setQueryData(projectKey(projectId), project);
      setStreamingText('');
      setGeneratingImage(false);
      setStatus(null);
    };
    const onTextStart = (e: any) => mine(e) && setStreamingText('');
    const onTextDelta = (e: any) => {
      if (mine(e) && typeof e?.delta === 'string') setStreamingText((text) => text + e.delta);
    };
    const onTextCompleted = (e: any) => mine(e) && setStreamingText('');
    const onGenerating = (e: any) => mine(e) && !e?.isInpaint && setGeneratingImage(true);
    const onGeneratingStop = (e: any) => mine(e) && setGeneratingImage(false);
    const onStatus = (e: any) => {
      if (!mine(e)) return;
      if (e?.text) setStatus(e.text);
      if (e?.done) {
        setGeneratingImage(false);
        setTimeout(() => setStatus(null), 2000);
      }
    };

    // Designs appear here as they finish, before the saved message arrives.
    const onNodeNew = (e: any) => {
      if (!mine(e) || !e?.id || !e?.filePath) return;
      setLiveNodes((nodes) => (nodes.some((node) => node.id === e.id) ? nodes : [...nodes, { id: e.id, filePath: e.filePath, name: e.name || 'Design', prompt: e.prompt || '' }]));
    };

    socket.on('workflow:node:new', onNodeNew);
    socket.on('newMessage', onNewMessage);
    socket.on('textStart', onTextStart);
    socket.on('textDelta', onTextDelta);
    socket.on('textCompleted', onTextCompleted);
    socket.on('generatingimage', onGenerating);
    socket.on('generatingimage:stop', onGeneratingStop);
    socket.on('workflow:ai:status', onStatus);
    return () => {
      socket.off('workflow:node:new', onNodeNew);
      socket.off('newMessage', onNewMessage);
      socket.off('textStart', onTextStart);
      socket.off('textDelta', onTextDelta);
      socket.off('textCompleted', onTextCompleted);
      socket.off('generatingimage', onGenerating);
      socket.off('generatingimage:stop', onGeneratingStop);
      socket.off('workflow:ai:status', onStatus);
    };
  }, [projectId, queryClient]);

  return { streamingText, status, generatingImage, liveNodes };
}
