import { Icon, type IconName } from '@/components/icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Drawer } from '@/components/drawer';
import { Empty, LoadError, Loading, Pill, Segmented } from '@/components/kit';
import { Button, Field } from '@/components/ui';
import {
  type AutomationIssue,
  type AutomationNode,
  dryRunAutomation,
  type DryRunResult,
  getAutomationGraph,
  isEnabled,
  setEnabled,
  updateAutomationGraph,
} from '@/features/automation/automation-api';
import { AddStepDrawer } from '@/features/automation/add-step-drawer';
import { AutomationCanvas } from '@/features/automation/automation-canvas';
import { type Draft, StepFields, TYPED_STEPS } from '@/features/automation/step-editors';
import { errorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { radius, space, useColors } from '@/lib/theme';

import { humanizeKey, useChatScreen } from './chat-ui';

const NODE_LABELS: Record<string, string> = {
  trigger: 'Trigger',
  action: 'Action',
  prompt: 'Prompt',
  condition: 'Condition',
  delay: 'Delay',
  ai_generate: 'AI generate',
  transform: 'Transform',
  http_request: 'HTTP request',
  upload: 'Upload',
};

const NODE_ICONS: Record<string, IconName> = {
  trigger: 'flash-outline',
  action: 'send-outline',
  prompt: 'chatbox-ellipses-outline',
  condition: 'git-branch-outline',
  delay: 'hourglass-outline',
  ai_generate: 'sparkles-outline',
  transform: 'shuffle-outline',
  http_request: 'globe-outline',
  upload: 'cloud-upload-outline',
};

/** Fields the canvas manages itself; the rest of a step's text settings can be edited here. */
const HIDDEN_FIELDS = new Set([
  'isActive',
  'isTesting',
  'webhookSecret',
  'composioLogo',
  'iconUrl',
  'composioToolkit',
  'composioTriggerSlug',
  'composioAction',
  'connectionPlatform',
  'triggerType',
  'actionType',
  'contentType',
  'nodeType',
  'revision',
]);
const READ_ONLY_FIELDS = new Set(['webhookUrl']);
const MULTILINE = /prompt|body|text|message|content|description|template|expression|caption/i;

type Edge = { id?: string; source?: string; target?: string; sourceHandle?: string | null };
type Step = { node: AutomationNode; depth: number; branch?: string };

export const automationGraphKey = (id: string) => ['automations', 'graph', id] as const;

/** Steps in the order they run, following edges from the triggers; condition branches are labeled. */
function orderSteps(nodes: AutomationNode[], edges: Edge[]): Step[] {
  const incoming = new Set(edges.map((edge) => edge.target));
  const steps: Step[] = [];
  const seen = new Set<string>();
  const visit = (node: AutomationNode, depth: number, branch?: string) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    steps.push({ node, depth, branch });
    const out = edges.filter((edge) => edge.source === node.id);
    const branching = node.type === 'condition' && out.length > 1;
    for (const edge of out) {
      const next = nodes.find((item) => item.id === edge.target);
      if (!next) continue;
      const label = node.type === 'condition' && edge.sourceHandle ? (edge.sourceHandle === 'true' ? 'If true' : edge.sourceHandle === 'false' ? 'If false' : edge.sourceHandle) : undefined;
      visit(next, branching ? depth + 1 : depth, label);
    }
  };
  for (const root of nodes.filter((node) => !incoming.has(node.id))) visit(root, 0);
  for (const node of nodes) visit(node, 0);
  return steps;
}

function subtitle(node: AutomationNode) {
  const data = (node.data ?? {}) as Record<string, any>;
  const subtype = data.triggerType || data.actionType || data.contentType;
  return [NODE_LABELS[node.type ?? ''] ?? node.type, subtype ? String(subtype).replace(/_/g, ' ') : ''].filter(Boolean).join(' · ');
}

/**
 * The chat's automation, as the web's canvas shows it: steps in run order with
 * branches and validation issues, live while Genit edits it. Steps can be
 * edited, deleted and dry-run; new steps come from the add menu or from Genit.
 */
export function AutomationPreview({ projectId }: { projectId: string }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { prefillComposer } = useChatScreen();
  const graph = useQuery({ queryKey: automationGraphKey(projectId), queryFn: () => getAutomationGraph(projectId) });
  const [open, setOpen] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'canvas' | 'steps'>('canvas');
  const [selected, setSelected] = useState<string | null>(null);

  // The agent edits the graph while the person watches.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const refresh = (event: any) => {
      if (String(event?.projectId) === String(projectId)) queryClient.invalidateQueries({ queryKey: automationGraphKey(projectId) });
    };
    const events = ['automation:graph:update', 'automation:ai:update', 'agent:run:end'];
    for (const name of events) socket.on(name, refresh);
    return () => {
      for (const name of events) socket.off(name, refresh);
    };
  }, [projectId, queryClient]);

  if (graph.isLoading) return <Loading />;
  if (graph.isError) return <LoadError error={graph.error} onRetry={graph.refetch} />;
  const document = graph.data?.data;
  const nodes = document?.nodes ?? [];
  const edges = (document?.edges ?? []) as Edge[];
  const issues = new Map((graph.data?.validationErrors ?? []).map((issue: AutomationIssue) => [issue.nodeId, issue.errors]));
  const enabled = isEnabled(document);
  const refresh = () => queryClient.invalidateQueries({ queryKey: automationGraphKey(projectId) });

  const addStep = () => prefillComposer?.('Add a step to this automation that ');
  const addDrawer = (
    <AddStepDrawer
      projectId={projectId}
      visible={adding}
      onClose={() => setAdding(false)}
      onAdded={async (nodeId) => {
        await refresh();
        if (view === 'canvas') setSelected(nodeId);
        else setOpen(nodeId);
      }}
    />
  );

  if (!nodes.length) {
    return (
      <View style={{ flex: 1, paddingHorizontal: space.page, gap: space.md }}>
        <Empty icon='git-network-outline' title='No steps yet' message='Add a trigger and the actions that follow, or ask Genit to build it.' />
        <Button title='Add a step' icon={<Icon name='add' size={18} color={colors.onPrimary} />} onPress={() => setAdding(true)} />
        {prefillComposer ? <Button title='Ask Genit to add a step' variant='secondary' onPress={addStep} /> : null}
        {addDrawer}
      </View>
    );
  }

  const steps = orderSteps(nodes, edges);
  const ready = graph.data?.ready ?? issues.size === 0;

  const toggleActive = async (value: boolean) => {
    setToggling(true);
    setError('');
    try {
      await setEnabled(projectId, value);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setToggling(false);
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.page }}>
      <View style={{ flex: 1 }}>
        <Segmented
          options={[
            { value: 'canvas', label: 'Canvas' },
            { value: 'steps', label: 'Steps', count: nodes.length },
          ]}
          value={view}
          onChange={setView}
        />
      </View>
      <Pressable
        accessibilityRole='switch'
        accessibilityState={{ checked: enabled, disabled: toggling }}
        accessibilityLabel={enabled ? 'Active. Turn off' : 'Paused. Turn on'}
        disabled={toggling}
        onPress={() => toggleActive(!enabled)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: enabled ? colors.successSurface : colors.surface }}
      >
        {toggling ? <ActivityIndicator size='small' /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: enabled ? colors.success : colors.textFaint }} />}
        <Text style={{ fontSize: 13, fontWeight: '600', color: enabled ? colors.success : colors.textMuted }}>{enabled ? 'Active' : 'Paused'}</Text>
      </Pressable>
    </View>
  );

  if (view === 'canvas') {
    const node = nodes.find((item) => item.id === selected);
    const title = String(node?.data?.title || 'Step');
    const outgoing = node ? edges.filter((edge) => edge.source === node.id) : [];
    return (
      <View style={{ flex: 1, gap: space.sm, paddingBottom: space.sm }}>
        {header}
        {error ? <Text style={{ paddingHorizontal: space.page, fontSize: 13, color: colors.danger }}>{error}</Text> : null}
        <AutomationCanvas projectId={projectId} nodes={nodes} edges={edges} issues={issues} onChanged={refresh} onOpenStep={setSelected} onAdd={() => setAdding(true)} />
        {addDrawer}
        <Drawer visible={!!node} onClose={() => setSelected(null)} title={title} tall>
          {node ? (
            <View style={{ gap: space.md }}>
              <Text style={{ fontSize: 13, color: colors.textMuted }}>{subtitle(node)}</Text>
              {(issues.get(node.id) ?? []).map((issue) => (
                <View key={issue} style={{ flexDirection: 'row', gap: 6 }}>
                  <Icon name='alert-circle' size={14} color={colors.danger} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, fontSize: 13, color: colors.danger }}>{issue}</Text>
                </View>
              ))}
              <StepEditor key={node.id} projectId={projectId} node={node} onChanged={refresh} />
              {outgoing.length ? (
                <View style={{ gap: space.sm }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Leads to</Text>
                  {outgoing.map((edge) => {
                    const target = nodes.find((item) => item.id === edge.target);
                    return (
                      <View key={edge.id || `${edge.source}-${edge.target}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        {edge.sourceHandle ? <Pill label={edge.sourceHandle === 'true' ? 'If true' : edge.sourceHandle === 'false' ? 'If false' : edge.sourceHandle} /> : null}
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: colors.text }}>
                          {String(target?.data?.title || NODE_LABELS[target?.type ?? ''] || 'Step')}
                        </Text>
                        <Button
                          small
                          variant='ghost'
                          title='Disconnect'
                          icon={<Icon name='unlink-outline' size={16} color={colors.text} />}
                          onPress={async () => {
                            try {
                              await updateAutomationGraph(projectId, (document) => ({
                                nodes: document.nodes,
                                edges: (document.edges as Edge[]).filter((item) => !(item.source === edge.source && item.target === edge.target && (item.sourceHandle ?? null) === (edge.sourceHandle ?? null))) as Record<string, unknown>[],
                              }));
                              await refresh();
                            } catch (caught) {
                              setError(errorMessage(caught));
                            }
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
        </Drawer>
      </View>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled' contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.md }}>
      <View style={{ marginHorizontal: -space.page }}>{header}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Pill label={ready ? 'Ready' : `${issues.size} ${issues.size === 1 ? 'step needs' : 'steps need'} attention`} tone={ready ? 'success' : 'danger'} />
        <Pill label={`${nodes.length} steps`} />
        <Pill label={`${edges.length} connections`} />
        {graph.isFetching ? <ActivityIndicator size='small' /> : null}
      </View>
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}

      <View>
        {steps.map((step, index) => (
          <StepRow
            key={step.node.id}
            projectId={projectId}
            step={step}
            last={index === steps.length - 1}
            issues={issues.get(step.node.id) ?? []}
            expanded={open === step.node.id}
            onToggle={() => setOpen((current) => (current === step.node.id ? null : step.node.id))}
            onChanged={refresh}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button flex title='Add step' icon={<Icon name='add' size={18} color={colors.onPrimary} />} onPress={() => setAdding(true)} />
        {prefillComposer ? <Button flex title='Ask Genit' variant='secondary' icon={<Icon name='ai-enhance' size={18} color={colors.text} />} onPress={addStep} /> : null}
      </View>
      {addDrawer}
    </ScrollView>
  );
}

function StepRow({
  projectId,
  step,
  last,
  issues,
  expanded,
  onToggle,
  onChanged,
}: {
  projectId: string;
  step: Step;
  last: boolean;
  issues: string[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const colors = useColors();
  const { node } = step;
  const data = (node.data ?? {}) as Record<string, any>;
  const title = String(data.title || data.label || NODE_LABELS[node.type ?? ''] || 'Step');
  const icon = NODE_ICONS[node.type ?? ''] ?? 'ellipse-outline';

  return (
    <View style={{ flexDirection: 'row', gap: space.md, marginLeft: step.depth * 18 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: issues.length ? colors.dangerSurface : colors.selected }}>
          <Icon name={icon} size={15} color={issues.length ? colors.danger : colors.selectedText} />
        </View>
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: space.md, gap: 4 }}>
        {step.branch ? <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' }}>{step.branch}</Text> : null}
        <Pressable accessibilityRole='button' accessibilityState={{ expanded }} accessibilityLabel={`${title}, ${subtitle(node)}`} onPress={onToggle} style={{ gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{title}</Text>
            {node.type === 'trigger' && data.isActive === false ? <Pill label='Off' /> : null}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </View>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>{subtitle(node)}</Text>
          {data.description && !expanded ? (
            <Text numberOfLines={2} style={{ fontSize: 13, color: colors.textMuted }}>
              {String(data.description)}
            </Text>
          ) : null}
        </Pressable>
        {issues.map((issue) => (
          <View key={issue} style={{ flexDirection: 'row', gap: 6 }}>
            <Icon name='alert-circle' size={14} color={colors.danger} style={{ marginTop: 2 }} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.danger }}>{issue}</Text>
          </View>
        ))}
        {expanded ? <StepEditor projectId={projectId} node={node} onChanged={onChanged} /> : null}
      </View>
    </View>
  );
}

function StepEditor({ projectId, node, onChanged }: { projectId: string; node: AutomationNode; onChanged: () => Promise<unknown> }) {
  const colors = useColors();
  const data = (node.data ?? {}) as Record<string, any>;
  const typed = TYPED_STEPS.has(node.type ?? '');
  const editable = Object.entries(data).filter(([key, value]) => !HIDDEN_FIELDS.has(key) && !READ_ONLY_FIELDS.has(key) && (typeof value === 'string' || typeof value === 'number'));
  const readOnly = typed ? [] : Object.entries(data).filter(([key, value]) => READ_ONLY_FIELDS.has(key) && typeof value === 'string' && value);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(editable.map(([key, value]) => [key, String(value)])));
  // Typed steps edit a copy of the step's data, saved as a whole.
  const [draft, setDraft] = useState<Draft>(() => ({ ...data }));
  const [busy, setBusy] = useState<'save' | 'delete' | 'run' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<DryRunResult | null>(null);
  const dirty = typed ? JSON.stringify(draft) !== JSON.stringify(data) : editable.some(([key, value]) => values[key] !== String(value));
  const patch = (change: Draft) => setDraft((current) => ({ ...current, ...change }));

  const run = async (key: 'save' | 'delete' | 'run', action: () => Promise<unknown>) => {
    setBusy(key);
    setNotice('');
    try {
      await action();
    } catch (caught) {
      setNotice(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      const response = await updateAutomationGraph(projectId, (document) => ({
        nodes: document.nodes.map((item) =>
          item.id === node.id
            ? {
                ...item,
                data: typed
                  ? { ...item.data, ...draft }
                  : { ...item.data, ...Object.fromEntries(editable.map(([key, value]) => [key, typeof value === 'number' && values[key].trim() !== '' && !Number.isNaN(Number(values[key])) ? Number(values[key]) : values[key]])) },
              }
            : item
        ),
        edges: document.edges,
      }));
      await onChanged();
      setNotice(response?.dropped?.length ? `Saved. Some invalid connections were removed: ${response.dropped.join(', ')}` : response?.message || 'Saved.');
    });

  const remove = () =>
    run('delete', async () => {
      await updateAutomationGraph(projectId, (document) => ({
        nodes: document.nodes.filter((item) => item.id !== node.id),
        edges: (document.edges as Edge[]).filter((edge) => edge.source !== node.id && edge.target !== node.id) as Record<string, unknown>[],
      }));
      await onChanged();
    });

  const dryRun = () =>
    run('run', async () => {
      // The dry run reads the stored workflow, so unsaved edits are saved first.
      if (dirty) await save();
      setResult(await dryRunAutomation(projectId, node.id));
    });

  return (
    <View style={{ marginTop: space.sm, padding: space.md, gap: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {typed ? (
        <>
          <Field label='Name' value={String(draft.title ?? '')} onChangeText={(text) => patch({ title: text })} />
          <StepFields node={node} draft={draft} set={patch} />
          <Field label='Notes' value={String(draft.description ?? '')} multiline placeholder='What this step is for' onChangeText={(text) => patch({ description: text })} />
        </>
      ) : editable.length ? (
        editable.map(([key]) => (
          <Field
            key={key}
            label={humanizeKey(key).replace(/^\w/, (c) => c.toUpperCase())}
            value={values[key]}
            onChangeText={(text) => setValues((current) => ({ ...current, [key]: text }))}
            multiline={MULTILINE.test(key)}
            autoCapitalize='none'
          />
        ))
      ) : (
        <Text style={{ fontSize: 13, color: colors.textMuted }}>This step has no text settings. Ask Genit to change it.</Text>
      )}
      {readOnly.map(([key, value]) => (
        <View key={key} style={{ gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{humanizeKey(key)}</Text>
          <Text selectable style={{ fontSize: 13, color: colors.textMuted }}>
            {String(value)}
          </Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {typed || editable.length ? <Button small title='Save' onPress={save} loading={busy === 'save'} disabled={!dirty || !!busy} /> : null}
        <Button small variant='secondary' title='Dry run from here' onPress={dryRun} loading={busy === 'run'} disabled={!!busy} icon={<Icon name='play-outline' size={16} color={colors.text} />} />
        {confirmDelete ? (
          <>
            <Button small variant='dangerSolid' title='Delete step' onPress={remove} loading={busy === 'delete'} disabled={!!busy} />
            <Button small variant='ghost' title='Cancel' onPress={() => setConfirmDelete(false)} />
          </>
        ) : (
          <Button small variant='danger' title='Delete' onPress={() => setConfirmDelete(true)} disabled={!!busy} />
        )}
      </View>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>Dry runs cost no credits: nothing is generated or published.</Text>
      {notice ? <Text style={{ fontSize: 13, color: colors.textMuted }}>{notice}</Text> : null}
      {result ? (
        <View style={{ gap: 4, padding: space.sm, borderRadius: radius.sm, backgroundColor: result.ok ? colors.successSurface : colors.dangerSurface }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: result.ok ? colors.success : colors.danger }}>{result.message}</Text>
          {[...result.errors, ...result.trace].map((line, index) => (
            <Text key={`${index}-${line}`} style={{ fontSize: 12, color: colors.text }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
