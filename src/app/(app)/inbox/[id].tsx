import { Icon } from '@/components/icon';
import { showToast } from '@/components/toast';
import { BrandLogo } from '@/components/brand-logo';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, ImageBackground, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { Avatar, Empty, IconButton, LoadError, Loading } from '@/components/kit';
import { Banner, Button } from '@/components/ui';
import { CALL_PLATFORMS, CallDrawer } from '@/features/inbox/calls/call-drawer';
import { ConversationActions } from '@/features/inbox/conversation-actions';
import { EditMessageDrawer, TemplateDrawer } from '@/features/inbox/conversation-drawers';
import { ChatHeaderSkeleton, ChatSkeleton } from '@/features/inbox/chat-skeleton';
import { EmojiDrawer } from '@/features/inbox/emoji-drawer';
import { haptic } from '@/features/inbox/haptics';
import { cachedConversation } from '@/features/inbox/inbox-accounts';
import {
  aiDraft,
  aiHandoff,
  canEditMessage,
  deleteMessage,
  editMessage,
  fetchConversation,
  fetchMessages,
  type InboxAttachment,
  type InboxMessage,
  inboxKeys,
  isEmail,
  markRead,
  MESSAGE_PAGE,
  replyMaxLength,
  retryMessage,
  sendMessage,
  supportsAttachments,
  telegramWindowClosed,
  updateConversation,
  senderLogo,
  uploadAttachment,
  whatsappWindowClosed,
} from '@/features/inbox/inbox-api';
import { MessageBubble } from '@/features/inbox/message-bubble';
import { useConversationRoom } from '@/features/inbox/use-inbox-realtime';
import { useIntegrations } from '@/features/integrations/integrations-api';
import { errorMessage } from '@/lib/api';
import { type LocalFile } from '@/lib/files';
import { platformMeta } from '@/lib/platforms';
import { radius, space, useColors } from '@/lib/theme';

const INBOX_PATTERN_LIGHT = require('../../../../assets/images/inbox-pattern-light.png');
const INBOX_PATTERN_DARK = require('../../../../assets/images/inbox-pattern-dark.png');

const MAX_ATTACHMENTS = 4;

type Draft = { reply: string; attachments: InboxAttachment[] };

/** Drafts (text and uploaded attachments) survive leaving and reopening a conversation, but not an app restart. */
const drafts = new Map<string, Draft>();

export default function ConversationScreen() {
  const colors = useColors();
  const dark = useColorScheme() === 'dark';
  const [callType] = useState<'audio' | 'video'>('video');
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { integrations } = useIntegrations();
  useConversationRoom(id);

  const conversationQuery = useQuery({
    queryKey: ['inbox', 'conversation', id],
    queryFn: () => fetchConversation(id),
    initialData: () => cachedConversation(queryClient, id),
    staleTime: 15_000,
  });
  // Fresher copies arrive through list refreshes; prefer them.
  const conversation = cachedConversation(queryClient, id) ?? conversationQuery.data ?? null;

  // Newest page first; each older page asks for messages before the oldest one loaded.
  const messages = useInfiniteQuery({
    queryKey: inboxKeys.messages(id),
    queryFn: ({ pageParam }) => fetchMessages(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length >= MESSAGE_PAGE ? last[0]?.createdAt : undefined),
    refetchInterval: 15_000,
  });

  const [draftState, setDraftState] = useState<Draft>(() => drafts.get(id) ?? { reply: '', attachments: [] });
  const updateDraft = (patch: Partial<Draft> | ((current: Draft) => Partial<Draft>)) =>
    setDraftState((current) => {
      const next = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
      drafts.set(id, next);
      return next;
    });
  const { reply, attachments } = draftState;
  const setReply = (text: string) => updateDraft({ reply: text });
  const setAttachments = (next: (current: InboxAttachment[]) => InboxAttachment[]) => updateDraft((current) => ({ attachments: next(current.attachments) }));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [drawer, setDrawer] = useState<'attach' | 'template' | 'call' | 'emoji' | null>(null);
  // Where the cursor was last, so an emoji lands there rather than at the end.
  const selection = useRef({ start: reply.length, end: reply.length });
  const [actionsOpen, setActionsOpen] = useState(false);
  const [messageMenu, setMessageMenu] = useState<InboxMessage | null>(null);
  const [editing, setEditing] = useState<InboxMessage | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<InboxMessage | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: inboxKeys.all });

  // Opening a conversation reads it.
  const unread = conversation?.unreadCount ?? 0;
  useEffect(() => {
    if (unread > 0) markRead(id).then(invalidate).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, unread]);

  const send = useMutation({
    mutationFn: () => sendMessage(id, reply.trim(), attachments),
    onSuccess: () => {
      haptic.success();
      updateDraft({ reply: '', attachments: [] });
      invalidate();
    },
    onError: (caught) => {
      haptic.error();
      setError(errorMessage(caught));
      // A failed send is saved as a failed message with Retry.
      invalidate();
    },
  });

  const draft = useMutation({
    mutationFn: () => aiDraft(id, reply.trim() || undefined),
    onSuccess: (text) => setReply(text),
    onError: (caught) => setError(errorMessage(caught)),
  });

  const retry = useMutation({ mutationFn: (messageId: string) => retryMessage(messageId), onSettled: invalidate });

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof updateConversation>[1]) => updateConversation(id, patch),
    onSuccess: () => {
      haptic.success();
      invalidate();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  // Pages arrive newest-first and oldest-first within each; the inverted list wants newest-first overall.
  const list = useMemo(() => {
    const seen = new Set<string>();
    const ordered: InboxMessage[] = [];
    for (const page of messages.data?.pages ?? []) {
      for (const message of [...page].reverse()) {
        if (seen.has(message._id)) continue;
        seen.add(message._id);
        ordered.push(message);
      }
    }
    return ordered;
  }, [messages.data]);

  if (!conversation) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <IconButton icon='chevron-back' label='Back' onPress={() => router.back()} />
          {conversationQuery.isLoading ? <ChatHeaderSkeleton /> : null}
        </View>
        {conversationQuery.isLoading ? (
          <ChatSkeleton />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center' }}>
            {conversationQuery.isError ? (
              <LoadError error={conversationQuery.error} onRetry={conversationQuery.refetch} />
            ) : (
              <Empty icon='chatbubble-outline' title='Conversation not found' message='It may have been deleted.' />
            )}
          </View>
        )}
      </SafeAreaView>
    );
  }

  const meta = platformMeta(conversation.platform);
  const email = isEmail(conversation.platform);
  const canCall = CALL_PLATFORMS.has(conversation.platform);
  const announceCalls = () => showToast('Voice and video calls are coming soon to Genit.', 'call-outline');
  const account = integrations.find((item) => item._id === conversation.integration);
  const telegramConnection = (account?.metadata?.businessConnections ?? []).find(
    (connection: { id: string }) => connection.id === conversation.metadata?.businessConnectionId
  );
  const providerReplyUnavailable = !!conversation.metadata?.telegramBusiness && (!telegramConnection?.isEnabled || !telegramConnection?.rights?.can_reply);
  const maxLength = replyMaxLength(conversation);
  const waClosed = whatsappWindowClosed(conversation);
  const handoff = aiHandoff(conversation);

  const blockedReason = conversation.isBlocked
    ? 'This contact is blocked. Unblock to reply.'
    : conversation.status === 'resolved'
      ? 'This conversation is resolved. Reopen to reply.'
      : telegramWindowClosed(conversation)
        ? 'Telegram Business only allows replies within 24 hours of the customer’s last message.'
        : providerReplyUnavailable
          ? 'This Telegram Business connection isn’t allowed to reply. Check its permissions in Telegram.'
          : null;

  const canSend = !blockedReason && !waClosed && (reply.trim().length > 0 || attachments.length > 0) && !uploading && (!maxLength || reply.length <= maxLength);

  const addFiles = async (files: LocalFile[]) => {
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) return setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    setUploading(true);
    setError('');
    try {
      const uploaded: InboxAttachment[] = [];
      for (const file of files.slice(0, room)) uploaded.push(await uploadAttachment(file));
      setAttachments((current) => [...current, ...uploaded]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  };


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon='chevron-back' label='Back' onPress={() => router.back()} />
        <Pressable accessibilityRole='button' accessibilityLabel='Conversation actions and contact details' onPress={() => setActionsOpen(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Avatar uri={conversation.customerAvatar} fallbackUri={senderLogo(conversation)} name={conversation.customerName} size={36} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
              {conversation.customerName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <BrandLogo platform={conversation.platform} size={13} />
              <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
                {[meta.label, conversation.customerHandle, conversation.status !== 'open' ? conversation.status : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        </Pressable>
        {/* Voice and video calls are coming soon: the buttons say so instead of calling. */}
        <IconButton icon='call-outline' label='Voice call, coming soon' onPress={announceCalls} />
        <IconButton icon='videocam' label='Video call, coming soon' onPress={announceCalls} />
        <IconButton icon='ellipsis-horizontal' label='Conversation actions' busy={update.isPending} onPress={() => setActionsOpen(true)} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {conversation.subject ? (
          <Text numberOfLines={2} style={{ paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: space.sm, fontSize: 15, fontWeight: '600', color: colors.text }}>
            {conversation.subject}
          </Text>
        ) : null}
        {handoff ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.page, marginTop: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: 'rgba(217,119,6,0.12)' }}>
            <Icon name='person-circle-outline' size={22} color='#D97706' />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>AI auto-reply paused</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted }}>{handoff}</Text>
            </View>
            <Button title='Resume AI' variant='secondary' small loading={update.isPending} onPress={() => update.mutate({ resumeAi: true })} />
          </View>
        ) : null}
        {/* The web's chat wallpaper, pre-rendered for each theme. Email reads like a document, so it stays plain. */}
        <View style={{ flex: 1 }}>
        {email ? null : (
          <ImageBackground
            source={dark ? INBOX_PATTERN_DARK : INBOX_PATTERN_LIGHT}
            resizeMode='repeat'
            style={StyleSheet.absoluteFill}
            imageStyle={{ resizeMode: 'repeat' }}
          />
        )}
        {list.length === 0 ? (
          // An inverted list draws its empty state upside down at the bottom, so placeholders render outside it.
          messages.isLoading ? (
            <ChatSkeleton />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              {messages.isError ? (
                <LoadError error={messages.error} onRetry={messages.refetch} />
              ) : (
                <Empty icon='chatbubble-outline' title='No messages yet' />
              )}
            </View>
          )
        ) : (
          <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
            inverted
            onEndReached={() => messages.hasNextPage && !messages.isFetchingNextPage && messages.fetchNextPage()}
            onEndReachedThreshold={0.3}
            ListFooterComponent={messages.isFetchingNextPage ? <Loading /> : undefined}
            data={list}
            keyExtractor={(message) => message._id}
            contentContainerStyle={{ padding: space.lg, gap: space.md }}
            keyboardDismissMode='interactive'
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                email={email}
                platform={conversation.platform}
                contact={conversation}
                onLongPress={
                  canEditMessage(item)
                    ? () => {
                        haptic.select();
                        setMessageMenu(item);
                      }
                    : undefined
                }
                onRetry={() => retry.mutate(item._id)}
                retrying={retry.isPending && retry.variables === item._id}
              />
            )}
          />
        )}
        </View>

        <View style={{ padding: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
          <Banner message={error} />
          {blockedReason ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>{blockedReason}</Text>
              {conversation.isBlocked ? (
                <Button title='Unblock' variant='secondary' small loading={update.isPending} onPress={() => update.mutate({ isBlocked: false })} />
              ) : conversation.status === 'resolved' ? (
                <Button title='Reopen' variant='secondary' small loading={update.isPending} onPress={() => update.mutate({ status: 'open' })} />
              ) : null}
            </View>
          ) : waClosed ? (
            <View style={{ gap: space.sm }}>
              <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center' }}>
                It’s been more than 24 hours since this customer wrote. WhatsApp requires an approved template to reply.
              </Text>
              <Button title='Send template' onPress={() => setDrawer('template')} />
            </View>
          ) : (
            <>
              {attachments.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                  {attachments.map((attachment, index) => (
                    <Pressable
                      key={`${attachment.url}-${index}`}
                      accessibilityRole='button'
                      accessibilityLabel={`Remove ${attachment.name}`}
                      onPress={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surface }}
                    >
                      <Text numberOfLines={1} style={{ maxWidth: 140, fontSize: 13, color: colors.text }}>
                        {attachment.name}
                      </Text>
                      <Icon name='close' size={14} color={colors.textMuted} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
                {supportsAttachments(conversation) ? (
                  <IconButton icon='attach' label='Attach files' busy={uploading} disabled={attachments.length >= MAX_ATTACHMENTS} onPress={() => setDrawer('attach')} />
                ) : null}
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    minHeight: 40,
                    borderRadius: 20,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Pressable
                    accessibilityRole='button'
                    accessibilityLabel='Add emoji'
                    onPress={() => {
                      Keyboard.dismiss();
                      setDrawer('emoji');
                    }}
                    hitSlop={6}
                    style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                  >
                    <Icon name='happy-outline' size={22} color={colors.textMuted} />
                  </Pressable>
                  <TextInput
                    onSelectionChange={(event) => {
                      selection.current = event.nativeEvent.selection;
                    }}
                    value={reply}
                    onChangeText={(text) => setReply(maxLength ? text.slice(0, maxLength) : text)}
                    placeholder={email ? 'Write a reply' : 'Message'}
                    placeholderTextColor={colors.textFaint}
                    multiline
                    accessibilityLabel='Reply'
                    style={{
                      flex: 1,
                      maxHeight: 140,
                      paddingLeft: 0,
                      paddingRight: reply.trim() ? 0 : space.md,
                      paddingTop: 10,
                      paddingBottom: 10,
                      fontSize: 16,
                      color: colors.text,
                    }}
                  />
                  {/* Rewrites what you've typed with AI, so it only appears once there's text to work with. */}
                  {reply.trim() || draft.isPending ? (
                    <Pressable
                      accessibilityRole='button'
                      accessibilityLabel='Improve with AI'
                      disabled={draft.isPending}
                      onPress={() => {
                        setError('');
                        draft.mutate();
                      }}
                      hitSlop={6}
                      style={({ pressed }) => ({ width: 36, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
                    >
                      {draft.isPending ? <ActivityIndicator size='small' color={colors.primary} /> : <Icon name='ai-enhance' size={20} color={colors.primary} />}
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole='button'
                  accessibilityLabel='Send'
                  disabled={!canSend || send.isPending}
                  onPress={() => {
                    setError('');
                    send.mutate();
                  }}
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: canSend ? colors.primary : colors.surfacePressed }}
                >
                  {send.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Icon name='arrow-up' size={20} color={canSend ? colors.onPrimary : colors.textFaint} />}
                </Pressable>
              </View>
              {maxLength ? (
                <Text style={{ alignSelf: 'flex-end', fontSize: 12, color: reply.length >= maxLength ? colors.danger : colors.textFaint }}>
                  {reply.length} / {maxLength}
                </Text>
              ) : null}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <ConversationActions
        conversation={conversation}
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onCall={announceCalls}
        onDeleted={() => router.back()}
        onError={setError}
      />

      <OptionsDrawer
        visible={drawer === 'attach'}
        onClose={() => setDrawer(null)}
        title='Attach'
        options={[
          { value: 'media', label: 'Photos and videos' },
          { value: 'files', label: 'Files' },
        ]}
        onSelect={async (value) => {
          if (value === 'media') {
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: MAX_ATTACHMENTS - attachments.length, quality: 0.9 });
            if (!result.canceled) await addFiles(result.assets.map((asset) => ({ uri: asset.uri, name: asset.fileName ?? undefined, mimeType: asset.mimeType })));
          } else {
            const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
            if (!result.canceled) await addFiles(result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined })));
          }
        }}
      />

      <OptionsDrawer
        visible={!!messageMenu}
        onClose={() => setMessageMenu(null)}
        title='Message'
        options={[
          { value: 'edit', label: 'Edit' },
          { value: 'delete', label: 'Delete' },
        ]}
        onSelect={(action) => {
          if (action === 'edit') setEditing(messageMenu);
          if (action === 'delete') setDeletingMessage(messageMenu);
        }}
      />

      <EditMessageDrawer
        visible={!!editing}
        initial={editing?.content ?? ''}
        onClose={() => setEditing(null)}
        onSave={async (content) => {
          if (!editing) return;
          await editMessage(editing._id, content);
          invalidate();
        }}
      />

      <ConfirmDrawer
        visible={!!deletingMessage}
        onClose={() => setDeletingMessage(null)}
        title='Delete this message?'
        message="It's removed from Genit and, where the channel allows it, from the conversation too."
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          if (!deletingMessage) return;
          await deleteMessage(deletingMessage._id);
          invalidate();
        }}
      />

      <EmojiDrawer
        visible={drawer === 'emoji'}
        onClose={() => setDrawer(null)}
        onPick={(emoji) => {
          const { start, end } = selection.current;
          const at = Math.min(start, reply.length);
          const next = reply.slice(0, at) + emoji + reply.slice(Math.min(Math.max(end, at), reply.length));
          if (maxLength && next.length > maxLength) return;
          setReply(next);
          selection.current = { start: at + emoji.length, end: at + emoji.length };
        }}
      />
      <TemplateDrawer conversationId={id} visible={drawer === 'template'} onClose={() => setDrawer(null)} />
      {canCall ? <CallDrawer conversation={conversation} visible={drawer === 'call'} onClose={() => setDrawer(null)} callType={callType} /> : null}
    </SafeAreaView>
  );
}
