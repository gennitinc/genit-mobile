import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { Card, Chip, Empty, LoadError, Loading, Pill, Row, SectionTitle, SelectField, Stat, Toggle } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { accountLabel } from '@/features/inbox/inbox-accounts';
import { effectivePlatform, useIntegrations } from '@/features/integrations/integrations-api';
import { errorMessage } from '@/lib/api';
import { space, useColors } from '@/lib/theme';

import {
  addRecipients,
  campaignKeys,
  EMAIL_CHANNELS,
  getOutreach,
  type GtmCampaign,
  launchOutreach,
  OUTREACH_CHANNELS,
  type OutreachChannel,
  type OutreachVariant,
  pauseOutreach,
  randomId,
  type RecipientStatus,
  saveOutreach,
  suppressRecipient,
} from './campaigns-api';

const RECIPIENT_FILTERS: ('all' | RecipientStatus)[] = ['all', 'pending', 'scheduled', 'sent', 'delivered', 'read', 'replied', 'failed', 'suppressed'];

type Picker = { kind: 'variantChannel'; index: number } | { kind: 'sender'; channel: OutreachChannel } | null;

export function CampaignOutreach({ campaign, onChanged }: { campaign: GtmCampaign; onChanged: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { active } = useIntegrations();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'all' | RecipientStatus>('all');
  const outreach = useQuery({ queryKey: campaignKeys.outreach(campaign._id, page, status), queryFn: () => getOutreach(campaign._id, page, status) });

  const [variants, setVariants] = useState<OutreachVariant[]>(campaign.outreach.variants);
  const [senders, setSenders] = useState(campaign.outreach.integrations);
  const [throttle, setThrottle] = useState(String(campaign.outreach.throttlePerMinute || 10));
  const [recipientText, setRecipientText] = useState('');
  const [consentSource, setConsentSource] = useState('');
  const [consent, setConsent] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const accountsFor = (channel: OutreachChannel) => active.filter((connection) => effectivePlatform(connection) === channel);
  const usedChannels = [...new Set(variants.map((variant) => variant.channel))];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['campaigns', 'outreach', campaign._id] });
    onChanged();
  };

  const run = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: refresh,
    onError: (caught) => setError(errorMessage(caught)),
  });

  const settings = () => ({ throttlePerMinute: Math.max(1, Math.round(Number(throttle)) || 1), integrations: senders, variants });

  const save = () => {
    setNotice('');
    setError('');
    run.mutate(async () => {
      await saveOutreach(campaign._id, settings());
      setNotice('Outreach settings saved.');
    });
  };

  const launch = async () => {
    setNotice('');
    await saveOutreach(campaign._id, settings());
    const result = await launchOutreach(campaign._id);
    setNotice(`${result.scheduled} message${result.scheduled === 1 ? '' : 's'} scheduled${result.rejected.length ? `, ${result.rejected.length} skipped` : ''}.`);
    await refresh();
  };

  const importRecipients = () => {
    setNotice('');
    setError('');
    if (!consent) return setError('Confirm that these recipients agreed to hear from you.');
    const parsed = recipientText
      .split(/\r?\n/)
      .map((line) => line.split(',').map((part) => part.trim()))
      .filter((parts) => parts.some(Boolean))
      .map(([channel, address, name]) => ({
        channel: channel?.toLowerCase() as OutreachChannel,
        address,
        name: name || address,
        consentStatus: 'opted_in' as const,
        consentSource: consentSource.trim() || 'operator-confirmed import',
      }));
    const invalid = parsed.findIndex((item) => !item.address || !OUTREACH_CHANNELS.some((channel) => channel.value === item.channel));
    if (!parsed.length || invalid !== -1) {
      return setError(invalid === -1 ? 'Use one recipient per line: channel,address,name' : `Line ${invalid + 1}: use channel,address,name with a supported channel.`);
    }
    run.mutate(async () => {
      await addRecipients(campaign._id, parsed);
      setRecipientText('');
      setConsent(false);
      setNotice(`Added ${parsed.length} recipient${parsed.length === 1 ? '' : 's'}.`);
    });
  };

  const addVariant = () => {
    const channel = OUTREACH_CHANNELS.find((item) => accountsFor(item.value).length)?.value ?? 'gmail';
    setVariants((current) => [
      ...current,
      {
        id: randomId(),
        channel,
        name: `Variant ${current.filter((item) => item.channel === channel).length + 1}`,
        content: '',
        subject: EMAIL_CHANNELS.includes(channel) ? '' : undefined,
        templateLanguage: channel === 'whatsapp' ? 'en_US' : undefined,
        weight: 1,
      },
    ]);
  };

  const updateVariant = (index: number, patch: Partial<OutreachVariant>) =>
    setVariants((current) => current.map((variant, position) => (position === index ? { ...variant, ...patch } : variant)));

  const stats = outreach.data?.stats ?? {};
  const totalRecipients = Object.values(stats).reduce((sum, count) => sum + (count ?? 0), 0);
  const running = campaign.outreach.status === 'running';
  const recipients = outreach.data?.recipients ?? [];
  const pagination = outreach.data?.recipientPagination;

  return (
    <View style={{ gap: space.lg }}>
      <Banner tone='success' message={notice} />
      <Banner message={error} />

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {running ? (
          <Button title='Pause' variant='secondary' flex loading={run.isPending} onPress={() => run.mutate(() => pauseOutreach(campaign._id))} />
        ) : null}
        <Button title='Save' variant='secondary' flex loading={run.isPending} onPress={save} />
        <Button title='Launch' flex disabled={!variants.length || !totalRecipients} onPress={() => setConfirmLaunch(true)} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Stat label='Recipients' value={totalRecipients} />
        <Stat label='Scheduled' value={stats.scheduled ?? 0} />
        <Stat label='Sent' value={stats.sent ?? 0} />
        <Stat label='Delivered' value={stats.delivered ?? 0} />
        <Stat label='Read' value={stats.read ?? 0} />
        <Stat label='Replied' value={stats.replied ?? 0} />
        <Stat label='Failed' value={stats.failed ?? 0} />
      </View>

      <Card>
        <SectionTitle title='Message variants' />
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Each recipient gets one weighted variant for their channel.</Text>
        {variants.map((variant, index) => (
          <View key={variant.id} style={{ gap: space.sm, paddingTop: space.sm, borderTopWidth: index ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <SelectField label='Channel' value={OUTREACH_CHANNELS.find((c) => c.value === variant.channel)?.label} onPress={() => setPicker({ kind: 'variantChannel', index })} />
              </View>
              <View style={{ width: 90 }}>
                <Field label='Weight' value={String(variant.weight)} keyboardType='number-pad' onChangeText={(text) => updateVariant(index, { weight: Math.max(0, Number(text) || 0) })} />
              </View>
            </View>
            <Field label='Name' value={variant.name} onChangeText={(name) => updateVariant(index, { name })} />
            {EMAIL_CHANNELS.includes(variant.channel) ? <Field label='Subject' value={variant.subject ?? ''} onChangeText={(subject) => updateVariant(index, { subject })} /> : null}
            {variant.channel === 'whatsapp' ? (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 2 }}>
                  <Field label='Template name' value={variant.templateName ?? ''} onChangeText={(templateName) => updateVariant(index, { templateName })} autoCapitalize='none' />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label='Language' value={variant.templateLanguage ?? 'en_US'} onChangeText={(templateLanguage) => updateVariant(index, { templateLanguage })} autoCapitalize='none' />
                </View>
              </View>
            ) : null}
            <Field label='Message' value={variant.content} onChangeText={(content) => updateVariant(index, { content })} multiline />
            <Button title='Remove variant' variant='danger' small onPress={() => setVariants((current) => current.filter((_, i) => i !== index))} />
          </View>
        ))}
        <Button title='Add variant' variant='secondary' small onPress={addVariant} />
      </Card>

      {usedChannels.length ? (
        <Card>
          <SectionTitle title='Send from' />
          {usedChannels.map((channel) => {
            const account = active.find((connection) => connection._id === senders[channel]);
            return (
              <SelectField
                key={channel}
                label={OUTREACH_CHANNELS.find((c) => c.value === channel)?.label}
                value={account ? accountLabel(account) : accountsFor(channel).length ? 'Choose an account' : 'No connected account'}
                onPress={() => setPicker({ kind: 'sender', channel })}
              />
            );
          })}
          <Field label='Messages per minute' value={throttle} onChangeText={setThrottle} keyboardType='number-pad' />
        </Card>
      ) : null}

      <Card>
        <SectionTitle title='Add recipients' />
        <Field
          label='One per line: channel,address,name'
          value={recipientText}
          onChangeText={setRecipientText}
          multiline
          autoCapitalize='none'
          placeholder={'gmail,ana@company.com,Ana\nwhatsapp,+15551234567,Ben'}
        />
        <Field label='Where consent came from' value={consentSource} onChangeText={setConsentSource} placeholder='e.g. Website newsletter signup' />
        <Toggle label='These people agreed to be contacted' value={consent} onChange={setConsent} />
        <Button title='Add recipients' variant='secondary' small loading={run.isPending} onPress={importRecipients} />
      </Card>

      <View style={{ gap: space.sm }}>
        <SectionTitle title='Recipients' />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {RECIPIENT_FILTERS.map((filter) => (
            <Chip key={filter} label={filter === 'all' ? 'All' : filter} active={status === filter} onPress={() => (setStatus(filter), setPage(1))} />
          ))}
        </View>
        {outreach.isLoading ? (
          <Loading />
        ) : outreach.isError ? (
          <LoadError error={outreach.error} onRetry={outreach.refetch} />
        ) : recipients.length === 0 ? (
          <Empty icon='people-outline' title='No recipients' />
        ) : (
          <View style={{ marginHorizontal: -space.page }}>
            {recipients.map((recipient) => (
              <Row
                key={recipient._id}
                title={recipient.name}
                subtitle={`${recipient.channel} · ${recipient.address}${recipient.lastError ? ` · ${recipient.lastError}` : ''}`}
                trailing={
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Pill label={recipient.status} tone={recipient.status === 'failed' ? 'danger' : recipient.status === 'replied' ? 'success' : 'neutral'} />
                    {recipient.status !== 'suppressed' ? (
                      <Button title='Suppress' variant='ghost' small onPress={() => run.mutate(() => suppressRecipient(campaign._id, recipient._id))} />
                    ) : null}
                  </View>
                }
              />
            ))}
          </View>
        )}
        {pagination && pagination.totalPages > 1 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Button title='Previous' variant='ghost' small disabled={page <= 1} onPress={() => setPage(page - 1)} />
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 13, color: colors.textMuted }}>
              Page {page} of {pagination.totalPages}
            </Text>
            <Button title='Next' variant='ghost' small disabled={!pagination.hasNextPage} onPress={() => setPage(page + 1)} />
          </View>
        ) : null}
      </View>

      <OptionsDrawer
        visible={picker?.kind === 'variantChannel'}
        onClose={() => setPicker(null)}
        title='Channel'
        value={picker?.kind === 'variantChannel' ? variants[picker.index]?.channel : undefined}
        options={OUTREACH_CHANNELS.map((channel) => ({ value: channel.value, label: channel.label, description: accountsFor(channel.value).length ? undefined : 'Not connected' }))}
        onSelect={(channel) => {
          if (picker?.kind !== 'variantChannel') return;
          updateVariant(picker.index, {
            channel,
            subject: EMAIL_CHANNELS.includes(channel) ? (variants[picker.index].subject ?? '') : undefined,
            templateLanguage: channel === 'whatsapp' ? (variants[picker.index].templateLanguage ?? 'en_US') : undefined,
          });
        }}
      />
      <OptionsDrawer
        visible={picker?.kind === 'sender'}
        onClose={() => setPicker(null)}
        title='Send from'
        value={picker?.kind === 'sender' ? senders[picker.channel] : undefined}
        options={picker?.kind === 'sender' ? accountsFor(picker.channel).map((account) => ({ value: account._id, label: accountLabel(account) })) : []}
        onSelect={(id) => picker?.kind === 'sender' && setSenders({ ...senders, [picker.channel]: id })}
      />
      <ConfirmDrawer
        visible={confirmLaunch}
        onClose={() => setConfirmLaunch(false)}
        title='Launch outreach?'
        message={`Genit saves these settings and starts messaging ${totalRecipients} recipient${totalRecipients === 1 ? '' : 's'} at up to ${settings().throttlePerMinute} a minute. Messages already sent can't be recalled.`}
        confirmLabel='Launch'
        onConfirm={launch}
      />
    </View>
  );
}
