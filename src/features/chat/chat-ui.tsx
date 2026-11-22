import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { IconName } from '@/components/kit';
import { resolveToolkit, useComposioToolkits } from '@/features/integrations/integrations-api';
import { API_URL } from '@/lib/config';
import { platformMeta } from '@/lib/platforms';
import { radius, space, useColors } from '@/lib/theme';

import type { AgentAttachedFile } from './chat-api';

// ─── Screen context ───────────────────────────────────────────────────────────

export type ChatPreview =
  | {
      kind: 'document' | 'website';
      title: string;
      url: string;
      displayUrl?: string;
      openUrl?: string;
      downloadUrl?: string;
      fileName?: string;
    }
  | { kind: 'media'; title: string; url: string; isVideo: boolean; prompt?: string }
  | { kind: 'automation' }
  | { kind: 'designs' };

type ChatScreen = {
  projectId: string;
  category?: string;
  openPreview: (preview: ChatPreview) => void;
  /** Starts an agent run in this chat, as if typed in the composer. */
  sendToAgent?: (text: string, attachedFiles?: AgentAttachedFile[]) => Promise<unknown>;
  /** Puts text in the composer for the person to finish. */
  prefillComposer?: (text: string) => void;
};

export const ChatScreenContext = createContext<ChatScreen | null>(null);

export function useChatScreen() {
  const value = useContext(ChatScreenContext);
  if (!value) throw new Error('useChatScreen must be used inside a chat screen');
  return value;
}

/** Server-relative file paths, made absolute. */
export function fullUrl(url?: string | null) {
  if (!url) return '';
  if (/^https?:\/\//.test(url)) return url;
  const origin = API_URL.replace(/\/api\/v1\/?$/, '');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export function openExternal(url?: string | null) {
  const target = fullUrl(url);
  if (target) WebBrowser.openBrowserAsync(target).catch(() => undefined);
}

// ─── Card shell ───────────────────────────────────────────────────────────────

type Tone = 'neutral' | 'success';

/** The bordered card every agent step and result uses. */
export function AgentCard({
  icon,
  title,
  meta,
  tone = 'neutral',
  children,
  footer,
}: {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background, overflow: 'hidden' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.md,
          paddingVertical: 10,
          borderBottomWidth: children ? 1 : 0,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ width: 20, alignItems: 'center' }}>{icon ?? <CardIcon name={tone === 'success' ? 'checkmark-circle' : 'ellipse-outline'} tone={tone} />}</View>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text }}>
          {title}
        </Text>
        {meta ? (
          typeof meta === 'string' ? (
            <Text numberOfLines={1} style={{ maxWidth: '45%', fontSize: 12, color: colors.textMuted }}>
              {meta}
            </Text>
          ) : (
            meta
          )
        ) : null}
      </View>
      {children ? <View style={{ padding: space.md, gap: space.sm }}>{children}</View> : null}
      {footer ? <View style={{ paddingHorizontal: space.md, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border }}>{footer}</View> : null}
    </View>
  );
}

export function CardIcon({ name, tone = 'neutral' }: { name: IconName; tone?: Tone }) {
  const colors = useColors();
  return <Icon name={name} size={15} color={tone === 'success' ? colors.success : colors.textMuted} />;
}

/** Small "Open ↗" link used inside cards. */
export function LinkText({ label, url }: { label: string; url?: string | null }) {
  const colors = useColors();
  if (!url) return null;
  return (
    <Text accessibilityRole='link' onPress={() => openExternal(url)} style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>
      {label} ↗
    </Text>
  );
}

/** Compact bordered action used inside cards. */
export function CardButton({
  label,
  icon,
  onPress,
  disabled,
  busy,
  primary,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
}) {
  const colors = useColors();
  const foreground = primary ? colors.onPrimary : colors.text;
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        minHeight: 34,
        paddingHorizontal: space.md,
        borderRadius: radius.sm,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.borderStrong,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: primary ? (pressed ? colors.primaryPressed : colors.primary) : pressed ? colors.surfacePressed : 'transparent',
      })}
    >
      {busy ? <ActivityIndicator size='small' color={foreground} /> : icon ? <Icon name={icon} size={14} color={foreground} /> : null}
      <Text style={{ fontSize: 13, fontWeight: '600', color: foreground }}>{label}</Text>
    </Pressable>
  );
}

// ─── Plugin logos ─────────────────────────────────────────────────────────────

/** A plugin's logo: the given icon, the catalog logo, a built-in icon, or a plug. */
export function PluginLogo({ icon, label, slug, size = 18 }: { icon?: string; label: string; slug?: string; size?: number }) {
  const colors = useColors();
  const toolkits = useComposioToolkits();
  const [failed, setFailed] = useState(false);
  const list = toolkits.data ?? [];
  const logo = icon || list.find((item) => item.slug === slug)?.logo || resolveToolkit(label, list)?.logo;
  const builtIn = platformMeta(slug ?? label.toLowerCase().replace(/\s+/g, '_'));

  if (logo && !failed && /^https?:\/\//.test(logo)) {
    return (
      <Image
        source={{ uri: logo }}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: 4 }}
        contentFit='contain'
        accessibilityLabel={`${label} logo`}
      />
    );
  }
  if (builtIn.icon !== 'apps') {
    return <Icon name={builtIn.icon} size={size} color={builtIn.color ?? colors.text} />;
  }
  return <Icon name='extension-puzzle-outline' size={size} color={colors.textMuted} accessibilityLabel={`${label} plugin`} />;
}

export function PluginName({ name, slug }: { name: string; slug?: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '50%' }}>
      <PluginLogo label={name} slug={slug} size={14} />
      <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
        {name}
      </Text>
    </View>
  );
}

/** "Facebook · publish post" from "facebook_publish_post". */
export function humanizeToolName(name: string) {
  const parts = name.split(/[_.:-]/).filter(Boolean);
  if (!parts.length) return name;
  const head = parts[0].replace(/^\w/, (c) => c.toUpperCase());
  const tail = parts.slice(1).join(' ');
  return tail ? `${head} · ${tail}` : head;
}

export function humanizeKey(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}
