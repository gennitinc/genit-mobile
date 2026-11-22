import { api } from '@/lib/api';

export type CallStatus = 'permission_requested' | 'invited' | 'ringing' | 'answered' | 'declined' | 'missed' | 'ended' | 'failed';

export type CallSession = {
  _id: string;
  mode: 'meeting_link' | 'whatsapp_native';
  callType: 'audio' | 'video';
  direction: 'inbound' | 'outbound';
  status: CallStatus;
  joinUrl?: string;
  error?: string;
  metadata?: {
    meetingProvider?: 'google_meet' | 'microsoft_teams';
    transport?: 'browser' | 'gateway';
    offerSdp?: string;
    remoteAnswerSdp?: string;
    claimedBy?: string;
  };
  conversation?: string | { _id: string; customerName?: string; customerHandle?: string };
  createdAt: string;
  answeredAt?: string;
  endedAt?: string;
};

export type CallCapabilities = {
  meetingLink: { available: boolean; provider?: 'google_meet' | 'microsoft_teams'; providers?: ('google_meet' | 'microsoft_teams')[] };
  whatsappNative: { available: boolean; permissionGranted: boolean; gatewayConfigured: boolean; browserCalling?: boolean; reason?: string };
};

export const fetchConversationCalls = (conversationId: string) =>
  api<{ capabilities: CallCapabilities; calls: CallSession[] }>(`inbox/conversations/${conversationId}/calls`);

export const createCall = (
  conversationId: string,
  body: { mode: 'meeting_link' | 'whatsapp_native'; callType: 'audio' | 'video'; meetingProvider?: 'google_meet' | 'microsoft_teams'; message?: string; sdp?: string }
) => api<{ call: CallSession }>(`inbox/conversations/${conversationId}/calls`, { body }).then((data) => data.call);

export const requestCallPermission = (conversationId: string, body: { message?: string; template?: { name: string; language: string } }) =>
  api<{ call: CallSession }>(`inbox/conversations/${conversationId}/call-permission`, { body }).then((data) => data.call);

export const fetchLiveCalls = () => api<{ calls: CallSession[] }>('inbox/calls/live').then((data) => data.calls);

export const acceptCall = (callId: string, body: { stage: 'pre_accept' | 'accept'; sdp?: string }) =>
  api<{ call: CallSession }>(`inbox/calls/${callId}/accept`, { body }).then((data) => data.call);

export const rejectCall = (callId: string) => api(`inbox/calls/${callId}/reject`, { method: 'POST' });
export const endCall = (callId: string) => api(`inbox/calls/${callId}/end`, { method: 'POST' });

export function callCustomerName(call?: CallSession) {
  return typeof call?.conversation === 'object' ? call.conversation.customerName || call.conversation.customerHandle : undefined;
}
