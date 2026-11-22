import { Icon } from '@/components/icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { IconButton, LoadError, Loading, Page } from '@/components/kit';
import { Banner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { AgentMessage, GenitHeader } from '@/features/chat/agent-message';
import {
  type AgentAttachedFile,
  type AgentRun,
  type ChatProject,
  continueAgentRun,
  deleteAgentRun,
  getProject,
  newRequestId,
  projectKey,
  type ProjectMessage,
  runsKey,
  saveInspiration,
  startAgentRun,
  stopAgentRun,
  stripTimeContext,
  withTimeContext,
} from '@/features/chat/chat-api';
import { useChatPrefs } from '@/features/chat/chat-prefs';
import { chatDesigns } from '@/features/chat/design-studio';
import { type ChatPreview, ChatScreenContext, fullUrl } from '@/features/chat/chat-ui';
import { Composer, useAgentModels } from '@/features/chat/composer';
import { isHiddenMessage, LegacyMessage, messageText } from '@/features/chat/legacy-message';
import { Markdown } from '@/features/chat/markdown';
import { PreviewDrawer } from '@/features/chat/preview-drawer';
import { documentPreviewUrl } from '@/features/chat/result-cards';
import { updateRun, useAgentRuns, useProjectLive } from '@/features/chat/use-chat-live';
import { archiveChat, deleteChat } from '@/features/history/history-api';
import { errorMessage } from '@/lib/api';
import { space, useColors } from '@/lib/theme';

type Item = { kind: 'run'; at: number; run: AgentRun } | { kind: 'message'; at: number; message: ProjectMessage };

/** Runs and saved messages in time order. Older chats copied run text into messages; those copies are skipped. */
function timeline(project: ChatProject | undefined, runs: AgentRun[]): Item[] {
  const prompts = new Set(runs.map((run) => stripTimeContext(run.prompt || '').trim()).filter(Boolean));
  const texts = new Set(runs.map((run) => run.text?.trim()).filter(Boolean));
  const messages = (project?.messages ?? []).filter((message) => {
    if (isHiddenMessage(message)) return false;
    const text = stripTimeContext(messageText(message)).trim();
    if (!text) return true;
    const user = message.type === 'user' || message.role === 'user';
    return user ? !prompts.has(text) : !texts.has(text);
  });
  return [
    ...messages.map((message) => ({ kind: 'message' as const, at: message.createdAt ? Date.parse(message.createdAt) : 0, message })),
    ...runs.map((run) => ({ kind: 'run' as const, at: run.createdAt, run })),
  ].sort((a, b) => a.at - b.at);
}

/** The most recent thing worth previewing: a design, document, live browser or workflow. */
function latestPreview(project: ChatProject | undefined, runs: AgentRun[]): ChatPreview | null {
  for (const run of [...runs].reverse()) {
    for (const call of [...run.toolCalls].reverse()) {
      if (!call.result?.ok) continue;
      const data = call.result.data || {};
      switch (call.render) {
        case 'generated_design':
          if (data.url) return { kind: 'media', title: data.name || 'Generated design', url: fullUrl(data.url), isVideo: String(data.url).endsWith('.mp4'), prompt: data.prompt };
          break;
        case 'document_artifact': {
          const artifact = data.artifact || data;
          const fileUrl = fullUrl(artifact.fileUrl);
          return { kind: 'document', title: artifact.title || 'Document', url: documentPreviewUrl(artifact.format, fileUrl, fullUrl(artifact.previewUrl)), downloadUrl: fileUrl, fileName: artifact.fileName };
        }
        case 'research_report': {
          const report = data.report || data;
          if (report.previewUrl) return { kind: 'document', title: report.title || 'Research report', url: fullUrl(report.previewUrl), downloadUrl: fullUrl(report.pdfUrl), fileName: report.fileName };
          break;
        }
        case 'gtm_pdf_report': {
          const report = data.report || data;
          if (report.url) return { kind: 'document', title: report.campaignName || 'GTM campaign report', url: fullUrl(report.url), downloadUrl: fullUrl(report.url), fileName: report.fileName };
          break;
        }
        case 'browser_session':
          if (data.liveViewUrl) return { kind: 'website', title: data.title || 'Live browser', url: fullUrl(data.liveViewUrl), displayUrl: data.url, openUrl: data.url };
          break;
        case 'automation_node_created':
        case 'automation_nodes_connected':
        case 'automation_node_updated':
        case 'automation_node_removed':
        case 'automation_nodes_disconnected':
          return { kind: 'automation' };
      }
    }
  }
  // Saved versions: a design opens the studio; an automation snapshot opens the workflow.
  for (const message of [...(project?.messages ?? [])].reverse()) {
    for (const group of [...(message.generationGroups ?? [])].reverse()) {
      const items = group.items ?? [];
      if (items.some((item) => /^(image|video)/.test(item.type ?? '') || (!item.type && (item.url || item.filePath)))) return { kind: 'designs' };
      if (items.some((item) => item.type === 'application/json+automation')) return { kind: 'automation' };
    }
  }
  if (project?.category === 'automation') return { kind: 'automation' };
  return GRAPHICS_CATEGORIES.has(project?.category ?? '') ? { kind: 'designs' } : null;
}

const GRAPHICS_CATEGORIES = new Set(['flier', 'image', 'instagram_post', 'poster', 'youtube_thumbnail', 'facebook_post', 'facebook_cover', 'banner', 'logo', 'presentation']);

export default function ChatScreen() {
  const { id, preview: previewParam } = useLocalSearchParams<{ id: string; preview?: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const project = useQuery({ queryKey: projectKey(id), queryFn: () => getProject(id) });
  const runs = useAgentRuns(id);
  const live = useProjectLive(id);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<ChatPreview | null>(previewParam === 'automation' ? { kind: 'automation' } : null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | null>(null);
  const [error, setError] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  // Hidden at once when removed, before the saved project catches up.
  const [removedInspiration, setRemovedInspiration] = useState<string | null>(null);
  const prefs = useChatPrefs();
  const { selected: model } = useAgentModels();
  const list = useRef<FlatList<Item>>(null);

  const allRuns = runs.data ?? [];
  const items = timeline(project.data, allRuns);
  const activeRun = [...allRuns].reverse().find((run) => run.status === 'running');
  const latestRun = allRuns.at(-1);
  const waiting = allRuns.some((run) => run.status === 'awaiting_input' || run.status === 'awaiting_integration');
  const available = latestPreview(project.data, allRuns);
  const title = stripTimeContext(project.data?.title || '') || 'Chat';
  const designs = chatDesigns(project.data, allRuns, live.liveNodes);
  const savedInspiration = project.data?.metadata?.selectedInspirationUrl || null;
  // Like the web, the picked inspiration goes with every message until it is removed.
  const inspiration = savedInspiration && savedInspiration !== removedInspiration ? savedInspiration : null;
  const working = activeRun
    ? activeRun.toolCalls.some((call) => !call.result)
      ? 'Genit is working on a step…'
      : activeRun.thinkingActive
        ? 'Genit is thinking…'
        : 'Genit is working…'
    : live.status || (live.generatingImage ? 'Generating your design…' : null);

  const send = async ({ prompt, text, attachedFiles, agentModelId, useBrandIdentity }: Parameters<Parameters<typeof Composer>[0]['onSend']>[0]) => {
    setError('');
    const resumable = latestRun && ['cancelled', 'failed', 'running'].includes(latestRun.status) ? latestRun : undefined;
    if (resumable && /^(continue|resume|go on|keep going)[.!]?$/i.test(text)) {
      await continueAgentRun(resumable.runId);
      return;
    }
    const runId = await startAgentRun({ projectId: id, prompt, requestId: newRequestId(), attachedFiles, useBrandIdentity, agentModelId });
    updateRun(queryClient, id, runId, (run) => ({ ...run, prompt, attachedFiles, status: 'running' }), prompt);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 150);
    // Credits change as the run works; the balance under the composer follows.
    setTimeout(() => refreshUser().catch(() => undefined), 4000);
  };

  /** Starts a run from a card in the chat (animate a design, for example). */
  const sendToAgent = (text: string, attachedFiles?: AgentAttachedFile[]) =>
    send({ prompt: withTimeContext(text), text, attachedFiles, agentModelId: model?._id, useBrandIdentity: prefs.useBrand });

  const prefillComposer = (text: string) => {
    setPreview(null);
    setDraft(text);
  };

  const removeInspiration = async () => {
    setRemovedInspiration(inspiration);
    try {
      await saveInspiration(id, null);
      queryClient.invalidateQueries({ queryKey: projectKey(id) });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const removeRun = async (runId: string) => {
    await deleteAgentRun(runId);
    queryClient.setQueryData<AgentRun[]>(runsKey(id), (current = []) => current.filter((run) => run.runId !== runId));
  };

  const body = () => {
    if (project.isLoading || runs.isLoading) return <Loading />;
    if (project.isError) return <LoadError error={project.error} onRetry={project.refetch} />;
    const streaming = live.streamingText || live.status || live.generatingImage;
    return (
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        ref={list}
        data={items}
        keyExtractor={(item, index) => (item.kind === 'run' ? item.run.runId : String(item.message.id || item.message._id || index))}
        contentContainerStyle={{ padding: space.lg, gap: space.xl, flexGrow: 1 }}
        keyboardShouldPersistTaps='handled'
        keyboardDismissMode='interactive'
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          setAtBottom(contentSize.height - contentOffset.y - layoutMeasurement.height < 150);
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => atBottom && list.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) =>
          item.kind === 'run' ? (
            <AgentMessage run={item.run} onDelete={() => removeRun(item.run.runId)} />
          ) : project.data ? (
            <LegacyMessage project={project.data} message={item.message} />
          ) : null
        }
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: 80 }}>
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>Start a conversation</Text>
            <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>Ask anything, or describe what you’d like Genit to create or do.</Text>
          </View>
        }
        ListFooterComponent={
          streaming ? (
            <View style={{ gap: space.sm, paddingTop: items.length ? space.xl : 0 }}>
              <GenitHeader status={<ActivityIndicator size='small' color={colors.textMuted} />} />
              {live.streamingText ? <Markdown>{live.streamingText}</Markdown> : <Text style={{ fontSize: 14, color: colors.textMuted }}>{live.status || (live.generatingImage ? 'Generating your design…' : 'Thinking…')}</Text>}
            </View>
          ) : undefined
        }
      />
    );
  };

  return (
    <ChatScreenContext.Provider value={{ projectId: id, category: project.data?.category, openPreview: setPreview, sendToAgent, prefillComposer }}>
      <Page
        title={title}
        back={() => (router.canGoBack() ? router.back() : router.replace('/chat'))}
        actions={
          <>
            {designs.length && available?.kind !== 'designs' ? <IconButton icon='images-outline' label='Design studio' onPress={() => setPreview({ kind: 'designs' })} /> : null}
            {available ? <IconButton icon='albums-outline' label='Show preview' onPress={() => setPreview(available)} /> : null}
            <IconButton icon='ellipsis-horizontal' label='Chat options' onPress={() => setMenu(true)} />
          </>
        }
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ paddingHorizontal: space.lg }}>
            <Banner message={error} />
          </View>
          <View style={{ flex: 1 }}>
            {body()}
            {!atBottom && items.length ? (
              <Pressable
                accessibilityRole='button'
                accessibilityLabel='Scroll to latest'
                onPress={() => list.current?.scrollToEnd({ animated: true })}
                style={{
                  position: 'absolute',
                  bottom: space.md,
                  alignSelf: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                }}
              >
                <Icon name='chevron-down' size={20} color={colors.text} />
              </Pressable>
            ) : null}
          </View>
          <View style={{ paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: Math.max(insets.bottom, space.md) }}>
            <Composer
              value={draft}
              onChangeText={setDraft}
              placeholder='Ask a follow-up…'
              onSend={send}
              running={!!activeRun}
              blocked={waiting && !activeRun}
              onStop={() => (activeRun ? stopAgentRun(activeRun.runId) : Promise.resolve())}
              inspiration={inspiration}
              onRemoveInspiration={removeInspiration}
            />
          </View>
        </KeyboardAvoidingView>
      </Page>

      <PreviewDrawer preview={preview} projectId={id} onClose={() => setPreview(null)} designs={designs} working={working} />
      <OptionsDrawer
        visible={menu}
        onClose={() => setMenu(false)}
        title={title}
        options={[
          { value: 'new', label: 'New chat', icon: <Icon name='create-outline' size={22} color={colors.text} /> },
          { value: 'history', label: 'All chats', icon: <Icon name='time-outline' size={22} color={colors.text} /> },
          { value: 'archive', label: 'Archive chat', icon: <Icon name='archive-outline' size={22} color={colors.text} /> },
          { value: 'delete', label: 'Delete chat', icon: <Icon name='trash-outline' size={22} color={colors.danger} /> },
        ]}
        onSelect={(action) => {
          if (action === 'new') router.push('/chat');
          if (action === 'history') router.push('/history');
          if (action === 'archive') {
            archiveChat(id)
              .then(() => {
                queryClient.invalidateQueries({ queryKey: ['history'] });
                router.back();
              })
              .catch((caught) => setError(errorMessage(caught)));
          }
          if (action === 'delete') setConfirm('delete');
        }}
      />
      <ConfirmDrawer
        visible={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title='Delete this chat?'
        message="The chat and everything in it is deleted. This can't be undone."
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          await deleteChat(id);
          queryClient.invalidateQueries({ queryKey: ['history'] });
          router.back();
        }}
      />
    </ChatScreenContext.Provider>
  );
}
