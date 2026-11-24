import { ReportButton } from '@/features/safety/report-button';
import { Icon, type IconName } from '@/components/icon';
import { GenitMark } from '@/components/genit-mark';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ConfirmDrawer } from '@/components/drawer';
import { radius, space, useColors } from '@/lib/theme';

import {
  ConnectLinkButton,
  ConnectRequiredCard,
  ElicitationCard,
  InspirationPicker,
  PlanCard,
  ThinkingStream,
  WorkflowSummaryCard,
} from './agent-cards';
import { type AgentAttachedFile, type AgentRun, type AgentToolCall, answerAgent, resumeAfterConnect, stripTimeContext } from './chat-api';
import { AgentCard, CardButton, CardIcon, humanizeToolName, LinkText, PluginLogo, useChatScreen } from './chat-ui';
import { Markdown } from './markdown';
import { renderToolResult } from './result-cards';

// ─── Shared message chrome ────────────────────────────────────────────────────

export function UserBubble({ text, files, actions }: { text: string; files?: AgentAttachedFile[]; actions?: ReactNode }) {
  const colors = useColors();
  const { openPreview } = useChatScreen();
  const shown = stripTimeContext(text);
  return (
    <View style={{ alignItems: 'flex-end', gap: 6 }}>
      {files?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6, maxWidth: '85%' }}>
          {files.map((file, index) =>
            file.type?.startsWith('image/') ? (
              <Pressable
                key={`${file.url}-${index}`}
                accessibilityRole='imagebutton'
                accessibilityLabel={file.name}
                onPress={() => openPreview({ kind: 'media', title: file.name, url: file.url, isVideo: false })}
              >
                <Image source={{ uri: file.url }} style={{ width: 96, height: 96, borderRadius: radius.sm, backgroundColor: colors.surface }} contentFit='cover' />
              </Pressable>
            ) : (
              <Pressable
                key={`${file.url}-${index}`}
                accessibilityRole='button'
                onPress={() =>
                  file.type?.startsWith('video/')
                    ? openPreview({ kind: 'media', title: file.name, url: file.url, isVideo: true })
                    : openPreview({ kind: 'document', title: file.name, url: file.url, downloadUrl: file.url, fileName: file.name })
                }
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220, padding: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}
              >
                <Icon name={file.type?.startsWith('video/') ? 'film-outline' : 'document-outline'} size={16} color={colors.textMuted} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: colors.text }}>
                  {file.name}
                </Text>
              </Pressable>
            )
          )}
        </View>
      ) : null}
      {shown ? (
        <View style={{ maxWidth: '85%', paddingHorizontal: space.md, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: 6, backgroundColor: colors.primary }}>
          <Text selectable style={{ fontSize: 15, lineHeight: 21, color: colors.onPrimary }}>
            {shown}
          </Text>
        </View>
      ) : null}
      {actions}
    </View>
  );
}

export function GenitHeader({ status }: { status?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <GenitMark size={26} />
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>Genit</Text>
      <View style={{ flex: 1 }} />
      {status}
    </View>
  );
}

export type Reaction = 'like' | 'dislike' | null | undefined;

export function MessageActions({
  text,
  reaction,
  onLike,
  onDislike,
  onDelete,
  onEdit,
}: {
  text?: string;
  reaction?: Reaction;
  onLike?: () => void;
  onDislike?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const action = (icon: IconName, label: string, onPress: () => void, active?: boolean) => (
    <Pressable
      key={label}
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ padding: 6, borderRadius: radius.sm, backgroundColor: pressed ? colors.surfacePressed : 'transparent' })}
    >
      <Icon name={icon} size={17} color={active ? colors.primary : colors.textMuted} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {text
        ? action(copied ? 'checkmark' : 'copy-outline', copied ? 'Copied' : 'Copy', async () => {
            await Clipboard.setStringAsync(stripTimeContext(text));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        : null}
      {onEdit ? action('create-outline', 'Edit', onEdit) : null}
      {onLike ? action(reaction === 'like' ? 'thumbs-up' : 'thumbs-up-outline', 'Good response', onLike, reaction === 'like') : null}
      {onDislike ? action(reaction === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline', 'Bad response', onDislike, reaction === 'dislike') : null}
      {onDelete ? action('trash-outline', 'Delete', onDelete) : null}
    </View>
  );
}

function StatusBadge({ status }: { status: AgentRun['status'] }) {
  const colors = useColors();
  const badge = (label: string, tone: 'muted' | 'amber', spinner?: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.full,
        backgroundColor: tone === 'amber' ? 'rgba(245, 158, 11, 0.12)' : colors.surface,
      }}
    >
      {spinner ? <ActivityIndicator size='small' color={colors.textMuted} style={{ transform: [{ scale: 0.6 }], width: 12, height: 12 }} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B' }} />}
      <Text style={{ fontSize: 11, fontWeight: '600', color: tone === 'amber' ? '#B45309' : colors.textMuted }}>{label}</Text>
    </View>
  );
  if (status === 'running') return badge('Working', 'muted', true);
  if (status === 'awaiting_input') return badge('Waiting on you', 'amber');
  if (status === 'awaiting_integration') return badge('Connect account', 'amber');
  if (status === 'failed') return badge('Needs attention', 'amber');
  return null;
}

// ─── Error text ───────────────────────────────────────────────────────────────

export function friendlyError(error?: string) {
  if (!error) return '';
  if (/^invalid_?value$/i.test(error.trim())) return 'Genit produced a value that did not match the available options. Please try again.';
  if (/tool_use[\s\S]*tool_result[\s\S]*corresponding/i.test(error)) return 'A previous step was interrupted before its result was saved. Please try again.';
  if (/(?:messages\.\d+|InvalidToolInputError|NoSuchToolError|AI_[A-Z_]+|tool[_ -]?(?:use|result|call))/i.test(error)) {
    return 'An internal step could not be completed. Please try again.';
  }
  const busy = "We're seeing high demand right now. Please try again in a few moments.";
  try {
    let parsed = JSON.parse(error);
    if (parsed.error && typeof parsed.error.message === 'string') {
      try {
        parsed = JSON.parse(parsed.error.message);
      } catch {
        // The inner message is plain text.
      }
    }
    if (parsed.error) {
      if (parsed.error.status === 'RESOURCE_EXHAUSTED' || parsed.error.code === 429) return busy;
      const message = parsed.error.message || parsed.error.code;
      return typeof message === 'string' ? message : JSON.stringify(message);
    }
    if (typeof parsed.message === 'string') return parsed.message;
    return "We couldn't complete this request. Please try again.";
  } catch {
    if (/429|resource_exhausted|quota|rate limit/i.test(error)) return busy;
  }
  return error.length <= 500 ? error : "We couldn't complete this request. Please try again.";
}

function errorTitle(code: string | undefined, provider: string | undefined) {
  const who = provider || 'Provider';
  switch (code) {
    case 'provider_plan_required':
      return `${who} plan required`;
    case 'provider_quota_limited':
      return `${who} limit reached`;
    case 'provider_authentication_required':
      return ['OpenAI', 'Anthropic', 'Google'].includes(provider || '') ? 'Contact support' : `Reconnect ${provider || 'provider'}`;
    case 'provider_permission_denied':
      return `${who} permission required`;
    case 'provider_action_unavailable':
      return `${who} action unavailable`;
    case 'provider_temporarily_unavailable':
      return `${who} temporarily unavailable`;
    case 'request_invalid':
      return 'Check the request';
    case 'resource_not_found':
      return 'Requested item not found';
    case 'execution_incomplete':
      return 'Workflow did not finish';
    case 'verification_failed':
      return 'Final verification failed';
    default:
      return 'Action needs attention';
  }
}

// ─── Tool calls ───────────────────────────────────────────────────────────────

const AUTOMATION_RENDERS = new Set(['automation_node_created', 'automation_nodes_connected', 'automation_node_updated', 'automation_node_removed', 'automation_nodes_disconnected']);
const QUIET_AUTOMATION_TOOLS = new Set(['get_automation_graph']);
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

/** Every link in a tool's result, labelled by the key it came from. */
export function resultLinks(value: unknown) {
  const links = new Map<string, { url: string; label: string }>();
  const seen = new WeakSet<object>();
  const label = (path: string[], url: string) => {
    const key = [...path]
      .reverse()
      .find((part) => !/^\d+$/.test(part))
      ?.replace(/[_-]+/g, ' ')
      .trim();
    if (key && !/^(url|uri|href|link|file path)$/i.test(key)) return key.replace(/\b\w/g, (c) => c.toUpperCase());
    try {
      return `Open ${new URL(url).hostname.replace(/^www\./, '')}`;
    } catch {
      return 'Open result';
    }
  };
  const visit = (current: unknown, path: string[], depth: number) => {
    if (depth > 8 || current == null) return;
    if (typeof current === 'string') {
      for (const match of current.match(URL_PATTERN) || []) {
        const url = match.replace(/[),.;\]}]+$/, '');
        if (!links.has(url)) links.set(url, { url, label: label(path, url) });
      }
      return;
    }
    if (typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    if (Array.isArray(current)) current.forEach((item, index) => visit(item, [...path, String(index + 1)], depth + 1));
    else Object.entries(current).forEach(([key, item]) => visit(item, [...path, key], depth + 1));
  };
  visit(value, [], 0);
  return [...links.values()];
}

function workflowSummary(calls: AgentToolCall[]) {
  const key = (source: string, handle: string | undefined, target: string) => `${source}:${handle || ''}:${target}`;
  const nodes = new Map<string, any>();
  const connections = new Set<string>();
  const removed = new Map<string, any>();
  const updated = new Set<string>();
  let disconnected = 0;
  const drop = (matches: (k: string) => boolean) => [...connections].forEach((k) => matches(k) && connections.delete(k));
  for (const call of calls) {
    if (!call.result?.ok) continue;
    const data = call.result.data || {};
    if (call.render === 'automation_node_created' && data.nodeId) {
      nodes.set(data.nodeId, { ...nodes.get(data.nodeId), ...data });
      removed.delete(data.nodeId);
      if (data.reused) updated.add(data.nodeId);
      if (data.connectedFrom) connections.add(key(data.connectedFrom, data.sourceHandle, data.nodeId));
    }
    if (call.render === 'automation_node_updated' && data.nodeId) {
      nodes.set(data.nodeId, { ...nodes.get(data.nodeId), ...data });
      updated.add(data.nodeId);
    }
    if (call.render === 'automation_nodes_connected' && data.sourceId && data.targetId) connections.add(key(data.sourceId, data.sourceHandle, data.targetId));
    if (call.render === 'automation_nodes_disconnected') {
      disconnected += Number(data.removedConnections) || 0;
      drop((k) => {
        const [source, handle, target] = k.split(':');
        return source === data.sourceId && target === data.targetId && (!data.sourceHandle || handle === data.sourceHandle);
      });
    }
    if (call.render === 'automation_node_removed') {
      for (const node of data.nodes || []) {
        if (!node?.nodeId) continue;
        nodes.delete(node.nodeId);
        updated.delete(node.nodeId);
        removed.set(node.nodeId, node);
        drop((k) => {
          const [source, , target] = k.split(':');
          return source === node.nodeId || target === node.nodeId;
        });
      }
      for (const edge of data.reconnected || []) connections.add(key(edge.sourceId, edge.sourceHandle, edge.targetId));
    }
  }
  const list = [...nodes.values()];
  return {
    nodes: list,
    connectionCount: connections.size,
    removedNodes: [...removed.values()],
    isUpdate: removed.size > 0 || updated.size > 0 || disconnected > 0 || list.some((node) => node.verifiedOnly),
  };
}

function pendingLabel(call: AgentToolCall) {
  switch (call.name) {
    case 'web_search':
      return 'Searching the web';
    case 'create_automation_node':
      return `Creating ${call.args?.data?.title || call.args?.type || 'node'}`;
    case 'connect_automation_nodes':
      return 'Connecting nodes';
    case 'update_automation_node':
      return `Updating ${call.args?.data?.title || 'node'}`;
    case 'delete_automation_node': {
      const count = call.args?.nodeIds?.length || 1;
      return count === 1 ? 'Removing node' : `Removing ${count} nodes`;
    }
    case 'disconnect_automation_nodes':
      return 'Disconnecting nodes';
    case 'get_automation_graph':
      return 'Reading workflow';
    default:
      return humanizeToolName(call.name);
  }
}

function ToolCall({ call, inspiration }: { call: AgentToolCall; inspiration?: { onSelect?: (image: string) => Promise<unknown> } }) {
  const colors = useColors();
  if (call.name === 'request_user_input' || call.name.toUpperCase().startsWith('COMPOSIO_')) return null;

  if (!call.result) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
        <ActivityIndicator size='small' color={colors.textMuted} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.textMuted }}>
          <Text style={{ fontWeight: '600', color: colors.text }}>{pendingLabel(call)}</Text> running…
        </Text>
      </View>
    );
  }
  if (!call.result.ok) return null;
  const data = call.result.data || {};

  if (call.render === 'design_inspiration') {
    const results = Array.isArray(data) ? data : data?.pins || data?.inspirations || [];
    return <InspirationPicker results={results} query={call.args?.query || 'design inspiration'} onSelect={inspiration?.onSelect} />;
  }

  const rendered = renderToolResult(call.render, data);
  if (rendered) return <>{rendered}</>;

  return (
    <AgentCard
      icon={data?.provider ? <PluginLogo label={data.provider} slug={data.providerSlug} size={15} /> : <CardIcon name='checkmark-circle' tone='success' />}
      title={humanizeToolName(call.name)}
      meta={data?.provider}
      tone='success'
    />
  );
}

function ToolLinks({ links }: { links: { url: string; label: string }[] }) {
  const colors = useColors();
  const [all, setAll] = useState(false);
  if (!links.length) return null;
  const shown = all ? links : links.slice(0, 6);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
      {shown.map((link) => (
        <LinkText key={link.url} label={link.label} url={link.url} />
      ))}
      {links.length > 6 && !all ? (
        <Text onPress={() => setAll(true)} style={{ fontSize: 13, color: colors.textMuted }}>
          {links.length - 6} more {links.length - 6 === 1 ? 'link' : 'links'}
        </Text>
      ) : null}
    </View>
  );
}

/** Opens a pre-filled email to Genit support (the web form has no server route). */
function contactSupport(subject: string, prompt: string) {
  const body = `What I asked Genit:\n${stripTimeContext(prompt)}\n\n`;
  Linking.openURL(`mailto:hello@trygenit.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`).catch(() => undefined);
}

// ─── A whole run ──────────────────────────────────────────────────────────────

export function AgentMessage({ run, onDelete }: { run: AgentRun; onDelete: () => Promise<unknown> }) {
  const colors = useColors();
  const [confirming, setConfirming] = useState(false);
  const isDone = run.status !== 'running';
  const awaitsInspiration = run.status === 'awaiting_input' && !!run.elicitation?.question.toLowerCase().includes('inspiration');
  const text = /\b(gpt-|input_fidelity|api error|[45]\d\d the model)\b/i.test(run.text) ? "I couldn't complete this request. Please try again." : run.text;

  const failedTool = [...run.toolCalls].reverse().find((call) => call.result?.ok === false);
  const errorCode = failedTool?.result?.errorCode || run.errorCode;
  const errorProvider = failedTool?.result?.provider || run.errorProvider;

  // Several inspiration searches in one run show as one merged picker.
  const inspirationCalls = run.toolCalls.filter((call) => call.render === 'design_inspiration');
  let calls = run.toolCalls;
  if (inspirationCalls.length > 1) {
    const seen = new Set<string>();
    const merged = inspirationCalls
      .flatMap((call) => (Array.isArray(call.result?.data) ? call.result.data : []))
      .filter((item: any) => item?.image && !seen.has(item.image) && seen.add(item.image));
    const first = run.toolCalls.findIndex((call) => call.render === 'design_inspiration');
    calls = run.toolCalls
      .filter((call, index) => call.render !== 'design_inspiration' || index === first)
      .map((call) => (call.render === 'design_inspiration' ? { ...call, result: { ok: true, data: merged } } : call));
  }
  const summary = workflowSummary(calls);
  const visible = calls
    .filter((call) => !AUTOMATION_RENDERS.has(call.render || '') && !(call.result && QUIET_AUTOMATION_TOOLS.has(call.name)))
    .filter((call) => (call.name.toUpperCase().startsWith('COMPOSIO_') ? !!(call.result?.ok && resultLinks(call.result.data).length) : !!call.result || run.status === 'running'));

  return (
    <View style={{ gap: space.md }}>
      {run.prompt || run.attachedFiles?.length ? <UserBubble text={run.prompt} files={run.attachedFiles} /> : null}

      <View style={{ gap: space.sm }}>
        <GenitHeader status={<StatusBadge status={run.status} />} />
        <ThinkingStream text={run.thinking} active={run.thinkingActive && run.status === 'running'} />
        <PlanCard tasks={run.plan} />

        {visible.map((call) => (
          <View key={call.id} style={{ gap: space.sm }}>
            <ToolCall call={call} inspiration={awaitsInspiration ? { onSelect: (image) => answerAgent(run.runId, image) } : undefined} />
            {call.result?.ok && !['request_user_input'].includes(call.name) && !['design_inspiration', 'web_search_results', 'browser_session'].includes(call.render || '') ? (
              <ToolLinks links={resultLinks(call.result.data)} />
            ) : null}
          </View>
        ))}

        {summary.nodes.length || summary.connectionCount || summary.removedNodes.length ? <WorkflowSummaryCard {...summary} /> : null}

        {run.integrationRequired && run.status === 'awaiting_integration' ? (
          <ConnectRequiredCard required={run.integrationRequired} onConnected={() => resumeAfterConnect(run.runId, run.integrationRequired!.platform)} />
        ) : null}

        {run.elicitation && run.status === 'awaiting_input' && !awaitsInspiration ? (
          <ElicitationCard elicitation={run.elicitation} onSubmit={(value, metadata) => answerAgent(run.runId, value, metadata)} />
        ) : null}

        {text && !(run.status === 'failed' && run.error) ? <Markdown renderConnection={(label, href) => <ConnectLinkButton label={label} href={href} />}>{text}</Markdown> : null}

        {run.error ? (
          <View style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
            <Icon name='alert-circle-outline' size={18} color='#F59E0B' />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {errorProvider ? <PluginLogo label={errorProvider} size={14} /> : null}
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{errorTitle(errorCode, errorProvider)}</Text>
              </View>
              <Text selectable style={{ fontSize: 13, lineHeight: 19, color: colors.textMuted }}>
                {friendlyError(run.error)}
              </Text>
            </View>
          </View>
        ) : null}

        {run.status === 'failed' && errorCode === 'genit_feature_missing' ? (
          <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Want Genit to support this?</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Send the request to our team, or contact support if you expected it to work already.</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <CardButton primary label='Request this feature' onPress={() => contactSupport('Feature request', run.prompt)} />
              <CardButton label='Contact support' onPress={() => contactSupport('Support request', run.prompt)} />
            </View>
          </View>
        ) : null}

        {isDone ? <><MessageActions text={run.text} onDelete={() => setConfirming(true)} /><ReportButton kind='ai' contentId={`run:${run.runId}`} /></> : null}
      </View>

      <ConfirmDrawer
        visible={confirming}
        onClose={() => setConfirming(false)}
        title='Delete this reply?'
        message='The prompt and everything Genit did for it are deleted from this chat.'
        confirmLabel='Delete'
        destructive
        onConfirm={onDelete}
      />
    </View>
  );
}
