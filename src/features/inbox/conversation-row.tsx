import { Icon } from '@/components/icon';
import { BrandLogo } from '@/components/brand-logo';
import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Avatar, type IconName } from '@/components/kit';
import { relativeTime } from '@/lib/format';
import { space, useColors } from '@/lib/theme';

import { haptic } from './haptics';
import { aiHandoff, type InboxConversation, senderLogo, textPreview } from './inbox-api';

export type SwipeAction = 'read' | 'pin' | 'resolve' | 'reopen' | 'more';

/**
 * One conversation in the list. Swipe right to mark read or pin, swipe left to
 * resolve or open every action. Long-press starts multi-select.
 */
export function ConversationRow({
  conversation,
  selecting,
  selected,
  onPress,
  onLongPress,
  onSwipeAction,
}: {
  conversation: InboxConversation;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onSwipeAction: (action: SwipeAction) => void;
}) {
  const colors = useColors();
  const swipeable = useRef<SwipeableMethods>(null);
  const unread = conversation.unreadCount > 0;
  const handoff = aiHandoff(conversation);

  const act = (action: SwipeAction) => {
    haptic.impact();
    swipeable.current?.close();
    onSwipeAction(action);
  };

  const leading = unread
    ? { action: 'read' as const, label: 'Read', icon: 'checkmark-done' as IconName, color: colors.primary }
    : { action: 'pin' as const, label: conversation.isPinned ? 'Unpin' : 'Pin', icon: 'pin' as IconName, color: '#F59E0B' };
  const resolve =
    conversation.status === 'resolved'
      ? { action: 'reopen' as const, label: 'Reopen', icon: 'arrow-undo' as IconName, color: '#2563EB' }
      : { action: 'resolve' as const, label: 'Resolve', icon: 'checkmark-circle' as IconName, color: '#16A34A' };

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      enabled={!selecting}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      onSwipeableWillOpen={() => haptic.select()}
      renderLeftActions={() => <SwipeButton {...leading} onPress={() => act(leading.action)} />}
      renderRightActions={() => (
        <View style={{ flexDirection: 'row' }}>
          <SwipeButton {...resolve} onPress={() => act(resolve.action)} />
          <SwipeButton action='more' label='More' icon='ellipsis-horizontal' color={colors.textMuted} onPress={() => act('more')} />
        </View>
      )}
    >
      <Pressable
        accessibilityRole='button'
        accessibilityState={{ selected }}
        accessibilityLabel={`${conversation.customerName}, ${unread ? `${conversation.unreadCount} unread, ` : ''}${textPreview(conversation.lastMessage)}`}
        accessibilityHint={selecting ? 'Toggles selection' : 'Opens the conversation. Swipe for actions, long press to select.'}
        accessibilityActions={[
          { name: 'read', label: 'Mark as read' },
          { name: 'resolve', label: conversation.status === 'resolved' ? 'Reopen' : 'Resolve' },
          { name: 'more', label: 'More actions' },
        ]}
        onAccessibilityAction={(event) => {
          const name = event.nativeEvent.actionName;
          if (name === 'read') onSwipeAction('read');
          if (name === 'resolve') onSwipeAction(conversation.status === 'resolved' ? 'reopen' : 'resolve');
          if (name === 'more') onSwipeAction('more');
        }}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          gap: space.md,
          paddingHorizontal: space.page,
          paddingVertical: space.md,
          backgroundColor: pressed || selected ? colors.surfacePressed : colors.background,
        })}
      >
        {selecting ? (
          <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.primary : colors.borderStrong} style={{ alignSelf: 'center' }} />
        ) : null}
        {/* Sized to the photo so the platform badge sits on it, not at the bottom of a tall row. */}
        <View style={{ alignSelf: 'flex-start', width: 48, height: 48 }}>
          <Avatar uri={conversation.customerAvatar} fallbackUri={senderLogo(conversation)} name={conversation.customerName} size={48} />
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
            <BrandLogo platform={conversation.platform} size={14} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: unread ? '700' : '500', color: colors.text }}>
              {conversation.customerName}
            </Text>
            {conversation.isPinned ? <Icon name='pin' size={13} color={colors.textMuted} accessibilityLabel='Pinned' /> : null}
            {conversation.isMuted ? <Icon name='notifications-off' size={13} color={colors.textMuted} accessibilityLabel='Muted' /> : null}
            {conversation.isBlocked ? <Icon name='ban' size={13} color={colors.danger} accessibilityLabel='Blocked' /> : null}
            <Text style={{ fontSize: 12, color: unread ? colors.primary : colors.textFaint }}>{relativeTime(conversation.lastMessageAt)}</Text>
          </View>
          {conversation.subject ? (
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>
              {conversation.subject}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text numberOfLines={2} style={{ flex: 1, fontSize: 14, color: unread ? colors.text : colors.textMuted }}>
              {textPreview(conversation.lastMessage) || 'No messages yet'}
            </Text>
            {unread ? (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.onPrimary }}>{conversation.unreadCount}</Text>
              </View>
            ) : null}
          </View>
          {conversation.status !== 'open' || handoff ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 }}>
              {conversation.status !== 'open' ? (
                <Text style={{ fontSize: 12, fontWeight: '500', color: colors.textMuted, textTransform: 'capitalize' }}>{conversation.status}</Text>
              ) : null}
              {handoff ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Icon name='person' size={11} color='#D97706' />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#D97706' }}>Needs a person</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

function SwipeButton({ label, icon, color, onPress }: { action: SwipeAction; label: string; icon: IconName; color: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ width: 76, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: color, opacity: pressed ? 0.8 : 1 })}
    >
      <Icon name={icon} size={20} color='#FFFFFF' />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>{label}</Text>
    </Pressable>
  );
}
