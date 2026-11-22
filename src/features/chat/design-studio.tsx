import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { Empty } from '@/components/kit';
import { radius, space, useColors } from '@/lib/theme';

import type { AgentRun, ChatProject } from './chat-api';
import { fullUrl, useChatScreen } from './chat-ui';
import type { LiveDesign } from './use-chat-live';

export type StudioDesign = { key: string; url: string; isVideo: boolean; name: string; prompt?: string; at: number };

const isVideoUrl = (url: string, type?: string) => !!type?.startsWith('video') || /\.(mp4|mov|webm)(\?|$)/i.test(url);

/**
 * Every design in the chat, oldest first: versions saved on messages, designs
 * the agent generated, and designs still arriving over the socket. The web
 * shows these as nodes on its graphics canvas.
 */
export function chatDesigns(project: ChatProject | undefined, runs: AgentRun[], live: LiveDesign[] = []): StudioDesign[] {
  const designs = new Map<string, StudioDesign>();
  const add = (design: StudioDesign) => {
    if (design.url && !designs.has(design.url)) designs.set(design.url, design);
  };

  for (const message of project?.messages ?? []) {
    const messageAt = message.createdAt ? Date.parse(message.createdAt) : 0;
    for (const group of message.generationGroups ?? []) {
      for (const item of group.items ?? []) {
        const type = item.type ?? '';
        if (type.startsWith('application/json') || item.status === 'generating' || item.status === 'error') continue;
        const url = fullUrl(item.url || item.filePath);
        add({ key: `m-${item.id}`, url, isVideo: isVideoUrl(url, type), name: item.name || group.title || 'Design', at: item.timestamp ? Date.parse(item.timestamp) : messageAt });
      }
    }
  }
  for (const run of runs) {
    for (const call of run.toolCalls) {
      if (call.render !== 'generated_design' || !call.result?.ok) continue;
      const data = call.result.data || {};
      const url = fullUrl(data.url);
      add({ key: `r-${call.id}`, url, isVideo: isVideoUrl(url), name: data.name || 'Generated design', prompt: data.prompt, at: run.createdAt });
    }
  }
  for (const node of live) {
    const url = fullUrl(node.filePath);
    add({ key: `l-${node.id}`, url, isVideo: isVideoUrl(url), name: node.name, prompt: node.prompt, at: Date.now() });
  }
  return [...designs.values()].sort((a, b) => a.at - b.at);
}

/** A two-column board of the chat's designs; tapping one opens it full size. */
export function DesignStudio({ designs, working }: { designs: StudioDesign[]; working?: boolean }) {
  const colors = useColors();
  const { openPreview } = useChatScreen();
  const { width } = useWindowDimensions();
  const tile = (width - space.page * 2 - space.sm) / 2;

  if (!designs.length && !working) {
    return <Empty icon='images-outline' title='No designs yet' message='Designs Genit makes in this chat collect here.' />;
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.md }}>
      <Text style={{ fontSize: 13, color: colors.textMuted }}>
        {designs.length} design{designs.length === 1 ? '' : 's'} in this chat
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {designs.map((design) => (
          <Pressable
            key={design.key}
            accessibilityRole='imagebutton'
            accessibilityLabel={`Open ${design.name}`}
            onPress={() => openPreview({ kind: 'media', title: design.name, url: design.url, isVideo: design.isVideo, prompt: design.prompt })}
            style={({ pressed }) => ({ width: tile, gap: 4, opacity: pressed ? 0.8 : 1 })}
          >
            <View style={{ width: tile, height: tile, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              {design.isVideo ? (
                <Icon name='play-circle' size={44} color={colors.text} />
              ) : (
                <Image source={{ uri: design.url }} style={{ width: '100%', height: '100%' }} contentFit='cover' transition={150} />
              )}
            </View>
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: colors.text }}>
              {design.name}
            </Text>
          </Pressable>
        ))}
        {working ? (
          <View style={{ width: tile, height: tile, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
            <Icon name='sparkles-outline' size={22} color={colors.textMuted} />
            <Text style={{ fontSize: 12.5, color: colors.textMuted }}>Generating…</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
