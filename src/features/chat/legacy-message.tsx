import { Icon } from '@/components/icon';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmDrawer } from '@/components/drawer';
import { errorMessage } from '@/lib/api';
import { shareRemoteFile } from '@/lib/files';
import { radius, space, useColors } from '@/lib/theme';

import { ConnectLinkButton, InspirationPicker } from './agent-cards';
import { GenitHeader, MessageActions, type Reaction, UserBubble } from './agent-message';
import {
  addReaction,
  type ChatProject,
  deleteGenerationItem,
  deleteProjectMessages,
  generateProjectMessage,
  type GenerationGroup,
  type GenerationItem,
  type MessageFile,
  projectKey,
  publishToInspiration,
  type ProjectMessage,
  removeReaction,
  unpublishFromInspiration,
  setActiveGeneration,
  stripTimeContext,
} from './chat-api';
import { CardButton, fullUrl, openExternal, useChatScreen } from './chat-ui';
import { useChatPrefs } from './chat-prefs';
import { Markdown } from './markdown';

export const messageId = (message: ProjectMessage) => String(message.id || message._id || '');

export function messageText(message: ProjectMessage) {
  return message.parts?.find((part) => part.type === 'text')?.text ?? message.text ?? '';
}

function reasoningText(message: ProjectMessage) {
  return message.parts?.find((part) => part.type === 'reasoning')?.text ?? message.analysis ?? '';
}

const isUser = (message: ProjectMessage) => message.type === 'user' || message.role === 'user';

/** Version notices the web hides; the version card already shows the result. */
export function isHiddenMessage(message: ProjectMessage) {
  if (message.isHidden) return true;
  const text = messageText(message).trim();
  return /^Here is (the generated design|the generated video|your generated AI video)/.test(text);
}

function filesOf(message: ProjectMessage) {
  return ((message.fileAttachments || message.attachedFiles || []) as MessageFile[]).map((file) => ({
    name: file.name || 'Attachment',
    type: file.type || '',
    url: fullUrl(file.url || file.filePath),
    size: file.size,
  }));
}

/** A message saved on the project, from chats made before agent runs. */
export function LegacyMessage({ project, message }: { project: ChatProject; message: ProjectMessage }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const id = messageId(message);
  const [deleting, setDeleting] = useState(false);
  const [reaction, setReaction] = useState<Reaction>(message.feedback?.userReaction);
  const refresh = () => queryClient.invalidateQueries({ queryKey: projectKey(project._id) });

  const react = async (type: 'like' | 'dislike') => {
    const previous = reaction;
    const next = previous === type ? null : type;
    setReaction(next);
    try {
      if (previous) await removeReaction(project._id, id, previous);
      if (next) await addReaction(project._id, id, next);
    } catch {
      setReaction(previous);
    }
  };

  if (isUser(message)) {
    // No edit action: the server has no route to edit a saved message (the web's edit fails with 404).
    const text = messageText(message);
    return <UserBubble text={text} files={filesOf(message)} actions={<MessageActions text={text} />} />;
  }

  const text = messageText(message);
  const reasoning = reasoningText(message);
  return (
    <View style={{ gap: space.sm }}>
      <GenitHeader />
      {reasoning ? (
        <View style={{ padding: space.md, borderRadius: radius.sm, backgroundColor: colors.surface }}>
          <Markdown muted size={13}>
            {reasoning}
          </Markdown>
        </View>
      ) : null}
      {text ? <Markdown renderConnection={(label, href) => <ConnectLinkButton label={label} href={href} />}>{text}</Markdown> : null}
      {text ? <ReplyLinks text={text} /> : null}
      {(message.parts ?? []).map((part, index) =>
        part.type === 'options' && part.options?.length ? (
          <ReplyOptions key={`options-${index}`} project={project} options={part.options} />
        ) : part.type === 'search_results' && part.results?.length ? (
          <InspirationPicker
            key={`results-${index}`}
            results={part.results}
            query={part.query || 'design inspiration'}
            initialSelection={project.metadata?.selectedInspirationUrl}
            onSelect={async () => {
              await refresh();
            }}
          />
        ) : null
      )}
      {(message.generationGroups ?? []).map((group, index) => (
        <VersionsCard key={group._id || group.id || index} project={project} group={group} prompt={text} />
      ))}
      {message.totalTime && message.totalTime > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name='time-outline' size={12} color={colors.textMuted} />
          <Text style={{ fontSize: 12, color: colors.textMuted }}>Processed in {formatDuration(message.totalTime)}</Text>
        </View>
      ) : null}
      <MessageActions text={text} reaction={reaction} onLike={() => react('like')} onDislike={() => react('dislike')} onDelete={id ? () => setDeleting(true) : undefined} />
      <ConfirmDrawer
        visible={deleting}
        onClose={() => setDeleting(false)}
        title='Delete this reply?'
        message='This reply, the message before it and everything after it are deleted from the chat.'
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          await deleteProjectMessages(project._id, id);
          await refresh();
        }}
      />
    </View>
  );
}

const isVideoItem = (item: GenerationItem) => !!item.type?.startsWith('video/') || /\.(mp4|mov|webm)(\?|$)/i.test(item.url || item.filePath || '');

/** The versions of one generated design, with view, use, save, publish, edit and delete. */
function VersionsCard({ project, group, prompt }: { project: ChatProject; group: GenerationGroup; prompt: string }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { openPreview, sendToAgent } = useChatScreen();
  const items = group.items ?? [];
  const [unpublished, setUnpublished] = useState<Set<string>>(new Set());
  const groupId = String(group.id || group._id || '');
  const [index, setIndex] = useState(Math.max(0, items.findIndex((item) => item.isActive)));
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeId, setActiveId] = useState(items.find((item) => item.isActive)?.id);

  if (!items.length) return null;
  const current = items[Math.min(index, items.length - 1)];
  const url = fullUrl(current.url || current.filePath);
  const video = isVideoItem(current);
  const refresh = () => queryClient.invalidateQueries({ queryKey: projectKey(project._id) });

  const run = async (key: string, action: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    setNotice('');
    try {
      await action();
      if (success) setNotice(success);
    } catch (caught) {
      setNotice(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  };

  const snapshot = current.type === 'application/json+automation' ? 'automation' : current.type === 'application/json+workflow' ? 'workflow' : null;
  if (snapshot) return <SnapshotCard item={current} kind={snapshot} />;

  const animate = () =>
    run('animate', async () => {
      if (!sendToAgent) return;
      const extension = url.split('?')[0].split('.').pop()?.toLowerCase();
      await sendToAgent(animationPrompt(project.category, stripTimeContext(prompt)), [
        { name: current.name || 'design', type: extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg', url },
      ]);
    });

  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10, backgroundColor: colors.surface }}>
        <Icon name='layers-outline' size={15} color={colors.textMuted} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text }}>
          {group.title || current.name || 'Generated design'}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>
          Version {index + 1} of {items.length}
        </Text>
      </View>

      <Pressable
        accessibilityRole='imagebutton'
        accessibilityLabel='View full size'
        disabled={!url || current.status === 'generating'}
        onPress={() => openPreview({ kind: 'media', title: current.name || 'Design', url, isVideo: video, prompt })}
        style={{ height: 260, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}
      >
        {current.status === 'generating' ? (
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <ActivityIndicator />
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Generating…</Text>
          </View>
        ) : current.status === 'error' ? (
          <Text style={{ fontSize: 13, color: colors.danger }}>This version failed to generate.</Text>
        ) : current.videoConfig && !url ? (
          <View style={{ alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg }}>
            <Icon name='film-outline' size={40} color={colors.textMuted} />
            <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>This animated preview plays on the web app.</Text>
          </View>
        ) : video ? (
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <Icon name='play-circle' size={56} color={colors.text} />
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Tap to play</Text>
          </View>
        ) : url ? (
          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit='contain' />
        ) : null}
      </Pressable>

      {items.length > 1 ? (
        <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, padding: space.sm }}>
          {items.map((item, itemIndex) => {
            const thumb = fullUrl(item.url || item.filePath);
            return (
              <Pressable
                key={item.id || itemIndex}
                accessibilityRole='button'
                accessibilityLabel={`Version ${itemIndex + 1}`}
                accessibilityState={{ selected: itemIndex === index }}
                onPress={() => setIndex(itemIndex)}
                style={{ width: 52, height: 52, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 2, borderColor: itemIndex === index ? colors.primary : 'transparent', backgroundColor: colors.surface }}
              >
                {thumb && !isVideoItem(item) ? <Image source={{ uri: thumb }} style={{ width: '100%', height: '100%' }} contentFit='cover' /> : <Icon name='film-outline' size={20} color={colors.textMuted} style={{ margin: 14 }} />}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {url && current.status !== 'generating' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.md, paddingTop: items.length > 1 ? 0 : space.md }}>
          <CardButton
            label={activeId === current.id ? 'In use' : 'Use this version'}
            icon={activeId === current.id ? 'checkmark-circle' : 'radio-button-off'}
            disabled={activeId === current.id}
            busy={busy === 'active'}
            onPress={() =>
              run('active', async () => {
                await setActiveGeneration(project._id, groupId, current.id);
                setActiveId(current.id);
              }, 'This version is now the one in use.')
            }
          />
          {!video ? <CardButton label='Edit area' icon='brush-outline' onPress={() => router.push({ pathname: '/chat/inpaint', params: { projectId: project._id, imageUrl: url, groupId } })} /> : null}
          {!video ? <CardButton label='Convert to video' icon='film-outline' busy={busy === 'animate'} disabled={!sendToAgent} onPress={animate} /> : null}
          {current.publishStatus === 'published' && !unpublished.has(current.id) ? (
            <CardButton
              label='Unpublish'
              icon='eye-off-outline'
              busy={busy === 'publish'}
              onPress={() =>
                run(
                  'publish',
                  async () => {
                    await unpublishFromInspiration(url);
                    setUnpublished((ids) => new Set(ids).add(current.id));
                    await refresh();
                  },
                  'Removed from the inspiration gallery.'
                )
              }
            />
          ) : (
            <CardButton
              label='Publish'
              icon='share-outline'
              busy={busy === 'publish'}
              onPress={() =>
                run(
                  'publish',
                  async () => {
                    await publishToInspiration({
                      mediaUrl: url,
                      mediaType: video ? 'video' : 'image',
                      prompt,
                      category: project.category || 'generic_design',
                      title: current.name || (video ? 'Generated video' : 'Generated design'),
                    });
                    setUnpublished((ids) => {
                      const next = new Set(ids);
                      next.delete(current.id);
                      return next;
                    });
                    await refresh();
                  },
                  'Published to the inspiration gallery.'
                )
              }
            />
          )}
          <CardButton label='Save' icon='download-outline' busy={busy === 'save'} onPress={() => run('save', () => shareRemoteFile(url, current.name || url.split('/').pop() || 'genit-design'))} />
          <CardButton label='Delete' icon='trash-outline' onPress={() => setConfirmDelete(true)} />
        </View>
      ) : null}
      {notice ? <Text style={{ paddingHorizontal: space.md, paddingBottom: space.md, fontSize: 13, color: colors.textMuted }}>{notice}</Text> : null}

      <ConfirmDrawer
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title='Delete this version?'
        message="This version is removed from the card. It can't be undone."
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          await deleteGenerationItem(project._id, groupId, current.id);
          setIndex(0);
          await refresh();
        }}
      />
    </View>
  );
}

function formatDuration(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const PROJECT_TYPES = ['Flyer or Poster', 'Logo or Branding', 'Social Media Graphic', 'Website Landing Page'];

/** Suggested replies under a saved reply. Choosing one sends it through the same pipeline as the web. */
function ReplyOptions({ project, options }: { project: ChatProject; options: string[] }) {
  const colors = useColors();
  const prefs = useChatPrefs();
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const projectType = options.some((option) => PROJECT_TYPES.includes(option));
  const locked = projectType && !!project.category && project.category !== 'auto';

  const choose = async (option: string) => {
    if (sending || locked) return;
    setSending(option);
    setError('');
    try {
      await generateProjectMessage(project._id, option, { useBrandIdentity: prefs.useBrand });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(null);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      {projectType ? <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Select project type</Text> : null}
      <View accessibilityRole={projectType ? 'radiogroup' : undefined} style={{ flexDirection: projectType ? 'column' : 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((option) => {
          const selected = projectType && project.category === option;
          return (
            <Pressable
              key={option}
              accessibilityRole={projectType ? 'radio' : 'button'}
              accessibilityState={{ selected, disabled: locked || !!sending, busy: sending === option }}
              disabled={locked || !!sending}
              onPress={() => choose(option)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                paddingHorizontal: space.md,
                paddingVertical: projectType ? space.md : 8,
                borderRadius: projectType ? radius.md : 999,
                borderWidth: 1,
                borderColor: selected ? colors.primary : colors.border,
                backgroundColor: pressed ? colors.surfacePressed : colors.surface,
                opacity: locked && !selected ? 0.5 : 1,
              })}
            >
              {projectType ? <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? colors.primary : colors.textMuted} /> : null}
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }}>{option}</Text>
              {sending === option ? <ActivityIndicator size='small' /> : null}
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

const INTEGRATION_NAMES = ['Meta Ads', 'Google Ads', 'Facebook', 'Instagram', 'X Ads', 'Twitter', 'X', 'Pinterest', 'TikTok', 'LinkedIn', 'Shopify', 'Mailchimp', 'Brevo'];

/** What the web detects in a reply: a plugin to connect or reconnect, or an ad balance to top up. */
export function replyLinks(text: string) {
  const lower = text.toLowerCase();
  const topUp = lower.includes('ad balance') || lower.includes('top up');
  let integration: string | null = null;
  for (const name of INTEGRATION_NAMES) {
    const n = name.toLowerCase();
    if (
      [`connect ${n}`, `connect your ${n}`, `no ${n} connection`, `${n} needs reconnection`, `reconnect ${n}`, `reconnect your ${n}`].some((phrase) => lower.includes(phrase)) ||
      (lower.includes(n) && (lower.includes('token expired') || lower.includes('needs reconnection') || lower.includes('reconnect')))
    ) {
      integration = name;
      break;
    }
  }
  if (!integration) {
    const match =
      text.match(/(?:reconnect|connect) (?:your )?([A-Z][A-Za-z0-9\s]+?)(?: account| integration| plugin| in the integrations page| in the plugin page)/i) ||
      text.match(/([A-Z][A-Za-z0-9\s]+?) needs reconnection/i);
    if (match && match[1].length < 20) integration = match[1].trim();
  }
  return {
    integration,
    reconnect: lower.includes('reconnect') || lower.includes('expired') || lower.includes('needs reconnection'),
    metaTopUp: topUp && (lower.includes('meta') || lower.includes('facebook')),
    googleTopUp: topUp && lower.includes('google'),
  };
}

function ReplyLinks({ text }: { text: string }) {
  const links = replyLinks(text);
  // Replies that already carry a connect link get a button from the markdown.
  const hasConnectLink = /\[\s*(?:re)?connect\b[^\]]*\]\(https?:\/\//i.test(text);
  if (!(links.integration && !hasConnectLink) && !links.metaTopUp && !links.googleTopUp) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {links.integration && !hasConnectLink ? (
        <CardButton primary label={`${links.reconnect ? 'Reconnect' : 'Connect'} ${links.integration}`} icon='link-outline' onPress={() => router.push('/plugins')} />
      ) : null}
      {links.metaTopUp ? <CardButton label='Top up Meta Ads balance' icon='open-outline' onPress={() => openExternal('https://business.facebook.com/ads/manager/billing_history/summary/')} /> : null}
      {links.googleTopUp ? <CardButton label='Top up Google Ads balance' icon='open-outline' onPress={() => openExternal('https://ads.google.com/aw/billing/summary')} /> : null}
    </View>
  );
}

/** The web's prompts for turning a design into a video, by design type. */
function animationPrompt(designType: string | undefined, original: string) {
  const base = original || 'Animate this design';
  const prompts: Record<string, string> = {
    logo: 'Animate the logo with smooth, professional motion. Add subtle movement like gentle rotation, scaling, or morphing effects. Keep the brand identity intact while bringing the logo to life with elegant transitions.',
    flier: 'Animate this flier design with engaging motion graphics. Add dynamic text animations, smooth transitions between elements, and eye-catching visual effects that highlight key information.',
    instagram_post: 'Create an animated Instagram post with trendy motion effects. Add smooth transitions, text animations, and dynamic elements that capture attention in the feed.',
    poster: 'Animate this poster with cinematic motion. Add dramatic transitions, text reveals, and visual effects that enhance the message and create impact.',
    youtube_thumbnail: 'Animate this YouTube thumbnail with dynamic motion. Add eye-catching effects, text animations, and movement that draws viewers in and stands out in search results.',
    facebook_post: "Animate this Facebook post with engaging motion. Add smooth transitions, text animations, and visual effects that increase engagement and catch the viewer's attention.",
    facebook_cover: 'Animate this Facebook cover with subtle, professional motion. Add gentle transitions and effects that enhance the design without being distracting.',
    banner: 'Animate this banner with dynamic motion graphics. Add smooth transitions, text animations, and visual effects that create impact and draw attention.',
  };
  const lead = prompts[designType ?? ''] ?? 'Animate this design with smooth, professional motion. Add elegant transitions and visual effects.';
  return `Turn the attached design into a short video. ${lead} ${base}`;
}

/** A saved canvas snapshot: an automation (opens the workflow) or a legacy design workflow. */
function SnapshotCard({ item, kind }: { item: GenerationItem; kind: 'automation' | 'workflow' }) {
  const colors = useColors();
  const { openPreview } = useChatScreen();
  const nodes = item.data?.nodes?.length ?? 0;
  const edges = item.data?.edges?.length ?? 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}>
      <View style={{ width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
        <Icon name={kind === 'automation' ? 'flash-outline' : 'git-branch-outline'} size={20} color={colors.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>
          {item.name || (kind === 'automation' ? 'Automation canvas' : 'Workflow canvas')}
        </Text>
        <Text style={{ fontSize: 12.5, color: colors.textMuted }}>
          {kind === 'automation' ? 'Automation' : 'Workflow'} · {nodes} nodes · {edges} connections
        </Text>
      </View>
      {kind === 'automation' ? <CardButton label='View canvas' icon='git-network-outline' onPress={() => openPreview({ kind: 'automation' })} /> : null}
    </View>
  );
}
