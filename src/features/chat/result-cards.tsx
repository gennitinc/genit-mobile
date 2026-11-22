import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { shareRemoteFile } from '@/lib/files';
import { radius, space, useColors } from '@/lib/theme';

import { publishToInspiration, setActiveGeneration, unpublishFromInspiration } from './chat-api';
import { AgentCard, CardButton, CardIcon, fullUrl, humanizeKey, LinkText, PluginLogo, PluginName, useChatScreen } from './chat-ui';

// ─── Small building blocks ────────────────────────────────────────────────────

function Muted({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={{ fontSize: 13, color: colors.textMuted }}>{children}</Text>;
}

function Body({ children, lines }: { children: ReactNode; lines?: number }) {
  const colors = useColors();
  return (
    <Text numberOfLines={lines} selectable style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>
      {children}
    </Text>
  );
}

function ItemList<T>({ items, limit, render, empty }: { items: T[]; limit: number; render: (item: T) => ReactNode; empty: string }) {
  const colors = useColors();
  if (!items.length) return <Muted>{empty}</Muted>;
  return (
    <View style={{ marginHorizontal: -space.md, marginVertical: -space.md }}>
      {items.slice(0, limit).map((item, index) => (
        <View key={index} style={{ paddingHorizontal: space.md, paddingVertical: 10, borderTopWidth: index ? 1 : 0, borderColor: colors.border, gap: 3 }}>
          {render(item)}
        </View>
      ))}
    </View>
  );
}

function Metrics({ entries }: { entries: [string, ReactNode][] }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md }}>
      {entries.map(([label, value]) => (
        <View key={label} style={{ width: '50%', paddingRight: space.sm }}>
          <Text numberOfLines={1} style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted }}>
            {label}
          </Text>
          <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 16, fontWeight: '700', color: colors.text }}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ProviderMeta({ data, detail }: { data: any; detail?: string }) {
  const colors = useColors();
  const extra = detail || data?.account;
  if (!data?.provider) return extra ? <Text numberOfLines={1} style={{ maxWidth: '45%', fontSize: 12, color: colors.textMuted }}>{extra}</Text> : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '55%' }}>
      <PluginName name={data.provider} slug={data.providerSlug} />
      {extra ? (
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: colors.textMuted }}>
          · {extra}
        </Text>
      ) : null}
    </View>
  );
}

function formatMetric(value: unknown) {
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value).slice(0, 40);
  } catch {
    return String(value);
  }
}

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;

// ─── Cards ────────────────────────────────────────────────────────────────────

function VideoTranscriptCard({ data }: { data: any }) {
  const [copied, setCopied] = useState(false);
  const transcript = String(data?.transcript || '');
  const platform = String(data?.platform || 'video');
  const name = platform.charAt(0).toUpperCase() + platform.slice(1);
  return (
    <AgentCard
      icon={<PluginLogo label={name} slug={platform} size={15} />}
      title={`${name} transcript`}
      meta={data?.language ? String(data.language).toUpperCase() : undefined}
      tone='success'
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <LinkText label='Open video' url={data?.sourceUrl} />
          <CardButton
            label={copied ? 'Copied' : 'Copy transcript'}
            icon={copied ? 'checkmark' : 'copy-outline'}
            onPress={async () => {
              await Clipboard.setStringAsync(transcript);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
        </View>
      }
    >
      <Muted>
        {data?.title ? `${data.title} · ` : ''}
        {Number(data?.characterCount || transcript.length).toLocaleString()} characters
        {data?.truncated ? ' · shortened for analysis' : ''}
      </Muted>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={{ maxHeight: 280 }} nestedScrollEnabled>
        <Body>{transcript}</Body>
      </ScrollView>
    </AgentCard>
  );
}

function SocialPostPublishedCard({ data }: { data: any }) {
  const item = data?.actionItem;
  const url = item?.filePath || item?.data?.permalink || item?.data?.tweetUrl || item?.data?.url || data?.permalink;
  return (
    <AgentCard icon={<CardIcon name='checkmark-circle' tone='success' />} title={item?.name || 'Post published'} meta={<ProviderMeta data={data} />} tone='success'>
      {item?.text ? <Body lines={3}>{item.text}</Body> : null}
      {item?.data?.mediaUrl ? (
        <Image source={{ uri: item.data.mediaUrl }} style={{ height: 180, borderRadius: radius.sm }} contentFit='cover' />
      ) : null}
      <LinkText label='Open post' url={url} />
    </AgentCard>
  );
}

function PostListCard({ data }: { data: any }) {
  const items: any[] = data?.posts || data?.media || data?.tweets || data?.videos || data?.playlists || data?.items || data?.pins || [];
  const label = data?.playlists ? 'playlist' : data?.items ? 'item' : 'post';
  return (
    <AgentCard icon={<CardIcon name='document-text-outline' />} title={plural(items.length, label)} meta={<ProviderMeta data={data} />}>
      <ItemList
        items={items}
        limit={5}
        empty={`No ${label}s found.`}
        render={(post) => (
          <>
            <Body lines={2}>{post.message || post.caption || post.text || post.title || post.snippet?.title || '(no title)'}</Body>
            <LinkText label='Open' url={post.permalink_url || post.permalink || post.url} />
          </>
        )}
      />
    </AgentCard>
  );
}

function CommentsListCard({ data }: { data: any }) {
  const colors = useColors();
  const items: any[] = data?.comments || data?.replies || [];
  return (
    <AgentCard icon={<CardIcon name='chatbubble-outline' />} title={plural(items.length, 'comment')} meta={<ProviderMeta data={data} />}>
      <ItemList
        items={items}
        limit={5}
        empty='No comments.'
        render={(comment) => (
          <>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{comment.from?.name || comment.username || comment.author || 'User'}</Text>
            <Muted>{comment.message || comment.text}</Muted>
          </>
        )}
      />
    </AgentCard>
  );
}

function InsightsCard({ data }: { data: any }) {
  const metrics = data?.metrics || data?.insights || data?.stats || data?.report || data;
  const entries =
    metrics && typeof metrics === 'object'
      ? Object.entries(metrics)
          .filter(([key]) => !['status', 'actionItem', 'account', 'provider', 'providerSlug'].includes(key))
          .slice(0, 8)
      : [];
  return (
    <AgentCard icon={<CardIcon name='trending-up' />} title='Insights' meta={<ProviderMeta data={data} />}>
      {entries.length ? <Metrics entries={entries.map(([key, value]) => [humanizeKey(key), formatMetric(value)])} /> : <Muted>No metrics returned.</Muted>}
    </AgentCard>
  );
}

function EmailSentCard({ data }: { data: any }) {
  const colors = useColors();
  const detail = data?.actionItem?.data || {};
  return (
    <AgentCard icon={<CardIcon name='send' tone='success' />} title='Email sent' meta={<ProviderMeta data={data} detail={detail.to || data?.to} />} tone='success'>
      {detail.subject || data?.subject ? <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{detail.subject || data?.subject}</Text> : null}
      {detail.snippet || detail.body ? <Muted>{detail.snippet || detail.body}</Muted> : null}
    </AgentCard>
  );
}

function EmailListCard({ data }: { data: any }) {
  const colors = useColors();
  const items: any[] = data?.messages || data?.emails || [];
  return (
    <AgentCard icon={<CardIcon name='mail-outline' />} title={plural(items.length, 'email')} meta={<ProviderMeta data={data} />}>
      <ItemList
        items={items}
        limit={5}
        empty='Inbox is clear.'
        render={(mail) => (
          <>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
              {mail.subject || '(no subject)'}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted }}>
              {[mail.from || mail.sender, mail.snippet].filter(Boolean).join(' · ')}
            </Text>
          </>
        )}
      />
    </AgentCard>
  );
}

function MessageSentCard({ data }: { data: any }) {
  const detail = data?.actionItem?.data || {};
  return (
    <AgentCard icon={<CardIcon name='send' tone='success' />} title='Message sent' meta={<ProviderMeta data={data} detail={detail.recipient || detail.chat || detail.to} />} tone='success'>
      {detail.message || detail.text ? <Body lines={3}>{detail.message || detail.text}</Body> : null}
    </AgentCard>
  );
}

function DriveFilesCard({ data }: { data: any }) {
  const items: any[] = data?.files || [];
  return (
    <AgentCard icon={<CardIcon name='folder-outline' />} title={plural(items.length, 'file')} meta={<ProviderMeta data={data} />}>
      <ItemList
        items={items}
        limit={6}
        empty='No files.'
        render={(file) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <CardIcon name='document-outline' />
            <View style={{ flex: 1 }}>
              <Body lines={1}>{file.name}</Body>
            </View>
            <LinkText label='Open' url={file.webViewLink} />
          </View>
        )}
      />
    </AgentCard>
  );
}

function GoogleFormCard({ data }: { data: any }) {
  const form = data?.result || data || {};
  const url = form.formUrl || form.responderUri || form.url;
  const fields = form.verifiedFieldCount ?? form.items?.length;
  return (
    <AgentCard
      icon={<PluginLogo label='Google Forms' slug='google_forms' size={15} />}
      title={form.info?.title || 'Google Form ready'}
      meta={typeof fields === 'number' ? `${fields} fields` : data?.account}
      tone='success'
    >
      {url ? <LinkText label='Open the form' url={url} /> : <Muted>Google did not return a form link.</Muted>}
    </AgentCard>
  );
}

function statusColor(status: string | undefined, colors: ReturnType<typeof useColors>) {
  const value = String(status || '').toLowerCase();
  if (/active|live|running/.test(value)) return colors.success;
  if (value.includes('pause')) return '#F59E0B';
  return colors.textFaint;
}

function CampaignListCard({ data }: { data: any }) {
  const colors = useColors();
  const items: any[] = data?.campaigns || [];
  return (
    <AgentCard icon={<CardIcon name='bar-chart-outline' />} title={plural(items.length, 'campaign')} meta={<ProviderMeta data={data} />}>
      <ItemList
        items={items}
        limit={6}
        empty='No campaigns.'
        render={(campaign) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(campaign.status, colors) }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }}>
              {campaign.name || campaign.campaign_name || 'Untitled'}
            </Text>
            {campaign.status ? <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.textMuted }}>{String(campaign.status).toLowerCase()}</Text> : null}
          </View>
        )}
      />
    </AgentCard>
  );
}

function ContactListCard({ data }: { data: any }) {
  const items: any[] = data?.contacts || [];
  return (
    <AgentCard icon={<CardIcon name='people-outline' />} title={plural(items.length, 'contact')} meta={<ProviderMeta data={data} />}>
      <ItemList items={items} limit={6} empty='No contacts.' render={(contact) => <Body lines={1}>{contact.email || contact.name}</Body>} />
    </AgentCard>
  );
}

function InlineVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView player={player} style={{ height: 220, borderRadius: radius.sm }} nativeControls contentFit='contain' />;
}

/** A design, image or video the agent generated, with View, Publish, Save and Open. */
export function GeneratedDesignCard({ data }: { data: any }) {
  const colors = useColors();
  const { projectId, category, openPreview } = useChatScreen();
  const url = fullUrl(data?.url);
  const isVideo = !!data?.url?.endsWith('.mp4') || !!data?.message?.includes('video');
  const isImage = !isVideo && data?.assetKind === 'image';
  const [published, setPublished] = useState(data?.publishStatus === 'published' || !!data?.isPublished);
  const [busy, setBusy] = useState<'publish' | 'save' | null>(null);
  const [notice, setNotice] = useState('');
  const title = data?.name || (isVideo ? 'Generated video' : isImage ? 'Image generated' : 'Design generated');

  const togglePublish = async () => {
    setBusy('publish');
    setNotice('');
    try {
      if (published) {
        const response = await unpublishFromInspiration(url);
        if (!response.success) throw new Error(response.message || "Couldn't unpublish.");
        setPublished(false);
        setNotice('Removed from the inspiration gallery.');
      } else {
        const response = await publishToInspiration({
          mediaUrl: url,
          mediaType: isVideo ? 'video' : 'image',
          prompt: data?.prompt || data?.message || data?.name || '',
          category: category || 'generic_design',
          title: data?.name || (isVideo ? 'Generated video' : 'Generated design'),
        });
        if (!response.success && !response.message?.toLowerCase().includes('already')) throw new Error(response.message || "Couldn't publish.");
        setPublished(true);
        setNotice(response.success ? 'Published to the inspiration gallery.' : 'Already published.');
      }
    } catch (caught) {
      const message = errorMessage(caught);
      if (message.toLowerCase().includes('already')) {
        setPublished(true);
        setNotice('Already published.');
      } else setNotice(message);
    } finally {
      setBusy(null);
    }
  };

  const view = () => {
    if (data?.id && data?.generationGroupId) setActiveGeneration(projectId, data.generationGroupId, data.id).catch(() => undefined);
    openPreview({ kind: 'media', title, url, isVideo, prompt: data?.prompt });
  };

  return (
    <AgentCard
      icon={<CardIcon name={isVideo ? 'film-outline' : 'image-outline'} tone='success' />}
      title={isVideo ? 'Generated Video' : isImage ? 'Generated Image' : 'Generated Design'}
      tone='success'
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{title}</Text>
      {url ? (
        isVideo ? (
          <InlineVideo url={url} />
        ) : (
          <Pressable accessibilityRole='imagebutton' accessibilityLabel={`View ${title}`} onPress={view}>
            <Image source={{ uri: url }} style={{ height: 220, borderRadius: radius.sm, backgroundColor: colors.surface }} contentFit='contain' />
          </Pressable>
        )
      ) : null}
      {url ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {!isVideo ? <CardButton label='View' icon='expand-outline' onPress={view} /> : null}
          <CardButton
            label={busy === 'publish' ? (published ? 'Unpublishing…' : 'Publishing…') : published ? 'Published' : 'Publish'}
            icon={published ? 'checkmark-circle' : 'share-outline'}
            busy={busy === 'publish'}
            onPress={togglePublish}
          />
          <CardButton
            label='Save'
            icon='download-outline'
            busy={busy === 'save'}
            onPress={async () => {
              setBusy('save');
              try {
                await shareRemoteFile(url, url.split('/').pop()?.split('?')[0] || (isVideo ? 'genit-video.mp4' : 'genit-design.png'));
              } catch (caught) {
                setNotice(errorMessage(caught));
              } finally {
                setBusy(null);
              }
            }}
          />
        </View>
      ) : null}
      {notice ? <Muted>{notice}</Muted> : null}
    </AgentCard>
  );
}

/** Image results from a web search, shown as a swipeable row. */
export function InspirationStrip({ items, onPress }: { items: { image: string; alt?: string }[]; onPress: (index: number) => void }) {
  const colors = useColors();
  return (
    <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {items.map((item, index) => (
        <Pressable key={`${item.image}-${index}`} accessibilityRole='imagebutton' accessibilityLabel={item.alt || 'Design inspiration'} onPress={() => onPress(index)}>
          <Image source={{ uri: item.image }} style={{ width: 130, height: 130, borderRadius: radius.sm, backgroundColor: colors.surface }} contentFit='cover' />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function DesignInspirationCard({ data }: { data: any }) {
  const { openPreview } = useChatScreen();
  const items: any[] = Array.isArray(data) ? data : data?.pins || data?.inspirations || [];
  return (
    <AgentCard icon={<CardIcon name='sparkles-outline' />} title={`${items.length} internet search ${items.length === 1 ? 'inspiration' : 'inspirations'}`}>
      {items.length ? (
        <InspirationStrip
          items={items}
          onPress={(index) => openPreview({ kind: 'media', title: items[index]?.alt || 'Design inspiration', url: items[index]?.image, isVideo: false })}
        />
      ) : (
        <Muted>No inspirations found.</Muted>
      )}
    </AgentCard>
  );
}

function GtmCampaignCard({ data }: { data: any }) {
  const colors = useColors();
  const campaign = data?.campaign || data?.campaigns?.[0] || data;
  const campaigns: any[] = data?.campaigns || (campaign?._id ? [campaign] : []);
  return (
    <AgentCard
      icon={<CardIcon name='locate-outline' tone='success' />}
      title={campaigns.length > 1 ? 'GTM campaigns' : 'GTM campaign'}
      meta={campaigns.length > 1 ? `${campaigns.length} total` : campaign?.status}
      tone='success'
    >
      {campaigns.slice(0, 4).map((item, index) => (
        <View key={item._id || item.name || index} style={{ gap: space.sm, paddingTop: index ? space.sm : 0, borderTopWidth: index ? 1 : 0, borderColor: colors.border }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{item.name}</Text>
          {item.objective || item.plan?.summary ? <Muted>{item.objective || item.plan?.summary}</Muted> : null}
          {campaigns.length === 1 ? (
            <>
              <Metrics
                entries={(
                  [
                    ['Audience', item.audience],
                    ['Offer', item.offer],
                    ['Timeline', item.timeline],
                    ['Success', item.successMetric],
                    ['Channels', item.channels?.join(', ')],
                    ['Budget', item.budget != null ? `$${item.budget}` : null],
                  ] as [string, string | null | undefined][]
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => [label, <Text key={label} style={{ fontSize: 13, fontWeight: '400' }}>{value}</Text>])}
              />
              {item.research?.summary ? (
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Research</Text>
                  <Muted>{item.research.summary}</Muted>
                  {(item.research.sources ?? []).slice(0, 4).map((source: any, sourceIndex: number) => (
                    <LinkText key={`${source.url}-${sourceIndex}`} label={source.title || 'Source'} url={source.url} />
                  ))}
                </View>
              ) : null}
              {item.plan?.funnel?.length ? (
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>Campaign plan</Text>
                  {item.plan.funnel.map((stage: any) => (
                    <Muted key={stage.stage}>
                      <Text style={{ color: colors.text }}>{stage.stage}:</Text> {stage.goal}
                    </Muted>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ))}
    </AgentCard>
  );
}

function GtmLeadsCard({ data }: { data: any }) {
  const colors = useColors();
  const leads: any[] = data?.leads || [];
  return (
    <AgentCard icon={<CardIcon name='people-outline' tone='success' />} title={plural(leads.length, 'lead')} meta={data?.provider} tone='success'>
      <ItemList
        items={leads}
        limit={6}
        empty='No leads found.'
        render={(lead) => (
          <>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{lead.fullName || lead.email}</Text>
            <Muted>{[lead.title, lead.company, lead.email].filter(Boolean).join(' · ')}</Muted>
          </>
        )}
      />
    </AgentCard>
  );
}

function GtmOutboundCard({ data }: { data: any }) {
  const stats = data?.stats || {};
  const scheduled = data?.scheduled ?? stats.scheduled ?? (data?.jobs || []).length;
  const imported = stats.imported ?? (data?.recipients || []).length;
  return (
    <AgentCard
      icon={<CardIcon name='mail-outline' tone='success' />}
      title={scheduled > 0 ? 'Campaign outreach' : 'Campaign recipients'}
      meta={`${scheduled || imported} ${scheduled > 0 ? 'scheduled' : 'ready'}`}
      tone='success'
    >
      <Metrics entries={Object.entries(stats).map(([label, value]) => [humanizeKey(label), String(value)])} />
      {data?.rejected?.length ? <Muted>{data.rejected.length} recipient(s) were skipped; their reasons are in this campaign’s chat history.</Muted> : null}
    </AgentCard>
  );
}

function GtmAttributionCard({ data }: { data: any }) {
  const metrics = data?.metrics || data?.attribution?.metrics || {};
  const value = data?.conversionValue ?? data?.attribution?.conversionValue ?? 0;
  const roi = data?.roi ?? data?.attribution?.roi;
  return (
    <AgentCard icon={<CardIcon name='bar-chart-outline' tone='success' />} title='GTM attribution' meta={data?.campaign?.name} tone='success'>
      <Metrics
        entries={[
          ['Clicks', String(metrics.clicks || 0)],
          ['Conversions', String(data?.conversions || 0)],
          ['Value', `$${value}`],
          ['ROI', roi == null ? 'n/a' : `${Math.round(roi * 100)}%`],
        ]}
      />
    </AgentCard>
  );
}

function GtmOptimizerCard({ data }: { data: any }) {
  const colors = useColors();
  const recommendations: any[] = data?.recommendations || data?.campaign?.recommendations || [];
  return (
    <AgentCard icon={<CardIcon name='sparkles-outline' tone='success' />} title='Optimizer recommendations' meta={`${recommendations.length} new`} tone='success'>
      {recommendations.length ? (
        recommendations.slice(0, 4).map((rec, index) => (
          <Muted key={`${rec.title}-${index}`}>
            <Text style={{ fontWeight: '600', color: colors.text }}>{rec.title}</Text> — {rec.action}
          </Muted>
        ))
      ) : (
        <Muted>No new recommendations.</Muted>
      )}
    </AgentCard>
  );
}

function DocumentActions({ preview, downloadUrl, fileName, viewLabel = 'View' }: { preview?: () => void; downloadUrl?: string; fileName?: string; viewLabel?: string }) {
  const [saving, setSaving] = useState(false);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {preview ? <CardButton label={viewLabel} icon='eye-outline' onPress={preview} /> : null}
      {downloadUrl ? (
        <CardButton
          label='Save'
          icon='download-outline'
          busy={saving}
          onPress={async () => {
            setSaving(true);
            try {
              await shareRemoteFile(downloadUrl, fileName || downloadUrl.split('/').pop()?.split('?')[0] || 'genit-document');
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}
    </View>
  );
}

function GtmPdfReportCard({ data }: { data: any }) {
  const { openPreview } = useChatScreen();
  const report = data?.report || data;
  const url = fullUrl(report?.url);
  return (
    <AgentCard icon={<CardIcon name='document-text-outline' tone='success' />} title='PDF report ready' meta={report?.campaignName} tone='success'>
      <DocumentActions
        preview={url ? () => openPreview({ kind: 'document', title: report?.campaignName || 'GTM campaign report', url, downloadUrl: url, fileName: report?.fileName }) : undefined}
        downloadUrl={url}
        fileName={report?.fileName}
      />
    </AgentCard>
  );
}

function ResearchReportCard({ data }: { data: any }) {
  const { openPreview } = useChatScreen();
  const report = data?.report || data;
  const previewUrl = fullUrl(report?.previewUrl);
  const pdfUrl = fullUrl(report?.pdfUrl);
  return (
    <AgentCard icon={<CardIcon name='document-text-outline' tone='success' />} title={report?.title || 'Research report'} meta='Document and PDF' tone='success'>
      <DocumentActions
        viewLabel='View report'
        preview={previewUrl ? () => openPreview({ kind: 'document', title: report?.title || 'Research report', url: previewUrl, downloadUrl: pdfUrl, fileName: report?.fileName }) : undefined}
        downloadUrl={pdfUrl}
        fileName={report?.fileName}
      />
    </AgentCard>
  );
}

function hostname(url?: string) {
  try {
    return url ? new URL(url).hostname : '';
  } catch {
    return '';
  }
}

function BrowserSessionCard({ data }: { data: any }) {
  const { openPreview } = useChatScreen();
  const live = fullUrl(data?.liveViewUrl);
  return (
    <AgentCard icon={<CardIcon name='globe-outline' tone='success' />} title={data?.title || 'Live browser'} meta={hostname(data?.url) || 'Interactive session'} tone='success'>
      <Muted>Watch or take over the browser Genit is using.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' }}>
        {live ? (
          <CardButton
            label='Open browser'
            icon='open-outline'
            onPress={() => openPreview({ kind: 'website', title: data?.title || 'Live browser', url: live, displayUrl: data?.url, openUrl: data?.url })}
          />
        ) : null}
        <LinkText label={hostname(data?.url) || 'Open page'} url={data?.url} />
      </View>
    </AgentCard>
  );
}

/** Office files preview through Microsoft's viewer; PDFs open directly. */
export function documentPreviewUrl(format: string | undefined, fileUrl: string, fallback: string) {
  const value = format?.toLowerCase();
  if (value === 'pdf' && fileUrl) return fileUrl;
  if (['docx', 'xlsx', 'pptx'].includes(value || '') && fileUrl.startsWith('https://')) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
  }
  return fallback || fileUrl;
}

function DocumentArtifactCard({ data }: { data: any }) {
  const { openPreview } = useChatScreen();
  const artifact = data?.artifact || data;
  const fileUrl = fullUrl(artifact?.fileUrl);
  const previewUrl = documentPreviewUrl(artifact?.format, fileUrl, fullUrl(artifact?.previewUrl));
  return (
    <AgentCard
      icon={<CardIcon name='document-text-outline' tone='success' />}
      title={artifact?.title || 'Document'}
      meta={`${String(artifact?.format || 'file').toUpperCase()} · v${artifact?.version || 1}`}
      tone='success'
    >
      <DocumentActions
        preview={previewUrl ? () => openPreview({ kind: 'document', title: artifact?.title || 'Document', url: previewUrl, downloadUrl: fileUrl, fileName: artifact?.fileName }) : undefined}
        downloadUrl={fileUrl}
        fileName={artifact?.fileName}
      />
    </AgentCard>
  );
}

function DocumentListCard({ data }: { data: any }) {
  const colors = useColors();
  const artifacts: any[] = data?.artifacts || [];
  return (
    <AgentCard icon={<CardIcon name='documents-outline' />} title='Documents' meta={`${artifacts.length} recent`}>
      <ItemList
        items={artifacts}
        limit={10}
        empty='No documents yet.'
        render={(artifact) => (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }}>
              {artifact.title}
            </Text>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.textMuted }}>
              {artifact.format} · v{artifact.version}
            </Text>
          </View>
        )}
      />
    </AgentCard>
  );
}

// ─── Google Calendar ──────────────────────────────────────────────────────────

type CalendarEvent = {
  id?: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  attendees?: { email: string }[];
};

function eventTime(event: CalendarEvent) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  if (!start) return { date: '', time: '' };
  const s = new Date(start);
  const date = s.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (event.start?.date) return { date, time: 'All day' };
  const clock = (value: Date) => value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!end) return { date, time: clock(s) };
  const e = new Date(end);
  return {
    date,
    time: s.toDateString() === e.toDateString() ? `${clock(s)} – ${clock(e)}` : `${clock(s)} – ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${clock(e)}`,
  };
}

export function CalendarEventsCard({ events, account }: { events: CalendarEvent[]; account?: string }) {
  const colors = useColors();
  return (
    <AgentCard
      icon={<PluginLogo label='Google Calendar' slug='google_calendar' size={15} />}
      title={plural(events.length, 'event')}
      meta={<ProviderMeta data={{ provider: 'Google Calendar', providerSlug: 'google_calendar', account }} />}
    >
      <ItemList
        items={events}
        limit={20}
        empty='Nothing on the calendar.'
        render={(event) => {
          const when = eventTime(event);
          return (
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ width: 84 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>{when.date}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{when.time}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{event.summary || '(no title)'}</Text>
                {event.location ? <Muted>📍 {event.location}</Muted> : null}
                {event.attendees?.length ? <Muted>{plural(event.attendees.length, 'attendee')}</Muted> : null}
                <LinkText label='Open' url={event.htmlLink} />
              </View>
            </View>
          );
        }}
      />
    </AgentCard>
  );
}

export function CalendarEventCreatedCard({ data }: { data: any }) {
  const colors = useColors();
  return (
    <AgentCard
      icon={<PluginLogo label='Google Calendar' slug='google_calendar' size={15} />}
      title='Event created'
      meta={<PluginName name='Google Calendar' slug='google_calendar' />}
      tone='success'
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{data?.summary || '(no title)'}</Text>
      <LinkText label='Open in Google Calendar' url={data?.htmlLink} />
    </AgentCard>
  );
}

export function WebSourcesCard({ data }: { data: any }) {
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  return (
    <AgentCard icon={<CardIcon name='checkmark-circle' tone='success' />} title='Web sources' tone='success'>
      {results.slice(0, 5).map((result, index) => (
        <LinkText key={`${result.url || index}`} label={result.title || result.url} url={result.url} />
      ))}
    </AgentCard>
  );
}

/** Picks the card for a tool's render hint. Unknown hints return null. */
export function renderToolResult(hint: string | undefined, data: any): ReactNode | null {
  switch (hint) {
    case 'social_post_published':
      return <SocialPostPublishedCard data={data} />;
    case 'post_list':
      return <PostListCard data={data} />;
    case 'comments_list':
      return <CommentsListCard data={data} />;
    case 'insights':
      return <InsightsCard data={data} />;
    case 'campaign_list':
    case 'campaign_created':
      return <CampaignListCard data={data} />;
    case 'email_sent':
      return <EmailSentCard data={data} />;
    case 'email_list':
    case 'email_detail':
    case 'email_events':
      return <EmailListCard data={data} />;
    case 'message_sent':
      return <MessageSentCard data={data} />;
    case 'drive_files':
    case 'drive_file_detail':
      return <DriveFilesCard data={data} />;
    case 'google_form':
      return <GoogleFormCard data={data} />;
    case 'contact_list':
    case 'contact_created':
      return <ContactListCard data={data} />;
    case 'generated_design':
      return <GeneratedDesignCard data={data} />;
    case 'design_inspiration':
      return <DesignInspirationCard data={data} />;
    case 'gtm_campaign':
    case 'gtm_campaign_list':
      return <GtmCampaignCard data={data} />;
    case 'gtm_leads':
      return <GtmLeadsCard data={data} />;
    case 'gtm_outbound':
      return <GtmOutboundCard data={data} />;
    case 'gtm_attribution':
      return <GtmAttributionCard data={data} />;
    case 'gtm_optimizer':
      return <GtmOptimizerCard data={data} />;
    case 'gtm_pdf_report':
      return <GtmPdfReportCard data={data} />;
    case 'research_report':
      return <ResearchReportCard data={data} />;
    case 'browser_session':
      return <BrowserSessionCard data={data} />;
    case 'document_artifact':
      return <DocumentArtifactCard data={data} />;
    case 'document_list':
      return <DocumentListCard data={data} />;
    case 'youtube_transcript':
    case 'video_transcript':
      return <VideoTranscriptCard data={data} />;
    case 'calendar_events':
      return <CalendarEventsCard events={data?.events || []} account={data?.account} />;
    case 'calendar_event_created':
      return <CalendarEventCreatedCard data={data} />;
    case 'web_search_results':
      return <WebSourcesCard data={data} />;
    default:
      return null;
  }
}
