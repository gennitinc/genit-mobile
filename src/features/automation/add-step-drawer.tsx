import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { BrandLogo, hasBrandLogo } from '@/components/brand-logo';
import { Drawer } from '@/components/drawer';
import { Icon } from '@/components/icon';
import { SearchField } from '@/components/kit';
import { type AutomationNode, updateAutomationGraph } from '@/features/automation/automation-api';
import { useComposioToolkits, useIntegrations } from '@/features/integrations/integrations-api';
import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

import { ADD_MENU, newStepData, newStepId, type StepOption } from './step-catalog';

type Edge = { id?: string; source?: string; target?: string; sourceHandle?: string | null };

/** Adds the step to the graph: a trigger goes first, anything else after the last step. */
export async function insertStep(projectId: string, option: StepOption) {
  const id = newStepId(option.type);
  await updateAutomationGraph(projectId, (document) => {
    const nodes = document.nodes;
    const edges = document.edges as Edge[];
    const data = newStepData(option.type, option.subtype, id, option.initialData);
    const edge = (source: string, target: string) => ({ id: `edge-${source}-${target}-${Date.now()}`, source, target, animated: true });
    const lowest = nodes.reduce<AutomationNode | undefined>((best, node) => (!best || (node.position?.y ?? 0) > (best.position?.y ?? 0) ? node : best), undefined);

    if (option.type === 'trigger') {
      const incoming = new Set(edges.map((item) => item.target));
      const root = nodes.find((node) => !incoming.has(node.id) && node.type !== 'trigger');
      const top = nodes.reduce((min, node) => Math.min(min, node.position?.y ?? 0), 0);
      const node = { id, type: 'trigger', position: { x: root?.position?.x ?? 0, y: top - 180 }, data };
      return { nodes: [node, ...nodes], edges: root ? [...edges, edge(id, root.id)] : edges };
    }

    // The step that ends the run: the lowest step nothing follows from.
    const outgoing = new Set(edges.map((item) => item.source));
    const ends = nodes.filter((node) => !outgoing.has(node.id));
    const last = ends.reduce<AutomationNode | undefined>((best, node) => (!best || (node.position?.y ?? 0) > (best.position?.y ?? 0) ? node : best), undefined);
    const anchor = last ?? lowest;
    const node = { id, type: option.type, position: { x: anchor?.position?.x ?? 0, y: (anchor?.position?.y ?? 0) + (anchor ? 180 : 0) }, data };
    const link = last ? { ...edge(last.id, id), ...(last.type === 'condition' ? { sourceHandle: 'true' } : {}) } : null;
    return { nodes: [...nodes, node], edges: link ? [...edges, link] : edges };
  });
  return id;
}

/**
 * The web canvas's add menu as a drawer: the connected apps' events and
 * actions first, then every built-in trigger, action and logic step.
 */
export function AddStepDrawer({ projectId, visible, onClose, onAdded }: { projectId: string; visible: boolean; onClose: () => void; onAdded: (nodeId: string) => void }) {
  const colors = useColors();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { active } = useIntegrations();
  const toolkits = useComposioToolkits();

  const sections = useMemo(() => {
    // Apps connected through the wider catalog, each as an event and an action.
    const apps = new Map<string, { slug: string; name: string; logo?: string }>();
    for (const connection of active) {
      if (connection.platform !== 'composio') continue;
      const slug = String(connection.metadata?.toolkitSlug || connection.metadata?.appSlug || '').toLowerCase();
      if (!slug || apps.has(slug)) continue;
      const toolkit = toolkits.data?.find((item) => item.slug === slug);
      apps.set(slug, { slug, name: toolkit?.name || slug.replace(/^\w/, (c) => c.toUpperCase()), logo: toolkit?.logo || connection.accountAvatar });
    }
    const connected: StepOption[] = [...apps.values()].flatMap((app) => {
      const initialData = { composioToolkit: app.slug, composioToolkitName: app.name, composioLogo: app.logo, connectionToolkit: app.slug };
      return [
        { type: 'trigger', subtype: 'composio_event', label: `${app.name} event`, icon: 'flash-outline', platform: app.slug, logo: app.logo, initialData: { ...initialData, title: `${app.name} event` } },
        { type: 'action', subtype: 'composio_action', label: `${app.name} action`, icon: 'send-outline', platform: app.slug, logo: app.logo, initialData: { ...initialData, title: `${app.name} action` } },
      ] as StepOption[];
    });
    const all = [...(connected.length ? [{ label: 'Connected apps', items: connected }] : []), ...ADD_MENU];
    const query = search.trim().toLowerCase();
    if (!query) return all;
    return all.map((section) => ({ ...section, items: section.items.filter((item) => item.label.toLowerCase().includes(query) || section.label.toLowerCase().includes(query)) })).filter((section) => section.items.length);
  }, [active, toolkits.data, search]);

  const add = async (option: StepOption) => {
    const key = `${option.type}:${option.subtype ?? ''}:${option.label}`;
    setBusy(key);
    setError('');
    try {
      const id = await insertStep(projectId, option);
      setSearch('');
      onAdded(id);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer visible={visible} onClose={onClose} title='Add a step' tall>
      <View style={{ gap: space.md }}>
        <SearchField value={search} onChange={setSearch} placeholder='Search steps' />
        {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
        {sections.map((section) => (
          <View key={section.label} style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' }}>{section.label}</Text>
            {section.items.map((item) => {
              const key = `${item.type}:${item.subtype ?? ''}:${item.label}`;
              const logo = item.logo;
              return (
                <Pressable
                  key={key}
                  accessibilityRole='button'
                  accessibilityLabel={`Add ${item.label}`}
                  disabled={!!busy}
                  onPress={() => add(item)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.md, backgroundColor: pressed ? colors.surfacePressed : 'transparent' })}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
                    {logo ? (
                      <Image source={{ uri: logo }} style={{ width: 20, height: 20 }} contentFit='contain' />
                    ) : hasBrandLogo(item.platform) ? (
                      <BrandLogo platform={item.platform} size={20} />
                    ) : (
                      <Icon name={item.icon} size={18} color={colors.text} />
                    )}
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>{item.label}</Text>
                  {busy === key ? <ActivityIndicator size='small' /> : <Icon name='add' size={18} color={colors.textMuted} />}
                </Pressable>
              );
            })}
          </View>
        ))}
        {!sections.length ? <Text style={{ fontSize: 14, color: colors.textMuted }}>No steps match “{search}”.</Text> : null}
      </View>
    </Drawer>
  );
}
