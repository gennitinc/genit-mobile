import { Icon } from '@/components/icon';
import { PullRefresh } from '@/components/pull-refresh';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { ConfirmDrawer, Drawer, OptionsDrawer } from '@/components/drawer';
import { Empty, IconButton, LoadError, Loading, Page } from '@/components/kit';
import { Banner, Button } from '@/components/ui';
import { assetKind, deleteFromLibrary, type MediaAsset, uploadToLibrary, useLibrary } from '@/features/library/library-api';
import { ApiError, errorMessage } from '@/lib/api';
import { formatBytes, type LocalFile, shareRemoteFile } from '@/lib/files';
import { shortDate } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';

const KIND_ICON = { image: 'image', video: 'videocam', audio: 'musical-notes', file: 'document' } as const;

export default function LibraryScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const library = useLibrary('all');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [uploadMenu, setUploadMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const assets = library.data?.assets ?? [];
  const storage = library.data?.storage;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['library'] });

  const uploadFiles = async (files: LocalFile[]) => {
    if (!files.length) return;
    setUploadError('');
    setProgress({ done: 0, total: files.length });
    try {
      for (const [index, file] of files.entries()) {
        await uploadToLibrary(file);
        setProgress({ done: index + 1, total: files.length });
      }
    } catch (caught) {
      setUploadError(
        caught instanceof ApiError && caught.status === 413
          ? 'Your storage is full. Delete some files or upgrade your plan to upload more.'
          : errorMessage(caught)
      );
    } finally {
      setProgress(null);
      refresh();
    }
  };

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, quality: 1 });
    if (!result.canceled) {
      await uploadFiles(result.assets.map((asset) => ({ uri: asset.uri, name: asset.fileName ?? undefined, mimeType: asset.mimeType })));
    }
  };

  const pickDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (!result.canceled) {
      await uploadFiles(result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? undefined })));
    }
  };

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await deleteFromLibrary(id);
    },
    onSettled: () => {
      setSelected(new Set());
      setSelecting(false);
      refresh();
    },
  });

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const subtitle =
    library.data?.scope === 'organization' ? 'Shared uploads and generated media for your organization' : 'Your uploads and generated media';

  return (
    <Page
      title='Media library'
      subtitle={subtitle}
      back={() => router.back()}
      actions={
        <>
          <IconButton
            icon={layout === 'grid' ? 'list' : 'grid'}
            label={layout === 'grid' ? 'Show as list' : 'Show as grid'}
            onPress={() => setLayout(layout === 'grid' ? 'list' : 'grid')}
          />
          <IconButton icon='cloud-upload-outline' label='Upload' busy={!!progress} onPress={() => setUploadMenu(true)} />
        </>
      }
    >
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        key={layout}
        data={assets}
        numColumns={layout === 'grid' ? 3 : 1}
        keyExtractor={(asset) => asset._id}
        columnWrapperStyle={layout === 'grid' ? { gap: space.sm } : undefined}
        contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.sm }}
        refreshControl={<PullRefresh onRefresh={() => library.refetch()} />}
        ListHeaderComponent={
          <View style={{ gap: space.md, paddingBottom: space.sm }}>
            {storage ? <StorageMeter used={storage.usedBytes} limit={storage.limitBytes} plan={storage.plan} /> : null}
            {progress ? <Banner tone='success' message={`Uploading ${progress.done + 1} of ${progress.total}…`} /> : null}
            <Banner message={uploadError} />
            {assets.length ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {selecting ? (
                  <>
                    <Button
                      title={selected.size === assets.length ? 'Clear' : 'Select all'}
                      variant='secondary'
                      small
                      flex
                      onPress={() => setSelected(selected.size === assets.length ? new Set() : new Set(assets.map((a) => a._id)))}
                    />
                    <Button
                      title={`Delete ${selected.size || ''}`.trim()}
                      variant='danger'
                      small
                      flex
                      disabled={!selected.size}
                      onPress={() => setConfirmDelete([...selected])}
                    />
                    <Button title='Done' variant='ghost' small onPress={() => (setSelecting(false), setSelected(new Set()))} />
                  </>
                ) : (
                  <Button title='Select' variant='secondary' small onPress={() => setSelecting(true)} />
                )}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          library.isLoading ? (
            <Loading />
          ) : library.isError ? (
            <LoadError error={library.error} onRetry={library.refetch} />
          ) : (
            <Empty icon='images-outline' title='Your library is empty' message='Upload images, videos and documents to reuse them in posts.' action={{ label: 'Upload', onPress: () => setUploadMenu(true) }} />
          )
        }
        renderItem={({ item }) =>
          layout === 'grid' ? (
            <GridItem
              asset={item}
              selecting={selecting}
              selected={selected.has(item._id)}
              onPress={() => (selecting ? toggle(item._id) : setPreview(item))}
            />
          ) : (
            <ListItem
              asset={item}
              selecting={selecting}
              selected={selected.has(item._id)}
              onPress={() => (selecting ? toggle(item._id) : setPreview(item))}
            />
          )
        }
      />

      <OptionsDrawer
        visible={uploadMenu}
        onClose={() => setUploadMenu(false)}
        title='Upload'
        options={[
          { value: 'media', label: 'Photos and videos', icon: <Icon name='images-outline' size={20} color={colors.text} /> },
          { value: 'files', label: 'Documents and other files', icon: <Icon name='document-outline' size={20} color={colors.text} /> },
        ]}
        onSelect={(value) => (value === 'media' ? pickMedia() : pickDocuments())}
      />

      <PreviewDrawer asset={preview} onClose={() => setPreview(null)} onDelete={(asset) => setConfirmDelete([asset._id])} />

      <ConfirmDrawer
        visible={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete && confirmDelete.length > 1 ? `Delete ${confirmDelete.length} files?` : 'Delete file?'}
        message="Posts that already use these files keep working, but they'll be gone from your library. This can't be undone."
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          if (!confirmDelete) return;
          await remove.mutateAsync(confirmDelete);
          setPreview(null);
        }}
      />
    </Page>
  );
}

function StorageMeter({ used, limit, plan }: { used: number; limit: number; plan: string }) {
  const colors = useColors();
  const percent = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <View style={{ gap: 6, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, color: colors.text }}>
          {formatBytes(used)} of {formatBytes(limit)} used
        </Text>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>{plan} plan</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfacePressed }}>
        <View style={{ width: `${percent}%`, height: '100%', backgroundColor: percent > 90 ? colors.danger : colors.primary }} />
      </View>
    </View>
  );
}

function Check({ selected }: { selected: boolean }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: selected ? colors.primary : '#FFFFFF',
        backgroundColor: selected ? colors.primary : 'rgba(0,0,0,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {selected ? <Icon name='checkmark' size={14} color='#FFFFFF' /> : null}
    </View>
  );
}

function Thumb({ asset, size }: { asset: MediaAsset; size?: number }) {
  const colors = useColors();
  const kind = assetKind(asset);
  if (kind === 'image') return <Image source={{ uri: asset.url }} style={size ? { width: size, height: size, borderRadius: radius.sm } : { flex: 1 }} contentFit='cover' />;
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed }, size ? { width: size, height: size, borderRadius: radius.sm } : { flex: 1 }]}>
      <Icon name={KIND_ICON[kind]} size={size ? size / 2 : 28} color={colors.textMuted} />
    </View>
  );
}

function GridItem({ asset, selecting, selected, onPress }: { asset: MediaAsset; selecting: boolean; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={asset.name}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flex: 1 / 3, maxWidth: '32%', aspectRatio: 1, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface }}
    >
      <Thumb asset={asset} />
      {selecting ? (
        <View style={{ position: 'absolute', top: 6, right: 6 }}>
          <Check selected={selected} />
        </View>
      ) : null}
    </Pressable>
  );
}

function ListItem({ asset, selecting, selected, onPress }: { asset: MediaAsset; selecting: boolean; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.surface }}
    >
      <Thumb asset={asset} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, color: colors.text }}>
          {asset.name}
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>
          {[asset.size ? formatBytes(asset.size) : null, shortDate(asset.createdAt), asset.source === 'generated' ? 'Generated' : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {selecting ? <Check selected={selected} /> : null}
    </Pressable>
  );
}

function PreviewDrawer({ asset, onClose, onDelete }: { asset: MediaAsset | null; onClose: () => void; onDelete: (asset: MediaAsset) => void }) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kind = asset ? assetKind(asset) : 'file';

  const download = async () => {
    if (!asset) return;
    setBusy(true);
    setError('');
    try {
      await shareRemoteFile(asset.url, asset.name);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      visible={!!asset}
      onClose={onClose}
      title={asset?.name}
      tall
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title='Download' variant='secondary' flex loading={busy} onPress={download} />
          <Button title='Delete' variant='danger' flex onPress={() => asset && onDelete(asset)} />
        </View>
      }
    >
      <Banner message={error} />
      {asset && kind === 'image' ? (
        <Image source={{ uri: asset.url }} style={{ height: 320, borderRadius: radius.md }} contentFit='contain' />
      ) : asset && kind === 'video' ? (
        <VideoPreview url={asset.url} />
      ) : (
        <View style={{ height: 160, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surface }}>
          <Icon name={KIND_ICON[kind]} size={48} color={colors.textMuted} />
        </View>
      )}
      {asset ? (
        <View style={{ gap: space.xs }}>
          <Detail label='Size' value={asset.size ? formatBytes(asset.size) : '—'} />
          {asset.width && asset.height ? <Detail label='Dimensions' value={`${asset.width} × ${asset.height}`} /> : null}
          {asset.duration ? <Detail label='Duration' value={`${Math.round(asset.duration)}s`} /> : null}
          <Detail label='Added' value={shortDate(asset.createdAt)} />
          <Detail label='Source' value={asset.source === 'generated' ? 'Generated with AI' : 'Uploaded'} />
        </View>
      ) : null}
    </Drawer>
  );
}

function VideoPreview({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView player={player} style={{ height: 320, borderRadius: radius.md }} nativeControls contentFit='contain' />;
}

function Detail({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 14, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 14, color: colors.text }}>{value}</Text>
    </View>
  );
}
