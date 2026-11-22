import { Icon } from '@/components/icon';
import { BrandLogo } from '@/components/brand-logo';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Drawer, OptionsDrawer } from '@/components/drawer';
import { Avatar, Chip, SectionTitle, Segmented, SelectField, Toggle } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { useIntegrations } from '@/features/integrations/integrations-api';
import { MediaPickerDrawer } from '@/features/library/media-picker';
import { api, errorMessage } from '@/lib/api';
import { platformMeta, POST_PLATFORMS, type PostPlatform } from '@/lib/platforms';
import { radius, space, useColors } from '@/lib/theme';

import {
  EMPTY_FORM,
  formFromPost,
  PLATFORM_RULES,
  type PostForm,
  type PostWhen,
  TARGET_LABEL,
  toPayload,
  validatePost,
  type YoutubePrivacy,
} from './post-form';
import {
  type ConnectionOptions,
  createPosts,
  enhanceText,
  fetchOptions,
  isVideo,
  postKeys,
  publishPosts,
  type SocialPost,
  updatePost,
  updateRemotePost,
} from './posts-api';

export type ComposerTarget =
  | { mode: 'create'; campaignId?: string }
  | { mode: 'edit'; post: SocialPost; remote: boolean };

type Picker =
  | { kind: 'account'; platform: PostPlatform }
  | { kind: 'target'; platform: PostPlatform }
  | { kind: 'tiktokPrivacy' }
  | { kind: 'playlist' }
  | { kind: 'youtubePrivacy' }
  | { kind: 'playlistPrivacy' }
  | { kind: 'campaign' };

const PRIVACY_OPTIONS: { value: YoutubePrivacy; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'private', label: 'Private' },
];

type Playlist = { id: string; snippet?: { title: string; description?: string }; status?: { privacyStatus?: YoutubePrivacy } };

export function PostComposer({ target, onClose }: { target: ComposerTarget | null; onClose: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { activeFor } = useIntegrations();
  const [form, setForm] = useState<PostForm>(EMPTY_FORM);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [enhancing, setEnhancing] = useState<'title' | 'content' | null>(null);
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const editing = target?.mode === 'edit' ? target.post : null;
  const remote = target?.mode === 'edit' && target.remote;

  // Start from the post being edited (or a blank form) each time the drawer opens.
  const [openedFor, setOpenedFor] = useState<ComposerTarget | null>(null);
  if (target !== openedFor) {
    setOpenedFor(target);
    if (target) {
      setError('');
      setShowErrors(false);
      setForm(target.mode === 'edit' ? formFromPost(target.post) : { ...EMPTY_FORM, campaignId: target.campaignId ?? '' });
    }
  }

  const set = (patch: Partial<PostForm>) => setForm((current) => ({ ...current, ...patch }));

  const connectedPlatforms = POST_PLATFORMS.filter((platform) => activeFor(platform).length > 0);

  // Destination options (pages, boards, authors, privacy levels) per chosen account.
  const optionQueries = useQueries({
    queries: form.platforms.map((platform) => ({
      queryKey: ['social-posts', 'options', form.integrationIds[platform] ?? ''],
      queryFn: () => fetchOptions(form.integrationIds[platform]!),
      enabled: !!form.integrationIds[platform] && !remote,
      staleTime: 5 * 60_000,
    })),
  });
  const optionsFor = (platform: PostPlatform) => optionQueries[form.platforms.indexOf(platform)]?.data;

  const youtubeId = form.integrationIds.youtube;
  const playlists = useQuery({
    queryKey: ['youtube-playlists', youtubeId],
    queryFn: () =>
      api<{ playlists: Playlist[] }>(`integrations/youtube/${youtubeId}/playlists`, { query: { maxResults: 50 } }).then(
        (data) => data.playlists
      ),
    enabled: !!youtubeId && form.platforms.includes('youtube') && !remote,
  });

  const campaigns = useQuery({
    queryKey: ['campaigns', 'options'],
    queryFn: () =>
      api<{ campaigns: { _id: string; name: string; status?: string }[] }>('gtm/campaigns', { query: { page: 1, limit: 50 } }).then(
        (data) => data.campaigns
      ),
    enabled: !!target && !remote,
  });

  const togglePlatform = (platform: PostPlatform) => {
    setForm((current) => {
      if (current.platforms.includes(platform)) {
        const integrationIds = { ...current.integrationIds };
        const providerTargetIds = { ...current.providerTargetIds };
        delete integrationIds[platform];
        delete providerTargetIds[platform];
        return { ...current, platforms: current.platforms.filter((p) => p !== platform), integrationIds, providerTargetIds };
      }
      // Preselect the primary (or only) account.
      const accounts = activeFor(platform);
      const account = accounts.find((item) => item.isPrimary) ?? accounts[0];
      return {
        ...current,
        platforms: [...current.platforms, platform],
        integrationIds: { ...current.integrationIds, [platform]: account?._id },
      };
    });
  };

  const enhance = async (field: 'title' | 'content') => {
    setEnhancing(field);
    setError('');
    try {
      const { text } = await enhanceText({
        field,
        title: form.title,
        content: form.content,
        platforms: form.platforms,
        media: form.media,
      });
      set({ [field]: text });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setEnhancing(null);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (editing && remote) {
        await updateRemotePost(String(editing.integration), editing.externalId!, {
          content: form.content,
          ...(editing.title !== undefined ? { title: form.title } : {}),
        });
        return 1;
      }
      const payload = toPayload(form);
      const saved = editing
        ? await updatePost(editing._id, payload).then((result) => result.posts ?? [result.post])
        : await createPosts(payload);
      if (form.when === 'published') await publishPosts(saved.map((post) => post._id));
      return saved.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.all });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const errors = remote ? (form.content.trim() ? [] : ['Write the post text.']) : validatePost(form);

  const submit = () => {
    setShowErrors(true);
    if (errors.length) return;
    setError('');
    save.mutate();
  };

  const saveLabel = remote
    ? 'Save changes'
    : form.when === 'published'
      ? 'Publish now'
      : form.when === 'scheduled'
        ? editing?.status === 'scheduled'
          ? 'Reschedule'
          : 'Schedule'
        : form.platforms.length > 1
          ? `Save ${form.platforms.length} drafts`
          : 'Save draft';

  const strictestCaption = Math.min(
    ...form.platforms.map((platform) => PLATFORM_RULES[platform]?.contentMax ?? Infinity),
    Infinity
  );

  return (
    <>
      <Drawer
        visible={!!target}
        onClose={onClose}
        title={editing ? 'Edit post' : 'New post'}
        tall
        footer={<Button title={saveLabel} loading={save.isPending} onPress={submit} />}
      >
        <Banner message={error} />
        {showErrors && errors.length ? <Banner message={errors.join('\n')} /> : null}

        {!remote ? (
          <View style={{ gap: space.md }}>
            <SectionTitle title='Post to' />
            {connectedPlatforms.length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.textMuted }}>
                Connect a social account in Plugins to choose where this post goes. You can still save a draft later.
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {connectedPlatforms.map((platform) => {
                  const meta = platformMeta(platform);
                  const active = form.platforms.includes(platform);
                  return (
                    <Chip
                      key={platform}
                      label={meta.label}
                      active={active}
                      onPress={() => togglePlatform(platform)}
                      icon={<BrandLogo platform={platform} size={16} />}
                    />
                  );
                })}
              </View>
            )}

            {form.platforms.map((platform) => {
              const meta = platformMeta(platform);
              const accounts = activeFor(platform);
              const account = accounts.find((item) => item._id === form.integrationIds[platform]);
              const options = optionsFor(platform);
              const targetName = options?.targets.find((t) => t.id === form.providerTargetIds[platform])?.name;
              return (
                <View key={platform} style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <BrandLogo platform={platform} size={20} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{meta.label}</Text>
                  </View>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>{PLATFORM_RULES[platform]?.summary}</Text>
                  {accounts.length > 1 ? (
                    <SelectField
                      label='Account'
                      value={account?.accountName}
                      onPress={() => setPicker({ kind: 'account', platform })}
                    />
                  ) : account ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <Avatar uri={account.accountAvatar} name={account.accountName} size={24} />
                      <Text style={{ fontSize: 14, color: colors.text }}>{account.accountName}</Text>
                    </View>
                  ) : null}
                  {platform !== 'youtube' && options?.targets.length ? (
                    <SelectField
                      label={TARGET_LABEL[platform] ?? 'Destination'}
                      value={targetName}
                      placeholder={`Select ${(TARGET_LABEL[platform] ?? 'destination').toLowerCase()}`}
                      onPress={() => setPicker({ kind: 'target', platform })}
                    />
                  ) : null}
                  {platform === 'tiktok' && options?.privacyLevels.length ? (
                    <SelectField
                      label='Who can view'
                      value={options.privacyLevels.find((level) => level.value === form.tiktokPrivacyLevel)?.label}
                      onPress={() => setPicker({ kind: 'tiktokPrivacy' })}
                    />
                  ) : null}
                  {platform === 'youtube' ? (
                    <>
                      <SelectField
                        label='Playlist'
                        value={
                          form.youtubeNewPlaylist
                            ? 'New playlist…'
                            : form.youtubePlaylistId
                              ? form.youtubePlaylistTitle || form.youtubePlaylistId
                              : 'No playlist'
                        }
                        onPress={() => setPicker({ kind: 'playlist' })}
                      />
                      {form.youtubeNewPlaylist ? (
                        <>
                          <Field
                            value={form.youtubePlaylistTitle}
                            onChangeText={(youtubePlaylistTitle) => set({ youtubePlaylistTitle })}
                            placeholder='Playlist name'
                          />
                          <Field
                            value={form.youtubePlaylistDescription}
                            onChangeText={(youtubePlaylistDescription) => set({ youtubePlaylistDescription })}
                            placeholder='Playlist description (optional)'
                            multiline
                          />
                          <SelectField
                            label='Playlist visibility'
                            value={PRIVACY_OPTIONS.find((o) => o.value === form.youtubePlaylistPrivacyStatus)?.label}
                            onPress={() => setPicker({ kind: 'playlistPrivacy' })}
                          />
                        </>
                      ) : null}
                      <SelectField
                        label='Video visibility'
                        value={PRIVACY_OPTIONS.find((o) => o.value === form.youtubePrivacyStatus)?.label}
                        onPress={() => setPicker({ kind: 'youtubePrivacy' })}
                      />
                      <Toggle
                        label='Made for kids'
                        value={form.youtubeMadeForKids}
                        onChange={(youtubeMadeForKids) => set({ youtubeMadeForKids })}
                      />
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={{ gap: space.sm }}>
          <Field
            label={form.platforms.includes('youtube') ? 'Title (required for YouTube)' : 'Title'}
            value={form.title}
            onChangeText={(title) => set({ title })}
            placeholder='Add a title'
          />
          <Button
            title='Enhance with AI'
            variant='ghost'
            small
            loading={enhancing === 'title'}
            disabled={!!enhancing || (!form.title && !form.content)}
            onPress={() => enhance('title')}
            icon={<Icon name='sparkles' size={14} color={colors.textMuted} />}
          />
        </View>

        <View style={{ gap: space.sm }}>
          <Field
            label='Caption'
            value={form.content}
            onChangeText={(content) => set({ content })}
            placeholder='What do you want to say?'
            multiline
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Button
              title='Enhance with AI'
              variant='ghost'
              small
              loading={enhancing === 'content'}
              disabled={!!enhancing || (!form.title && !form.content)}
              onPress={() => enhance('content')}
              icon={<Icon name='sparkles' size={14} color={colors.textMuted} />}
            />
            {Number.isFinite(strictestCaption) ? (
              <Text
                style={{
                  fontSize: 12,
                  color: form.content.length > strictestCaption ? colors.danger : colors.textFaint,
                }}
              >
                {form.content.length.toLocaleString()} / {strictestCaption.toLocaleString()}
              </Text>
            ) : null}
          </View>
        </View>

        {!remote ? (
          <>
            <View style={{ gap: space.sm }}>
              <SectionTitle title='Media' />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {form.media.map((item, index) => (
                  <View key={`${item.url}-${index}`} style={{ width: 84, height: 84, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface }}>
                    {isVideo(item) ? (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name='videocam' size={26} color={colors.textMuted} />
                      </View>
                    ) : (
                      <Image source={{ uri: item.url }} style={{ flex: 1 }} contentFit='cover' />
                    )}
                    <Pressable
                      accessibilityRole='button'
                      accessibilityLabel='Remove media'
                      onPress={() => set({ media: form.media.filter((_, i) => i !== index) })}
                      hitSlop={8}
                      style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}
                    >
                      <Icon name='close' size={14} color='#FFFFFF' />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  accessibilityRole='button'
                  accessibilityLabel='Add media'
                  onPress={() => setMediaOpen(true)}
                  style={{ width: 84, height: 84, borderRadius: radius.sm, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name='add' size={24} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>

            <SelectField
              label='Campaign'
              value={campaigns.data?.find((c) => c._id === form.campaignId)?.name ?? (form.campaignId ? 'Linked campaign' : 'No campaign')}
              onPress={() => setPicker({ kind: 'campaign' })}
            />

            <View style={{ gap: space.sm }}>
              <SectionTitle title='When' />
              <Segmented<PostWhen>
                value={form.when}
                onChange={(when) => set({ when })}
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'scheduled', label: 'Schedule' },
                  { value: 'published', label: 'Now' },
                ]}
              />
              {form.when === 'scheduled' ? (
                <DateField
                  label='Publish at'
                  value={form.scheduledFor}
                  minimumDate={new Date()}
                  onChange={(scheduledFor) => set({ scheduledFor })}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </Drawer>

      <MediaPickerDrawer
        visible={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onPick={(media) => set({ media: [...form.media, ...media] })}
      />

      <ComposerPickers
        picker={picker}
        onClose={() => setPicker(null)}
        form={form}
        set={set}
        activeFor={activeFor}
        optionsFor={optionsFor}
        playlists={playlists.data ?? []}
        campaigns={campaigns.data ?? []}
      />
    </>
  );
}

function ComposerPickers({
  picker,
  onClose,
  form,
  set,
  activeFor,
  optionsFor,
  playlists,
  campaigns,
}: {
  picker: Picker | null;
  onClose: () => void;
  form: PostForm;
  set: (patch: Partial<PostForm>) => void;
  activeFor: ReturnType<typeof useIntegrations>['activeFor'];
  optionsFor: (platform: PostPlatform) => ConnectionOptions | undefined;
  playlists: Playlist[];
  campaigns: { _id: string; name: string; status?: string }[];
}) {
  const visible = !!picker;
  if (picker?.kind === 'account') {
    const { platform } = picker;
    return (
      <OptionsDrawer
        visible={visible}
        onClose={onClose}
        title={`${platformMeta(platform).label} account`}
        value={form.integrationIds[platform]}
        options={activeFor(platform).map((account) => ({ value: account._id, label: account.accountName }))}
        onSelect={(id) =>
          set({
            integrationIds: { ...form.integrationIds, [platform]: id },
            providerTargetIds: { ...form.providerTargetIds, [platform]: '' },
          })
        }
      />
    );
  }
  if (picker?.kind === 'target') {
    const { platform } = picker;
    return (
      <OptionsDrawer
        visible={visible}
        onClose={onClose}
        title={TARGET_LABEL[platform] ?? 'Destination'}
        value={form.providerTargetIds[platform]}
        options={(optionsFor(platform)?.targets ?? []).map((t) => ({ value: t.id, label: t.name, description: t.description }))}
        onSelect={(id) => set({ providerTargetIds: { ...form.providerTargetIds, [platform]: id } })}
      />
    );
  }
  if (picker?.kind === 'tiktokPrivacy') {
    return (
      <OptionsDrawer
        visible={visible}
        onClose={onClose}
        title='Who can view'
        value={form.tiktokPrivacyLevel}
        options={(optionsFor('tiktok')?.privacyLevels ?? []).map((level) => ({ value: level.value, label: level.label }))}
        onSelect={(tiktokPrivacyLevel) => set({ tiktokPrivacyLevel })}
      />
    );
  }
  if (picker?.kind === 'playlist') {
    return (
      <OptionsDrawer
        visible={visible}
        onClose={onClose}
        title='Playlist'
        value={form.youtubeNewPlaylist ? '__new__' : form.youtubePlaylistId || '__none__'}
        options={[
          { value: '__none__', label: 'No playlist' },
          ...playlists.map((playlist) => ({ value: playlist.id, label: playlist.snippet?.title || playlist.id })),
          { value: '__new__', label: 'New playlist…' },
        ]}
        onSelect={(value) => {
          if (value === '__none__') {
            set({ youtubeNewPlaylist: false, youtubePlaylistId: '', youtubePlaylistTitle: '', youtubePlaylistDescription: '' });
          } else if (value === '__new__') {
            set({ youtubeNewPlaylist: true, youtubePlaylistId: '' });
          } else {
            const playlist = playlists.find((item) => item.id === value);
            set({
              youtubeNewPlaylist: false,
              youtubePlaylistId: value,
              youtubePlaylistTitle: playlist?.snippet?.title ?? '',
              youtubePlaylistDescription: playlist?.snippet?.description ?? '',
              youtubePlaylistPrivacyStatus: playlist?.status?.privacyStatus ?? 'public',
            });
          }
        }}
      />
    );
  }
  if (picker?.kind === 'youtubePrivacy' || picker?.kind === 'playlistPrivacy') {
    const key = picker.kind === 'youtubePrivacy' ? 'youtubePrivacyStatus' : 'youtubePlaylistPrivacyStatus';
    return (
      <OptionsDrawer
        visible={visible}
        onClose={onClose}
        title={picker.kind === 'youtubePrivacy' ? 'Video visibility' : 'Playlist visibility'}
        value={form[key]}
        options={PRIVACY_OPTIONS}
        onSelect={(value) => set({ [key]: value })}
      />
    );
  }
  if (picker?.kind === 'campaign') {
    return (
      <OptionsDrawer
        visible={visible}
        onClose={onClose}
        title='Campaign'
        value={form.campaignId || '__none__'}
        options={[
          { value: '__none__', label: 'No campaign' },
          ...campaigns.map((campaign) => ({ value: campaign._id, label: campaign.name, description: campaign.status })),
        ]}
        onSelect={(value) => set({ campaignId: value === '__none__' ? '' : value })}
      />
    );
  }
  return null;
}
