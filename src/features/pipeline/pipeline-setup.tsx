import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ConfirmDrawer, OptionsDrawer } from '@/components/drawer';
import { Card, Chip, LoadError, Loading, SectionTitle, SelectField, Toggle } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { localTimeZone } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';

import { getSettings, pipelineKeys, saveSettings, type SalesAgentSettings } from './pipeline-api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(String(value));
  }
  return (
    <Field
      label={label}
      value={text}
      keyboardType='number-pad'
      onChangeText={setText}
      onBlur={() => {
        const parsed = Math.round(Number(text));
        const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
        setText(String(next));
        onChange(next);
      }}
    />
  );
}

export function PipelineSetup() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: pipelineKeys.settings, queryFn: getSettings });
  const [draft, setDraft] = useState<SalesAgentSettings | null>(null);
  const [delays, setDelays] = useState('');
  const [picker, setPicker] = useState<'vertical' | 'calendar' | 'sender' | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState('');
  const [notice, setNotice] = useState('');

  // Start editing from the server's copy, and again whenever it's reloaded.
  const [loadedFrom, setLoadedFrom] = useState<SalesAgentSettings | null>(null);
  if (query.data && query.data.settings !== loadedFrom) {
    setLoadedFrom(query.data.settings);
    setDraft(query.data.settings);
    setDelays(query.data.settings.followUp.delaysHours.join(', '));
  }

  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      setNotice('Sales agent settings saved.');
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all });
    },
  });

  if (query.isLoading) return <Loading />;
  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data || !draft) return null;

  const data = query.data;
  const vertical = data.verticals.find((v) => v.key === draft.vertical) ?? data.verticals[0];
  const set = (patch: Partial<SalesAgentSettings>) => setDraft({ ...draft, ...patch });
  const setBooking = (patch: Partial<SalesAgentSettings['booking']>) => setDraft({ ...draft, booking: { ...draft.booking, ...patch } });

  const submit = () => {
    setNotice('');
    const delaysHours = delays
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 5);
    save.mutate({ ...draft, followUp: { ...draft.followUp, delaysHours } });
  };

  const copy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const snippet = `<form action="${data.formEndpoint}" method="POST">
  <input name="name" placeholder="Your name" required />
  <input name="email" type="email" placeholder="Email" />
  <input name="phone" type="tel" placeholder="Phone" />
${(vertical?.questions ?? [])
  .filter((q) => q.required)
  .slice(0, 3)
  .map((q) => `  <input name="${q.key}" placeholder="${q.label}" />`)
  .join('\n')}
  <textarea name="message" placeholder="How can we help?"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off" />
  <input type="hidden" name="redirect" value="https://YOUR-SITE.com/thank-you" />
  <button type="submit">Send</button>
</form>`;

  const capacity = data.capacity;

  return (
    <View style={{ gap: space.lg }}>
      <Banner tone='success' message={notice} />
      {save.isError ? <Banner message={errorMessage(save.error)} /> : null}

      <Card>
        <SectionTitle title={`AI sales agent · ${capacity.plan} plan`} />
        <Toggle
          label='Qualify, book and follow up automatically'
          description='When off, enquiries still land in the pipeline and auto-replies only answer questions.'
          value={draft.enabled}
          onChange={(enabled) => set({ enabled })}
        />
        {capacity.limit !== null ? (
          <Text style={{ fontSize: 13, color: colors.textMuted }}>
            {capacity.used} of {capacity.limit} leads handled this month
          </Text>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title='What counts as a qualified lead' />
        <SelectField label='Industry' value={vertical?.name} onPress={() => setPicker('vertical')} />
        <Text style={{ fontSize: 14, color: colors.text }}>Qualified at score {draft.qualifyThreshold}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
          {[30, 40, 50, 60, 70, 80, 90, 100].map((score) => (
            <Chip key={score} label={String(score)} active={draft.qualifyThreshold === score} onPress={() => set({ qualifyThreshold: score })} />
          ))}
        </View>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Higher means stricter. The assistant asks:</Text>
        {(vertical?.questions ?? []).map((q) => (
          <Text key={q.key} style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>
            • {q.ask}
            {q.required ? '' : ' (optional)'}
          </Text>
        ))}
      </Card>

      <Card>
        <SectionTitle title='Capture' />
        <Toggle label='Chats and DMs' description='Instagram, Messenger, WhatsApp, Telegram, X and LinkedIn messages.' value={draft.captureChats} onChange={(captureChats) => set({ captureChats })} />
        <Toggle label='Email inboxes' description='Off by default — inboxes also receive newsletters and receipts.' value={draft.captureEmail} onChange={(captureEmail) => set({ captureEmail })} />
        <Text style={{ fontSize: 13, color: colors.textMuted }}>
          Meta lead ads are captured automatically from Facebook pages connected in Plugins.
        </Text>
      </Card>

      <Card>
        <SectionTitle title={`Booking${vertical?.meetingName ? ` · ${vertical.meetingName}` : ''}`} />
        <Toggle
          label='Let the assistant book meetings'
          description='Offers real free times from your Google Calendar once a lead is qualified.'
          value={draft.booking.enabled}
          onChange={(enabled) => setBooking({ enabled })}
        />
        {draft.booking.enabled ? (
          data.calendars.length === 0 ? (
            <Banner message='Connect Google Calendar in Plugins so the assistant can see your free times.' />
          ) : (
            <>
              <SelectField label='Calendar' value={data.calendars.find((c) => c.id === draft.booking.calendarIntegrationId)?.name ?? 'Choose a calendar'} onPress={() => setPicker('calendar')} />
              <Field label='Meeting name' value={draft.booking.meetingName ?? ''} onChangeText={(meetingName) => setBooking({ meetingName })} placeholder={vertical?.meetingName} />
              <Field label='Location (optional)' value={draft.booking.location ?? ''} onChangeText={(location) => setBooking({ location })} placeholder='Address or video link' />
              <Field label='Time zone' value={draft.booking.timezone} onChangeText={(timezone) => setBooking({ timezone })} autoCapitalize='none' />
              {draft.booking.timezone !== localTimeZone() ? (
                <Button title={`Use ${localTimeZone()}`} variant='ghost' small onPress={() => setBooking({ timezone: localTimeZone() })} />
              ) : null}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <NumberField label='Start hour' value={draft.booking.startHour} min={0} max={23} onChange={(startHour) => setBooking({ startHour })} />
                </View>
                <View style={{ flex: 1 }}>
                  <NumberField label='End hour' value={draft.booking.endHour} min={1} max={24} onChange={(endHour) => setBooking({ endHour })} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <NumberField label='Length (min)' value={draft.booking.durationMinutes} min={10} max={240} onChange={(durationMinutes) => setBooking({ durationMinutes })} />
                </View>
                <View style={{ flex: 1 }}>
                  <NumberField label='Gap (min)' value={draft.booking.bufferMinutes} min={0} max={120} onChange={(bufferMinutes) => setBooking({ bufferMinutes })} />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <NumberField label='Notice (hours)' value={draft.booking.minNoticeHours} min={0} max={168} onChange={(minNoticeHours) => setBooking({ minNoticeHours })} />
                </View>
                <View style={{ flex: 1 }}>
                  <NumberField label='Days ahead' value={draft.booking.horizonDays} min={1} max={30} onChange={(horizonDays) => setBooking({ horizonDays })} />
                </View>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>Days</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
                {DAYS.map((label, day) => {
                  const active = draft.booking.days.includes(day);
                  return (
                    <Chip
                      key={label}
                      label={label}
                      active={active}
                      onPress={() => setBooking({ days: active ? draft.booking.days.filter((d) => d !== day) : [...draft.booking.days, day].sort() })}
                    />
                  );
                })}
              </View>
            </>
          )
        ) : null}
      </Card>

      <Card>
        <SectionTitle title='Follow-ups' />
        <Toggle
          label='Nudge leads who go quiet'
          description='Chats are only followed up inside the platform’s 24-hour messaging window.'
          value={draft.followUp.enabled}
          onChange={(enabled) => set({ followUp: { ...draft.followUp, enabled } })}
        />
        {draft.followUp.enabled ? (
          <>
            <Field label='Hours between follow-ups' value={delays} onChangeText={setDelays} placeholder='4, 20, 72' keyboardType='numbers-and-punctuation' />
            <Text style={{ fontSize: 12, color: colors.textMuted }}>Comma-separated, up to 5. Email waits at least 24h.</Text>
            <SelectField
              label='Email sender for form leads'
              value={data.emailSenders.find((s) => s.id === draft.emailIntegrationId)?.name ?? 'None'}
              onPress={() => setPicker('sender')}
            />
          </>
        ) : null}
      </Card>

      <Card>
        <SectionTitle title='Website form & webhooks' />
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Endpoint (POST)</Text>
        <Pressable accessibilityRole='button' accessibilityLabel='Copy endpoint' onPress={() => copy(data.formEndpoint, 'url')} style={{ padding: space.md, borderRadius: radius.sm, backgroundColor: colors.background }}>
          <Text selectable style={{ fontFamily: 'Menlo', fontSize: 12, color: colors.text }}>
            {data.formEndpoint}
          </Text>
        </Pressable>
        <Button title={copied === 'url' ? 'Copied' : 'Copy endpoint'} variant='secondary' small onPress={() => copy(data.formEndpoint, 'url')} />
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Embed code</Text>
        <View style={{ padding: space.md, borderRadius: radius.sm, backgroundColor: colors.background }}>
          <Text selectable style={{ fontFamily: 'Menlo', fontSize: 11, lineHeight: 16, color: colors.text }}>
            {snippet}
          </Text>
        </View>
        <Button title={copied === 'snippet' ? 'Copied' : 'Copy embed code'} variant='secondary' small onPress={() => copy(snippet, 'snippet')} />
        <Button title='Generate a new form URL' variant='danger' small onPress={() => setConfirmRotate(true)} />
      </Card>

      <Button title='Save settings' loading={save.isPending} onPress={submit} />

      <OptionsDrawer
        visible={picker === 'vertical'}
        onClose={() => setPicker(null)}
        title='Industry'
        value={draft.vertical}
        options={data.verticals.map((v) => ({ value: v.key, label: v.name }))}
        onSelect={(key) => set({ vertical: key })}
      />
      <OptionsDrawer
        visible={picker === 'calendar'}
        onClose={() => setPicker(null)}
        title='Calendar'
        value={draft.booking.calendarIntegrationId}
        options={data.calendars.map((c) => ({ value: c.id, label: c.name }))}
        onSelect={(calendarIntegrationId) => setBooking({ calendarIntegrationId })}
      />
      <OptionsDrawer
        visible={picker === 'sender'}
        onClose={() => setPicker(null)}
        title='Email sender'
        value={draft.emailIntegrationId ?? '__none__'}
        options={[{ value: '__none__', label: 'None' }, ...data.emailSenders.map((s) => ({ value: s.id, label: s.name, description: s.platform }))]}
        onSelect={(id) => set({ emailIntegrationId: id === '__none__' ? undefined : id })}
      />
      <ConfirmDrawer
        visible={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        title='Generate a new form URL?'
        message='Forms and webhooks using the current URL will stop working until you update them.'
        confirmLabel='Generate new URL'
        destructive
        onConfirm={() => save.mutateAsync({ rotateFormKey: true })}
      />
    </View>
  );
}
