import { Icon, type IconName } from '@/components/icon';
import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Drawer } from '@/components/drawer';
import { Banner, Button, Field } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';
import type { SocialPlatform } from '@/lib/types';

import { pickAndUploadLogo } from './onboarding-api';


export const SOCIALS: Record<
  SocialPlatform,
  { label: string; icon: IconName; color?: string; placeholder: string }
> = {
  facebook: { label: 'Facebook', icon: 'logo-facebook', color: '#0866FF', placeholder: 'facebook.com/yourpage' },
  instagram: { label: 'Instagram', icon: 'logo-instagram', color: '#E4405F', placeholder: 'instagram.com/yourbrand' },
  linkedin: { label: 'LinkedIn', icon: 'logo-linkedin', color: '#0A66C2', placeholder: 'linkedin.com/company/...' },
  youtube: { label: 'YouTube', icon: 'logo-youtube', color: '#FF0000', placeholder: 'youtube.com/@yourchannel' },
  twitter: { label: 'X / Twitter', icon: 'logo-x', placeholder: 'x.com/yourhandle' },
  tiktok: { label: 'TikTok', icon: 'logo-tiktok', placeholder: 'tiktok.com/@you' },
};

export function SocialField({
  platform,
  value,
  onChange,
}: {
  platform: SocialPlatform;
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  const meta = SOCIALS[platform];
  return (
    <Field
      value={value}
      onChangeText={onChange}
      placeholder={meta.placeholder}
      accessibilityLabel={meta.label}
      keyboardType='url'
      autoCapitalize='none'
      autoCorrect={false}
      leading={<Icon name={meta.icon} size={20} color={meta.color ?? colors.text} />}
    />
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function LogoPicker({ uri, onUploaded }: { uri: string; onUploaded: (url: string) => void }) {
  const colors = useColors();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const pick = async () => {
    setUploading(true);
    setError('');
    try {
      const url = await pickAndUploadLogo();
      if (url) onUploaded(url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  };

  // With a logo: a small tile beside a Change link, not a full-width banner.
  if (uri) {
    return (
      <View style={{ gap: space.sm }}>
        <Pressable
          accessibilityRole='button'
          accessibilityLabel='Change logo'
          disabled={uploading}
          onPress={pick}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.7 : 1 })}
        >
          <View
            style={{
              width: 64,
              height: 64,
              padding: 6,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              // White like the org logo tile, so dark or transparent logos stay visible.
              backgroundColor: '#FFFFFF',
            }}
          >
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Image source={{ uri }} contentFit='contain' style={{ width: '100%', height: '100%' }} />
            )}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text }}>Logo</Text>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>PNG or JPG, up to 5MB</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>{uploading ? 'Uploading…' : 'Change'}</Text>
        </Pressable>
        <Banner message={error} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={uri ? 'Change logo' : 'Upload logo'}
        disabled={uploading}
        onPress={pick}
        style={{
          height: 112,
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.xs,
          overflow: 'hidden',
          borderWidth: 1,
          borderStyle: uri ? 'solid' : 'dashed',
          borderRadius: radius.md,
          borderColor: colors.borderStrong,
          backgroundColor: colors.background,
        }}
      >
        {uploading ? (
          <ActivityIndicator color={colors.primary} />
        ) : uri ? (
          <Image source={{ uri }} contentFit='contain' style={{ width: '100%', height: '100%' }} />
        ) : (
          <>
            <Icon name='cloud-upload-outline' size={24} color={colors.textMuted} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>Upload your logo</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>PNG or JPG, up to 5MB</Text>
          </>
        )}
      </Pressable>
      <Banner message={error} />
    </View>
  );
}

const FONT_OPTIONS = [
  'Inter',
  'Montserrat',
  'Poppins',
  'Roboto',
  'Open Sans',
  'Lato',
  'Playfair Display',
  'Merriweather',
  'Raleway',
  'Nunito',
];

export function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const options = value && !FONT_OPTIONS.includes(value) ? [value, ...FONT_OPTIONS] : FONT_OPTIONS;

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ fontSize: 13, color: colors.textMuted }}>{label}</Text>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`${label} font: ${value || 'not selected'}`}
        onPress={() => setOpen(true)}
        style={{
          height: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.md,
          borderWidth: 1,
          borderRadius: radius.md,
          borderColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: value ? colors.text : colors.textFaint }}>
          {value || 'Select font'}
        </Text>
        <Icon name='chevron-down' size={16} color={colors.textMuted} />
      </Pressable>
      <Drawer title={`${label} font`} visible={open} onClose={() => setOpen(false)} tall>
        <View style={{ marginHorizontal: -space.page }}>
          {options.map((font) => (
            <Pressable
              key={font}
              accessibilityRole='button'
              accessibilityState={{ selected: font === value }}
              onPress={() => {
                onChange(font);
                setOpen(false);
              }}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                padding: space.lg,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 16, color: colors.text }}>{font}</Text>
              {font === value ? <Icon name='checkmark' size={20} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </View>
      </Drawer>
    </View>
  );
}

const SWATCHES = [
  '#4F46E5', '#2563EB', '#0891B2', '#059669', '#65A30D', '#CA8A04',
  '#EA580C', '#DC2626', '#DB2777', '#9333EA', '#0F172A', '#FFFFFF',
];
const MAX_COLORS = 6;
const HEX = /^#[0-9a-f]{6}$/i;

function ColorSheet({
  initial,
  onSave,
  onRemove,
  onClose,
}: {
  initial: string;
  onSave: (color: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [hex, setHex] = useState(initial);
  const valid = HEX.test(hex);

  return (
    <Drawer title={onRemove ? 'Edit color' : 'Add a color'} visible onClose={onClose} tall>
        <View style={{ height: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: valid ? hex : colors.surface }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {SWATCHES.map((swatch) => (
            <Pressable
              key={swatch}
              accessibilityRole='button'
              accessibilityLabel={`Use ${swatch}`}
              onPress={() => setHex(swatch)}
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: colors.borderStrong,
                backgroundColor: swatch,
              }}
            />
          ))}
        </View>
        <Field
          label='Hex code'
          value={hex}
          onChangeText={setHex}
          placeholder='#4F46E5'
          autoCapitalize='none'
          autoCorrect={false}
          maxLength={7}
          error={hex.length === 7 && !valid ? 'Use a color like #4F46E5' : undefined}
        />
        <Button title='Save color' disabled={!valid} onPress={() => onSave(hex.toUpperCase())} />
        {onRemove ? <Button title='Remove color' variant='danger' onPress={onRemove} /> : null}
    </Drawer>
  );
}

export function ColorEditor({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  const colors = useColors();
  // Index being edited, with values.length meaning a new color.
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {values.map((value, index) => (
        <Pressable
          key={`${value}-${index}`}
          accessibilityRole='button'
          accessibilityLabel={`Edit color ${value}`}
          onPress={() => setEditing(index)}
          style={{ alignItems: 'center', gap: space.xs }}
        >
          <View style={{ width: 48, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: value }} />
          <Text style={{ fontSize: 10, color: colors.textMuted }}>{value.toUpperCase()}</Text>
        </Pressable>
      ))}
      {values.length < MAX_COLORS ? (
        <Pressable
          accessibilityRole='button'
          accessibilityLabel='Add a color'
          onPress={() => setEditing(values.length)}
          style={{
            width: 48,
            height: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderRadius: radius.md,
            borderColor: colors.borderStrong,
          }}
        >
          <Icon name='add' size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {editing !== null ? (
        <ColorSheet
          initial={values[editing] ?? '#'}
          onClose={() => setEditing(null)}
          onSave={(color) => {
            const next = [...values];
            next[editing] = color;
            onChange(next);
            setEditing(null);
          }}
          onRemove={
            editing < values.length
              ? () => {
                  onChange(values.filter((_, index) => index !== editing));
                  setEditing(null);
                }
              : undefined
          }
        />
      ) : null}
    </View>
  );
}

export function TagEditor({
  values,
  onChange,
  placeholder,
  max,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  max?: number;
}) {
  const colors = useColors();
  const [draft, setDraft] = useState('');
  const atLimit = max !== undefined && values.length >= max;

  const add = () => {
    const value = draft.trim();
    setDraft('');
    if (value && !values.includes(value)) onChange([...values, value]);
  };

  return (
    <View style={{ gap: space.md }}>
      {values.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {values.map((value) => (
            <Pressable
              key={value}
              accessibilityRole='button'
              accessibilityLabel={`Remove ${value}`}
              onPress={() => onChange(values.filter((item) => item !== value))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.xs,
                paddingVertical: 6,
                paddingHorizontal: space.md,
                borderRadius: radius.full,
                backgroundColor: colors.selected,
              }}
            >
              <Text style={{ fontSize: 14, color: colors.selectedText }}>{value}</Text>
              <Icon name='close' size={14} color={colors.selectedText} />
            </Pressable>
          ))}
        </View>
      ) : null}
      {!atLimit ? (
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          returnKeyType='done'
          submitBehavior='submit'
          onSubmitEditing={add}
          trailing={
            draft.trim() ? (
              <Pressable accessibilityRole='button' accessibilityLabel='Add' onPress={add} hitSlop={10}>
                <Icon name='add-circle' size={24} color={colors.primary} />
              </Pressable>
            ) : null
          }
        />
      ) : null}
    </View>
  );
}
