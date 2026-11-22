import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { downloadAndShare, formatBytes, shareRemoteFile } from '@/lib/files';
import { timeOnly } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';

import { EmailBody } from './email-body';
import { gmailAttachmentPath, type InboxAttachment, type InboxMessage, isHtml, quotedTextStart } from './inbox-api';

const STATUS_ICON = {
  queued: 'time-outline',
  sending: 'time-outline',
  sent: 'checkmark',
  delivered: 'checkmark-done',
  read: 'checkmark-done',
  failed: 'alert-circle',
} as const;

/** Belt and braces: the email view's security policy already blocks scripts. */
function cleanHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
}

export function MessageBubble({
  message,
  email,
  onLongPress,
  onRetry,
  retrying,
}: {
  message: InboxMessage;
  email: boolean;
  onLongPress?: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [showQuoted, setShowQuoted] = useState(false);
  const mine = message.senderType !== 'customer';
  const html = email && isHtml(message.content);

  const quoteAt = !html && email ? quotedTextStart(message.content) : -1;
  const text = quoteAt > 0 && !showQuoted ? message.content.slice(0, quoteAt).trimEnd() : message.content;

  const bubbleColor = mine ? colors.primary : colors.surface;
  const textColor = mine ? colors.onPrimary : colors.text;
  const maxWidth = email ? width - space.xl * 2 : width * 0.78;

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 4 }}>
      <Pressable
        accessibilityRole={onLongPress ? 'button' : undefined}
        accessibilityHint={onLongPress ? 'Long press for message actions' : undefined}
        onLongPress={onLongPress}
        style={{
          maxWidth,
          padding: space.md,
          gap: space.sm,
          borderRadius: radius.lg,
          borderBottomRightRadius: mine ? 4 : radius.lg,
          borderBottomLeftRadius: mine ? radius.lg : 4,
          backgroundColor: html ? colors.surface : bubbleColor,
        }}
      >
        {message.senderType === 'bot' ? (
          <Text style={{ fontSize: 11, fontWeight: '600', color: html ? colors.textMuted : textColor, opacity: 0.8 }}>AI reply</Text>
        ) : null}
        {html ? (
          <EmailBody html={cleanHtml(message.content)} width={maxWidth - space.md * 2} />
        ) : text ? (
          <Text selectable style={{ fontSize: 15, lineHeight: 21, color: textColor }}>
            {text}
          </Text>
        ) : null}
        {quoteAt > 0 ? (
          <Pressable accessibilityRole='button' onPress={() => setShowQuoted(!showQuoted)} hitSlop={8}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: textColor, opacity: 0.8 }}>
              {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
            </Text>
          </Pressable>
        ) : null}
        {message.attachments?.map((attachment, index) => (
          <Attachment key={`${attachment.url}-${index}`} attachment={attachment} tint={html ? colors.text : textColor} />
        ))}
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 11, color: colors.textFaint }}>{timeOnly(message.sentAt ?? message.createdAt)}</Text>
        {mine ? (
          <Icon
            name={STATUS_ICON[message.status] ?? 'checkmark'}
            size={13}
            color={message.status === 'failed' ? colors.danger : message.status === 'read' ? colors.primary : colors.textFaint}
            accessibilityLabel={message.status}
          />
        ) : null}
      </View>
      {message.status === 'failed' ? (
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {message.error ? <Text style={{ fontSize: 12, color: colors.danger, textAlign: 'right' }}>{message.error}</Text> : null}
          {onRetry ? (
            <Pressable accessibilityRole='button' onPress={onRetry} disabled={retrying} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>{retrying ? 'Retrying…' : 'Retry'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Attachment({ attachment, tint }: { attachment: InboxAttachment; tint: string }) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isLink = attachment.mimeType === 'text/uri-list';
  // Links, video and audio open in the in-app browser, which plays media; other files go to the share sheet.
  const playsInBrowser = /^https?:/i.test(attachment.url) && (isLink || attachment.kind === 'video' || attachment.kind === 'audio');

  const open = async () => {
    setBusy(true);
    setError('');
    try {
      // Gmail attachments are private and stream through the API with the session token.
      if (attachment.providerMessageId && attachment.providerAttachmentId) {
        await downloadAndShare(gmailAttachmentPath(attachment), attachment.name);
      } else if (playsInBrowser) {
        await WebBrowser.openBrowserAsync(attachment.url);
      } else {
        await shareRemoteFile(attachment.url, attachment.name);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  if (attachment.kind === 'image' && attachment.url && !attachment.providerAttachmentId) {
    return (
      <Pressable accessibilityRole='button' accessibilityLabel={`Image ${attachment.name}`} onPress={open}>
        <Image source={{ uri: attachment.url }} style={{ width: 220, height: 220, borderRadius: radius.md }} contentFit='cover' />
      </Pressable>
    );
  }

  const icon = isLink ? 'link' : attachment.kind === 'video' ? 'play-circle' : attachment.kind === 'audio' ? 'musical-notes' : 'document-attach';
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={`Attachment ${attachment.name}`}
      onPress={open}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.sm, backgroundColor: 'rgba(127,127,127,0.15)' }}
    >
      <Icon name={busy ? 'hourglass-outline' : icon} size={20} color={tint} />
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, color: tint }}>
          {attachment.name}
        </Text>
        <Text style={{ fontSize: 12, color: error ? colors.danger : tint, opacity: 0.75 }}>
          {error || (isLink ? 'Open link' : attachment.kind === 'video' ? 'Play video' : attachment.kind === 'audio' ? 'Play audio' : formatBytes(attachment.size))}
        </Text>
      </View>
    </Pressable>
  );
}
