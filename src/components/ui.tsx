import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Icon } from './icon';
import { Image } from 'expo-image';
import { type ComponentRef, type ReactNode, type Ref, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, space, useColors } from '@/lib/theme';

import { useInDrawer } from './drawer-context';

export type TextInputRef = ComponentRef<typeof TextInput>;

type ScreenProps = {
  children: ReactNode;
  /** Pinned below the scrolling content, above the keyboard. */
  footer?: ReactNode;
  /** Rendered above the scrolling content. */
  header?: ReactNode;
  centered?: boolean;
  /** A navigation header already clears the top of the screen. */
  underHeader?: boolean;
};

export function Screen({ children, footer, header, centered, underHeader }: ScreenProps) {
  const colors = useColors();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={underHeader ? ['bottom'] : ['top', 'bottom']}
    >
      {header}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='interactive'
          contentContainerStyle={{
            flexGrow: 1,
            padding: space.page,
            gap: space.lg,
            justifyContent: centered ? 'center' : 'flex-start',
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            style={{
              paddingHorizontal: space.page,
              paddingVertical: space.md,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Logo({ size = 56 }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/logo.png')}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
      accessibilityLabel='Genit logo'
    />
  );
}

export function Heading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: space.sm }}>
      <Text
        accessibilityRole='header'
        style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.text }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textMuted }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  flex?: boolean;
  /** Compact height for toolbars and inline actions. */
  small?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  flex,
  small,
}: ButtonProps) {
  const colors = useColors();
  const inactive = disabled || loading;
  const foreground = {
    primary: colors.onPrimary,
    secondary: colors.text,
    ghost: colors.textMuted,
    danger: colors.danger,
    dangerSolid: '#FFFFFF',
  }[variant];
  const solid = variant === 'primary' || variant === 'dangerSolid';
  const solidColor = variant === 'dangerSolid' ? colors.danger : colors.primary;

  return (
    <Pressable
      accessibilityRole='button'
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: flex ? 1 : undefined,
        height: small ? 36 : 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.sm,
        paddingHorizontal: small ? space.md : space.lg,
        borderRadius: radius.md,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: colors.borderStrong,
        opacity: disabled ? 0.45 : 1,
        backgroundColor: solid
          ? pressed && variant === 'primary'
            ? colors.primaryPressed
            : solidColor
          : pressed
            ? colors.surfacePressed
            : 'transparent',
      })}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon}
          <Text style={{ fontSize: small ? 14 : 16, fontWeight: '600', color: foreground }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

type TextLinkProps = {
  title: string;
  prefix?: string;
  onPress: () => void;
  disabled?: boolean;
};

export function TextLink({ title, prefix, onPress, disabled }: TextLinkProps) {
  const colors = useColors();

  let questionPrefix = prefix;
  let linkTitle = title;
  if (!questionPrefix && title.includes('? ')) {
    const qIndex = title.indexOf('? ');
    questionPrefix = title.slice(0, qIndex + 1);
    linkTitle = title.slice(qIndex + 2);
  }

  return (
    <Pressable
      accessibilityRole='button'
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={{ alignSelf: 'center', opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ fontSize: 15, fontWeight: '600' }}>
        {questionPrefix ? (
          <Text style={{ color: colors.text, fontWeight: '500' }}>
            {questionPrefix}{' '}
          </Text>
        ) : null}
        <Text style={{ color: colors.primary }}>{linkTitle}</Text>
      </Text>
    </Pressable>
  );
}

export function Banner({ message, tone = 'error' }: { message?: string; tone?: 'error' | 'success' }) {
  const colors = useColors();
  if (!message) return null;
  const error = tone === 'error';
  return (
    <View
      accessibilityLiveRegion='polite'
      accessibilityRole='alert'
      style={{
        flexDirection: 'row',
        gap: space.sm,
        padding: space.md,
        borderRadius: radius.md,
        backgroundColor: error ? colors.dangerSurface : colors.successSurface,
      }}
    >
      <Icon
        name={error ? 'alert-circle' : 'checkmark-circle'}
        size={18}
        color={error ? colors.danger : colors.success}
      />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: error ? colors.danger : colors.success }}>
        {message}
      </Text>
    </View>
  );
}

type FieldProps = TextInputProps & {
  label?: string;
  error?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  ref?: Ref<TextInputRef>;
};

export function Field({ label, error, leading, trailing, ref, multiline, ...input }: FieldProps) {
  const colors = useColors();
  // Inside a drawer the sheet must know about the input to move above the keyboard.
  const Input = (useInDrawer() ? BottomSheetTextInput : TextInput) as typeof TextInput;
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{label}</Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: space.sm,
          minHeight: 52,
          paddingHorizontal: space.md,
          borderWidth: 1,
          borderRadius: radius.md,
          backgroundColor: colors.background,
          borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
        }}
      >
        {leading}
        <Input
          ref={ref}
          multiline={multiline}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          accessibilityLabel={label ?? input.placeholder}
          {...input}
          onFocus={(event) => {
            setFocused(true);
            input.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            input.onBlur?.(event);
          }}
          style={{
            flex: 1,
            fontSize: 16,
            color: colors.text,
            paddingVertical: multiline ? space.md : 0,
            minHeight: multiline ? 88 : undefined,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
        {trailing}
      </View>
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
    </View>
  );
}

export function PasswordField(props: FieldProps) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  return (
    <Field
      {...props}
      secureTextEntry={!visible}
      autoCapitalize='none'
      autoCorrect={false}
      trailing={
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible((value) => !value)}
          hitSlop={10}
        >
          <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
        </Pressable>
      }
    />
  );
}

export function Divider({ label }: { label: string }) {
  const colors = useColors();
  const line = <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {line}
      <Text style={{ fontSize: 12, color: colors.textFaint, textTransform: 'uppercase' }}>{label}</Text>
      {line}
    </View>
  );
}

const OTP_LENGTH = 6;

type OtpInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** One real input stretched over six boxes, so paste and iOS code autofill just work. */
export function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  const colors = useColors();
  const input = useRef<TextInputRef>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {Array.from({ length: OTP_LENGTH }, (_, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              height: 56,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: focused && index === activeIndex ? 2 : 1,
              borderRadius: radius.md,
              borderColor: focused && index === activeIndex ? colors.primary : colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ fontSize: 22, fontWeight: '600', color: colors.text }}>{value[index]}</Text>
          </View>
        ))}
      </View>
      <TextInput
        ref={input}
        value={value}
        autoFocus
        // Stays editable while busy: disabling it would drop focus and the keyboard.
        onChangeText={(text) => {
          if (!disabled) onChange(text.replace(/\D/g, '').slice(0, OTP_LENGTH));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType='number-pad'
        textContentType='oneTimeCode'
        autoComplete='one-time-code'
        maxLength={OTP_LENGTH}
        accessibilityLabel='6-digit code'
        caretHidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.02,
          color: 'transparent',
        }}
      />
    </View>
  );
}
