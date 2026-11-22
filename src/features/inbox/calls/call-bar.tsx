import { Icon } from '@/components/icon';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

import { inboxKeys } from '../inbox-api';
import { callController } from './call-controller';
import { fetchLiveCalls } from './calls-api';

export function useCallState() {
  return useSyncExternalStore(callController.subscribe, callController.getSnapshot, callController.getSnapshot);
}

/**
 * Feeds live WhatsApp call state into the controller and shows a floating bar
 * for incoming and active calls. Socket events refresh the poll instantly.
 */
export function CallBar() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const state = useCallState();
  const inCall = !['idle', 'ended'].includes(state.phase);
  const [error, setError] = useState('');

  const { data: calls } = useQuery({
    queryKey: inboxKeys.liveCalls,
    queryFn: fetchLiveCalls,
    refetchInterval: inCall ? 2000 : 5000,
  });

  useEffect(() => {
    if (!calls) return;
    const current = callController.getSnapshot().call;
    const mine = current && calls.find((call) => call._id === current._id);
    if (mine) void callController.sync(mine);
    else if (current) callController.dropIncoming(current._id);
    const incoming = calls.find(
      (call) => call.direction === 'inbound' && call.status === 'ringing' && call.metadata?.transport !== 'gateway' && !call.metadata?.claimedBy
    );
    if (incoming) callController.ring(incoming);
  }, [calls]);

  // The call timer ticks from a clock kept in state, not read during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.phase !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.phase]);

  if (state.phase === 'idle' && !state.error && !error) return null;

  const seconds = state.connectedAt ? Math.max(0, Math.floor((now - state.connectedAt) / 1000)) : 0;
  const label = {
    idle: state.error ?? error,
    connecting: 'Starting call…',
    ringing: 'Ringing…',
    incoming: 'Incoming WhatsApp call',
    answering: 'Connecting…',
    active: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    ended: state.endedStatus === 'failed' ? state.error ?? 'Call failed' : `Call ${state.endedStatus ?? 'ended'}`,
  }[state.phase];

  const act = (action: () => Promise<unknown>) => {
    setError('');
    action().catch((caught) => setError(errorMessage(caught)));
  };

  return (
    <View
      accessibilityLiveRegion='polite'
      style={{
        position: 'absolute',
        left: space.lg,
        right: space.lg,
        top: insets.top + space.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md,
        borderRadius: radius.lg,
        backgroundColor: '#111827',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
      }}
    >
      <Icon name='logo-whatsapp' size={24} color='#25D366' />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>
          {state.customerName ?? 'WhatsApp call'}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: 13, color: '#D1D5DB' }}>
          {label}
        </Text>
      </View>
      {state.phase === 'incoming' ? (
        <>
          <RoundButton icon='close' label='Decline' color='#DC2626' onPress={() => act(() => callController.decline())} />
          <RoundButton icon='call' label='Answer' color='#16A34A' onPress={() => act(() => callController.answer())} />
        </>
      ) : ['connecting', 'ringing', 'answering', 'active'].includes(state.phase) ? (
        <>
          <RoundButton
            icon={state.muted ? 'mic-off' : 'mic'}
            label={state.muted ? 'Unmute' : 'Mute'}
            color={state.muted ? colors.borderStrong : '#374151'}
            onPress={() => callController.toggleMute()}
          />
          <RoundButton icon='call' label='End call' color='#DC2626' rotate onPress={() => act(() => callController.hangup())} />
        </>
      ) : null}
    </View>
  );
}

function RoundButton({ icon, label, color, onPress, rotate }: { icon: 'close' | 'call' | 'mic' | 'mic-off'; label: string; color: string; onPress: () => void; rotate?: boolean }) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}
    >
      <Icon name={icon} size={20} color='#FFFFFF' style={rotate ? { transform: [{ rotate: '135deg' }] } : undefined} />
    </Pressable>
  );
}
