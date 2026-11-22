import { Icon } from '@/components/icon';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Drawer } from '@/components/drawer';
import { Empty, Loading } from '@/components/kit';
import { Banner, Button } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

import { assetKind, type MediaAsset, uploadToLibrary, useLibrary } from './library-api';

export type PickedMedia = { url: string; mimeType?: string };

/**
 * Pick images or videos from the workspace library, or upload new ones from
 * the camera roll. Uploads land in the library, so they can be reused.
 */
export function MediaPickerDrawer({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (media: PickedMedia[]) => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const library = useLibrary('visual', visible);
  const [selected, setSelected] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setSelected([]);
    setError('');
    onClose();
  };

  const toggle = (asset: MediaAsset) =>
    setSelected((current) =>
      current.some((item) => item._id === asset._id)
        ? current.filter((item) => item._id !== asset._id)
        : [...current, asset]
    );

  const upload = async () => {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.9,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      const uploaded: MediaAsset[] = [];
      for (const asset of result.assets) {
        const { asset: saved } = await uploadToLibrary({
          uri: asset.uri,
          name: asset.fileName ?? undefined,
          mimeType: asset.mimeType,
        });
        uploaded.push(saved);
      }
      setSelected((current) => [...current, ...uploaded]);
      await queryClient.invalidateQueries({ queryKey: ['library'] });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  };

  const assets = (library.data?.assets ?? []).filter((asset) => ['image', 'video'].includes(assetKind(asset)));

  return (
    <Drawer
      visible={visible}
      onClose={close}
      title='Add media'
      tall
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title='Upload' variant='secondary' flex loading={uploading} onPress={upload} />
          <Button
            title={selected.length ? `Add ${selected.length}` : 'Add'}
            flex
            disabled={!selected.length}
            onPress={() => {
              onPick(selected.map((asset) => ({ url: asset.url, mimeType: asset.mimeType })));
              close();
            }}
          />
        </View>
      }
    >
      <Banner message={error} />
      {library.isLoading ? (
        <Loading />
      ) : library.isError ? (
        <Banner message={errorMessage(library.error)} />
      ) : assets.length === 0 ? (
        <Empty icon='images-outline' title='No media yet' message='Upload photos or videos from your device.' />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {assets.map((asset) => {
            const index = selected.findIndex((item) => item._id === asset._id);
            const active = index >= 0;
            return (
              <Pressable
                key={asset._id}
                accessibilityRole='button'
                accessibilityLabel={`${asset.name}${active ? ', selected' : ''}`}
                accessibilityState={{ selected: active }}
                onPress={() => toggle(asset)}
                style={{
                  width: '31.5%',
                  aspectRatio: 1,
                  borderRadius: radius.sm,
                  overflow: 'hidden',
                  borderWidth: active ? 3 : 0,
                  borderColor: colors.primary,
                  backgroundColor: colors.surface,
                }}
              >
                {assetKind(asset) === 'image' ? (
                  <Image source={{ uri: asset.url }} style={{ flex: 1 }} contentFit='cover' />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name='videocam' size={28} color={colors.textMuted} />
                    <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted, paddingHorizontal: 4 }}>
                      {asset.name}
                    </Text>
                  </View>
                )}
                {active ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.primary,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{index + 1}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Drawer>
  );
}
