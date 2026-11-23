import {
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  useBottomSheet,
} from '@gorhom/bottom-sheet';
import { Icon } from './icon';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

import { InDrawerContext } from './drawer-context';
import { Banner, Button } from './ui';


type DrawerProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pinned under the scrolling content, e.g. Save / Cancel. */
  footer?: ReactNode;
  /** Opens nearly full height, for long forms and lists. */
  tall?: boolean;
  /** Content handles its own scrolling (e.g. a list). */
  noScroll?: boolean;
  /** Content takes its own drags (a canvas, a live page): only the handle moves the sheet. */
  lockContent?: boolean;
};

/**
 * The dimmed layer behind a drawer; tapping it closes the drawer. Unlike the library's backdrop,
 * it lets taps through as soon as the drawer starts closing, so the screen behind (like the
 * button that opened the drawer) answers straight away instead of ~300ms later.
 */
function DrawerBackdrop({ animatedIndex, style }: BottomSheetBackdropProps) {
  const { close } = useBottomSheet();
  const [touchable, setTouchable] = useState(false);
  useAnimatedReaction(
    () => animatedIndex.value > -0.1,
    (now, before) => {
      if (now !== before) runOnJS(setTouchable)(now);
    }
  );
  const fade = useAnimatedStyle(() => ({ opacity: interpolate(animatedIndex.value, [-1, 0], [0, 0.5], Extrapolation.CLAMP) }));
  return (
    <Animated.View pointerEvents={touchable ? 'auto' : 'none'} style={[style, { backgroundColor: '#000000' }, fade]}>
      <Pressable accessibilityLabel='Close' style={StyleSheet.absoluteFill} onPress={() => close()} />
    </Animated.View>
  );
}

/**
 * The app's only dialog surface. Every picker, form, detail view and
 * confirmation is a drawer that slides up from the bottom; nothing uses a modal.
 */
export function Drawer({ visible, onClose, title, children, footer, tall, noScroll, lockContent }: DrawerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheetModal>(null);

  const presented = useRef(false);
  // True from the moment the sheet starts sliding away until it has fully closed.
  const dismissing = useRef(false);
  // An open asked for while the old sheet is still sliding away; shown once it has closed.
  const reopen = useRef(false);

  useEffect(() => {
    if (visible) {
      presented.current = true;
      if (dismissing.current) {
        reopen.current = true;
        // onDismiss normally shows it once the old sheet is gone; never leave it waiting longer.
        const timer = setTimeout(() => {
          if (!reopen.current || !presented.current) return;
          reopen.current = false;
          dismissing.current = false;
          ref.current?.present();
        }, 700);
        return () => clearTimeout(timer);
      }
      ref.current?.present();
    } else if (presented.current) {
      // Dismissing a sheet that was never presented leaves the library stuck
      // in "dismissing", and it then refuses to show the sheet at all.
      presented.current = false;
      reopen.current = false;
      // Closing by the screen (the X, a picked option, Save) slides away too; an open asked for
      // meanwhile must wait for onDismiss, or the library ignores it.
      dismissing.current = true;
      ref.current?.dismiss();
    }
  }, [visible]);


  const titleRow = title ? (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.page,
        paddingBottom: space.md,
      }}
    >
      <Text accessibilityRole='header' style={{ flex: 1, fontSize: 18, fontWeight: '700', color: colors.text }}>
        {title}
      </Text>
      <Pressable accessibilityRole='button' accessibilityLabel='Close' onPress={onClose} hitSlop={12}>
        <Icon name='close' size={24} color={colors.textMuted} />
      </Pressable>
    </View>
  ) : null;

  // The handle and footer are measured by the sheet, so a drawer sized to its
  // content leaves room for the title and the pinned footer.
  const handle = () => (
    <View style={{ paddingTop: 10 }}>
      <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: space.md, backgroundColor: colors.borderStrong }} />
      {titleRow}
    </View>
  );

  const footerBar = footer ? (
    <View
      style={{
        paddingHorizontal: space.page,
        paddingTop: space.md,
        paddingBottom: insets.bottom + space.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      {footer}
    </View>
  ) : null;

  const pinnedFooter =
    footer && !noScroll ? (props: BottomSheetFooterProps) => <BottomSheetFooter {...props}>{footerBar}</BottomSheetFooter> : undefined;

  return (
    <BottomSheetModal
      ref={ref}
      enableContentPanningGesture={!lockContent}
      onAnimate={(_from, to) => {
        if (to !== -1) return;
        dismissing.current = true;
        // Tell the screen the moment the sheet starts closing (swipe or backdrop), not when the
        // slide-out ends. Otherwise the screen still thinks it is open for ~300ms, and a tap that
        // reopens it (like the "…" button) changes nothing and is lost.
        if (presented.current) {
          presented.current = false;
          onClose();
        }
      }}
      onDismiss={() => {
        dismissing.current = false;
        if (reopen.current && presented.current) {
          reopen.current = false;
          ref.current?.present();
        } else if (presented.current) {
          // Closed without the early notice above; tell the screen now.
          presented.current = false;
          onClose();
        }
      }}
      enableDynamicSizing={!tall}
      snapPoints={tall ? ['92%'] : undefined}
      maxDynamicContentSize={undefined}
      backdropComponent={DrawerBackdrop}
      keyboardBehavior='interactive'
      keyboardBlurBehavior='restore'
      android_keyboardInputMode='adjustResize'
      backgroundStyle={{ backgroundColor: colors.background, borderRadius: radius.lg }}
      handleComponent={handle}
      footerComponent={pinnedFooter}
      topInset={insets.top}
    >
      <InDrawerContext.Provider value>
        {noScroll && !tall ? (
          // Sized to its content: the sheet can only measure children inside its own view.
          <BottomSheetView style={{ paddingBottom: footer ? 0 : insets.bottom }}>
            {children}
            {footerBar}
          </BottomSheetView>
        ) : noScroll ? (
          <View style={{ flex: 1, paddingBottom: footer ? 0 : insets.bottom }}>{children}</View>
        ) : (
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            enableFooterMarginAdjustment={!!footer}
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={{
              paddingHorizontal: space.page,
              paddingBottom: footer ? space.lg : insets.bottom + space.lg,
              gap: space.lg,
            }}
          >
            {children}
          </BottomSheetScrollView>
        )}
        {/* Drawers that scroll their own content keep the footer in the layout. */}
        {noScroll && tall ? footerBar : null}
      </InDrawerContext.Provider>
    </BottomSheetModal>
  );
}

type ConfirmDrawerProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  /** Red confirm button for deleting or other irreversible actions. */
  destructive?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
};

/** Replaces confirmation alerts. Stays open and shows the error if the action fails. */
export function ConfirmDrawer({
  visible,
  onClose,
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
}: ConfirmDrawerProps) {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      visible={visible}
      onClose={() => {
        setError('');
        onClose();
      }}
      title={title}
    >
      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textMuted }}>{message}</Text>
      <Banner message={error} />
      <View style={{ gap: space.sm }}>
        <Button
          title={confirmLabel}
          variant={destructive ? 'dangerSolid' : 'primary'}
          loading={busy}
          onPress={confirm}
        />
        <Button title='Cancel' variant='ghost' disabled={busy} onPress={onClose} />
      </View>
    </Drawer>
  );
}

export type DrawerOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
};

type OptionsDrawerProps<T extends string> = {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: DrawerOption<T>[];
  value?: T | T[];
  onSelect: (value: T) => void;
  /** Keeps the drawer open after a pick (multi-select). */
  stayOpen?: boolean;
};

/** A list of choices: the drawer version of a select or action menu. */
export function OptionsDrawer<T extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onSelect,
  stayOpen,
}: OptionsDrawerProps<T>) {
  const colors = useColors();
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <Drawer visible={visible} onClose={onClose} title={title}>
      <View style={{ marginHorizontal: -space.page }}>
        {options.map((option, index) => {
          const active = selected.includes(option.value);
          return (
            <View key={option.value}>
            {index ? <View style={{ height: 1, marginHorizontal: space.page, backgroundColor: colors.border, opacity: 0.3 }} /> : null}
            <Pressable
              accessibilityRole='button'
              accessibilityState={{ selected: active }}
              onPress={() => {
                onSelect(option.value);
                if (!stayOpen) onClose();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                minHeight: 52,
                paddingHorizontal: space.page,
                paddingVertical: space.sm,
                backgroundColor: pressed ? colors.surfacePressed : 'transparent',
              })}
            >
              {option.icon}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, color: colors.text }}>{option.label}</Text>
                {option.description ? (
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>{option.description}</Text>
                ) : null}
              </View>
              {active ? <Icon name='checkmark-circle' size={24} color={colors.success} accessibilityLabel='Selected' /> : null}
            </Pressable>
            </View>
          );
        })}
      </View>
    </Drawer>
  );
}
