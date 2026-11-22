import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ConfirmDrawer, type DrawerOption, OptionsDrawer } from '@/components/drawer';
import { integrationsKey, updateInboxSettings, useIntegrations } from '@/features/integrations/integrations-api';
import { errorMessage } from '@/lib/api';
import { downloadAndShare } from '@/lib/files';

import { ContactDrawer } from './conversation-drawers';
import { haptic } from './haptics';
import { accountLabel } from './inbox-accounts';
import {
  aiHandoff,
  clearConversation,
  type ConversationPatch,
  deleteConversation,
  exportPath,
  type InboxConversation,
  inboxKeys,
  markRead,
  updateConversation,
} from './inbox-api';

type Action =
  | 'read'
  | 'resolve'
  | 'reopen'
  | 'snooze'
  | 'pin'
  | 'mute'
  | 'block'
  | 'resumeAi'
  | 'autoReply'
  | 'contact'
  | 'call'
  | 'export'
  | 'clear'
  | 'delete';

/** Whether AI auto-reply is on for a channel. Telegram keeps its own flag. */
export const autoReplyOn = (metadata?: Record<string, any>) => !!(metadata?.inboxAutoReplyEnabled || metadata?.telegramAutoReplyEnabled);

/**
 * Everything you can do to one conversation, as drawers: the action list and
 * the contact, clear and delete drawers it leads to. Shared by the list's swipe
 * "More" action and the thread's menu so both offer the same things.
 */
export function ConversationActions({
  conversation,
  visible,
  onClose,
  onCall,
  onDeleted,
  onError,
}: {
  conversation: InboxConversation;
  visible: boolean;
  onClose: () => void;
  /** Shown only where calling is possible (WhatsApp threads). */
  onCall?: () => void;
  onDeleted?: () => void;
  onError: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const { integrations } = useIntegrations();
  const [next, setNext] = useState<'contact' | 'clear' | 'delete' | null>(null);
  const account = integrations.find((item) => item._id === conversation.integration);
  const autoReply = autoReplyOn(account?.metadata);
  const handoff = aiHandoff(conversation);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: inboxKeys.all });

  const update = useMutation({
    mutationFn: (patch: ConversationPatch) => updateConversation(conversation._id, patch),
    onSuccess: () => {
      haptic.success();
      invalidate();
    },
    onError: (caught) => {
      haptic.error();
      onError(errorMessage(caught));
    },
  });

  const run = async (action: Action) => {
    onError('');
    try {
      if (action === 'read') {
        await markRead(conversation._id);
        await invalidate();
      }
      if (action === 'resolve') update.mutate({ status: 'resolved' });
      if (action === 'reopen') update.mutate({ status: 'open' });
      if (action === 'snooze') update.mutate({ status: 'snoozed' });
      if (action === 'pin') update.mutate({ isPinned: !conversation.isPinned });
      if (action === 'mute') update.mutate({ isMuted: !conversation.isMuted });
      if (action === 'block') update.mutate({ isBlocked: !conversation.isBlocked });
      if (action === 'resumeAi') update.mutate({ resumeAi: true });
      if (action === 'autoReply' && account) {
        await updateInboxSettings(account._id, { autoReplyEnabled: !autoReply });
        haptic.success();
        await queryClient.invalidateQueries({ queryKey: integrationsKey });
      }
      if (action === 'call') onCall?.();
      if (action === 'contact' || action === 'clear' || action === 'delete') setNext(action);
      if (action === 'export') await downloadAndShare(exportPath(conversation._id), `${conversation.customerName || 'conversation'}-chat.txt`);
    } catch (caught) {
      haptic.error();
      onError(errorMessage(caught));
    }
  };

  const options: DrawerOption<Action>[] = [
    ...(conversation.unreadCount > 0 ? [{ value: 'read' as const, label: 'Mark as read' }] : []),
    conversation.status === 'resolved'
      ? { value: 'reopen', label: 'Reopen' }
      : { value: 'resolve', label: 'Resolve', description: 'Archives the thread in Gmail and Outlook too' },
    ...(conversation.status === 'snoozed' ? [{ value: 'reopen' as const, label: 'Unsnooze' }] : [{ value: 'snooze' as const, label: 'Snooze' }]),
    { value: 'pin', label: conversation.isPinned ? 'Unpin' : 'Pin to top' },
    { value: 'mute', label: conversation.isMuted ? 'Unmute' : 'Mute' },
    { value: 'block', label: conversation.isBlocked ? 'Unblock' : 'Block' },
    ...(handoff ? [{ value: 'resumeAi' as const, label: 'Resume AI auto-reply', description: handoff }] : []),
    ...(account
      ? [
          {
            value: 'autoReply' as const,
            label: autoReply ? 'Turn off AI auto-reply' : 'Turn on AI auto-reply',
            description: `For every conversation on ${accountLabel(account)}`,
          },
        ]
      : []),
    { value: 'contact', label: 'Contact details' },
    ...(onCall ? [{ value: 'call' as const, label: 'Call' }] : []),
    { value: 'export', label: 'Export chat' },
    { value: 'clear', label: 'Clear chat' },
    { value: 'delete', label: 'Delete conversation' },
  ];
  // Reopen can appear twice for a snoozed-and-resolved edge; keep the first.
  const unique = options.filter((option, index) => options.findIndex((other) => other.value === option.value) === index);

  return (
    <>
      <OptionsDrawer visible={visible} onClose={onClose} title={conversation.customerName} options={unique} onSelect={(action) => void run(action)} />
      {next === 'contact' ? <ContactDrawer conversation={conversation} visible onClose={() => setNext(null)} /> : null}
      <ConfirmDrawer
        visible={next === 'clear'}
        onClose={() => setNext(null)}
        title='Clear chat?'
        message={`This removes the message history with ${conversation.customerName} from Genit. New messages still arrive. This can't be undone.`}
        confirmLabel='Clear chat'
        destructive
        onConfirm={async () => {
          await clearConversation(conversation._id);
          haptic.success();
          await invalidate();
        }}
      />
      <ConfirmDrawer
        visible={next === 'delete'}
        onClose={() => setNext(null)}
        title='Delete conversation?'
        message={`The conversation with ${conversation.customerName} and its messages are removed from Genit. This can't be undone.`}
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          await deleteConversation(conversation._id);
          haptic.success();
          await invalidate();
          onDeleted?.();
        }}
      />
    </>
  );
}
