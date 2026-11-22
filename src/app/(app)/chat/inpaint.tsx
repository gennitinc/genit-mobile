import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image as NativeImage, KeyboardAvoidingView, PanResponder, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { Chip, IconButton, Page } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { inpaint } from '@/features/chat/chat-api';
import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';
import { useQueryClient } from '@tanstack/react-query';

type Stroke = { width: number; points: { x: number; y: number }[] };

const BRUSHES = [
  { label: 'Small', width: 14 },
  { label: 'Medium', width: 28 },
  { label: 'Large', width: 48 },
];

function pathOf(stroke: Stroke) {
  return stroke.points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

/**
 * Paint over the part of a design to change, describe the change, and Genit
 * repaints only that area. The painted area becomes a black-and-white mask
 * the size of the image, which is what the server expects.
 */
export default function InpaintScreen() {
  const { projectId, imageUrl, groupId } = useLocalSearchParams<{ projectId: string; imageUrl: string; groupId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { width: screenWidth } = useWindowDimensions();
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [brush, setBrush] = useState(BRUSHES[1].width);
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mask = useRef<ComponentRef<typeof View>>(null);
  const brushRef = useRef(brush);
  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);

  useEffect(() => {
    NativeImage.getSize(
      imageUrl,
      (width, height) => setNatural({ width, height }),
      () => setError("Couldn't load this image.")
    );
  }, [imageUrl]);

  const canvas = useMemo(() => {
    if (!natural) return null;
    const width = screenWidth - space.xl * 2;
    const height = Math.min(width * (natural.height / natural.width), 460);
    return { width: height < width * (natural.height / natural.width) ? height * (natural.width / natural.height) : width, height };
  }, [natural, screenWidth]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          const { locationX: x, locationY: y } = event.nativeEvent;
          setStrokes((current) => [...current, { width: brushRef.current, points: [{ x, y }] }]);
        },
        onPanResponderMove: (event) => {
          const { locationX: x, locationY: y } = event.nativeEvent;
          setStrokes((current) => {
            if (!current.length) return current;
            const last = current[current.length - 1];
            return [...current.slice(0, -1), { ...last, points: [...last.points, { x, y }] }];
          });
        },
      }),
    []
  );

  const apply = async () => {
    if (!natural || !strokes.length || !prompt.trim()) return;
    setSaving(true);
    setError('');
    try {
      const maskUri = await captureRef(mask as never, { format: 'png', result: 'tmpfile', width: natural.width, height: natural.height });
      const response = await inpaint(projectId, { imageUrl, maskUri, prompt: prompt.trim(), generationGroupId: groupId });
      if (!response.success) throw new Error(response.message || "Couldn't apply the edit.");
      queryClient.invalidateQueries({ queryKey: ['chat', 'project', projectId] });
      router.back();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title='Edit an area'
      back={() => router.back()}
      actions={
        <>
          <IconButton icon='arrow-undo-outline' label='Undo' onPress={() => setStrokes((current) => current.slice(0, -1))} />
          <IconButton icon='refresh' label='Clear' onPress={() => setStrokes([])} />
        </>
      }
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} scrollEnabled={false} contentContainerStyle={{ paddingHorizontal: space.page, gap: space.lg }} keyboardShouldPersistTaps='handled'>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>Paint over what you want to change, then describe the change.</Text>
          <Banner message={error} />
          {canvas ? (
            <View style={{ alignSelf: 'center', width: canvas.width, height: canvas.height }}>
              {/* The mask sits behind the image: black, with the painted area in white. */}
              <View ref={mask} collapsable={false} style={{ position: 'absolute', width: canvas.width, height: canvas.height, backgroundColor: '#000000' }}>
                <Svg width={canvas.width} height={canvas.height}>
                  {strokes.map((stroke, index) => (
                    <Path key={index} d={pathOf(stroke)} stroke='#FFFFFF' strokeWidth={stroke.width} strokeLinecap='round' strokeLinejoin='round' fill='none' />
                  ))}
                </Svg>
              </View>
              <NativeImage source={{ uri: imageUrl }} style={{ position: 'absolute', width: canvas.width, height: canvas.height, borderRadius: radius.sm }} resizeMode='contain' />
              <View {...responder.panHandlers} style={{ position: 'absolute', width: canvas.width, height: canvas.height }}>
                <Svg width={canvas.width} height={canvas.height} pointerEvents='none'>
                  {strokes.map((stroke, index) => (
                    <Path key={index} d={pathOf(stroke)} stroke={colors.primary} strokeOpacity={0.55} strokeWidth={stroke.width} strokeLinecap='round' strokeLinejoin='round' fill='none' />
                  ))}
                </Svg>
              </View>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {BRUSHES.map((option) => (
              <Chip key={option.label} label={option.label} active={brush === option.width} onPress={() => setBrush(option.width)} />
            ))}
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: space.page, paddingTop: space.md, paddingBottom: Math.max(insets.bottom, space.md), gap: space.md }}>
          <Field label='What should change?' placeholder='e.g. Make the sky a sunset' value={prompt} onChangeText={setPrompt} />
          <Button title='Apply edit' loading={saving} disabled={!strokes.length || prompt.trim().length < 2 || !natural} onPress={apply} />
        </View>
      </KeyboardAvoidingView>
    </Page>
  );
}
