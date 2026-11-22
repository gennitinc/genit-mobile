import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Drawer } from '@/components/drawer';
import { Button } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { shareRemoteFile } from '@/lib/files';
import { radius, space, useColors } from '@/lib/theme';

import { resizeAgentBrowser, stripTimeContext } from './chat-api';
import { AutomationPreview } from './automation-preview';
import { type ChatPreview, ChatScreenContext, useChatScreen } from './chat-ui';
import { DesignStudio, type StudioDesign } from './design-studio';

type Props = {
  preview: ChatPreview | null;
  projectId: string;
  onClose: () => void;
  designs: StudioDesign[];
  /** What the agent is doing right now, shown over the preview (the web's thinking overlay). */
  working?: string | null;
};

function previewTitle(preview: ChatPreview | null) {
  if (!preview) return 'Preview';
  switch (preview.kind) {
    case 'automation':
      return 'Workflow';
    case 'designs':
      return 'Design studio';
    case 'website':
      return 'Live browser';
    default:
      return preview.title || 'Preview';
  }
}

/** Results opened from the chat: documents, the live browser, media, the design studio and workflows. */
export function PreviewDrawer({ preview, projectId, onClose, designs, working }: Props) {
  // The sheet renders in a portal at the app root, outside the chat screen's context.
  const screen = useChatScreen();
  return (
    <Drawer visible={!!preview} onClose={onClose} title={previewTitle(preview)} tall noScroll>
      <ChatScreenContext.Provider value={screen}>
        {working ? <WorkingBar text={working} /> : null}
        {preview?.kind === 'document' || preview?.kind === 'website' ? <WebPreview preview={preview} projectId={projectId} /> : null}
        {preview?.kind === 'media' ? <MediaPreview preview={preview} /> : null}
        {preview?.kind === 'designs' ? <DesignStudio designs={designs} working={!!working} /> : null}
        {preview?.kind === 'automation' ? <AutomationPreview projectId={projectId} /> : null}
      </ChatScreenContext.Provider>
    </Drawer>
  );
}

function WorkingBar({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View accessibilityLiveRegion='polite' style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.page, marginBottom: space.sm, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surface }}>
      <ActivityIndicator size='small' />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: colors.textMuted }}>
        {text}
      </Text>
    </View>
  );
}

function fileName(url: string, fallback: string) {
  return url.split('/').pop()?.split('?')[0] || fallback;
}

function WebPreview({ preview, projectId }: { preview: Extract<ChatPreview, { kind: 'document' | 'website' }>; projectId: string }) {
  const colors = useColors();
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const external = preview.openUrl || preview.displayUrl || preview.url;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.page, paddingBottom: space.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: colors.textMuted }}>
          {preview.displayUrl || preview.url}
        </Text>
        <Button small variant='ghost' title='Reload' onPress={() => setReload((value) => value + 1)} />
        <Button small variant='secondary' title='Open' onPress={() => WebBrowser.openBrowserAsync(external)} />
        {preview.downloadUrl ? (
          <Button
            small
            variant='secondary'
            title='Save'
            loading={saving}
            onPress={async () => {
              setSaving(true);
              setError('');
              try {
                await shareRemoteFile(preview.downloadUrl!, preview.fileName || fileName(preview.downloadUrl!, 'genit-document'));
              } catch (caught) {
                setError(errorMessage(caught));
              } finally {
                setSaving(false);
              }
            }}
          />
        ) : null}
      </View>
      {error ? <Text style={{ paddingHorizontal: space.page, paddingBottom: space.sm, fontSize: 13, color: colors.danger }}>{error}</Text> : null}
      <View
        style={{ flex: 1, marginHorizontal: space.sm, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}
        onLayout={(event) => {
          // The agent's browser renders at the size of the screen watching it.
          if (preview.kind === 'website') {
            const { width, height } = event.nativeEvent.layout;
            resizeAgentBrowser(projectId, Math.round(width), Math.round(height)).catch(() => undefined);
          }
        }}
      >
        <WebView
          key={reload}
          source={{ uri: preview.url }}
          startInLoadingState
          renderLoading={() => (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator />
            </View>
          )}
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
          style={{ flex: 1, backgroundColor: colors.background }}
        />
      </View>
    </View>
  );
}

function MediaVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (instance) => instance.play());
  return <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit='contain' />;
}

function MediaPreview({ preview }: { preview: Extract<ChatPreview, { kind: 'media' }> }) {
  const colors = useColors();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <View style={{ flex: 1, gap: space.md }}>
      <View style={{ flex: 1, marginHorizontal: space.sm, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface }}>
        {preview.isVideo ? (
          <MediaVideo url={preview.url} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} maximumZoomScale={4} minimumZoomScale={1} centerContent contentContainerStyle={{ flexGrow: 1 }}>
            <Image source={{ uri: preview.url }} style={{ flex: 1, minHeight: 400 }} contentFit='contain' accessibilityLabel={preview.title} />
          </ScrollView>
        )}
      </View>
      {preview.prompt ? (
        <Text numberOfLines={3} style={{ paddingHorizontal: space.page, fontSize: 13, color: colors.textMuted }}>
          {stripTimeContext(preview.prompt)}
        </Text>
      ) : null}
      {error ? <Text style={{ paddingHorizontal: space.page, fontSize: 13, color: colors.danger }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.page, paddingBottom: space.xl }}>
        <Button
          flex
          title='Save or share'
          loading={saving}
          icon={<Icon name='share-outline' size={18} color={colors.onPrimary} />}
          onPress={async () => {
            setSaving(true);
            setError('');
            try {
              await shareRemoteFile(preview.url, fileName(preview.url, preview.isVideo ? 'genit-video.mp4' : 'genit-image.png'));
            } catch (caught) {
              setError(errorMessage(caught));
            } finally {
              setSaving(false);
            }
          }}
        />
        <Button flex variant='secondary' title='Open' onPress={() => WebBrowser.openBrowserAsync(preview.url)} />
      </View>
    </View>
  );
}
