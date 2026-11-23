import * as WebBrowser from 'expo-web-browser';
import { type ComponentRef, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, useColorScheme, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { OptionsDrawer } from '@/components/drawer';
import { Icon, type IconName } from '@/components/icon';
import { Button } from '@/components/ui';
import { radius, space, useColors } from '@/lib/theme';

import { useChatScreen } from './chat-ui';

/**
 * The agent's live browser, with the same native header the web draws over it:
 * back, forward, reload, address bar, device, take control and devtools, open
 * tabs, and the verification / hand-off banners. The page itself (screencast,
 * touch input, devtools panel) runs on the server; this drives it over the
 * WebView bridge (`host=native`, see live-view-page.ts on the server).
 */

type LiveTab = { id: string; url: string; title: string; active: boolean };
type LiveDevice = 'desktop' | 'tablet' | 'mobile';
type LiveState = {
  url: string;
  title: string;
  tabs: LiveTab[];
  controller: 'agent' | 'user';
  handoffReason?: string;
  device?: LiveDevice;
  landscape?: boolean;
  pageStatus?: { kind: string; reason: string; provider?: string };
  verificationCleared?: boolean;
  verificationRejected?: boolean;
};
type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'starting' | 'closed';

const DEVICES: { value: LiveDevice; label: string; description: string; icon: IconName }[] = [
  { value: 'desktop', label: 'Desktop', description: 'Fits the preview', icon: 'desktop-outline' },
  { value: 'tablet', label: 'Tablet', description: 'iPad Mini · 768 × 1024', icon: 'tablet-outline' },
  { value: 'mobile', label: 'Mobile', description: 'iPhone 15 Pro · 393 × 659', icon: 'phone-portrait-outline' },
];

export function isLiveBrowserUrl(url?: string) {
  return !!url && url.includes('/agents/browser/live/');
}

export function LiveBrowser({ url, displayUrl }: { url: string; displayUrl?: string }) {
  const colors = useColors();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { sendToAgent } = useChatScreen();
  const view = useRef<ComponentRef<typeof WebView>>(null);
  const [state, setState] = useState<LiveState | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [renderStuck, setRenderStuck] = useState(false);
  const [devtools, setDevtools] = useState({ open: false, errors: 0 });
  // The address being typed; null shows the page's own address.
  const [typed, setTyped] = useState<string | null>(null);
  const editing = typed !== null;
  const [deviceMenu, setDeviceMenu] = useState(false);
  // A server without the native bridge never answers: show its own header instead.
  const [bridged, setBridged] = useState<boolean | null>(null);
  const [handingBack, setHandingBack] = useState(false);

  // Built once per session: changing the source reloads the live view.
  const [initial] = useState(() => ({ displayUrl, theme: scheme }));
  const src = useMemo(() => {
    try {
      const next = new URL(url);
      if (bridged !== false) {
        next.searchParams.set('chrome', '0');
        next.searchParams.set('host', 'native');
      }
      if (initial.theme) next.searchParams.set('theme', initial.theme);
      if (initial.displayUrl) next.searchParams.set('start', initial.displayUrl);
      return next.toString();
    } catch {
      return url;
    }
  }, [url, bridged, initial]);

  useEffect(() => {
    if (bridged !== null) return;
    const timer = setTimeout(() => setBridged((current) => current ?? false), 8000);
    return () => clearTimeout(timer);
  }, [bridged]);

  const post = useCallback((message: Record<string, unknown>) => {
    const payload = JSON.stringify({ source: 'genit-host', ...message });
    view.current?.injectJavaScript(`window.__genitHost && window.__genitHost(${payload}); true;`);
  }, []);
  const command = (payload: Record<string, unknown>) => post({ type: 'command', command: payload });

  useEffect(() => {
    if (bridged) post({ type: 'theme', theme: scheme });
  }, [scheme, bridged, post]);

  const onMessage = (event: WebViewMessageEvent) => {
    let data: any;
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (!data || data.source !== 'genit-live') return;
    if (!bridged) setBridged(true);
    if (data.type === 'state' && data.state) setState(data.state);
    else if (data.type === 'status') setStatus(data.status);
    else if (data.type === 'render') setRenderStuck(!!data.stuck);
    else if (data.type === 'devtools') setDevtools({ open: !!data.open, errors: Number(data.errors) || 0 });
    else if (data.type === 'ready') post({ type: 'theme', theme: scheme });
  };

  const currentUrl = state?.url && state.url !== 'about:blank' ? state.url : displayUrl || '';

  const userInControl = state?.controller === 'user';
  const tabs = state?.tabs ?? [];
  const device: LiveDevice = state?.device || 'desktop';
  const currentDevice = DEVICES.find((item) => item.value === device) ?? DEVICES[0];
  const disabled = status !== 'live';
  const openSite = () => /^https?:\/\//i.test(currentUrl) && WebBrowser.openBrowserAsync(currentUrl);

  const imDone = async () => {
    setHandingBack(true);
    try {
      command({ type: 'control', controller: 'agent' });
      await sendToAgent?.("I'm done");
    } finally {
      setHandingBack(false);
    }
  };

  const banner = (icon: IconName, text: string, actions?: ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <Text style={{ flex: 1, fontSize: 12.5, color: colors.text }}>{text}</Text>
      {actions}
    </View>
  );

  const statusLabel =
    status === 'live' ? (userInControl ? 'You’re in control' : 'Agent browsing') : status === 'reconnecting' ? 'Reconnecting…' : status === 'starting' ? 'Starting…' : status === 'closed' ? 'Closed' : 'Connecting…';

  return (
    <View style={{ flex: 1, marginHorizontal: space.sm, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
      {bridged !== false ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingTop: 6 }}>
            <ToolButton icon='chevron-back' label='Back' onPress={() => command({ type: 'back' })} disabled={disabled} />
            <ToolButton icon='arrow-forward' label='Forward' onPress={() => command({ type: 'forward' })} disabled={disabled} />
            <ToolButton icon='refresh' label='Reload' onPress={() => command({ type: 'reload' })} disabled={disabled} />
            <View style={{ flex: 1, height: 34, marginHorizontal: 4, borderRadius: 10, justifyContent: 'center', paddingHorizontal: space.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: editing ? colors.primary : 'transparent' }}>
              <TextInput
                value={typed ?? currentUrl}
                onChangeText={setTyped}
                onFocus={() => setTyped(currentUrl)}
                onBlur={() => setTyped(null)}
                onSubmitEditing={() => {
                  if (typed?.trim()) command({ type: 'navigate', url: typed.trim() });
                  setTyped(null);
                }}
                editable={!disabled}
                selectTextOnFocus
                autoCapitalize='none'
                autoCorrect={false}
                keyboardType='url'
                returnKeyType='go'
                placeholder='Search or enter address'
                placeholderTextColor={colors.textFaint}
                accessibilityLabel='Live browser address'
                numberOfLines={1}
                style={{ fontSize: 13, color: colors.text, textAlign: editing ? 'left' : 'center', padding: 0 }}
              />
            </View>
            <ToolButton icon='open-outline' label='Open in your browser' onPress={openSite} disabled={!currentUrl} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <ToolButton icon={currentDevice.icon} label={`Device: ${currentDevice.label}`} onPress={() => setDeviceMenu(true)} disabled={disabled} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm }}>
              {status === 'live' ? (
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: userInControl ? colors.primary : colors.success }} />
              ) : (
                <ActivityIndicator size='small' />
              )}
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, color: colors.textMuted }}>
                {state?.title ? `${statusLabel} · ${state.title}` : statusLabel}
              </Text>
            </View>
            <Pressable
              accessibilityRole='button'
              accessibilityState={{ selected: userInControl, disabled }}
              disabled={disabled}
              onPress={() => command({ type: 'control', controller: userInControl ? 'agent' : 'user' })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 34,
                paddingHorizontal: space.md,
                borderRadius: 10,
                opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
                backgroundColor: userInControl ? colors.surfacePressed : colors.primary,
              })}
            >
              <Icon name={userInControl ? 'bot-outline' : 'hand-outline'} size={16} color={userInControl ? colors.text : colors.onPrimary} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: userInControl ? colors.text : colors.onPrimary }}>{userInControl ? 'Hand back' : 'Take control'}</Text>
            </Pressable>
            <ToolButton icon='terminal-outline' label='Console and network' onPress={() => post({ type: 'devtools' })} active={devtools.open} badge={devtools.open ? 0 : devtools.errors} />
          </View>

          {tabs.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: space.sm, paddingVertical: 6 }} style={{ flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              {tabs.map((tab) => (
                <Pressable
                  key={tab.id}
                  accessibilityRole='tab'
                  accessibilityState={{ selected: tab.active }}
                  onPress={() => command({ type: 'tab', id: tab.id })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 200, height: 30, paddingLeft: space.sm, paddingRight: 4, borderRadius: 8, borderWidth: 1, borderColor: tab.active ? colors.primary : colors.border, backgroundColor: tab.active ? colors.surface : 'transparent' }}
                >
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: tab.active ? colors.text : colors.textMuted }}>
                    {tab.title || tab.url || 'New tab'}
                  </Text>
                  <Pressable accessibilityRole='button' accessibilityLabel='Close tab' hitSlop={6} onPress={() => command({ type: 'close-tab', id: tab.id })}>
                    <Icon name='close' size={14} color={colors.textMuted} />
                  </Pressable>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {state?.pageStatus?.kind === 'verification_required'
            ? banner(
                'shield-warning-outline',
                `${state.pageStatus.reason}. ${
                  userInControl
                    ? state.verificationRejected
                      ? 'This site keeps rejecting Genit’s cloud browser. It isn’t something you did. Open the site in your own browser and paste what you need into chat.'
                      : renderStuck
                        ? 'This page isn’t displaying here. Reload it, or open the site in your browser.'
                        : 'Complete the check below, then tap I’m done.'
                    : 'If the site clears the check, Genit continues on its own. You can also take control.'
                }`,
                <View style={{ gap: 6 }}>
                  {renderStuck ? <Button small variant='secondary' title='Reload' onPress={() => command({ type: 'reload' })} /> : null}
                  {(renderStuck || state.verificationRejected) && /^https?:\/\//i.test(currentUrl) ? <Button small variant='secondary' title='Open site' onPress={openSite} /> : null}
                  {userInControl ? (
                    <Button small title='I’m done' loading={handingBack} onPress={imDone} />
                  ) : (
                    <Button small variant='secondary' title='Take control' onPress={() => command({ type: 'control', controller: 'user' })} />
                  )}
                </View>
              )
            : userInControl && state?.verificationCleared
              ? banner('checkmark-circle', 'Verification passed. Tap I’m done so Genit can continue.', <Button small title='I’m done' loading={handingBack} onPress={imDone} />)
              : userInControl && state?.handoffReason
                ? banner('hand-outline', `Genit needs your help: ${state.handoffReason}. Tap I’m done when finished.`, <Button small title='I’m done' loading={handingBack} onPress={imDone} />)
                : null}
        </>
      ) : null}

      <WebView
        key={bridged === false ? 'page' : 'native'}
        ref={view}
        source={{ uri: src }}
        onMessage={onMessage}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
            <ActivityIndicator color='#fff' />
          </View>
        )}
        onLoadStart={() => setStatus('connecting')}
        bounces={false}
        scrollEnabled={false}
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        keyboardDisplayRequiresUserAction={false}
        style={{ flex: 1, backgroundColor: '#000' }}
      />
      <OptionsDrawer
        visible={deviceMenu}
        onClose={() => setDeviceMenu(false)}
        title='Device'
        options={DEVICES.flatMap((item) =>
          (item.value === 'desktop' ? [false] : [false, true]).map((landscape) => ({
            value: `${item.value}:${landscape ? 'landscape' : 'portrait'}`,
            label: item.value === 'desktop' ? item.label : `${item.label} · ${landscape ? 'landscape' : 'portrait'}`,
            description: item.description,
            icon: <Icon name={item.icon} size={20} color={colors.textMuted} />,
          }))
        )}
        value={`${device}:${state?.landscape && device !== 'desktop' ? 'landscape' : 'portrait'}`}
        onSelect={(value) => {
          const [picked, orientation] = value.split(':');
          command({ type: 'device', device: picked, landscape: picked !== 'desktop' && orientation === 'landscape' });
        }}
      />
    </View>
  );
}

function ToolButton({ icon, label, onPress, disabled, active, badge }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; active?: boolean; badge?: number }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        backgroundColor: active || pressed ? colors.surfacePressed : 'transparent',
      })}
    >
      <Icon name={icon} size={18} color={colors.text} />
      {badge ? (
        <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 15, height: 15, paddingHorizontal: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
