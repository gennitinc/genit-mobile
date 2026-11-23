import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, Pattern, Polygon, Rect } from 'react-native-svg';

import { BrandLogo, hasBrandLogo } from '@/components/brand-logo';
import { ConfirmDrawer } from '@/components/drawer';
import { Icon, type IconName } from '@/components/icon';
import { type AutomationDocument, type AutomationNode, updateAutomationGraph } from '@/features/automation/automation-api';
import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

import { ACTIONS, TRIGGERS } from './step-catalog';

/**
 * The workflow canvas, as the web draws it with React Flow: steps as cards on a
 * dotted board, curved connections from each step's right handle to the next
 * step's left handle (If / else has a true and a false handle). Pinch to zoom,
 * drag to pan. In Edit mode, hold a step to move it, tap a handle and then a
 * step to connect them, tap a connection to remove it; undo and redo are kept
 * for the changes made here. Tapping a step opens its editor.
 */

export type CanvasEdge = { id?: string; source?: string; target?: string; sourceHandle?: string | null };

export const NODE_W = 228;
export const NODE_H = 92;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;

const NODE_META: Record<string, { label: string; icon: IconName; color: string }> = {
  trigger: { label: 'Trigger', icon: 'flash-outline', color: '#FBBF24' },
  action: { label: 'Action', icon: 'swap-horizontal', color: '#38BDF8' },
  prompt: { label: 'AI prompt', icon: 'sparkles-outline', color: '#A78BFA' },
  condition: { label: 'Condition', icon: 'git-branch-outline', color: '#34D399' },
  delay: { label: 'Delay', icon: 'time-outline', color: '#FB923C' },
  ai_generate: { label: 'AI generate', icon: 'ai-enhance', color: '#E879F9' },
  transform: { label: 'Transform', icon: 'swap-horizontal', color: '#22D3EE' },
  http_request: { label: 'HTTP request', icon: 'globe-outline', color: '#818CF8' },
  upload: { label: 'Upload', icon: 'cloud-upload-outline', color: '#2DD4BF' },
};

/** Same wording as the web node's second line. */
function nodeSubtitle(type: string, data: Record<string, any>) {
  if (data.composioToolkitName) return String(data.composioToolkitName);
  if (type === 'trigger') return String(data.triggerType || 'event').replace(/_/g, ' ');
  if (type === 'action') return String(data.actionType || 'action').replace(/_/g, ' ');
  if (type === 'condition') return [data.field, data.operator, data.value].filter(Boolean).join(' ') || 'branch';
  if (type === 'delay') return `${data.duration || 0} ${data.unit || 'minutes'}`;
  if (type === 'ai_generate') return `${data.contentType || 'content'} generation`;
  if (type === 'http_request') return `${data.method || 'GET'} ${data.url || 'request'}`;
  if (type === 'upload') return data.fileName || 'asset input';
  return String(data.instruction || data.expression || NODE_META[type]?.label || 'step');
}

function handlePoint(node: AutomationNode, side: 'in' | 'out', handle?: string | null, at?: { x: number; y: number }) {
  const x = at?.x ?? node.position?.x ?? 0;
  const y = at?.y ?? node.position?.y ?? 0;
  if (side === 'in') return { x, y: y + NODE_H / 2 };
  const ratio = node.type === 'condition' ? (handle === 'false' ? 0.68 : 0.34) : 0.5;
  return { x: x + NODE_W, y: y + NODE_H * ratio };
}

function createsCycle(edges: CanvasEdge[], source: string, target: string) {
  // Connecting source → target loops if target already leads back to source.
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) if (edge.source === current && edge.target) stack.push(edge.target);
  }
  return false;
}

type Snapshot = Pick<AutomationDocument, 'nodes' | 'edges'>;

export function AutomationCanvas({
  projectId,
  nodes,
  edges,
  issues,
  onChanged,
  onOpenStep,
  onAdd,
  testing,
}: {
  projectId: string;
  nodes: AutomationNode[];
  edges: CanvasEdge[];
  issues: Map<string, string[]>;
  onChanged: () => Promise<unknown>;
  onOpenStep: (nodeId: string) => void;
  onAdd: () => void;
  testing?: string | null;
}) {
  const colors = useColors();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [connecting, setConnecting] = useState<{ source: string; handle?: string } | null>(null);
  const [removeEdge, setRemoveEdge] = useState<CanvasEdge | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const undo = useRef<Snapshot[]>([]);
  const redo = useRef<Snapshot[]>([]);
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const syncHistory = () => setHistory({ undo: undo.current.length, redo: redo.current.length });

  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);

  const bounds = useMemo(() => {
    if (!nodes.length) return { minX: 0, minY: 0, maxX: NODE_W, maxY: NODE_H };
    const xs = nodes.map((node) => node.position?.x ?? 0);
    const ys = nodes.map((node) => node.position?.y ?? 0);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs) + NODE_W, maxY: Math.max(...ys) + NODE_H };
  }, [nodes]);

  const fit = useCallback(
    (animated = true) => {
      if (!size.width || !size.height) return;
      const pad = 40;
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const next = Math.min(Math.max(Math.min((size.width - pad * 2) / width, (size.height - pad * 2 - 56) / height), MIN_ZOOM), 1);
      const x = (size.width - width * next) / 2 - bounds.minX * next;
      const y = (size.height - height * next) / 2 - bounds.minY * next + 20;
      const timing = (value: number) => (animated ? withTiming(value, { duration: 250 }) : value);
      scale.set(timing(next));
      tx.set(timing(x));
      ty.set(timing(y));
    },
    [bounds, size, scale, tx, ty]
  );

  // Fit once the board has a size, and again when steps are added or removed.
  const fitted = useRef<string>('');
  useEffect(() => {
    const key = `${size.width}x${size.height}:${nodes.length}`;
    if (!size.width || fitted.current === key) return;
    fitted.current = key;
    fit(false);
  }, [size, nodes.length, fit]);

  const zoomBy = (factor: number) => {
    const next = Math.min(Math.max(scale.get() * factor, MIN_ZOOM), MAX_ZOOM);
    const cx = size.width / 2;
    const cy = size.height / 2;
    tx.set(withTiming(cx - (cx - tx.get()) * (next / scale.get()), { duration: 200 }));
    ty.set(withTiming(cy - (cy - ty.get()) * (next / scale.get()), { duration: 200 }));
    scale.set(withTiming(next, { duration: 200 }));
  };

  // Board gestures: one finger pans, two fingers pinch around their midpoint.
  const start = useSharedValue({ x: 0, y: 0, scale: 1, fx: 0, fy: 0 });
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onChange((event) => {
      tx.set(tx.get() + event.changeX);
      ty.set(ty.get() + event.changeY);
    });
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      start.set({ x: tx.get(), y: ty.get(), scale: scale.get(), fx: event.focalX, fy: event.focalY });
    })
    .onUpdate((event) => {
      const next = Math.min(Math.max(start.get().scale * event.scale, MIN_ZOOM), MAX_ZOOM);
      const ratio = next / start.get().scale;
      scale.set(next);
      tx.set(start.get().fx - (start.get().fx - start.get().x) * ratio);
      ty.set(start.get().fy - (start.get().fy - start.get().y) * ratio);
    });
  const board = Gesture.Simultaneous(pan, pinch);

  const layer = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));

  const change = async (label: string, apply: (document: Snapshot) => Snapshot, record = true) => {
    setBusy(true);
    setNotice('');
    try {
      let before: Snapshot | null = null;
      await updateAutomationGraph(projectId, (document) => {
        before = { nodes: document.nodes, edges: document.edges };
        return apply(document);
      });
      if (record && before) {
        undo.current = [...undo.current.slice(-29), before];
        redo.current = [];
        syncHistory();
      }
      await onChanged();
    } catch (caught) {
      setNotice(`${label}: ${errorMessage(caught)}`);
    } finally {
      setBusy(false);
      setDrag(null);
    }
  };

  const step = async (direction: 'undo' | 'redo') => {
    const from = direction === 'undo' ? undo : redo;
    const to = direction === 'undo' ? redo : undo;
    const snapshot = from.current[from.current.length - 1];
    if (!snapshot) return;
    from.current = from.current.slice(0, -1);
    let current: Snapshot | null = null;
    await change(
      'Couldn’t restore',
      (document) => {
        current = { nodes: document.nodes, edges: document.edges };
        return snapshot;
      },
      false
    );
    if (current) to.current = [...to.current, current];
    syncHistory();
  };

  const moveNode = (id: string, x: number, y: number) =>
    change('Couldn’t move the step', (document) => ({
      nodes: document.nodes.map((node) => (node.id === id ? { ...node, position: { x: Math.round(x), y: Math.round(y) } } : node)),
      edges: document.edges,
    }));

  const connect = (target: AutomationNode) => {
    const from = connecting;
    setConnecting(null);
    if (!from || from.source === target.id) return;
    if (target.type === 'trigger') return setNotice('A trigger starts the workflow, so nothing can lead into it.');
    if (edges.some((edge) => edge.source === from.source && edge.target === target.id && (edge.sourceHandle ?? null) === (from.handle ?? null))) return setNotice('Those steps are already connected.');
    if (createsCycle(edges, from.source, target.id)) return setNotice('That connection would make the workflow loop.');
    change('Couldn’t connect', (document) => ({
      nodes: document.nodes,
      edges: [...document.edges, { id: `edge-${from.source}-${target.id}-${Date.now()}`, source: from.source, target: target.id, ...(from.handle ? { sourceHandle: from.handle } : {}), animated: true }],
    }));
  };

  const pad = 400;
  const svgLeft = bounds.minX - pad;
  const svgTop = bounds.minY - pad;
  const svgWidth = bounds.maxX - bounds.minX + pad * 2;
  const svgHeight = bounds.maxY - bounds.minY + pad * 2;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const live = (node: AutomationNode) => (drag?.id === node.id ? { x: drag.x, y: drag.y } : undefined);

  const issueCount = issues.size;

  return (
    <View style={{ flex: 1, marginHorizontal: space.sm, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: editing ? colors.surface : '#101113' }}>
      <GestureDetector gesture={board}>
        <View style={{ flex: 1 }} onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
          <Svg style={{ position: 'absolute', inset: 0 } as any} width='100%' height='100%' pointerEvents='none'>
            <Defs>
              <Pattern id='dots' width={24} height={24} patternUnits='userSpaceOnUse'>
                <Circle cx={1} cy={1} r={1} fill={editing ? '#d4d4d8' : '#34363b'} />
              </Pattern>
            </Defs>
            <Rect width='100%' height='100%' fill='url(#dots)' />
          </Svg>

          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, transformOrigin: 'left top', overflow: 'visible' }, layer]}>
            <Svg style={{ position: 'absolute', left: svgLeft, top: svgTop }} width={svgWidth} height={svgHeight}>
              {edges.map((edge, index) => {
                const source = edge.source ? byId.get(edge.source) : undefined;
                const target = edge.target ? byId.get(edge.target) : undefined;
                if (!source || !target) return null;
                const a = handlePoint(source, 'out', edge.sourceHandle, live(source));
                const b = handlePoint(target, 'in', null, live(target));
                const curve = Math.max(50, Math.abs(b.x - a.x) * 0.5);
                const d = `M ${a.x - svgLeft} ${a.y - svgTop} C ${a.x - svgLeft + curve} ${a.y - svgTop}, ${b.x - svgLeft - curve} ${b.y - svgTop}, ${b.x - svgLeft} ${b.y - svgTop}`;
                const stroke = edge.sourceHandle === 'true' ? '#34D399' : edge.sourceHandle === 'false' ? '#FB7185' : '#a1a1aa';
                const ex = b.x - svgLeft;
                const ey = b.y - svgTop;
                return (
                  <G key={edge.id || `${edge.source}-${edge.target}-${index}`}>
                    <Path d={d} stroke={stroke} strokeWidth={1.6} fill='none' />
                    <Polygon points={`${ex - 9},${ey - 5} ${ex},${ey} ${ex - 9},${ey + 5}`} fill={stroke} />
                    {editing ? <Path d={d} stroke='transparent' strokeWidth={22} fill='none' onPress={() => setRemoveEdge(edge)} /> : null}
                  </G>
                );
              })}
            </Svg>

            {nodes.map((node) => (
              <CanvasNode
                key={node.id}
                node={node}
                position={live(node)}
                scale={scale}
                editing={editing}
                issues={issues.get(node.id)?.length ?? 0}
                testing={testing === node.id}
                connecting={!!connecting}
                isSource={connecting?.source === node.id}
                onPress={() => (connecting ? connect(node) : onOpenStep(node.id))}
                onDrag={(x, y) => setDrag({ id: node.id, x, y })}
                onDrop={(x, y) => moveNode(node.id, x, y)}
                onHandle={(handle) => setConnecting((current) => (current?.source === node.id && current.handle === handle ? null : { source: node.id, handle }))}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Toolbar, as on the web: mode, undo / redo, zoom, fit, add. */}
      <View style={{ position: 'absolute', top: space.sm, left: space.sm, right: space.sm, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ flexDirection: 'row', padding: 3, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
          {(['View', 'Edit'] as const).map((mode) => {
            const active = (mode === 'Edit') === editing;
            return (
              <Pressable
                key={mode}
                accessibilityRole='tab'
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setEditing(mode === 'Edit');
                  setConnecting(null);
                }}
                style={{ height: 30, paddingHorizontal: space.md, borderRadius: 9, justifyContent: 'center', backgroundColor: active ? colors.surfacePressed : 'transparent' }}
              >
                <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? colors.text : colors.textMuted }}>{mode}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 2, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
          {editing ? <CanvasTool icon='arrow-undo' label='Undo' onPress={() => step('undo')} disabled={busy || !history.undo} /> : null}
          {editing ? <CanvasTool icon='arrow-redo' label='Redo' onPress={() => step('redo')} disabled={busy || !history.redo} /> : null}
          <CanvasTool icon='remove' label='Zoom out' onPress={() => zoomBy(1 / 1.25)} />
          <CanvasTool icon='add' label='Zoom in' onPress={() => zoomBy(1.25)} />
          <CanvasTool icon='fit-view' label='Fit view' onPress={() => fit()} />
        </View>
      </View>

      {connecting ? (
        <View style={{ position: 'absolute', top: 56, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.md, paddingRight: 6, height: 36, borderRadius: radius.full, backgroundColor: colors.text }}>
          <Text style={{ fontSize: 13, color: colors.background }}>
            Tap the step to connect{connecting.handle ? ` (if ${connecting.handle})` : ''}
          </Text>
          <Pressable accessibilityRole='button' accessibilityLabel='Cancel connecting' onPress={() => setConnecting(null)} hitSlop={8} style={{ padding: 4 }}>
            <Icon name='close' size={16} color={colors.background} />
          </Pressable>
        </View>
      ) : null}

      <View style={{ position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm, flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        <View style={{ flex: 1, gap: 6 }}>
          {notice ? (
            <Pressable onPress={() => setNotice('')} style={{ alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12.5, color: colors.text }}>{notice}</Text>
            </Pressable>
          ) : null}
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, height: 30, borderRadius: radius.full, backgroundColor: colors.background, borderWidth: 1, borderColor: issueCount ? colors.danger : colors.border }}>
            {busy ? <ActivityIndicator size='small' /> : <Icon name={issueCount ? 'alert-circle' : 'checkmark-circle'} size={14} color={issueCount ? colors.danger : colors.success} />}
            <Text style={{ fontSize: 12, color: issueCount ? colors.danger : colors.textMuted }}>
              {busy ? 'Saving…' : issueCount ? `${issueCount} ${issueCount === 1 ? 'step needs' : 'steps need'} setup` : editing ? 'Hold a step to move it · tap a handle to connect' : 'Ready'}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole='button'
          accessibilityLabel='Add step'
          onPress={onAdd}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: space.lg, borderRadius: radius.full, opacity: pressed ? 0.85 : 1, backgroundColor: colors.primary })}
        >
          <Icon name='add' size={18} color={colors.onPrimary} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onPrimary }}>Add</Text>
        </Pressable>
      </View>

      <ConfirmDrawer
        visible={!!removeEdge}
        onClose={() => setRemoveEdge(null)}
        title='Remove this connection?'
        message={(() => {
          const source = removeEdge?.source ? byId.get(removeEdge.source) : undefined;
          const target = removeEdge?.target ? byId.get(removeEdge.target) : undefined;
          const name = (node?: AutomationNode) => String(node?.data?.title || NODE_META[node?.type ?? '']?.label || 'step');
          return `${name(source)} will no longer lead to ${name(target)}.`;
        })()}
        confirmLabel='Remove'
        destructive
        onConfirm={async () => {
          const edge = removeEdge;
          if (!edge) return;
          await change('Couldn’t remove the connection', (document) => ({
            nodes: document.nodes,
            edges: (document.edges as CanvasEdge[]).filter((item) => !(item.source === edge.source && item.target === edge.target && (item.sourceHandle ?? null) === (edge.sourceHandle ?? null))) as Record<string, unknown>[],
          }));
        }}
      />
    </View>
  );
}

function CanvasNode({
  node,
  position,
  scale,
  editing,
  issues,
  testing,
  connecting,
  isSource,
  onPress,
  onDrag,
  onDrop,
  onHandle,
}: {
  node: AutomationNode;
  position?: { x: number; y: number };
  scale: SharedValue<number>;
  editing: boolean;
  issues: number;
  testing: boolean;
  connecting: boolean;
  isSource: boolean;
  onPress: () => void;
  onDrag: (x: number, y: number) => void;
  onDrop: (x: number, y: number) => void;
  onHandle: (handle?: string) => void;
}) {
  const type = node.type ?? 'action';
  const data = (node.data ?? {}) as Record<string, any>;
  const meta = NODE_META[type] ?? NODE_META.action;
  const x = position?.x ?? node.position?.x ?? 0;
  const y = position?.y ?? node.position?.y ?? 0;
  const subtype = type === 'trigger' ? TRIGGERS.find((item) => item.id === data.triggerType) : type === 'action' ? ACTIONS.find((item) => item.id === data.actionType) : undefined;
  const lifted = useSharedValue(1);
  const origin = { x: node.position?.x ?? 0, y: node.position?.y ?? 0 };

  // In Edit mode the right edge of a card is its handle(s): a tap there starts a connection.
  const condition = type === 'condition';
  const tap = Gesture.Tap().onEnd((event, success) => {
    if (!success) return;
    if (editing && event.x > NODE_W - 30) runOnJS(onHandle)(condition ? (event.y < NODE_H / 2 ? 'true' : 'false') : undefined);
    else runOnJS(onPress)();
  });
  const move = Gesture.Pan()
    .enabled(editing)
    .activateAfterLongPress(250)
    .onStart(() => {
      lifted.set(withTiming(1.04, { duration: 120 }));
    })
    .onUpdate((event) => {
      runOnJS(onDrag)(origin.x + event.translationX / scale.get(), origin.y + event.translationY / scale.get());
    })
    .onEnd((event) => {
      runOnJS(onDrop)(origin.x + event.translationX / scale.get(), origin.y + event.translationY / scale.get());
    })
    .onFinalize(() => {
      lifted.set(withTiming(1, { duration: 120 }));
    });
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: lifted.get() }] }));

  const handle = (id?: string, top = 0.5, color = '#d4d4d8') => (
    <View key={id ?? 'out'} pointerEvents='none' style={{ position: 'absolute', right: editing ? -8 : -6, top: NODE_H * top - (editing ? 8 : 6), width: editing ? 16 : 12, height: editing ? 16 : 12, borderRadius: 8, borderWidth: 2, borderColor: '#161719', backgroundColor: color }} />
  );

  return (
    <GestureDetector gesture={Gesture.Exclusive(move, tap)}>
      <Animated.View
        accessible
        accessibilityRole='button'
        accessibilityLabel={`${meta.label}: ${data.title || meta.label}. ${nodeSubtitle(type, data)}${issues ? '. Needs setup' : ''}`}
        style={[
          {
            position: 'absolute',
            left: x,
            top: y,
            width: NODE_W,
            height: NODE_H,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            borderRadius: 14,
            borderWidth: isSource || testing ? 2 : 1,
            borderColor: issues ? '#F87171' : isSource ? '#60A5FA' : testing ? '#FBBF24' : 'rgba(82,82,91,0.9)',
            backgroundColor: '#202124',
            shadowColor: '#000',
            shadowOpacity: 0.28,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 12 },
            opacity: connecting && !isSource && type === 'trigger' ? 0.45 : 1,
          },
          lift,
        ]}
      >
        {type !== 'trigger' ? <View style={{ position: 'absolute', left: -6, top: NODE_H / 2 - 6, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#161719', backgroundColor: connecting && !isSource ? '#60A5FA' : '#d4d4d8' }} /> : null}
        <View style={{ width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3f3f46', backgroundColor: '#17181a' }}>
          {data.composioLogo ? (
            <Image source={{ uri: String(data.composioLogo) }} style={{ width: 28, height: 28, borderRadius: 6 }} contentFit='contain' />
          ) : subtype?.platform && hasBrandLogo(subtype.platform) ? (
            <BrandLogo platform={subtype.platform} size={26} />
          ) : (
            <Icon name={subtype?.icon ?? meta.icon} size={24} color={meta.color} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ marginBottom: 3, fontSize: 9, fontWeight: '700', letterSpacing: 1.3, color: '#71717a', textTransform: 'uppercase' }}>{meta.label}</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: '#f4f4f5' }}>
            {String(data.title || meta.label)}
          </Text>
          <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 10, color: '#71717a', textTransform: 'capitalize' }}>
            {nodeSubtitle(type, data)}
          </Text>
        </View>
        {type === 'trigger' && data.isActive === false ? (
          <View style={{ position: 'absolute', top: 8, right: 10, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: '#3f3f46' }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: '#d4d4d8' }}>OFF</Text>
          </View>
        ) : null}
        {issues ? (
          <View style={{ position: 'absolute', top: -7, right: 14, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F87171' }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>!</Text>
          </View>
        ) : null}
        {testing ? <ActivityIndicator size='small' color='#FBBF24' style={{ position: 'absolute', top: 8, right: 10 }} /> : null}
        {type === 'condition' ? [handle('true', 0.34, '#34D399'), handle('false', 0.68, '#FB7185')] : handle(undefined)}
      </Animated.View>
    </GestureDetector>
  );
}

function CanvasTool({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1, backgroundColor: pressed ? colors.surfacePressed : 'transparent' })}
    >
      <Icon name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}
