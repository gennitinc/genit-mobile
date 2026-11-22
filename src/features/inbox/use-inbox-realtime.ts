import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getSocket } from '@/lib/socket';

import { inboxKeys } from './inbox-api';

type InboxUpdate = {
  type: string;
  organizationId: string;
  conversationId?: string;
  messageId?: string;
  integrationId?: string;
};

/**
 * Live inbox updates over socket.io. Joins the org's inbox room and refreshes
 * the matching queries on every update. Mounted once, by the Inbox tab, which
 * stays mounted while a conversation is open on top of it. Polling in the
 * queries covers any gap while the socket reconnects.
 */
export function useInboxRealtime(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !organizationId) return;

    const join = () => socket.emit('join-inbox', organizationId);

    const onUpdate = (update: InboxUpdate) => {
      if (update.organizationId !== organizationId) return;
      queryClient.invalidateQueries({ queryKey: ['inbox', 'conversations'] });
      if (update.conversationId) queryClient.invalidateQueries({ queryKey: inboxKeys.messages(update.conversationId) });
      if (update.type === 'integration.updated') queryClient.invalidateQueries({ queryKey: ['integrations'] });
      if (update.type.startsWith('call.')) {
        queryClient.invalidateQueries({ queryKey: inboxKeys.liveCalls });
        if (update.conversationId) queryClient.invalidateQueries({ queryKey: inboxKeys.calls(update.conversationId) });
      }
    };

    // A reconnect drops room membership, so join again and catch up.
    const onConnect = () => {
      join();
      queryClient.invalidateQueries({ queryKey: inboxKeys.all });
    };

    if (socket.connected) join();
    socket.on('connect', onConnect);
    socket.on('inbox:update', onUpdate);
    return () => {
      socket.off('connect', onConnect);
      socket.off('inbox:update', onUpdate);
      socket.emit('leave-inbox', organizationId);
    };
  }, [organizationId, queryClient]);
}

/** Joins the open conversation's room so its message events arrive promptly. */
export function useConversationRoom(conversationId: string | undefined) {
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !conversationId) return;
    const join = () => socket.emit('join-inbox-conversation', conversationId);
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('leave-inbox-conversation', conversationId);
    };
  }, [conversationId]);
}
