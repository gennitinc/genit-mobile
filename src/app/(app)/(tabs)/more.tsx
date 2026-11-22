import { Icon } from '@/components/icon';
import { useTabBarSpace } from '@/components/glass-tab-bar';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { type IconName, OrgLogo, Page, Row, SectionTitle } from '@/components/kit';
import { useAuth } from '@/features/auth/auth-context';
import { currentOrganization, useOrganizations } from '@/features/orgs/orgs-api';
import { type AppearancePreference, setAppearance, useAppearancePreference } from '@/lib/appearance';
import { radius, space, useColors } from '@/lib/theme';

const SECTIONS: { title: string; subtitle: string; icon: IconName; href: Href }[] = [
  { title: 'Chat with Genit', subtitle: 'Ask, create and automate with AI agents', icon: 'sparkles-outline', href: '/chat' },
  { title: 'Pipeline', subtitle: 'Leads, bookings and your AI sales agent', icon: 'funnel-outline', href: '/pipeline' },
  { title: 'Campaigns', subtitle: 'Plans, outreach and results', icon: 'megaphone-outline', href: '/campaigns' },
  { title: 'Automation', subtitle: 'Workflows that run on their own', icon: 'git-network-outline', href: '/automation' },
  { title: 'Media library', subtitle: 'Uploads and generated media', icon: 'images-outline', href: '/library' },
  { title: 'Community', subtitle: 'Designs other creators published', icon: 'people-outline', href: '/community' },
  { title: 'Plugins', subtitle: 'Connected accounts and channels', icon: 'extension-puzzle-outline', href: '/plugins' },
  { title: 'History', subtitle: 'Your chats with Genit', icon: 'time-outline', href: '/history' },
  { title: 'Brand identity', subtitle: 'Logo, colors and voice Genit applies', icon: 'color-palette-outline', href: '/brand' },
  { title: 'Creator', subtitle: 'Earn by referring paid plans', icon: 'gift-outline', href: '/creator' },
];

const APPEARANCE: { value: AppearancePreference; label: string; description: string; icon: IconName }[] = [
  { value: 'system', label: 'System', description: 'Match your phone’s light or dark setting', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', description: 'Always light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', description: 'Always dark', icon: 'moon-outline' },
];

export default function MoreScreen() {
  const colors = useColors();
  const tabBarSpace = useTabBarSpace();
  // Softer than body text, so the icons don't compete with the labels.
  const iconColor = colors.textMuted;
  const { user, signOut, closeAccount } = useAuth();
  const org = currentOrganization(user);
  const organizations = useOrganizations();
  const [confirm, setConfirm] = useState<'signOut' | 'delete' | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const appearance = useAppearancePreference();
  const currentAppearance = APPEARANCE.find((option) => option.value === appearance) ?? APPEARANCE[0];

  return (
    <Page title='More'>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: tabBarSpace, gap: space.lg }}>
        <View style={{ paddingHorizontal: space.page, gap: space.md }}>
          <Pressable
            accessibilityRole='button'
            accessibilityHint='Switch or create organizations'
            onPress={() => router.push('/organizations')}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: pressed ? colors.surfacePressed : colors.surface })}
          >
            <OrgLogo uri={org?.businessLogo || user?.userdp} name={org?.businessName || user?.username} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
                {org?.businessName ?? 'Your workspace'}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 14, color: colors.textMuted }}>
                {user?.email}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Switch</Text>
              <Icon name='chevron-forward' size={16} color={colors.primary} />
            </View>
          </Pressable>
        </View>

        <View>
          <View style={{ paddingHorizontal: space.page, paddingBottom: space.xs }}>
            <SectionTitle title='Workspace' />
          </View>
          {SECTIONS.map((section, index) => (
            <View key={section.title}>
              {index ? <RowDivider /> : null}
              <Row
                spacious
                title={section.title}
                subtitle={section.subtitle}
                leading={<Icon name={section.icon} size={22} color={iconColor} />}
                onPress={() => router.push(section.href)}
              />
            </View>
          ))}
        </View>

        <View>
          <View style={{ paddingHorizontal: space.page, paddingBottom: space.xs }}>
            <SectionTitle title='Account' />
          </View>
          <Row
            spacious
            title='Organizations'
            subtitle={(organizations.data?.length ?? 0) > 1 ? `${organizations.data?.length} organizations · switch or create` : 'Switch or create organizations'}
            leading={<Icon name='swap-horizontal' size={22} color={iconColor} />}
            onPress={() => router.push('/organizations')}
          />
          <RowDivider />
          <Row
            spacious
            title='Appearance'
            subtitle={currentAppearance.label}
            leading={<Icon name={currentAppearance.icon} size={22} color={iconColor} />}
            onPress={() => setThemeOpen(true)}
          />
          <RowDivider />
          <Row spacious title='Sign out' leading={<Icon name='log-out-outline' size={22} color={iconColor} />} onPress={() => setConfirm('signOut')} />
          <RowDivider />
          <Row
            spacious
            title='Delete account'
            destructive
            leading={<Icon name='trash-outline' size={22} color={colors.danger} style={{ opacity: 0.8 }} />}
            onPress={() => setConfirm('delete')}
          />
        </View>
      </ScrollView>

      <OptionsDrawer
        visible={themeOpen}
        onClose={() => setThemeOpen(false)}
        title='Appearance'
        value={appearance}
        options={APPEARANCE.map((option) => ({
          value: option.value,
          label: option.label,
          description: option.description,
          icon: <Icon name={option.icon} size={22} color={iconColor} />,
        }))}
        onSelect={setAppearance}
      />
      <ConfirmDrawer
        visible={confirm === 'signOut'}
        onClose={() => setConfirm(null)}
        title='Sign out?'
        message='You’ll need to sign in again to use Genit on this device.'
        confirmLabel='Sign out'
        onConfirm={signOut}
      />
      <ConfirmDrawer
        visible={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title='Delete your account?'
        message='This permanently deletes your account and uploaded files. It can’t be undone.'
        confirmLabel='Delete account'
        destructive
        onConfirm={closeAccount}
      />
    </Page>
  );
}

/** A hairline between rows in a section, inset to line up with the labels. */
function RowDivider() {
  const colors = useColors();
  return <View style={{ height: 1, marginLeft: space.page + 22 + space.md, marginRight: space.page, backgroundColor: colors.border, opacity: 0.3 }} />;
}
