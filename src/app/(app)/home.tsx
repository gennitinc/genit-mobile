import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Banner, Button, Heading, Logo, Screen } from '@/components/ui';
import { onboardingRecord, useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

/** Where the app lands after onboarding, until the workspace screens are built. */
export default function HomeScreen() {
  const colors = useColors();
  const { user, signOut, closeAccount } = useAuth();
  const [busy, setBusy] = useState<'sign-out' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const onboarding = onboardingRecord(user);
  const brandLogo = onboarding?.brandLogo;

  const handleSignOut = async () => {
    setBusy('sign-out');
    await signOut();
  };

  const handleDelete = async () => {
    setBusy('delete');
    setError('');
    try {
      await closeAccount();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(null);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account and uploaded files. It can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: handleDelete },
      ]
    );

  return (
    <Screen
      footer={
        <View style={{ gap: space.xs }}>
          <Button
            title='Sign out'
            variant='secondary'
            loading={busy === 'sign-out'}
            disabled={!!busy}
            onPress={handleSignOut}
          />
          <Button
            title='Delete account'
            variant='danger'
            loading={busy === 'delete'}
            disabled={!!busy}
            onPress={confirmDelete}
          />
        </View>
      }
    >
      <Logo />
      <Heading
        title={`You're in, ${user?.username ?? 'there'}`}
        subtitle='Your account is ready. The rest of the Genit workspace is coming to mobile soon.'
      />
      <Banner message={error} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          padding: space.lg,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
        }}
      >
        {brandLogo ? (
          <Image
            source={{ uri: brandLogo }}
            contentFit='contain'
            style={{ width: 48, height: 48, borderRadius: radius.sm }}
          />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          {onboarding?.businessName ? (
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
              {onboarding.businessName}
            </Text>
          ) : null}
          <Text style={{ fontSize: 14, color: colors.textMuted }}>{user?.email}</Text>
        </View>
      </View>
    </Screen>
  );
}
