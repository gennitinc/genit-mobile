import { Icon, type IconName } from './icon';
import { Image } from 'expo-image';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

import { Button, Field } from './ui';

export type { IconName };

/** A tab or stack screen with a large title and optional actions on the right. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Shows a back chevron (for pushed screens). */
  back?: () => void;
}) {
  const colors = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.page,
          paddingTop: space.sm,
          paddingBottom: space.md,
        }}
      >
        {back ? <IconButton icon='chevron-back' label='Back' onPress={back} /> : null}
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole='header'
            numberOfLines={1}
            style={{ fontSize: back ? 22 : 30, fontWeight: '700', letterSpacing: -0.5, color: colors.text }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={{ fontSize: 14, color: colors.textMuted }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actions ? <View style={{ flexDirection: 'row', gap: space.xs }}>{actions}</View> : null}
      </View>
      {children}
    </SafeAreaView>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
  disabled,
  busy,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        backgroundColor: pressed ? colors.surfacePressed : colors.surface,
      })}
    >
      {busy ? (
        <ActivityIndicator size='small' color={colors.textMuted} />
      ) : (
        <Icon name={icon} size={20} color={color ?? colors.text} />
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  count,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: ReactNode;
  count?: number;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 36,
        paddingHorizontal: space.md,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.selected : colors.background,
      }}
    >
      {icon}
      <Text style={{ fontSize: 14, fontWeight: active ? '600' : '400', color: active ? colors.selectedText : colors.text }}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text style={{ fontSize: 12, color: active ? colors.selectedText : colors.textMuted }}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

/** A horizontally scrolling row of chips that bleeds to the screen edges. */
export function ChipRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.page }}
      style={[{ flexGrow: 0 }, style]}
    >
      {children}
    </ScrollView>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityRole='tablist'
      style={{ flexDirection: 'row', padding: 3, borderRadius: radius.md, backgroundColor: colors.surface }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole='tab'
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              height: 36,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              borderRadius: radius.sm,
              backgroundColor: active ? colors.background : 'transparent',
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: active ? '600' : '500', color: active ? colors.text : colors.textMuted }}>
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <Text style={{ fontSize: 12, color: colors.textFaint }}>{option.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const colors = useColors();
  return (
    <Field
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      autoCapitalize='none'
      autoCorrect={false}
      returnKeyType='search'
      clearButtonMode='while-editing'
      leading={<Icon name='search' size={18} color={colors.textMuted} />}
    />
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const colors = useColors();
  const base: ViewStyle = { padding: space.lg, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.surface };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole='button'
      onPress={onPress}
      style={({ pressed }) => [base, style, pressed ? { backgroundColor: colors.surfacePressed } : null]}
    >
      {children}
    </Pressable>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text
        style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted }}
      >
        {title}
      </Text>
      {action}
    </View>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  const colors = useColors();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, gap: 2, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface }}>
      <Text style={{ fontSize: 13, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>{value}</Text>
      {hint ? <Text style={{ fontSize: 12, color: colors.textFaint }}>{hint}</Text> : null}
    </View>
  );
}

/**
 * A person's photo. Falls back to `fallbackUri` (e.g. their company's logo),
 * then to their initials, whenever a picture is missing or fails to load
 * (social profile links expire).
 */
export function Avatar({
  uri,
  fallbackUri,
  name,
  size = 40,
}: {
  uri?: string | null;
  fallbackUri?: string | null;
  name?: string | null;
  size?: number;
}) {
  const colors = useColors();
  const [failed, setFailed] = useState<string[]>([]);
  const source = [uri, fallbackUri].find((item): item is string => !!item && !failed.includes(item));
  if (source) {
    return (
      <Image
        source={{ uri: source }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FFFFFF' }}
        contentFit='cover'
        onError={() => setFailed((list) => [...list, source])}
      />
    );
  }
  const initials = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.selected,
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '600', color: colors.selectedText }}>{initials || '?'}</Text>
    </View>
  );
}

/**
 * An organization's logo: the whole logo fitted on a white rounded tile, so
 * dark or transparent logos stay visible in dark mode and wide ones aren't cropped.
 */
export function OrgLogo({ uri, name, size = 40 }: { uri?: string | null; name?: string | null; size?: number }) {
  const colors = useColors();
  const tile = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.26),
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  if (uri) {
    const inset = Math.round(size * 0.12);
    return (
      <View style={{ ...tile, backgroundColor: '#FFFFFF' }}>
        <Image source={{ uri }} style={{ width: size - inset * 2, height: size - inset * 2 }} contentFit='contain' accessibilityLabel={name ? `${name} logo` : undefined} />
      </View>
    );
  }
  const initials = (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return (
    <View style={{ ...tile, backgroundColor: colors.selected }}>
      <Text style={{ fontSize: size * 0.38, fontWeight: '600', color: colors.selectedText }}>{initials || '?'}</Text>
    </View>
  );
}

const PILL_TONES = {
  neutral: ['surfacePressed', 'textMuted'],
  primary: ['selected', 'selectedText'],
  success: ['successSurface', 'success'],
  danger: ['dangerSurface', 'danger'],
} as const;

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof PILL_TONES }) {
  const colors = useColors();
  const [background, foreground] = PILL_TONES[tone];
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full, backgroundColor: colors[background] }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors[foreground] }}>{label}</Text>
    </View>
  );
}

export function Row({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  onLongPress,
  destructive,
  spacious,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  destructive?: boolean;
  /** Taller rows with more room between them, for menus like More. */
  spacious?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: spacious ? 68 : 56,
        paddingHorizontal: space.page,
        paddingVertical: spacious ? space.md + 2 : space.sm,
        backgroundColor: pressed ? colors.surfacePressed : 'transparent',
      })}
    >
      {leading}
      <View style={{ flex: 1, gap: spacious ? 4 : 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, color: destructive ? colors.danger : colors.text }}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={{ fontSize: 13, color: colors.textMuted }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name='chevron-forward' size={18} color={colors.textFaint} /> : null)}
    </Pressable>
  );
}

export function Empty({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useColors();
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.page }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface }}>
        <Icon name={icon} size={26} color={colors.textMuted} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '600', textAlign: 'center', color: colors.text }}>{title}</Text>
      {message ? (
        <Text style={{ fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.textMuted }}>{message}</Text>
      ) : null}
      {action ? <Button title={action.label} small onPress={action.onPress} /> : null}
    </View>
  );
}

export function Loading() {
  const colors = useColors();
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Empty
      icon='cloud-offline-outline'
      title="Couldn't load this"
      message={errorMessage(error)}
      action={{ label: 'Try again', onPress: onRetry }}
    />
  );
}

/** A tappable value that opens a drawer, standing in for a select input. */
export function SelectField({
  label,
  value,
  placeholder = 'Select',
  onPress,
  error,
  leading,
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  onPress: () => void;
  error?: string;
  /** An icon or logo before the value, like a field's leading icon. */
  leading?: ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{label}</Text> : null}
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={`${label ?? placeholder}: ${value || 'not set'}`}
        onPress={onPress}
        style={{
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.md,
          borderWidth: 1,
          borderRadius: radius.md,
          borderColor: error ? colors.danger : colors.border,
          backgroundColor: colors.background,
        }}
      >
        {leading}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: value ? colors.text : colors.textFaint }}>
          {value || placeholder}
        </Text>
        <Icon name='chevron-down' size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole='switch'
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: disabled ? 0.5 : 1 }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
        {description ? <Text style={{ fontSize: 13, color: colors.textMuted }}>{description}</Text> : null}
      </View>
      <View
        style={{
          width: 48,
          height: 28,
          padding: 3,
          borderRadius: 14,
          justifyContent: 'center',
          alignItems: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? colors.primary : colors.borderStrong,
        }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' }} />
      </View>
    </Pressable>
  );
}
