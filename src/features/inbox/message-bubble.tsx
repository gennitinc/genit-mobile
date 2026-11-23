import { Icon } from '@/components/icon';
import { BrandLogo } from '@/components/brand-logo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { errorMessage } from '@/lib/api';
import { downloadAndShare, formatBytes, shareRemoteFile } from '@/lib/files';
import { timeOnly } from '@/lib/format';
import { platformChatUrl, platformInboxUrl, type SocialEmbed, socialEmbed } from '@/lib/social-embed';
import { radius, space, useColors } from '@/lib/theme';

import { EmailBody } from './email-body';
import { fetchLinkPreview, firstLink, gmailAttachmentPath, type InboxAttachment, type InboxMessage, isHtml, quotedTextStart } from './inbox-api';

const STATUS_ICON = {
  queued: 'time-outline',
  sending: 'time-outline',
  sent: 'checkmark',
  delivered: 'checkmark-done',
  read: 'checkmark-done',
  failed: 'alert-circle',
} as const;

/**
 * The HTML to render for an email, like the web: synced Gmail, Outlook and
 * Composio mail keeps the formatted body in metadata.contentHtml and a plain
 * copy in content; older or sent messages may hold HTML in content itself.
 */
export function emailHtml(message: InboxMessage) {
  const stored = message.metadata?.contentHtml;
  if (typeof stored === 'string' && stored.trim()) return stored;
  return isHtml(message.content) ? message.content : '';
}

export function MessageBubble({
  message,
  email,
  platform,
  contact,
  onLongPress,
  onRetry,
  retrying,
}: {
  message: InboxMessage;
  email: boolean;
  /** The conversation's platform, for "Open in Instagram" on content it didn't share. */
  platform?: string;
  /** Who sent it: shown on the card for content the platform kept, and used to open their chat. */
  contact?: { customerName: string; customerHandle?: string; customerAvatar?: string; customerId?: string };
  onLongPress?: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [showQuoted, setShowQuoted] = useState(false);
  const mine = message.senderType !== 'customer';
  const html = email ? emailHtml(message) : '';

  const quoteAt = !html && email ? quotedTextStart(message.content) : -1;
  const text = quoteAt > 0 && !showQuoted ? message.content.slice(0, quoteAt).trimEnd() : message.content;

  const dark = useColorScheme() === 'dark';
  // Received bubbles sit on the chat wallpaper, so they're white (light) or lifted grey (dark), like the web.
  const bubbleColor = mine ? colors.primary : dark ? colors.surfacePressed : '#FFFFFF';
  const textColor = mine ? colors.onPrimary : colors.text;
  const maxWidth = email ? width - space.xl * 2 : width * 0.78;
  const attachments = message.attachments ?? [];
  const link = text ? firstLink(text) : '';
  // Photos and videos on their own show without a bubble around them, as on the web.
  const mediaOnly =
    !html && !text && attachments.length > 0 && attachments.every((item) => (item.kind === 'image' || item.kind === 'video') && !item.providerAttachmentId);
  // Nothing to show at all (a provider that withheld the content): say so instead of an empty bubble.
  const blank = !html && !text && attachments.length === 0;
  const bare = mediaOnly || blank;

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
          // Emails are designed for a white page, so they get one in dark mode too (the web does the same).
          backgroundColor: html ? '#FFFFFF' : bare ? 'transparent' : bubbleColor,
          borderWidth: html ? 1 : mine || bare ? 0 : StyleSheet.hairlineWidth,
          borderColor: colors.border,
          ...(bare ? { padding: 0 } : null),
          ...(html ? { width: maxWidth, paddingHorizontal: space.sm } : null),
        }}
      >
        {message.senderType === 'bot' ? (
          <Text style={{ fontSize: 11, fontWeight: '600', color: html ? '#52525B' : textColor, opacity: 0.8 }}>AI reply</Text>
        ) : null}
        {html ? (
          <EmailBody html={html} width={maxWidth - space.sm * 2} />
        ) : text ? (
          <Text selectable style={{ fontSize: 15, lineHeight: 21, color: textColor }}>
            {text}
          </Text>
        ) : blank ? (
          <UnsharedContent platform={platform} contact={contact} />
        ) : null}
        {quoteAt > 0 ? (
          <Pressable accessibilityRole='button' onPress={() => setShowQuoted(!showQuoted)} hitSlop={8}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: textColor, opacity: 0.8 }}>
              {showQuoted ? 'Hide quoted text' : 'Show quoted text'}
            </Text>
          </Pressable>
        ) : null}
        {/* A link in the text: the platform's own player for social posts, otherwise a preview card. */}
        {!html && link && !attachments.some((item) => item.url === link || item.share?.permalink === link) ? (
          socialEmbed(link) ? <SocialPost embed={socialEmbed(link)!} /> : <LinkPreviewCard url={link} tint={textColor} />
        ) : null}
        {attachments.map((attachment, index) => (
          <Attachment key={`${attachment.url}-${index}`} attachment={attachment} tint={html ? '#18181B' : mediaOnly ? colors.text : textColor} />
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

  if (attachment.kind === 'video' && /^https?:/i.test(attachment.url) && !attachment.providerAttachmentId) {
    // A shared reel plays from Genit's saved copy, with its caption and a way to the original.
    return attachment.share ? (
      <View style={{ width: 200, gap: space.xs }}>
        <InlineVideo url={attachment.url} name={attachment.name} />
        <SharedFrom share={attachment.share} tint={tint} />
      </View>
    ) : (
      <InlineVideo url={attachment.url} name={attachment.name} />
    );
  }

  const embed = isLink ? socialEmbed(attachment.url) : null;
  if (embed) return <SocialPost embed={embed} />;

  if (isLink && /^https?:/i.test(attachment.url)) {
    return <LinkCard url={attachment.url} name={attachment.name} tint={tint} onPress={open} busy={busy} />;
  }

  if (attachment.kind === 'image' && attachment.url && !attachment.providerAttachmentId) {
    return (
      <View style={{ width: 220, gap: space.xs }}>
        <Pressable accessibilityRole='button' accessibilityLabel={`Image ${attachment.name}`} onPress={open}>
          <Image source={{ uri: attachment.url }} style={{ width: 220, height: 220, borderRadius: radius.md }} contentFit='cover' />
        </Pressable>
        {attachment.share ? <SharedFrom share={attachment.share} tint={tint} /> : null}
      </View>
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

/**
 * A shared video or reel, played in the chat. The player is created only when
 * tapped, so a long conversation doesn't load every video at once.
 */
function InlineVideo({ url, name }: { url: string; name: string }) {
  const [playing, setPlaying] = useState(false);
  if (!playing) {
    return (
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`Play video ${name}`}
        onPress={() => setPlaying(true)}
        style={{ width: 200, height: 300, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111114' }}
      >
        <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' }}>
          <Icon name='play' size={24} color='#111114' />
        </View>
      </Pressable>
    );
  }
  return <PlayingVideo url={url} />;
}

function PlayingVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (instance) => instance.play());
  return <VideoView player={player} nativeControls contentFit='contain' style={{ width: 200, height: 300, borderRadius: radius.md, backgroundColor: '#111114' }} />;
}

/** A shared post, reel or page as a card: where it's from and its title, opening in the in-app browser. */
function LinkCard({ url, name, tint, onPress, busy }: { url: string; name: string; tint: string; onPress: () => void; busy: boolean }) {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    host = url;
  }
  const reel = /instagram\.com\/(reel|reels|p|tv)\//i.test(url);
  return (
    <Pressable
      accessibilityRole='link'
      accessibilityLabel={`Open ${name}`}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: 'rgba(127,127,127,0.15)' }}
    >
      <View style={{ width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(127,127,127,0.2)' }}>
        <Icon name={busy ? 'hourglass-outline' : reel ? 'play-circle' : 'link'} size={20} color={tint} />
      </View>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '600', color: tint }}>
          {reel ? 'Shared reel' : name}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: tint, opacity: 0.75 }}>
          {host}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * A shared reel or post, played through the platform's own embed. Tapping
 * anything inside it (or the button) opens the post on the platform itself.
 */
function SocialPost({ embed }: { embed: SocialEmbed }) {
  const colors = useColors();
  const width = 240;
  const height = Math.min(Math.round(width / embed.aspect), 430);
  const openPost = () => void Linking.openURL(embed.postUrl);
  return (
    <View style={{ width, gap: space.xs }}>
      <View style={{ width, height, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#111114' }}>
        <WebView
          source={{ uri: embed.embedUrl }}
          style={{ width, height, backgroundColor: 'transparent' }}
          scrollEnabled={false}
          allowsInlineMediaPlayback
          javaScriptEnabled
          // The embed loads its own pages; a tap that leaves it opens the platform instead.
          onShouldStartLoadWithRequest={(request) => {
            // The embed page and everything inside it (frames, the player) load normally.
            if (request.url.startsWith(embed.embedUrl) || request.isTopFrame === false || request.url === 'about:blank') return true;
            openPost();
            return false;
          }}
          setSupportMultipleWindows={false}
        />
      </View>
      <Pressable
        accessibilityRole='link'
        onPress={openPost}
        hitSlop={6}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}
      >
        <BrandLogo platform={embed.platform} size={16} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted }}>Open in {embed.label}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Content the platform kept from apps (often a shared post or reel): a card in
 * the post's place. The sender's photo, blurred under frosted glass, hints at
 * the post underneath; the button opens this person's chat in the platform's app.
 */
function UnsharedContent({
  platform,
  contact,
}: {
  platform?: string;
  contact?: { customerName: string; customerHandle?: string; customerAvatar?: string; customerId?: string };
}) {
  const colors = useColors();
  const dark = useColorScheme() === 'dark';
  const target = platform ? platformChatUrl(platform, contact ?? {}) : null;
  const handle = contact?.customerHandle?.replace(/^@/, '');
  const width = 250;
  return (
    <View style={{ width, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: dark ? '#121216' : '#FFFFFF' }}>
      {/* The hidden post: blurred photo, frosted glass, and the way to it on top. */}
      <Pressable
        accessibilityRole='link'
        accessibilityLabel={target ? `Open in ${target.label}` : 'Shared post'}
        disabled={!target}
        onPress={() => target && void Linking.openURL(target.url)}
        style={{ width, height: 220, alignItems: 'center', justifyContent: 'center' }}
      >
        {contact?.customerAvatar ? (
          <Image source={{ uri: contact.customerAvatar }} style={StyleSheet.absoluteFill} contentFit='cover' blurRadius={40} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#833AB4' }]}>
            <View style={{ position: 'absolute', left: -40, top: -30, width: 200, height: 200, borderRadius: 100, backgroundColor: '#FD1D1D', opacity: 0.55 }} />
            <View style={{ position: 'absolute', right: -50, bottom: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: '#FCAF45', opacity: 0.55 }} />
          </View>
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(10,10,14,0.38)' : 'rgba(255,255,255,0.28)' }]} />
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: radius.full,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(255,255,255,0.55)',
              backgroundColor: 'rgba(255,255,255,0.22)',
            }}
          >
            {platform ? <BrandLogo platform={platform} size={18} /> : null}
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{target ? `Open in ${target.label}` : 'Shared post'}</Text>
          </View>
        </View>
      </Pressable>
      {/* Who sent it, as on the post card. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
        {contact?.customerAvatar ? (
          <Image source={{ uri: contact.customerAvatar }} style={{ width: 32, height: 32, borderRadius: 16 }} contentFit='cover' />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
            {contact?.customerName || 'Shared post'}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
            {handle ? `@${handle} · ` : ''}shared a post
          </Text>
        </View>
        {platform ? <BrandLogo platform={platform} size={20} /> : null}
      </View>
      <Text style={{ paddingHorizontal: space.md, paddingBottom: space.md, fontSize: 12, lineHeight: 17, color: colors.textMuted }}>
        {target ? `${target.label} only shows this one in its own app. Tap to open the chat there.` : 'Only its own app can show this one.'}
      </Text>
    </View>
  );
}

/** Under a shared reel or post: its caption, and "Open in Instagram" (the post, or the app when its page isn't known). */
function SharedFrom({ share, tint }: { share: NonNullable<InboxAttachment['share']>; tint: string }) {
  const colors = useColors();
  const target = share.permalink ? { url: share.permalink, label: platformInboxUrl(share.platform)?.label ?? 'the app' } : platformInboxUrl(share.platform);
  return (
    <View style={{ gap: 4 }}>
      {share.caption ? (
        <Text numberOfLines={3} style={{ fontSize: 13, lineHeight: 18, color: tint }}>
          {share.caption}
        </Text>
      ) : null}
      {target ? (
        <Pressable
          accessibilityRole='link'
          onPress={() => void Linking.openURL(target.url)}
          hitSlop={6}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, opacity: pressed ? 0.6 : 1 })}
        >
          <BrandLogo platform={share.platform} size={14} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textMuted }}>
            {share.permalink ? `Open ${share.contentType} in ${target.label}` : `Open ${target.label}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The card WhatsApp and Telegram show under a link: image, site, title and description. Opens the page. */
function LinkPreviewCard({ url, tint }: { url: string; tint: string }) {
  const preview = useQuery({
    queryKey: ['inbox', 'link-preview', url],
    queryFn: () => fetchLinkPreview(url),
    staleTime: 6 * 60 * 60_000,
    retry: false,
  });
  const data = preview.data;
  if (!data) return null;
  return (
    <Pressable
      accessibilityRole='link'
      accessibilityLabel={`Open ${data.title ?? url}`}
      onPress={() => void WebBrowser.openBrowserAsync(url)}
      style={({ pressed }) => ({ width: 240, borderRadius: radius.md, overflow: 'hidden', backgroundColor: 'rgba(127,127,127,0.15)', opacity: pressed ? 0.8 : 1 })}
    >
      {data.image ? <Image source={{ uri: data.image }} style={{ width: 240, height: 126 }} contentFit='cover' /> : null}
      <View style={{ padding: space.sm, gap: 2 }}>
        {data.siteName ? (
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', color: tint, opacity: 0.7 }}>
            {data.siteName}
          </Text>
        ) : null}
        {data.title ? (
          <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '600', color: tint }}>
            {data.title}
          </Text>
        ) : null}
        {data.description ? (
          <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, color: tint, opacity: 0.8 }}>
            {data.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
