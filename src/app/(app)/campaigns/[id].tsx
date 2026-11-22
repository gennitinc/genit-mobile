import { Icon } from '@/components/icon';
import { PullRefresh } from '@/components/pull-refresh';
import { BrandLogo } from '@/components/brand-logo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Card, Empty, LoadError, Loading, Page, Pill, Row, SectionTitle, Segmented, Stat } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { CampaignOutreach } from '@/features/campaigns/campaign-outreach';
import {
  buildUtm,
  campaignKeys,
  exportReport,
  getAttribution,
  getCampaign,
  type GtmCampaign,
  readiness,
  recordConversion,
  runOptimizer,
  scheduleOptimizer,
  STATUS_TONE,
  updateCampaign,
} from '@/features/campaigns/campaigns-api';
import { fetchPosts } from '@/features/posts/posts-api';
import { errorMessage } from '@/lib/api';
import { API_URL } from '@/lib/config';
import { compactNumber, money, shortDate } from '@/lib/format';
import { platformMeta } from '@/lib/platforms';
import { openChatById, openNewChat } from '@/features/chat/navigate';
import { space, useColors } from '@/lib/theme';

type Tab = 'overview' | 'content' | 'performance' | 'outreach';

export default function CampaignScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');

  const campaign = useQuery({ queryKey: campaignKeys.detail(id), queryFn: () => getCampaign(id) });
  const posts = useQuery({ queryKey: ['social-posts', 'list', id], queryFn: () => fetchPosts(1, id).then((data) => data.posts) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: campaignKeys.all });

  const report = useMutation({
    mutationFn: () => exportReport(id),
    onSuccess: (result) => WebBrowser.openBrowserAsync(result.url),
    onError: (caught) => setError(errorMessage(caught)),
  });

  const ask = () => {
    const c = campaign.data;
    if (c?.chatId) openChatById(c.chatId);
    else openNewChat(`Help me improve the "${c?.name}" campaign.`);
  };

  if (campaign.isLoading) return <Page title='Campaign' back={() => router.back()}><Loading /></Page>;
  if (campaign.isError || !campaign.data) {
    return (
      <Page title='Campaign' back={() => router.back()}>
        <LoadError error={campaign.error} onRetry={campaign.refetch} />
      </Page>
    );
  }
  const c = campaign.data;
  const linked = posts.data ?? [];

  return (
    <Page title={c.name} subtitle={c.channels.join(', ')} back={() => router.back()}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.lg }}
        keyboardShouldPersistTaps='handled'
        refreshControl={<PullRefresh onRefresh={refresh} />}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
          <Pill label={c.status} tone={STATUS_TONE[c.status]} />
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            {[c.timeline, `Created ${shortDate(c.createdAt)}`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title='Ask Genit' variant='secondary' small flex onPress={ask} icon={<Icon name='sparkles' size={14} color={colors.text} />} />
          <Button title='Export PDF' variant='secondary' small flex loading={report.isPending} onPress={() => report.mutate()} />
        </View>
        <Banner message={error} />

        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'content', label: 'Content' },
            { value: 'performance', label: 'Results' },
            { value: 'outreach', label: 'Outreach' },
          ]}
        />

        {tab === 'overview' ? (
          <Overview campaign={c} linkedPosts={linked.length} onNavigate={setTab} />
        ) : tab === 'content' ? (
          <Card>
            <SectionTitle title={`Linked posts (${linked.length})`} />
            {posts.isLoading ? (
              <Loading />
            ) : linked.length === 0 ? (
              <Empty icon='images-outline' title='No posts linked yet' />
            ) : (
              <View style={{ marginHorizontal: -space.lg }}>
                {linked.map((post) => (
                  <Row
                    key={post._id}
                    title={post.title || post.content || 'Untitled post'}
                    subtitle={`${platformMeta(post.platform).label} · ${post.status}`}
                    leading={<BrandLogo platform={post.platform} size={22} />}
                    onPress={post.permalink ? () => WebBrowser.openBrowserAsync(post.permalink!) : undefined}
                  />
                ))}
              </View>
            )}
            <Button title='Create post' small onPress={() => router.push({ pathname: '/posts', params: { compose: '1', campaignId: c._id } })} />
          </Card>
        ) : tab === 'performance' ? (
          <Performance campaign={c} onChanged={refresh} />
        ) : (
          <CampaignOutreach campaign={c} onChanged={refresh} />
        )}
      </ScrollView>
    </Page>
  );
}

const NEXT_STEP = {
  content: { tab: 'content', copy: 'Link the first post to this campaign' },
  outreach: { tab: 'outreach', copy: 'Set up email or message outreach' },
  tracking: { tab: 'performance', copy: 'Start tracking conversions' },
} as const;

function Overview({ campaign, linkedPosts, onNavigate }: { campaign: GtmCampaign; linkedPosts: number; onNavigate: (tab: Tab) => void }) {
  const colors = useColors();
  const ready = readiness(campaign, linkedPosts);
  const next = ready.next && ready.next.id !== 'plan' ? NEXT_STEP[ready.next.id] : undefined;
  const brief = [
    ['Objective', campaign.objective],
    ['Audience', campaign.audience],
    ['Offer', campaign.offer],
    ['Budget', campaign.budget ? money(campaign.budget) : undefined],
    ['Success metric', campaign.successMetric],
  ].filter((item): item is [string, string] => !!item[1]);

  return (
    <View style={{ gap: space.lg }}>
      <Card>
        <SectionTitle title={`Ready ${ready.completed}/${ready.steps.length}`} />
        {ready.steps.map((step) => (
          <View key={step.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name={step.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={step.done ? colors.success : colors.textFaint} />
            <Text style={{ fontSize: 15, color: colors.text }}>{step.label}</Text>
          </View>
        ))}
        {next ? <Button title={next.copy} small onPress={() => onNavigate(next.tab)} /> : null}
      </Card>

      {brief.length ? (
        <Card>
          <SectionTitle title='Brief' />
          {brief.map(([label, value]) => (
            <View key={label} style={{ gap: 2 }}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{label}</Text>
              <Text style={{ fontSize: 15, color: colors.text }}>{value}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {campaign.plan.summary ? (
        <Card>
          <SectionTitle title='Plan' />
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{campaign.plan.summary}</Text>
        </Card>
      ) : null}

      {campaign.plan.funnel.length ? (
        <Card>
          <SectionTitle title='Funnel' />
          {campaign.plan.funnel.map((stage, index) => (
            <View key={index} style={{ gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                {index + 1}. {stage.stage}
              </Text>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>{stage.goal}</Text>
              {stage.actions.map((action, i) => (
                <Text key={i} style={{ fontSize: 14, color: colors.text }}>
                  • {action}
                </Text>
              ))}
            </View>
          ))}
        </Card>
      ) : null}

      {campaign.plan.calendar.length ? (
        <Card>
          <SectionTitle title='Day by day' />
          {[...campaign.plan.calendar]
            .sort((a, b) => a.day - b.day)
            .map((item, index) => (
              <Text key={index} style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>
                <Text style={{ fontWeight: '600' }}>Day {item.day}</Text> · {item.channel} · {item.action}
              </Text>
            ))}
        </Card>
      ) : null}

      {campaign.research?.sources.length ? (
        <Card>
          <SectionTitle title='Research' />
          {campaign.research.summary ? <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>{campaign.research.summary}</Text> : null}
          {campaign.research.sources.map((source) => (
            <Button key={source.url} title={source.title} variant='ghost' small onPress={() => WebBrowser.openBrowserAsync(source.url)} />
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function Performance({ campaign, onChanged }: { campaign: GtmCampaign; onChanged: () => void }) {
  const colors = useColors();
  const attribution = useQuery({ queryKey: campaignKeys.attribution(campaign._id), queryFn: () => getAttribution(campaign._id) });
  const [conversion, setConversion] = useState({ value: '', source: '' });
  const [utm, setUtm] = useState({ url: '', source: '', medium: '' });
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onSuccess: onChanged,
    onError: (caught) => setError(errorMessage(caught)),
  });

  const webhook = `${API_URL.replace(/\/api\/v1\/?$/, '')}/api/v1/gtm/public/campaigns/${campaign._id}/conversions`;
  const a = attribution.data;
  const open = campaign.recommendations.filter((item) => item.status === 'open');

  const copy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const setRecommendation = (index: number, status: 'done' | 'dismissed') =>
    run.mutate(() =>
      updateCampaign(campaign._id, {
        recommendations: campaign.recommendations.map((item, i) => (i === index ? { ...item, status } : item)),
      })
    );

  return (
    <View style={{ gap: space.lg }}>
      <Banner tone='success' message={notice} />
      <Banner message={error} />
      {attribution.isLoading ? (
        <Loading />
      ) : attribution.isError ? (
        <LoadError error={attribution.error} onRetry={attribution.refetch} />
      ) : a ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Stat label='Reach' value={compactNumber(a.metrics.impressions || a.metrics.views)} />
          <Stat label='Clicks' value={compactNumber(a.metrics.clicks)} />
          <Stat label='Engagement' value={compactNumber(a.metrics.likes + a.metrics.comments + a.metrics.shares)} />
          <Stat label='Conversions' value={a.conversions} />
          <Stat label='Revenue' value={money(a.conversionValue)} />
          <Stat label='ROI' value={a.roi === null ? '—' : `${Math.round(a.roi * 100)}%`} />
        </View>
      ) : null}

      <Card>
        <SectionTitle title='Recommendations' />
        {campaign.lastOptimizedAt ? <Text style={{ fontSize: 13, color: colors.textMuted }}>Last reviewed {shortDate(campaign.lastOptimizedAt)}</Text> : null}
        {open.length === 0 ? <Text style={{ fontSize: 14, color: colors.textFaint }}>No open recommendations.</Text> : null}
        {campaign.recommendations.map((item, index) =>
          item.status === 'open' ? (
            <View key={index} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Pill label={item.priority} tone={item.priority === 'high' ? 'danger' : 'neutral'} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: colors.text }}>{item.title}</Text>
              </View>
              <Text style={{ fontSize: 14, color: colors.textMuted }}>{item.action}</Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button title='Done' variant='secondary' small onPress={() => setRecommendation(index, 'done')} />
                <Button title='Dismiss' variant='ghost' small onPress={() => setRecommendation(index, 'dismissed')} />
              </View>
            </View>
          ) : null
        )}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title='Run review' small flex loading={run.isPending} onPress={() => run.mutate(() => runOptimizer(campaign._id))} />
          <Button
            title='Review weekly'
            variant='secondary'
            small
            flex
            onPress={() =>
              run.mutate(async () => {
                await scheduleOptimizer(campaign._id);
                setNotice('Genit will review this campaign every week.');
              })
            }
          />
        </View>
      </Card>

      <Card>
        <SectionTitle title='Record a conversion' />
        <Field label='Value' value={conversion.value} onChangeText={(value) => setConversion({ ...conversion, value })} keyboardType='decimal-pad' />
        <Field label='Source (optional)' value={conversion.source} onChangeText={(source) => setConversion({ ...conversion, source })} />
        <Button
          title='Record conversion'
          variant='secondary'
          small
          disabled={!Number.isFinite(Number(conversion.value)) || !conversion.value}
          onPress={() =>
            run.mutate(async () => {
              await recordConversion(campaign._id, { value: Number(conversion.value), source: conversion.source.trim() || undefined });
              setConversion({ value: '', source: '' });
              setNotice('Conversion recorded.');
            })
          }
        />
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Or send conversions from your site or CRM to this webhook:</Text>
        <Text selectable style={{ fontFamily: 'Menlo', fontSize: 11, color: colors.text }}>
          {webhook}
        </Text>
        <Button title={copied === 'webhook' ? 'Copied' : 'Copy webhook URL'} variant='ghost' small onPress={() => copy(webhook, 'webhook')} />
      </Card>

      <Card>
        <SectionTitle title='Tracking link' />
        <Field label='Page URL' value={utm.url} onChangeText={(url) => setUtm({ ...utm, url })} keyboardType='url' autoCapitalize='none' placeholder='https://' />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field label='Source' value={utm.source} onChangeText={(source) => setUtm({ ...utm, source })} autoCapitalize='none' placeholder='instagram' />
          </View>
          <View style={{ flex: 1 }}>
            <Field label='Medium' value={utm.medium} onChangeText={(medium) => setUtm({ ...utm, medium })} autoCapitalize='none' placeholder='social' />
          </View>
        </View>
        <Button
          title='Build link'
          variant='secondary'
          small
          disabled={!/^https?:\/\//.test(utm.url.trim())}
          onPress={() =>
            run.mutate(async () =>
              setLink(await buildUtm(campaign._id, { url: utm.url.trim(), source: utm.source.trim() || undefined, medium: utm.medium.trim() || undefined }))
            )
          }
        />
        {link ? (
          <>
            <Text selectable style={{ fontFamily: 'Menlo', fontSize: 11, color: colors.text }}>
              {link}
            </Text>
            <Button title={copied === 'utm' ? 'Copied' : 'Copy link'} variant='ghost' small onPress={() => copy(link, 'utm')} />
          </>
        ) : null}
      </Card>
    </View>
  );
}
