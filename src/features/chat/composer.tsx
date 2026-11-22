import { Icon, type IconName } from '@/components/icon';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Drawer, OptionsDrawer } from '@/components/drawer';
import { Toggle } from '@/components/kit';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { currentOrganization } from '@/features/orgs/orgs-api';
import { errorMessage } from '@/lib/api';
import type { LocalFile } from '@/lib/files';
import { radius, space, useColors } from '@/lib/theme';

import {
  type AgentAttachedFile,
  type AgentModel,
  DOCUMENT_PICKER_TYPES,
  enhancePrompt,
  isSupportedAttachment,
  listAgentModels,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  trackModelUse,
  uploadAgentFiles,
  validatePrompt,
  withTimeContext,
} from './chat-api';
import { setChatPrefs, useChatPrefs } from './chat-prefs';

export type SendInput = {
  /** What the person typed, with the device's time appended for the agent. */
  prompt: string;
  /** What the person typed, as typed. */
  text: string;
  attachedFiles?: AgentAttachedFile[];
  agentModelId?: string;
  useBrandIdentity: boolean;
};

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Resolves once the message is accepted; the composer clears then. */
  onSend: (input: SendInput) => Promise<void>;
  /** A run is working: the send button becomes Stop. */
  running?: boolean;
  onStop?: () => Promise<unknown>;
  /** Waiting for an answer in a card above, so the composer is paused. */
  blocked?: boolean;
  autoFocus?: boolean;
  /** A design inspiration picked in this chat; it goes with the next message, as on the web. */
  inspiration?: string | null;
  onRemoveInspiration?: () => void;
};

const ATTACH_OPTIONS = [
  { value: 'library', label: 'Photo library', icon: 'images-outline' },
  { value: 'camera', label: 'Take a photo', icon: 'camera-outline' },
  { value: 'files', label: 'Files', description: 'PDF, Word, Excel or PowerPoint', icon: 'document-outline' },
  { value: 'paste', label: 'Paste image', description: 'From the clipboard', icon: 'clipboard-outline' },
] as const;

/** Saves the clipboard's image to a file the uploader can send. */
async function pastedImage(): Promise<LocalFile | null> {
  const image = await Clipboard.getImageAsync({ format: 'png' });
  if (!image?.data) return null;
  const base64 = image.data.replace(/^data:image\/\w+;base64,/, '');
  const file = new File(Paths.cache, `pasted-${Date.now()}.png`);
  await file.write(base64, { encoding: 'base64' });
  return { uri: file.uri, name: 'Pasted image.png', mimeType: 'image/png', size: file.size ?? Math.round((base64.length * 3) / 4) };
}

function inspirationFile(url: string): AgentAttachedFile {
  const extension = url.split('?')[0].split('.').pop()?.toLowerCase();
  return { name: 'selected-design-inspiration', type: extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg', url };
}

export function useAgentModels() {
  const prefs = useChatPrefs();
  const models = useQuery({ queryKey: ['chat', 'models'], queryFn: listAgentModels, staleTime: 10 * 60_000 });
  const list = models.data ?? [];
  const selected = list.find((model) => model._id === prefs.modelId) ?? list.find((model) => model.isDefault) ?? list[0];
  return { models: list, selected, loading: models.isLoading };
}

export function Composer({ value, onChangeText, placeholder = 'Ask Genit anything…', onSend, running, onStop, blocked, autoFocus, inspiration, onRemoveInspiration }: Props) {
  const colors = useColors();
  const { user } = useAuth();
  const prefs = useChatPrefs();
  const { models, selected } = useAgentModels();
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [sheet, setSheet] = useState<'attach' | 'model' | 'brand' | null>(null);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState('');

  const credits = user?.creditsRemaining;
  const org = currentOrganization(user);
  const brandColors = (org?.brandColors ?? []).filter(Boolean).slice(0, 3);
  const wantsToResume = /^(continue|resume|go on|keep going)[.!]?$/i.test(value.trim());
  const showStop = !!running && !wantsToResume;

  const addFiles = (picked: LocalFile[]) => {
    const accepted = picked.filter((file) => isSupportedAttachment(file) && (file.size ?? 0) <= MAX_ATTACHMENT_BYTES);
    if (accepted.length !== picked.length) setError('Attach images, videos, PDFs or Office files up to 10 MB each.');
    else setError('');
    setFiles((current) => {
      if (current.length + accepted.length > MAX_ATTACHMENTS) setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return [...current, ...accepted].slice(0, MAX_ATTACHMENTS);
    });
  };

  const attach = async (source: (typeof ATTACH_OPTIONS)[number]['value']) => {
    try {
      if (source === 'paste') {
        const image = await pastedImage();
        if (image) addFiles([image]);
        else setError('There’s no image on the clipboard. Copy one, then try again.');
        return;
      }
      if (source === 'files') {
        const result = await DocumentPicker.getDocumentAsync({ type: DOCUMENT_PICKER_TYPES, multiple: true, copyToCacheDirectory: true });
        if (!result.canceled) addFiles(result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size })));
        return;
      }
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Allow camera access in Settings to take a photo.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: source === 'library',
        selectionLimit: MAX_ATTACHMENTS - files.length,
        quality: 0.9,
      };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      addFiles(
        result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? asset.uri.split('/').pop() ?? 'photo.jpg',
          mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          size: asset.fileSize,
        }))
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const send = async () => {
    if (sending) return;
    setError('');
    if (!wantsToResume) {
      if (credits === 0) {
        setError("You're out of credits. Add credits or upgrade your plan at trygenit.com to keep going.");
        return;
      }
      const invalid = validatePrompt(value, files.length);
      if (invalid) {
        setError(invalid);
        return;
      }
    }
    setSending(true);
    try {
      let attachedFiles = files.length ? await uploadAgentFiles(files) : undefined;
      if (inspiration && !wantsToResume && !attachedFiles?.some((file) => file.url === inspiration)) {
        attachedFiles = [...(attachedFiles ?? []), inspirationFile(inspiration)];
      }
      const text = value.trim() || 'Please use the attached files.';
      await onSend({
        prompt: withTimeContext(text),
        text,
        attachedFiles,
        agentModelId: selected?._id,
        useBrandIdentity: prefs.useBrand,
      });
      setFiles([]);
      onChangeText('');
    } catch (caught) {
      setError(errorMessage(caught) || "Couldn't start Genit. Your message is still here so you can retry.");
    } finally {
      setSending(false);
    }
  };

  const stop = async () => {
    if (!onStop) return;
    setStopping(true);
    try {
      await onStop();
    } catch {
      setError("Couldn't stop Genit. Please try again.");
    } finally {
      setStopping(false);
    }
  };

  const enhance = async () => {
    if (value.trim().length < 2) return;
    setEnhancing(true);
    setError('');
    try {
      const improved = (await enhancePrompt(value.trim())).trim();
      // The server returns the prompt unchanged when its AI call fails.
      if (!improved || improved === value.trim()) setError("Couldn't improve this prompt right now. Try again in a moment.");
      else onChangeText(improved);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setEnhancing(false);
    }
  };

  const disabledSend = sending || blocked || (!showStop && value.trim().length < 2 && !files.length && !wantsToResume);

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
        <Icon name='flash' size={12} color={colors.success} />
        <Text style={{ flex: 1, fontSize: 12, color: colors.textMuted }}>
          {typeof credits === 'number' ? `${credits.toLocaleString()} credits left` : ' '}
        </Text>
        {blocked ? <Text style={{ fontSize: 12, color: '#B45309' }}>Answer above to continue</Text> : null}
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={prefs.useBrand ? 'Brand identity on' : 'Brand identity off'}
          hitSlop={8}
          onPress={() => setSheet('brand')}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, opacity: pressed ? 0.6 : 1 })}
        >
          {prefs.useBrand && brandColors.length ? (
            <View style={{ flexDirection: 'row' }}>
              {brandColors.map((color, index) => (
                <View key={`${color}-${index}`} style={{ width: 12, height: 12, borderRadius: 6, marginLeft: index ? -4 : 0, borderWidth: 1.5, borderColor: colors.background, backgroundColor: color }} />
              ))}
            </View>
          ) : (
            <Icon name='color-palette-outline' size={14} color={colors.textMuted} />
          )}
          <Text style={{ fontSize: 12, color: colors.textMuted }}>{prefs.useBrand ? 'Brand on' : 'Brand off'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={{ fontSize: 13, color: colors.danger, paddingHorizontal: 4 }}>{error}</Text> : null}

      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.background, padding: space.sm, gap: space.sm }}>
        {files.length || inspiration ? (
          <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {inspiration ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, paddingRight: 8, borderRadius: radius.sm, backgroundColor: colors.surface }}>
                <Image source={{ uri: inspiration }} style={{ width: 28, height: 28, borderRadius: 4 }} />
                <Text numberOfLines={1} style={{ maxWidth: 110, fontSize: 12, color: colors.text }}>
                  Inspiration
                </Text>
                {onRemoveInspiration ? (
                  <Pressable accessibilityRole='button' accessibilityLabel='Remove inspiration' hitSlop={8} onPress={onRemoveInspiration}>
                    <Icon name='close-circle' size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {files.map((file, index) => (
              <View key={`${file.uri}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 4, paddingRight: 8, borderRadius: radius.sm, backgroundColor: colors.surface }}>
                {file.mimeType?.startsWith('image/') ? (
                  <Image source={{ uri: file.uri }} style={{ width: 28, height: 28, borderRadius: 4 }} />
                ) : (
                  <Icon name={file.mimeType?.startsWith('video/') ? 'film-outline' : 'document-outline'} size={18} color={colors.textMuted} />
                )}
                <Text numberOfLines={1} style={{ maxWidth: 110, fontSize: 12, color: colors.text }}>
                  {file.name}
                </Text>
                <Pressable accessibilityRole='button' accessibilityLabel={`Remove ${file.name}`} hitSlop={8} onPress={() => setFiles((current) => current.filter((_, i) => i !== index))}>
                  <Icon name='close-circle' size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          multiline
          autoFocus={autoFocus}
          editable={!sending}
          maxLength={5000}
          style={{ minHeight: 44, maxHeight: 160, paddingHorizontal: space.sm, paddingTop: 8, fontSize: 16, lineHeight: 21, color: colors.text }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ToolButton icon='add' label='Attach files' onPress={() => setSheet('attach')} disabled={sending || files.length >= MAX_ATTACHMENTS} filled />
          {models.length ? (
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={`Model: ${selected?.name}`}
              onPress={() => setSheet('model')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 34, paddingHorizontal: 10, borderRadius: radius.full, backgroundColor: colors.surface }}
            >
              <ModelIcon model={selected} />
              <Text numberOfLines={1} style={{ maxWidth: 110, fontSize: 13, color: colors.text }}>
                {selected?.name}
              </Text>
              <Icon name='chevron-down' size={13} color={colors.textMuted} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          {/* Shown once there's something to improve, to keep the bar light. */}
          {value.trim().length >= 2 ? (
            <ToolButton icon='sparkles-outline' label='Improve my prompt' onPress={enhance} busy={enhancing} disabled={sending} />
          ) : null}
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={showStop ? 'Stop Genit' : 'Send message'}
            disabled={showStop ? stopping : disabledSend}
            onPress={showStop ? stop : send}
            style={{
              width: 38,
              height: 38,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 19,
              backgroundColor: showStop ? colors.text : colors.primary,
              opacity: (showStop ? stopping : disabledSend) ? 0.4 : 1,
            }}
          >
            {sending || stopping ? (
              <ActivityIndicator size='small' color={showStop ? colors.background : colors.onPrimary} />
            ) : showStop ? (
              <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: colors.background }} />
            ) : (
              <Icon name='arrow-up' size={20} color={colors.onPrimary} />
            )}
          </Pressable>
        </View>
      </View>

      <OptionsDrawer
        visible={sheet === 'attach'}
        onClose={() => setSheet(null)}
        title='Attach'
        options={ATTACH_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          description: 'description' in option ? option.description : undefined,
          icon: <Icon name={option.icon} size={22} color={colors.textMuted} />,
        }))}
        onSelect={(source) => setTimeout(() => attach(source), 350)}
      />
      <OptionsDrawer
        visible={sheet === 'model'}
        onClose={() => setSheet(null)}
        title='Agent model'
        value={selected?._id}
        options={models.map((model) => ({ value: model._id, label: model.name, description: model.description, icon: <ModelIcon model={model} size={22} /> }))}
        onSelect={(id) => {
          setChatPrefs({ modelId: id });
          trackModelUse(id);
        }}
      />
      <BrandDrawer visible={sheet === 'brand'} onClose={() => setSheet(null)} />
    </View>
  );
}

function ToolButton({ icon, label, onPress, disabled, busy, filled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; busy?: boolean; filled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: filled ? colors.surface : 'transparent', opacity: disabled ? 0.4 : 1 }}
    >
      {busy ? <ActivityIndicator size='small' color={colors.textMuted} /> : <Icon name={icon} size={filled ? 22 : 19} color={filled ? colors.text : colors.textMuted} />}
    </Pressable>
  );
}

function ModelIcon({ model, size = 15 }: { model?: AgentModel; size?: number }) {
  const colors = useColors();
  if (model?.icon && /^https?:\/\//.test(model.icon)) {
    return <Image source={{ uri: model.icon }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit='contain' />;
  }
  return <Icon name='sparkles' size={size} color={colors.primary} />;
}

/** The organization's brand, and whether Genit should apply it to this chat. */
export function BrandDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const { user } = useAuth();
  const prefs = useChatPrefs();
  const org = currentOrganization(user);
  const hasBrand = !!org && !!(org.brandColors?.length || org.businessBio || org.slogan || org.businessLogo);

  const section = (label: string, content?: string | string[]) => {
    const text = Array.isArray(content) ? content.filter(Boolean).join(', ') : content;
    if (!text) return null;
    return (
      <View style={{ gap: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted }}>{label}</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>{text}</Text>
      </View>
    );
  };

  return (
    <Drawer
      visible={visible}
      onClose={onClose}
      title='Brand identity'
      footer={
        <Button
          title={hasBrand ? 'Edit brand' : 'Add your brand'}
          variant='secondary'
          disabled={hasBrand && !prefs.useBrand}
          onPress={() => {
            onClose();
            router.push('/brand');
          }}
        />
      }
    >
      <View style={{ gap: space.lg }}>
        <Toggle
          label='Apply brand identity'
          description='Genit uses your colors, voice and details in what it creates.'
          value={prefs.useBrand}
          onChange={(useBrand) => setChatPrefs({ useBrand })}
        />
        {hasBrand ? (
          // Faded while switched off: the brand is kept, just not applied.
          <View
            accessibilityState={{ disabled: !prefs.useBrand }}
            style={{ gap: space.lg, opacity: prefs.useBrand ? 1 : 0.35 }}
            pointerEvents={prefs.useBrand ? 'auto' : 'none'}
          >
            {!prefs.useBrand ? (
              <Text style={{ fontSize: 13, color: colors.textMuted }}>Not applied to this chat. Turn it on to use your brand.</Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              {org?.businessLogo ? <Image source={{ uri: org.businessLogo }} style={{ width: 44, height: 44, borderRadius: radius.sm }} contentFit='contain' /> : null}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{org?.businessName}</Text>
                {org?.industry ? <Text style={{ fontSize: 13, color: colors.textMuted }}>{org.industry}</Text> : null}
              </View>
            </View>
            {org?.brandColors?.length ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {org.brandColors.map((color, index) => (
                  <View key={`${color}-${index}`} style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: color }} />
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{color.toUpperCase()}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {section('Slogan', org?.slogan)}
            {section('Voice & tone', org?.voiceTone)}
            {section('About', org?.businessBio || org?.aboutUs)}
            {section('Mission', org?.mission)}
            {section('Vision', org?.vision)}
            {section('Values', org?.values)}
          </View>
        ) : (
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textMuted }}>No brand identity yet. Add your logo, colors and voice so Genit’s work matches your business.</Text>
        )}
      </View>
    </Drawer>
  );
}
