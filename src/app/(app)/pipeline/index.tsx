import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PullRefresh } from '@/components/pull-refresh';
import { router } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BarList } from '@/components/charts';
import { Drawer, OptionsDrawer } from '@/components/drawer';
import { Card, Chip, ChipRow, Empty, IconButton, LoadError, Loading, Page, SearchField, SectionTitle, Segmented, Stat, Toggle } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import {
  addLead,
  formatMinutes,
  getReport,
  LEAD_STAGES,
  type LeadStage,
  leadStage,
  listLeads,
  pipelineKeys,
  type PipelineLead,
  SOURCE_LABEL,
  STAGE_COLOR,
  STAGE_LABEL,
  updateLead,
} from '@/features/pipeline/pipeline-api';
import { PipelineSetup } from '@/features/pipeline/pipeline-setup';
import { errorMessage } from '@/lib/api';
import { compactNumber, dateTime, money, relativeTime } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';

type Tab = 'board' | 'funnel' | 'setup';

export default function PipelineScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('board');
  const [stage, setStage] = useState<LeadStage>('new');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [moving, setMoving] = useState<PipelineLead | null>(null);
  const [adding, setAdding] = useState(false);

  const leads = useQuery({ queryKey: pipelineKeys.list(q), queryFn: () => listLeads(q || undefined) });
  const report = useQuery({ queryKey: pipelineKeys.report(30), queryFn: () => getReport(30) });
  const r = report.data;

  const move = useMutation({
    mutationFn: ({ lead, to }: { lead: PipelineLead; to: LeadStage }) => updateLead(lead._id, { stage: to }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: pipelineKeys.all }),
  });

  const all = leads.data ?? [];
  const inStage = all.filter((lead) => leadStage(lead) === stage);

  return (
    <Page
      title='Pipeline'
      back={() => router.back()}
      actions={<IconButton icon='person-add-outline' label='Add lead' onPress={() => setAdding(true)} />}
    >
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        refreshControl={
          <PullRefresh onRefresh={() => Promise.all([leads.refetch(), report.refetch()])} />
        }
        contentContainerStyle={{ paddingBottom: space.xxl, gap: space.lg }}
        keyboardShouldPersistTaps='handled'
      >
        <View style={{ paddingHorizontal: space.page, gap: space.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Stat label='New enquiries (30d)' value={r ? r.totals.captured : '—'} />
            <Stat label='Qualified' value={r ? r.totals.qualified : '—'} />
            <Stat label='Booked' value={r ? r.totals.booked : '—'} hint={r ? `${r.totals.bookingRate}% of enquiries` : undefined} />
            <Stat label='Won' value={r ? compactNumber(r.totals.wonValue) : '—'} hint={r ? `${r.totals.won} deal${r.totals.won === 1 ? '' : 's'}` : undefined} />
            <Stat
              label='Median first reply'
              value={r ? formatMinutes(r.speedToLead.medianMinutes) : '—'}
              hint={r?.speedToLead.responded ? `${r.speedToLead.within5MinutesPct}% within 5 min` : undefined}
            />
          </View>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'funnel', label: 'Funnel' },
              { value: 'setup', label: 'Setup' },
            ]}
          />
        </View>

        {tab === 'board' ? (
          <>
            <View style={{ paddingHorizontal: space.page }}>
              <SearchField value={search} onChange={setSearch} placeholder='Search name, email or phone' />
            </View>
            <ChipRow>
              {LEAD_STAGES.map((s) => (
                <Chip
                  key={s}
                  label={STAGE_LABEL[s]}
                  active={stage === s}
                  count={all.filter((lead) => leadStage(lead) === s).length}
                  onPress={() => setStage(s)}
                  icon={<View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STAGE_COLOR[s] }} />}
                />
              ))}
            </ChipRow>
            <View style={{ paddingHorizontal: space.page, gap: space.sm }}>
              {move.isError ? <Banner message={errorMessage(move.error)} /> : null}
              {leads.isLoading ? (
                <Loading />
              ) : leads.isError ? (
                <LoadError error={leads.error} onRetry={leads.refetch} />
              ) : inStage.length === 0 ? (
                <Empty icon='people-outline' title={`No ${STAGE_LABEL[stage].toLowerCase()} leads`} />
              ) : (
                inStage.map((lead) => (
                  <LeadCard
                    key={lead._id}
                    lead={lead}
                    onPress={() => router.push({ pathname: '/pipeline/[id]', params: { id: lead._id } })}
                    onMove={() => setMoving(lead)}
                  />
                ))
              )}
              <Text style={{ fontSize: 12, textAlign: 'center', color: colors.textFaint }}>Long-press a lead to move it to another stage.</Text>
            </View>
          </>
        ) : tab === 'funnel' ? (
          <View style={{ paddingHorizontal: space.page, gap: space.lg }}>
            {report.isLoading ? (
              <Loading />
            ) : report.isError ? (
              <LoadError error={report.error} onRetry={report.refetch} />
            ) : r ? (
              <>
                <Card>
                  <SectionTitle title='Last 30 days' />
                  <BarList items={r.steps.map((step) => ({ label: `${STAGE_LABEL[step.stage]} · ${step.ofCaptured}%`, value: step.count }))} />
                </Card>
                <Card>
                  <SectionTitle title='Speed to lead' />
                  <Text style={{ fontSize: 14, color: colors.text }}>
                    Median first reply {formatMinutes(r.speedToLead.medianMinutes)} · {r.speedToLead.within5MinutesPct}% within 5 minutes · {r.speedToLead.unanswered} unanswered
                  </Text>
                </Card>
                {r.bySource.length ? (
                  <Card>
                    <SectionTitle title='By source' />
                    {r.bySource.map((row) => (
                      <SourceRow key={row.name} name={SOURCE_LABEL[row.name] ?? row.name} captured={row.captured} booked={row.booked} won={row.won} />
                    ))}
                  </Card>
                ) : null}
                {r.byChannel.length ? (
                  <Card>
                    <SectionTitle title='By channel' />
                    {r.byChannel.map((row) => (
                      <SourceRow key={row.name} name={row.name} captured={row.captured} booked={row.booked} won={row.won} />
                    ))}
                  </Card>
                ) : null}
                {r.upcomingBookings.length ? (
                  <Card>
                    <SectionTitle title='Upcoming bookings' />
                    {r.upcomingBookings.map((lead) => (
                      <Pressable key={lead._id} accessibilityRole='button' onPress={() => router.push({ pathname: '/pipeline/[id]', params: { id: lead._id } })}>
                        <Text style={{ fontSize: 14, color: colors.text }}>
                          {lead.fullName} · {dateTime(lead.booking?.start)}
                        </Text>
                      </Pressable>
                    ))}
                  </Card>
                ) : null}
              </>
            ) : null}
          </View>
        ) : (
          <View style={{ paddingHorizontal: space.page }}>
            <PipelineSetup />
          </View>
        )}
      </ScrollView>

      <OptionsDrawer
        visible={!!moving}
        onClose={() => setMoving(null)}
        title={`Move ${moving?.fullName ?? 'lead'}`}
        value={moving ? leadStage(moving) : undefined}
        options={LEAD_STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s], icon: <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STAGE_COLOR[s] }} /> }))}
        onSelect={(to) => moving && leadStage(moving) !== to && move.mutate({ lead: moving, to })}
      />

      <AddLeadDrawer visible={adding} onClose={() => setAdding(false)} />
    </Page>
  );
}

function LeadCard({ lead, onPress, onMove }: { lead: PipelineLead; onPress: () => void; onMove: () => void }) {
  const colors = useColors();
  const answered = Object.keys(lead.qualification?.answers ?? {}).length;
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityHint='Long press to move to another stage'
      onPress={onPress}
      onLongPress={onMove}
      style={({ pressed }) => ({ padding: space.md, gap: 4, borderRadius: radius.md, backgroundColor: pressed ? colors.surfacePressed : colors.surface })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.text }}>
          {lead.fullName}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textMuted }}>{lead.score}</Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textMuted }}>
        {[SOURCE_LABEL[lead.source] ?? lead.source, lead.channel, lead.dealValue ? money(lead.dealValue, lead.currency) : null].filter(Boolean).join(' · ')}
      </Text>
      <Text style={{ fontSize: 12, color: colors.textFaint }}>
        {answered ? `${answered} answer${answered === 1 ? '' : 's'} · ` : ''}
        {lead.followUp?.nextAt ? `Follow-up ${relativeTime(lead.followUp.nextAt)}` : `Updated ${relativeTime(lead.updatedAt)}`}
        {lead.agentSkippedReason === 'plan_limit' ? ' · Over plan limit' : ''}
      </Text>
    </Pressable>
  );
}

function SourceRow({ name, captured, booked, won }: { name: string; captured: number; booked: number; won: number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 14, color: colors.text }}>{name}</Text>
      <Text style={{ fontSize: 13, color: colors.textMuted }}>
        {captured} in · {booked} booked · {won} won
      </Text>
    </View>
  );
}

function AddLeadDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', phone: '', dealValue: '', notes: '', startFollowUp: true });
  const [error, setError] = useState('');

  const add = useMutation({
    mutationFn: () =>
      addLead({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        dealValue: form.dealValue ? Number(form.dealValue) : undefined,
        notes: form.notes.trim() || undefined,
        startFollowUp: form.startFollowUp,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
      setForm({ name: '', email: '', phone: '', dealValue: '', notes: '', startFollowUp: true });
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const submit = () => {
    if (!form.name.trim()) return setError('Enter a name.');
    if (!form.email.trim() && !form.phone.trim()) return setError('Add an email or phone number so the lead can be contacted.');
    if (form.dealValue && !Number.isFinite(Number(form.dealValue))) return setError('Deal value must be a number.');
    setError('');
    add.mutate();
  };

  return (
    <Drawer visible={visible} onClose={onClose} title='Add lead' tall footer={<Button title='Add lead' loading={add.isPending} onPress={submit} />}>
      <Banner message={error} />
      <Field label='Name' value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
      <Field label='Email' value={form.email} onChangeText={(email) => setForm({ ...form, email })} keyboardType='email-address' autoCapitalize='none' />
      <Field label='Phone' value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType='phone-pad' />
      <Field label='Deal value' value={form.dealValue} onChangeText={(dealValue) => setForm({ ...form, dealValue })} keyboardType='decimal-pad' />
      <Field label='Notes' value={form.notes} onChangeText={(notes) => setForm({ ...form, notes })} multiline />
      <Toggle label='Start follow-ups' description='The assistant reaches out and keeps following up.' value={form.startFollowUp} onChange={(startFollowUp) => setForm({ ...form, startFollowUp })} />
    </Drawer>
  );
}
