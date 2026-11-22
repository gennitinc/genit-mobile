import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PullRefresh } from '@/components/pull-refresh';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';

import { BarList } from '@/components/charts';
import { Avatar, Card, Empty, IconButton, LoadError, Loading, Page, Pill, Row, SectionTitle, Stat } from '@/components/kit';
import { Banner, Button } from '@/components/ui';
import { creatorKeys, embedCode, getEnrollment, getStats, joinProgram, qrImageUrl } from '@/features/creator/creator-api';
import { errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/config';
import { shareRemoteFile } from '@/lib/files';
import { money } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';

const STEPS = [
  {
    title: 'Join with your Genit account',
    description: 'You get a personal referral link and a dashboard showing sign-ups and earnings.',
  },
  {
    title: 'Share Genit honestly',
    description: 'Tutorials, reviews, or a mention to your clients. Show what you actually use it for.',
  },
  {
    title: 'Earn on paid plans',
    description: 'You earn a 20% commission every month that someone you referred stays on a paid plan.',
  },
];

export default function CreatorScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const enrollment = useQuery({ queryKey: creatorKeys.status, queryFn: getEnrollment });
  const stats = useQuery({ queryKey: creatorKeys.stats, queryFn: getStats, enabled: enrollment.data === true });
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const join = useMutation({
    mutationFn: joinProgram,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['creator'] }),
    onError: (caught) => setError(errorMessage(caught)),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['creator'] });

  const copy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const run = (action: () => Promise<unknown>) => {
    setError('');
    action().catch((caught) => setError(errorMessage(caught)));
  };

  const body = () => {
    if (enrollment.isLoading) return <Loading />;
    if (enrollment.isError) return <LoadError error={enrollment.error} onRetry={enrollment.refetch} />;

    if (!enrollment.data) {
      return (
        <View style={{ gap: space.lg }}>
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
            If you make content for founders, marketers, or small businesses, or you recommend tools to clients, you can earn a
            recurring share of the subscriptions you refer.
          </Text>
          {STEPS.map((step, index) => (
            <View key={step.title} style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.selectedText }}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{step.title}</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textMuted }}>{step.description}</Text>
              </View>
            </View>
          ))}
          <Button title='Join the program' loading={join.isPending} onPress={() => join.mutate()} />
          <Button title='Read the terms' variant='ghost' small onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/legal/terms-of-service`)} />
        </View>
      );
    }

    if (stats.isLoading) return <Loading />;
    // Unlike the web dashboard, a failed load shows an error, never sample numbers.
    if (stats.isError || !stats.data) return <LoadError error={stats.error} onRetry={stats.refetch} />;
    const s = stats.data;

    return (
      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Stat label='Total revenue' value={money(s.totalRevenue)} hint={s.revenueChange ? `${s.revenueChange > 0 ? '+' : ''}${s.revenueChange}% from last month` : undefined} />
          <Stat label='Supporters' value={s.totalSupporters} hint={`${s.activeSupporters} active · ${s.expiringSupporters} expiring`} />
          <Stat label='Revenue share' value={`${s.revenueShare}%`} hint='Earned on every supported plan' />
        </View>

        <Card>
          <SectionTitle title='Share your link' />
          <Text selectable style={{ fontSize: 14, color: colors.text }}>
            {s.referralLink}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title={copied === 'link' ? 'Copied' : 'Copy link'} small flex onPress={() => run(() => copy(s.referralLink, 'link'))} />
            <Button title='Share' variant='secondary' small flex onPress={() => run(() => Share.share({ message: `Join me on Genit: ${s.referralLink}`, url: s.referralLink }))} />
          </View>
          <View style={{ alignItems: 'center', gap: space.sm, paddingTop: space.sm }}>
            <Image
              source={{ uri: qrImageUrl(s.referralLink) }}
              style={{ width: 180, height: 180, borderRadius: radius.sm, backgroundColor: '#FFFFFF' }}
              accessibilityLabel='QR code for your referral link'
            />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title='Save QR code' variant='secondary' small onPress={() => run(() => shareRemoteFile(qrImageUrl(s.referralLink), 'genit-referral-qr.png'))} />
              <Button title={copied === 'embed' ? 'Copied' : 'Copy embed'} variant='secondary' small onPress={() => run(() => copy(embedCode(s.referralLink), 'embed'))} />
            </View>
          </View>
        </Card>

        {s.totalSupporters > 0 ? (
          <Card>
            <SectionTitle title='Supporters' />
            <BarList
              items={[
                { label: 'Supporting more than 7 days', value: s.activeSupporters },
                { label: 'Expiring within 7 days', value: s.expiringSupporters },
              ]}
            />
          </Card>
        ) : null}

        <View style={{ gap: space.sm }}>
          <SectionTitle title='Top supporters' />
          {s.referredUsers.length === 0 ? (
            <Empty icon='people-outline' title='No supporters yet' message='Share your link to start earning.' />
          ) : (
            <View style={{ marginHorizontal: -space.page }}>
              {s.referredUsers.map((person) => (
                <Row
                  key={person._id}
                  title={person.username}
                  subtitle={`${person.daysActive} day${person.daysActive === 1 ? '' : 's'} active`}
                  leading={<Avatar uri={person.userdp} name={person.username} size={36} />}
                  trailing={<Pill label={person.isActive ? 'Active' : 'New'} tone={person.isActive ? 'success' : 'neutral'} />}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <Page
      title={enrollment.data ? 'Creator dashboard' : 'Creators Program'}
      back={() => router.back()}
      actions={enrollment.data ? <IconButton icon='refresh' label='Refresh' busy={stats.isFetching} onPress={() => void refresh()} /> : undefined}
    >
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.lg }}
        refreshControl={<PullRefresh onRefresh={refresh} />}
      >
        <Banner message={error} />
        {body()}
      </ScrollView>
    </Page>
  );
}
