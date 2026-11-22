import { Icon } from '@/components/icon';
import { PullRefresh } from '@/components/pull-refresh';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { IconButton, LoadError, Loading, OrgLogo, Page, Pill, Row } from '@/components/kit';
import { Banner, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { currentOrganization, deleteOrganization, switchOrganization, useOrganizations } from '@/features/orgs/orgs-api';
import { errorMessage } from '@/lib/api';
import type { Organization } from '@/lib/types';
import { space, useColors } from '@/lib/theme';

/**
 * Every organization you own or belong to. Tap one to switch: the whole app
 * (and the web, which reads the same setting) then works in that organization.
 */
export default function OrganizationsScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const current = currentOrganization(user);
  const organizations = useOrganizations();
  const [switching, setSwitching] = useState<string | null>(null);
  const [menu, setMenu] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [error, setError] = useState('');
  const paid = !!user?.userPlan && user.userPlan !== 'Basic';

  const switchTo = async (org: Organization) => {
    if (org._id === current?._id || switching) return;
    setSwitching(org._id);
    setError('');
    try {
      await switchOrganization(org._id);
      // Everything cached belongs to the previous organization.
      queryClient.clear();
      await refreshUser();
      router.dismissTo('/home');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSwitching(null);
    }
  };

  const list = organizations.data ?? [];

  return (
    <Page title='Organizations' subtitle={current ? `Working in ${current.businessName}` : undefined} back={() => router.back()}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.xxl, gap: space.lg }}
        refreshControl={<PullRefresh onRefresh={() => organizations.refetch()} />}
      >
        <View style={{ paddingHorizontal: space.page, gap: space.md }}>
          <Banner message={error} />
          <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textMuted }}>
            Each organization has its own brand, posts, inbox, plugins and chats. Switching here switches the web app too.
          </Text>
        </View>

        {organizations.isLoading ? (
          <Loading />
        ) : organizations.isError ? (
          <LoadError error={organizations.error} onRetry={organizations.refetch} />
        ) : (
          <View>
            {list.map((org) => {
              const isCurrent = org._id === current?._id;
              return (
                <Row
                  key={org._id}
                  title={org.businessName}
                  subtitle={[org.businessPlan, org.owner === user?._id ? 'Owner' : 'Member'].filter(Boolean).join(' · ')}
                  leading={<OrgLogo uri={org.businessLogo} name={org.businessName} size={40} />}
                  trailing={
                    switching === org._id ? (
                      <ActivityIndicator />
                    ) : isCurrent ? (
                      <Pill label='Current' tone='success' />
                    ) : (
                      <IconButton icon='ellipsis-horizontal' label={`Options for ${org.businessName}`} onPress={() => setMenu(org)} />
                    )
                  }
                  onPress={() => switchTo(org)}
                />
              );
            })}
          </View>
        )}

        <View style={{ paddingHorizontal: space.page, gap: space.sm }}>
          <Button
            title='Create organization'
            variant='secondary'
            disabled={!paid}
            icon={<Icon name='add' size={20} color={colors.text} />}
            onPress={() => router.push('/organizations/new')}
          />
          {!paid ? <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>More organizations need a paid plan.</Text> : null}
          {current ? <Button title={`Edit ${current.businessName}’s brand`} variant='ghost' onPress={() => router.push('/brand')} /> : null}
        </View>
      </ScrollView>

      <OptionsDrawer
        visible={!!menu}
        onClose={() => setMenu(null)}
        title={menu?.businessName ?? 'Organization'}
        options={[
          { value: 'switch', label: 'Switch to this organization', icon: <Icon name='swap-horizontal' size={22} color={colors.text} /> },
          ...(menu?.owner === user?._id
            ? [{ value: 'delete' as const, label: 'Delete organization', icon: <Icon name='trash-outline' size={22} color={colors.danger} /> }]
            : []),
        ]}
        onSelect={(action) => {
          const org = menu;
          if (!org) return;
          if (action === 'switch') void switchTo(org);
          if (action === 'delete') setDeleting(org);
        }}
      />
      <ConfirmDrawer
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.businessName ?? 'this organization'}?`}
        message="Its brand, posts, inbox, plugins and chats are deleted for everyone in it. This can't be undone."
        confirmLabel='Delete'
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await deleteOrganization(deleting._id);
          await Promise.all([organizations.refetch(), refreshUser()]);
        }}
      />
    </Page>
  );
}
