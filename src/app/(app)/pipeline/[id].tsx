import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { OptionsDrawer } from '@/components/drawer';
import { Card, LoadError, Loading, Page, Pill, SectionTitle, SelectField } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import {
  getLead,
  LEAD_STAGES,
  type LeadPatch,
  leadStage,
  pipelineKeys,
  SOURCE_LABEL,
  STAGE_COLOR,
  STAGE_LABEL,
  STOP_REASON,
  updateLead,
} from '@/features/pipeline/pipeline-api';
import { errorMessage } from '@/lib/api';
import { dateTime, relativeTime } from '@/lib/format';
import { space, useColors } from '@/lib/theme';

export default function LeadScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({ queryKey: pipelineKeys.lead(id), queryFn: () => getLead(id) });
  const [stagePicker, setStagePicker] = useState(false);
  const [draft, setDraft] = useState<{ dealValue: string; lostReason: string; notes: string; answers: Record<string, string> } | null>(null);
  const [notice, setNotice] = useState('');

  const lead = query.data?.lead;
  const [loadedFrom, setLoadedFrom] = useState<typeof lead>(undefined);
  if (lead && lead !== loadedFrom) {
    setLoadedFrom(lead);
    setDraft({
      dealValue: lead.dealValue ? String(lead.dealValue) : '',
      lostReason: lead.lostReason ?? '',
      notes: lead.notes ?? '',
      answers: { ...(lead.qualification?.answers ?? {}) },
    });
  }

  const update = useMutation({
    mutationFn: (patch: LeadPatch) => updateLead(id, patch),
    onSuccess: () => {
      setNotice('Saved.');
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });

  if (query.isLoading) return <Page title='Lead' back={() => router.back()}><Loading /></Page>;
  if (query.isError || !lead || !draft) return <Page title='Lead' back={() => router.back()}><LoadError error={query.error} onRetry={query.refetch} /></Page>;

  const stage = leadStage(lead);
  const questions = query.data!.questions;
  const messages = query.data!.messages;

  const save = () => {
    setNotice('');
    const value = draft.dealValue.trim() ? Number(draft.dealValue) : undefined;
    if (value !== undefined && !Number.isFinite(value)) return;
    update.mutate({ dealValue: value, lostReason: stage === 'lost' ? draft.lostReason : undefined, notes: draft.notes, answers: draft.answers });
  };

  return (
    <Page title={lead.fullName} subtitle={[lead.email, lead.phone].filter(Boolean).join(' · ')} back={() => router.back()}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.lg }} keyboardShouldPersistTaps='handled'>
        <Banner tone='success' message={notice} />
        {update.isError ? <Banner message={errorMessage(update.error)} /> : null}

        <Card>
          <SelectField label='Stage' value={STAGE_LABEL[stage]} onPress={() => setStagePicker(true)} />
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            Score {lead.score} · {SOURCE_LABEL[lead.source] ?? lead.source}
            {lead.channel ? ` · ${lead.channel}` : ''}
          </Text>
          {lead.qualification?.summary ? <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>{lead.qualification.summary}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {lead.conversation ? (
              <Button title='Open conversation' variant='secondary' small onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: lead.conversation ?? '' } })} />
            ) : null}
            {lead.booking?.eventLink ? (
              <Button title='Open booking' variant='secondary' small onPress={() => lead.booking?.eventLink && WebBrowser.openBrowserAsync(lead.booking.eventLink)} />
            ) : null}
          </View>
          {lead.booking ? (
            <Text style={{ fontSize: 14, color: colors.text }}>
              Meeting {lead.booking.status} · {dateTime(lead.booking.start)}
            </Text>
          ) : null}
        </Card>

        <Card>
          <SectionTitle title='Follow-ups' />
          <Text style={{ fontSize: 14, color: colors.text }}>
            {lead.followUp?.stoppedReason
              ? `Stopped: ${STOP_REASON[lead.followUp.stoppedReason] ?? lead.followUp.stoppedReason}`
              : lead.followUp?.nextAt
                ? `Next follow-up ${relativeTime(lead.followUp.nextAt)} (${lead.followUp.count} sent)`
                : `${lead.followUp?.count ?? 0} sent`}
          </Text>
          <Button
            title={lead.followUp?.stoppedReason ? 'Resume follow-ups' : 'Stop follow-ups'}
            variant='secondary'
            small
            loading={update.isPending && update.variables?.followUp !== undefined}
            onPress={() => update.mutate({ followUp: lead.followUp?.stoppedReason ? 'resume' : 'stop' })}
          />
        </Card>

        {questions.length ? (
          <Card>
            <SectionTitle title='Qualification' />
            {questions.map((question) => (
              <Field
                key={question.key}
                label={`${question.label}${question.required ? '' : ' (optional)'}`}
                value={draft.answers[question.key] ?? ''}
                onChangeText={(text) => setDraft({ ...draft, answers: { ...draft.answers, [question.key]: text } })}
                placeholder={question.ask}
              />
            ))}
          </Card>
        ) : null}

        <Card>
          <SectionTitle title='Deal' />
          <Field label={`Deal value${lead.currency ? ` (${lead.currency})` : ''}`} value={draft.dealValue} onChangeText={(dealValue) => setDraft({ ...draft, dealValue })} keyboardType='decimal-pad' />
          {stage === 'lost' ? <Field label='Lost reason' value={draft.lostReason} onChangeText={(lostReason) => setDraft({ ...draft, lostReason })} /> : null}
          <Field label='Notes' value={draft.notes} onChangeText={(notes) => setDraft({ ...draft, notes })} multiline />
          <Button title='Save' loading={update.isPending && update.variables?.notes !== undefined} onPress={save} />
        </Card>

        {messages.length ? (
          <Card>
            <SectionTitle title='Conversation' />
            {messages.slice(-50).map((message) => (
              <View key={message._id} style={{ gap: 2 }}>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>
                  {message.senderType === 'customer' ? lead.fullName : message.senderType === 'bot' ? 'AI assistant' : 'You'} · {relativeTime(message.createdAt)}
                </Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>{message.content}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {lead.stageHistory?.length ? (
          <Card>
            <SectionTitle title='History' />
            {[...lead.stageHistory].reverse().map((entry, index) => (
              <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Pill label={STAGE_LABEL[entry.stage]} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.textMuted }}>
                  {dateTime(entry.at)} · {entry.by === 'agent' ? 'AI assistant' : entry.by === 'user' ? 'Your team' : 'System'}
                  {entry.note ? ` · ${entry.note}` : ''}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>

      <OptionsDrawer
        visible={stagePicker}
        onClose={() => setStagePicker(false)}
        title='Stage'
        value={stage}
        options={LEAD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s], icon: <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STAGE_COLOR[s] }} /> }))}
        onSelect={(to) => to !== stage && update.mutate({ stage: to })}
      />
    </Page>
  );
}
