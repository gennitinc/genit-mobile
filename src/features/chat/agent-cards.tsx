import { Icon } from '@/components/icon';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { connectIntegration } from '@/features/integrations/connect';
import { type CatalogItem, CATALOG, resolveToolkit, useComposioToolkits } from '@/features/integrations/integrations-api';
import { errorMessage } from '@/lib/api';
import type { LocalFile } from '@/lib/files';
import { radius, space, useColors } from '@/lib/theme';
import { useQueryClient } from '@tanstack/react-query';

import {
  type AgentAttachedFile,
  type AgentElicitation,
  type AgentIntegrationRequired,
  type AgentTask,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  saveInspiration,
  uploadAgentFiles,
} from './chat-api';
import { AgentCard, CardButton, CardIcon, PluginLogo, useChatScreen } from './chat-ui';
import { Markdown } from './markdown';
import { InspirationStrip } from './result-cards';

// ─── Thinking and plan ────────────────────────────────────────────────────────

/** The agent's reasoning: open while it streams, collapsible afterwards. */
export function ThinkingStream({ text, active }: { text: string; active: boolean }) {
  const colors = useColors();
  const [userOpen, setUserOpen] = useState(false);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setUserOpen(false);
  }
  const open = active || userOpen;
  if (!text && !active) return null;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole='button'
        accessibilityState={{ expanded: open }}
        onPress={() => !active && setUserOpen((value) => !value)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 9 }}
      >
        <Icon name='bulb-outline' size={15} color={active ? colors.text : colors.textMuted} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }}>{active ? 'Thinking…' : 'Thought process'}</Text>
        {active ? <ActivityIndicator size='small' color={colors.textMuted} /> : <Icon name={open ? 'chevron-down' : 'chevron-forward'} size={15} color={colors.textMuted} />}
      </Pressable>
      {open ? (
        <View style={{ maxHeight: 260, paddingHorizontal: space.md, paddingBottom: space.md }}>
          <Markdown muted size={13}>
            {text || '…'}
          </Markdown>
        </View>
      ) : null}
    </View>
  );
}

export function PlanCard({ tasks }: { tasks: AgentTask[] }) {
  const colors = useColors();
  if (!tasks?.length) return null;
  const done = tasks.filter((task) => task.status === 'done').length;
  return (
    <AgentCard icon={<CardIcon name='list-outline' />} title='Plan' meta={`${done}/${tasks.length}`}>
      {tasks.map((task) => (
        <View key={task.id} style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ width: 16, paddingTop: 2 }}>
            {task.status === 'running' ? (
              <ActivityIndicator size='small' color={colors.textMuted} style={{ transform: [{ scale: 0.7 }] }} />
            ) : (
              <Icon
                name={task.status === 'done' ? 'checkmark-circle' : task.status === 'failed' ? 'alert-circle' : 'ellipse-outline'}
                size={15}
                color={task.status === 'done' ? colors.success : task.status === 'failed' ? '#F59E0B' : colors.borderStrong}
              />
            )}
          </View>
          <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: task.status === 'done' ? colors.textMuted : colors.text }}>
            <Text style={{ textDecorationLine: task.status === 'done' ? 'line-through' : 'none', fontWeight: task.status === 'running' || task.status === 'failed' ? '600' : '400' }}>
              {task.title}
            </Text>
            {task.detail ? <Text style={{ fontSize: 12, color: colors.textMuted }}> · {task.detail}</Text> : null}
          </Text>
        </View>
      ))}
    </AgentCard>
  );
}

// ─── Automation workflow ──────────────────────────────────────────────────────

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  action: 'Action',
  prompt: 'Prompt',
  condition: 'Condition',
  delay: 'Delay',
  ai_generate: 'AI Generate',
  transform: 'Transform',
  http_request: 'HTTP Request',
  upload: 'Upload',
};

function nodePlugin(data: any) {
  const type = String(data?.actionType || data?.triggerType || '');
  const match = type.match(/(?:post_|send_|upload_to_|^)(facebook|instagram|linkedin|tiktok|youtube|brevo|gmail|outlook|whatsapp|google_drive)/);
  if (!match) return undefined;
  const names: Record<string, string> = { google_drive: 'Google Drive', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp' };
  return { slug: match[1], name: names[match[1]] || match[1].charAt(0).toUpperCase() + match[1].slice(1) };
}

const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** One card for every node the agent added, changed or removed in a run. */
export function WorkflowSummaryCard({
  nodes,
  connectionCount,
  removedNodes,
  isUpdate,
}: {
  nodes: any[];
  connectionCount: number;
  removedNodes: any[];
  isUpdate: boolean;
}) {
  const colors = useColors();
  const { openPreview } = useChatScreen();
  const [open, setOpen] = useState(false);
  return (
    <AgentCard
      icon={<CardIcon name='git-network-outline' tone='success' />}
      title={isUpdate ? 'Workflow updated' : 'Workflow created'}
      meta={[
        `${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'}`,
        `${connectionCount} ${connectionCount === 1 ? 'connection' : 'connections'}`,
        ...(removedNodes.length ? [`${removedNodes.length} removed`] : []),
      ].join(' · ')}
      tone='success'
    >
      {nodes.length ? (
        <Pressable accessibilityRole='button' accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>View nodes</Text>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {open
        ? nodes.map((node) => {
            const plugin = nodePlugin(node);
            const subtype = node.triggerType || node.actionType || node.contentType;
            return (
              <View key={node.nodeId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                {plugin ? <PluginLogo label={plugin.name} slug={plugin.slug} size={15} /> : <CardIcon name='ellipse' />}
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                    {node.title || 'Untitled node'}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: colors.textMuted }}>
                    {[NODE_LABELS[node.type] ?? titleCase(node.type || 'action'), subtype ? titleCase(String(subtype)) : ''].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            );
          })
        : null}
      {removedNodes.map((node) => (
        <Text key={node.nodeId} style={{ fontSize: 13, color: colors.textMuted }}>
          <Text style={{ textDecorationLine: 'line-through' }}>{node.title || 'Untitled node'}</Text> · Removed
        </Text>
      ))}
      <CardButton label='View workflow' icon='git-network-outline' onPress={() => openPreview({ kind: 'automation' })} />
    </AgentCard>
  );
}

// ─── Questions from the agent ────────────────────────────────────────────────

const IMAGE_SIZES: Record<string, [string, string]> = {
  '1:1': ['Square', '1024 × 1024'],
  '4:5': ['Portrait', '1024 × 1280'],
  '2:3': ['Tall portrait', '1024 × 1536'],
  '9:16': ['Story', '1080 × 1920'],
  '3:2': ['Landscape', '1536 × 1024'],
  '16:9': ['Wide', '1920 × 1080'],
  '4:3': ['Standard', '1440 × 1080'],
};
const VIDEO_SIZES: Record<string, [string, string]> = {
  '1:1': ['Square', '1080 × 1080'],
  '9:16': ['Vertical', '1080 × 1920'],
  '16:9': ['Landscape', '1920 × 1080'],
  '4:3': ['Standard', '1440 × 1080'],
};

/** Puts numbered or dash-separated questions on their own lines, as the web does. */
export function formatQuestion(value: string) {
  let text = String(value || '').trim();
  const numbered = (n: string) => `${n === '1' ? '\n\n' : '\n'}${n}. `;
  if ((text.match(/\(\d+\)\s+/g) || []).length >= 2) {
    text = text
      .replace(/,\s*(?:and\s+)?\((\d+)\)\s*/gi, (_, n) => numbered(n))
      .replace(/;\s*\((\d+)\)\s*/g, (_, n) => numbered(n))
      .replace(/\s+\((\d+)\)\s*/g, (_, n) => numbered(n));
  }
  if ((text.match(/(?:^|\s)\d+\.\s+/g) || []).length >= 2) {
    text = text.replace(/\s+(?=1\.\s+)/, '\n\n').replace(/\s+(?=[2-9]\d*\.\s+)/g, '\n');
  }
  const category = /([:;])\s*([A-Z][A-Za-z0-9 /&]{1,30})\s*[—–]\s*/g;
  if ([...text.matchAll(category)].length >= 2) {
    text = text.replace(category, (_, separator, label) => `${separator === ':' ? ':' : ''}\n   - **${label.trim()}:** `);
  }
  return text
    .replace(/([.!?])\s+(?=(?:Also|Finally|Please)\b)/g, '$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function ElicitationCard({
  elicitation,
  onSubmit,
}: {
  elicitation: AgentElicitation;
  onSubmit: (value: string, metadata?: { isOther: boolean; attachedFiles?: AgentAttachedFile[] }) => Promise<unknown>;
}) {
  const colors = useColors();
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const options = elicitation.options ?? [];
  const presentation = elicitation.presentation;
  const isSize = presentation === 'image_size' || presentation === 'video_size';
  const isDuration = presentation === 'video_duration';
  const isPlugin = presentation === 'plugin_choice';
  const sizes = presentation === 'video_size' ? VIDEO_SIZES : IMAGE_SIZES;
  const multiple = elicitation.multiple === true;

  const submit = async (answer: string, isOther = false) => {
    if (!answer.trim() && !files.length) return;
    setSubmitting(true);
    setPicked(answer);
    setError('');
    try {
      const attachedFiles = files.length ? await uploadAgentFiles(files) : undefined;
      await onSubmit(answer.trim() || 'See attached files.', { isOther, attachedFiles });
    } catch (caught) {
      setError(errorMessage(caught));
      setPicked(null);
    } finally {
      setSubmitting(false);
    }
  };

  const attach = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'video/*'], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const picked = result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size }));
    const accepted = picked.filter((file) => (file.size ?? 0) <= MAX_ATTACHMENT_BYTES);
    if (accepted.length !== picked.length) setError('Each attachment must be 10 MB or smaller.');
    setFiles((current) => [...current, ...accepted].slice(0, MAX_ATTACHMENTS));
  };

  const optionStyle = (active: boolean) => ({
    borderWidth: 1,
    borderColor: active ? colors.primary : colors.border,
    backgroundColor: active ? colors.selected : colors.background,
    borderRadius: radius.sm,
  });

  return (
    <AgentCard icon={<CardIcon name='help-circle-outline' />} title='Needs your input'>
      <Markdown>{formatQuestion(elicitation.question)}</Markdown>

      {options.length ? (
        <View
          accessibilityRole={multiple ? undefined : 'radiogroup'}
          style={{ flexDirection: isPlugin ? 'column' : 'row', flexWrap: 'wrap', gap: space.sm }}
        >
          {options.map((option) => {
            const active = multiple ? selected.includes(option.value) : picked === option.value;
            const onPress = () =>
              multiple ? setSelected((current) => (current.includes(option.value) ? current.filter((v) => v !== option.value) : [...current, option.value])) : submit(option.value);
            const size = sizes[option.value];
            return (
              <Pressable
                key={option.value}
                accessibilityRole={multiple ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: active, disabled: submitting }}
                accessibilityHint={option.description}
                disabled={submitting}
                onPress={onPress}
                style={({ pressed }) => [
                  optionStyle(active),
                  { opacity: pressed ? 0.7 : 1 },
                  isPlugin
                    ? { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }
                    : isSize || isDuration
                      ? { width: '31%', minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 4, padding: space.sm }
                      : { paddingHorizontal: space.md, paddingVertical: 8 },
                ]}
              >
                {isPlugin ? (
                  <>
                    <PluginLogo icon={option.icon} label={option.label} size={28} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
                        {option.label}
                        {option.connected ? <Text style={{ fontSize: 11, color: colors.success }}>  Connected</Text> : null}
                      </Text>
                      {option.description ? (
                        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
                          {option.description}
                        </Text>
                      ) : null}
                    </View>
                    {active && submitting ? <ActivityIndicator size='small' /> : null}
                  </>
                ) : isDuration ? (
                  <>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{option.value}s</Text>
                    <Text style={{ fontSize: 12, color: colors.text }}>{option.label}</Text>
                  </>
                ) : isSize && size ? (
                  <>
                    <AspectBox ratio={option.value} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{size[0]}</Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>
                      {option.value} · {size[1]}
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 13.5, fontWeight: '500', color: active ? colors.selectedText : colors.text }}>{option.label}</Text>
                )}
              </Pressable>
            );
          })}
          {elicitation.allowOther ? (
            <Pressable
              accessibilityRole='button'
              disabled={submitting}
              onPress={() => setShowOther(true)}
              style={[optionStyle(showOther), isPlugin ? { padding: space.md } : { paddingHorizontal: space.md, paddingVertical: 8 }]}
            >
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }}>Other</Text>
              {isPlugin ? <Text style={{ fontSize: 12, color: colors.textMuted }}>Enter another plugin or describe what you need</Text> : null}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {options.length && multiple ? (
        <CardButton primary label={`Continue (${selected.length})`} busy={submitting} disabled={!selected.length} onPress={() => submit(JSON.stringify(selected))} />
      ) : null}

      {!options.length || showOther ? (
        <View style={{ gap: space.sm }}>
          {files.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {files.map((file, index) => (
                <Pressable
                  key={`${file.uri}-${index}`}
                  accessibilityLabel={`Remove ${file.name}`}
                  onPress={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}
                >
                  <Icon name='attach' size={13} color={colors.textMuted} />
                  <Text numberOfLines={1} style={{ maxWidth: 140, fontSize: 12, color: colors.text }}>
                    {file.name}
                  </Text>
                  <Icon name='close' size={13} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <TextInput
              value={value}
              onChangeText={setValue}
              editable={!submitting}
              placeholder={showOther ? 'Name another plugin or describe what you need…' : 'Type your answer…'}
              placeholderTextColor={colors.textFaint}
              onSubmitEditing={() => submit(value, showOther)}
              returnKeyType='send'
              style={{ flex: 1, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 15 }}
            />
            <Pressable
              accessibilityRole='button'
              accessibilityLabel='Attach images or videos'
              disabled={submitting || files.length >= MAX_ATTACHMENTS}
              onPress={attach}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}
            >
              <Icon name='attach' size={18} color={colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel='Send'
              disabled={submitting || (!value.trim() && !files.length)}
              onPress={() => submit(value, showOther)}
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm,
                backgroundColor: colors.primary,
                opacity: submitting || (!value.trim() && !files.length) ? 0.5 : 1,
              }}
            >
              {submitting ? <ActivityIndicator size='small' color={colors.onPrimary} /> : <Icon name='arrow-up' size={18} color={colors.onPrimary} />}
            </Pressable>
          </View>
        </View>
      ) : null}
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
    </AgentCard>
  );
}

function AspectBox({ ratio }: { ratio: string }) {
  const colors = useColors();
  const [w, h] = ratio.split(':').map(Number);
  const scale = 40 / Math.max(w, h);
  return <View style={{ width: w * scale, height: h * scale, borderRadius: 2, borderWidth: 1.5, borderColor: colors.textMuted }} />;
}

// ─── Connect a plugin to continue ─────────────────────────────────────────────

/** The catalog entry to connect for a platform or toolkit the agent asked for. */
export function catalogItemFor(platform: string, name: string, toolkitSlug?: string): CatalogItem {
  if (toolkitSlug) {
    return { platform: 'composio', appSlug: toolkitSlug, name, category: 'More Plugins', status: 'available', description: '' };
  }
  return CATALOG.find((item) => item.platform === platform) ?? { platform, name, category: 'More Plugins', status: 'available', description: '' };
}

/** Connects through the provider's sign-in page in place, then calls `onConnected`. */
export function useConnect(item: CatalogItem, onConnected?: () => Promise<unknown> | void) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<'idle' | 'connecting' | 'connected' | 'resuming'>('idle');
  const [error, setError] = useState('');

  const resume = async () => {
    if (!onConnected) return;
    setState('resuming');
    setError('');
    try {
      await onConnected();
      setState('connected');
    } catch {
      setState('connected');
      setError(`${item.name} is connected, but the chat couldn't continue. Tap Continue chat to retry.`);
    }
  };

  const connect = async () => {
    setState('connecting');
    setError('');
    try {
      const result = await connectIntegration(item);
      if (result.status === 'cancelled') {
        setState('idle');
        return;
      }
      setState('connected');
      queryClient.invalidateQueries({ queryKey: ['integrations'] });
      await resume();
    } catch (caught) {
      setState('idle');
      setError(errorMessage(caught));
    }
  };

  return { state, error, connect, resume };
}

export function ConnectRequiredCard({ required, onConnected }: { required: AgentIntegrationRequired; onConnected: () => Promise<unknown> }) {
  const colors = useColors();
  const toolkits = useComposioToolkits();
  const toolkit = (toolkits.data ?? []).find((item) => item.slug === required.toolkitSlug) || resolveToolkit(required.platformName, toolkits.data ?? []);
  const name = toolkit?.name || required.platformName;
  const { state, error, connect, resume } = useConnect(catalogItemFor(required.platform, name, required.toolkitSlug), onConnected);

  return (
    <AgentCard
      icon={<CardIcon name='extension-puzzle-outline' />}
      title='Connection required'
      meta={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PluginLogo icon={toolkit?.logo} label={name} slug={required.toolkitSlug ?? required.platform} size={14} />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{name}</Text>
        </View>
      }
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Connect {name} to continue</Text>
      {required.reason ? <Text style={{ fontSize: 13, lineHeight: 19, color: colors.textMuted }}>{required.reason}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name='shield-checkmark-outline' size={13} color={colors.textMuted} />
        <Text style={{ fontSize: 12, color: colors.textMuted }}>Connect securely{required.toolkitSlug ? ' through Composio' : ` to ${name}`}.</Text>
      </View>
      {state === 'connected' || state === 'resuming' ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <CardButton label='Connected' icon='checkmark-circle' disabled onPress={() => undefined} />
          <CardButton primary label={state === 'resuming' ? 'Continuing…' : 'Continue chat'} busy={state === 'resuming'} onPress={resume} />
        </View>
      ) : (
        <CardButton primary label={`Connect ${name}`} icon='link-outline' busy={state === 'connecting'} onPress={connect} />
      )}
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
    </AgentCard>
  );
}

/** A "Connect X" link in a reply, shown as a connect button. */
export function ConnectLinkButton({ label, href }: { label: string; href: string }) {
  const toolkits = useComposioToolkits();
  const toolkit = resolveToolkit(label, toolkits.data ?? []);
  const name = toolkit?.name || label.replace(/^(?:re)?connect\s+|^authorize\s+/i, '');
  const { state, error, connect } = useConnect(
    toolkit ? catalogItemFor('composio', toolkit.name, toolkit.slug) : catalogItemFor('composio', name)
  );
  const colors = useColors();
  if (!toolkit) {
    // The catalog can lag a new toolkit; the provider's own link still works.
    return <CardButton primary label={label} icon='open-outline' onPress={() => WebBrowser.openBrowserAsync(href)} />;
  }
  return (
    <View style={{ gap: 4 }}>
      <CardButton
        primary={state !== 'connected'}
        label={state === 'connected' ? 'Connected' : `Connect ${toolkit.name}`}
        icon={state === 'connected' ? 'checkmark-circle' : 'link-outline'}
        busy={state === 'connecting'}
        disabled={state === 'connected'}
        onPress={connect}
      />
      {error ? <Text style={{ fontSize: 12, color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

// ─── Picking a design inspiration ─────────────────────────────────────────────

const AUTO_SELECT_SECONDS = 10;

/**
 * Inspiration images the agent found. While the agent waits, the person picks
 * one; after ten seconds the top match is chosen for them, as on the web.
 */
export function InspirationPicker({
  results,
  query,
  initialSelection,
  onSelect,
}: {
  results: { image: string; alt?: string }[];
  query: string;
  initialSelection?: string;
  onSelect?: (image: string) => Promise<unknown>;
}) {
  const colors = useColors();
  const { projectId, openPreview } = useChatScreen();
  const [selection, setSelection] = useState<string | null>(initialSelection ?? null);
  const [countdown, setCountdown] = useState(AUTO_SELECT_SECONDS);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  const choose = async (image: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const previous = selection;
    const next = previous === image ? null : image;
    setSelection(next);
    setPaused(true);
    try {
      await saveInspiration(projectId, next);
      if (next) await onSelect?.(next);
    } catch (caught) {
      setSelection(previous);
      setError(errorMessage(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const waiting = !!onSelect && !selection && !paused && results.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      if (countdown <= 1) void choose(results[0].image);
      else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
    // `choose` is stable enough here; re-running on it would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, waiting]);

  if (!results.length) return null;
  return (
    <AgentCard icon={<CardIcon name='sparkles-outline' />} title={`Internet search results (${results.length})`} meta={`"${query}"`}>
      {onSelect && !selection ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text style={{ flex: 1, fontSize: 13, color: colors.textMuted }}>
            {paused ? `Paused at ${countdown}s. Take your time choosing.` : `Choose within ${countdown}s, or Genit picks the top match.`}
          </Text>
          <CardButton label={paused ? 'Resume' : 'Pause'} icon={paused ? 'play' : 'pause'} onPress={() => setPaused((value) => !value)} />
        </View>
      ) : null}
      <InspirationStrip
        items={results}
        onPress={(index) =>
          onSelect ? void choose(results[index].image) : openPreview({ kind: 'media', title: results[index].alt || 'Design inspiration', url: results[index].image, isVideo: false })
        }
      />
      {selection ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name='checkmark-circle' size={15} color={colors.success} />
          <Text style={{ fontSize: 13, color: colors.text }}>Inspiration selected</Text>
          {busy ? <ActivityIndicator size='small' /> : null}
        </View>
      ) : null}
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
    </AgentCard>
  );
}
