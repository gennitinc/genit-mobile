import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Drawer, OptionsDrawer } from '@/components/drawer';
import { Icon } from '@/components/icon';
import { SearchField, SelectField, Toggle } from '@/components/kit';
import { Button, Field } from '@/components/ui';
import type { AutomationNode } from '@/features/automation/automation-api';
import { useIntegrations } from '@/features/integrations/integrations-api';
import { api } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

import {
  ACTIONS,
  AI_CONTENT_TYPES,
  ASPECT_RATIOS,
  CLOCK_FREQUENCIES,
  CONDITION_OPERATORS,
  DELAY_UNITS,
  DYNAMIC_MODES,
  HTTP_METHODS,
  SCHEDULE_FREQUENCIES,
  TRIGGERS,
  WEEKDAYS,
} from './step-catalog';

/**
 * Typed settings for each automation step, field for field with the web
 * canvas's node editors (trigger-node, action-node, ai-generate-node and the
 * logic nodes). `draft` is the step's data being edited; `set` patches it.
 */

export type Draft = Record<string, any>;
type SetDraft = (patch: Draft) => void;

type Choice = { value: string; label: string; description?: string };

function ChoiceField({ label, value, options, onChange, placeholder }: { label: string; value?: string; options: Choice[]; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SelectField label={label} value={options.find((option) => option.value === value)?.label ?? value} placeholder={placeholder} onPress={() => setOpen(true)} />
      <OptionsDrawer visible={open} onClose={() => setOpen(false)} title={label} options={options} value={value} onSelect={onChange} />
    </>
  );
}

function TextField({ label, draft, set, name, multiline, placeholder, numeric }: { label: string; draft: Draft; set: SetDraft; name: string; multiline?: boolean; placeholder?: string; numeric?: boolean }) {
  const raw = draft[name];
  return (
    <Field
      label={label}
      value={raw === undefined || raw === null ? '' : String(raw)}
      placeholder={placeholder}
      multiline={multiline}
      autoCapitalize='none'
      keyboardType={numeric ? 'numeric' : 'default'}
      onChangeText={(text) => set({ [name]: numeric && text.trim() !== '' && !Number.isNaN(Number(text)) ? Number(text) : text })}
    />
  );
}

function ReadOnly({ label, value }: { label: string; value?: string }) {
  const colors = useColors();
  if (!value) return null;
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{label}</Text>
      <Text selectable style={{ fontSize: 13, color: colors.textMuted }}>
        {value}
      </Text>
    </View>
  );
}

const asChoices = (values: string[]) => values.map((value) => ({ value, label: value }));
const idChoices = (values: { id: string; label: string }[]) => values.map((item) => ({ value: item.id, label: item.label }));

function ScheduleFields({ draft, set }: { draft: Draft; set: SetDraft }) {
  const frequency = String(draft.scheduleFrequency || 'Every Monday');
  return (
    <>
      <ChoiceField label='Runs' value={frequency} options={asChoices(SCHEDULE_FREQUENCIES)} onChange={(value) => set({ scheduleFrequency: value })} />
      {frequency === 'Once' ? <TextField label='Date and time' name='scheduleTime' draft={draft} set={set} placeholder='2026-12-01T09:00' /> : null}
      {frequency === 'Weekly' ? <ChoiceField label='Day' value={draft.scheduleWeekday} options={asChoices(WEEKDAYS)} onChange={(value) => set({ scheduleWeekday: value })} /> : null}
      {frequency === 'Monthly' ? <TextField label='Day of the month' name='scheduleMonthDay' draft={draft} set={set} numeric placeholder='1' /> : null}
      {frequency === 'Custom' ? <TextField label='Cron expression' name='cronExpression' draft={draft} set={set} placeholder='0 9 * * 1' /> : null}
      {CLOCK_FREQUENCIES.includes(frequency) ? <TextField label='Time' name='scheduleClock' draft={draft} set={set} placeholder='09:00' /> : null}
      <TextField label='Time zone' name='timezone' draft={draft} set={set} placeholder='Africa/Lagos' />
    </>
  );
}

function TriggerFields({ draft, set }: { draft: Draft; set: SetDraft }) {
  const type = String(draft.triggerType || 'schedule');
  return (
    <>
      <ChoiceField
        label='Trigger'
        value={type}
        options={[...TRIGGERS.map((item) => ({ value: item.id, label: item.label })), { value: 'composio_event', label: 'Connected app event' }]}
        onChange={(value) => set({ triggerType: value })}
      />
      {type === 'schedule' ? <ScheduleFields draft={draft} set={set} /> : null}
      {type === 'webhook' ? <ReadOnly label='Webhook URL' value={draft.webhookUrl || 'Created when you save the automation.'} /> : null}
      {['facebook_comment', 'instagram_comment', 'x_mention'].includes(type) ? <TextField label='Keyword filter' name='filterValue' draft={draft} set={set} placeholder='Only when it mentions…' /> : null}
      {['gmail_received', 'outlook_email_received'].includes(type) ? (
        <>
          <TextField label='From' name='senderFilter' draft={draft} set={set} placeholder='Any sender' />
          <TextField label='Subject contains' name='filterValue' draft={draft} set={set} placeholder='Any subject' />
        </>
      ) : null}
      {type === 'brevo_contact_added' ? <TextField label='List' name='filterValue' draft={draft} set={set} placeholder='Any list' /> : null}
      {type === 'calendar_event' ? (
        <ChoiceField
          label='Event type'
          value={draft.filterValue || 'created'}
          options={idChoices([
            { id: 'created', label: 'Created' },
            { id: 'starting', label: 'Starting' },
            { id: 'updated', label: 'Updated' },
            { id: 'cancelled', label: 'Cancelled' },
          ])}
          onChange={(value) => set({ filterValue: value })}
        />
      ) : null}
      {type === 'composio_event' ? <ComposioFields kind='trigger' draft={draft} set={set} /> : null}
    </>
  );
}

const MANAGE_FIELDS: Record<string, [string, string][]> = {
  update_facebook_post: [['postId', 'Post ID'], ['contentText', 'New text']],
  delete_facebook_post: [['postId', 'Post ID']],
  reply_facebook_comment: [['commentId', 'Comment ID'], ['messageBody', 'Reply']],
  reply_instagram_comment: [['commentId', 'Comment ID'], ['messageBody', 'Reply']],
  reply_linkedin_comment: [['shareId', 'Post ID'], ['commentUrn', 'Comment URN'], ['messageBody', 'Reply']],
  delete_linkedin_post: [['shareId', 'Post ID']],
  update_youtube_video: [['videoId', 'Video ID'], ['postTitle', 'Title'], ['contentText', 'Description']],
  reply_youtube_comment: [['commentId', 'Comment ID'], ['messageBody', 'Reply']],
  delete_youtube_video: [['videoId', 'Video ID']],
  update_pinterest_pin: [['pinId', 'Pin ID'], ['boardId', 'Board ID'], ['postTitle', 'Title'], ['contentText', 'Description']],
  delete_pinterest_pin: [['pinId', 'Pin ID']],
  delete_tweet: [['tweetId', 'Post ID']],
  delete_threads_post: [['postId', 'Post ID']],
};

const LONG = /contentText|messageBody|Description|Reply/;

function ActionFields({ draft, set }: { draft: Draft; set: SetDraft }) {
  const type = String(draft.actionType || 'send_gmail');
  const post = type.startsWith('post_');
  return (
    <>
      <ChoiceField
        label='Action'
        value={type}
        options={[...ACTIONS.map((item) => ({ value: item.id, label: item.label, description: item.category })), { value: 'composio_action', label: 'Connected app action' }]}
        onChange={(value) => set({ actionType: value })}
      />
      {['send_gmail', 'send_outlook_email', 'send_brevo_email'].includes(type) ? (
        <>
          <TextField label='To' name='recipientEmail' draft={draft} set={set} placeholder='name@example.com, or {{trigger.email}}' />
          <TextField label='Subject' name='subject' draft={draft} set={set} />
          <TextField label='Body' name='messageBody' draft={draft} set={set} multiline />
        </>
      ) : null}
      {type === 'whatsapp_reply' || type === 'messenger_reply' ? (
        <>
          <TextField label={type === 'whatsapp_reply' ? 'To' : 'Recipient ID'} name={type === 'whatsapp_reply' ? 'to' : 'recipientId'} draft={draft} set={set} placeholder='Leave empty to reply to the sender' />
          <TextField label='Reply message' name='messageBody' draft={draft} set={set} multiline />
        </>
      ) : null}
      {type === 'whatsapp_template' ? (
        <>
          <TextField label='To' name='to' draft={draft} set={set} />
          <TextField label='Template name or ID' name='templateName' draft={draft} set={set} />
        </>
      ) : null}
      {post ? (
        <>
          {type === 'post_tiktok' || type === 'post_youtube' ? <TextField label='Title' name='postTitle' draft={draft} set={set} /> : null}
          <TextField label={type === 'post_youtube' ? 'Description' : 'Caption'} name='contentText' draft={draft} set={set} multiline placeholder='Leave empty to use the content from an earlier step' />
          <TextField label='Media URL' name='mediaUrl' draft={draft} set={set} placeholder='Leave empty to use generated media' />
          {type === 'post_tiktok' ? (
            <ChoiceField
              label='Who can see it'
              value={draft.privacy || 'PUBLIC_TO_EVERYONE'}
              options={idChoices([
                { id: 'PUBLIC_TO_EVERYONE', label: 'Everyone' },
                { id: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
                { id: 'SELF_ONLY', label: 'Only me' },
              ])}
              onChange={(value) => set({ privacy: value })}
            />
          ) : null}
          {type === 'post_youtube' ? (
            <>
              <ChoiceField
                label='Visibility'
                value={draft.privacyStatus || 'public'}
                options={idChoices([
                  { id: 'public', label: 'Public' },
                  { id: 'unlisted', label: 'Unlisted' },
                  { id: 'private', label: 'Private' },
                ])}
                onChange={(value) => set({ privacyStatus: value })}
              />
              <TextField label='Category ID' name='categoryId' draft={draft} set={set} placeholder='22' />
              <TextField label='Tags' name='tags' draft={draft} set={set} placeholder='Comma separated' />
              <TextField label='Playlist ID' name='playlistId' draft={draft} set={set} />
            </>
          ) : null}
        </>
      ) : null}
      {(MANAGE_FIELDS[type] ?? []).map(([name, label]) => (
        <TextField key={name} label={label} name={name} draft={draft} set={set} multiline={LONG.test(label) || LONG.test(name)} />
      ))}
      {type.startsWith('generate_') ? <TextField label='Instruction' name='instruction' draft={draft} set={set} multiline /> : null}
      {type === 'add_calendar_event' ? (
        <>
          <TextField label='Event title' name='subject' draft={draft} set={set} />
          <TextField label='Details' name='messageBody' draft={draft} set={set} multiline />
        </>
      ) : null}
      {type === 'google_drive_upload' ? <TextField label='File URL' name='mediaUrl' draft={draft} set={set} placeholder='Leave empty to upload the previous step’s file' /> : null}
      {type === 'composio_action' ? <ComposioFields kind='tool' draft={draft} set={set} /> : null}
      {type !== 'composio_action' ? (
        <ChoiceField label='Each run' value={draft.dynamicMode || 'static'} options={idChoices(DYNAMIC_MODES)} onChange={(value) => set({ dynamicMode: value })} />
      ) : null}
    </>
  );
}

type Model = { _id?: string; modelId?: string; name: string; description?: string };
type Voice = { id: string; name: string };

function AiGenerateFields({ draft, set }: { draft: Draft; set: SetDraft }) {
  const contentType = String(draft.contentType || 'text');
  const models = useQuery({
    queryKey: ['inspire', 'models', contentType],
    queryFn: () => api<{ data?: Model[] }>('inspire/models', { query: { type: contentType } }).then((body) => (Array.isArray(body.data) ? body.data : [])),
    staleTime: 10 * 60_000,
  });
  const voices = useQuery({
    queryKey: ['inspire', 'voices'],
    queryFn: () => api<{ data?: Voice[]; defaultVoiceId?: string }>('inspire/voices/elevenlabs'),
    enabled: contentType === 'audio',
    staleTime: 60 * 60_000,
  });
  return (
    <>
      <ChoiceField label='Generate' value={contentType} options={idChoices(AI_CONTENT_TYPES)} onChange={(value) => set({ contentType: value, model: '' })} />
      <ChoiceField
        label='Model'
        value={draft.model || ''}
        placeholder={models.isLoading ? 'Loading models…' : 'Genit picks the best model'}
        options={[{ value: '', label: 'Genit picks the best model' }, ...(models.data ?? []).map((model) => ({ value: String(model._id || model.modelId), label: model.name, description: model.description }))]}
        onChange={(value) => set({ model: value })}
      />
      {contentType === 'image' || contentType === 'video' ? (
        <ChoiceField label='Aspect ratio' value={draft.aspectRatio || '16:9'} options={ASPECT_RATIOS.map((value) => ({ value, label: value === 'auto' ? 'Auto' : value }))} onChange={(value) => set({ aspectRatio: value })} />
      ) : null}
      {contentType === 'audio' ? (
        <ChoiceField
          label='Voice'
          value={draft.voiceId || voices.data?.defaultVoiceId}
          placeholder={voices.isLoading ? 'Loading voices…' : 'Default voice'}
          options={(voices.data?.data ?? []).map((voice) => ({ value: voice.id, label: voice.name }))}
          onChange={(value) => set({ voiceId: value, voiceName: voices.data?.data?.find((voice) => voice.id === value)?.name })}
        />
      ) : null}
      <ChoiceField label='Each run' value={draft.dynamicMode || 'static'} options={idChoices(DYNAMIC_MODES)} onChange={(value) => set({ dynamicMode: value })} />
      <TextField label='Prompt' name='prompt' draft={draft} set={set} multiline placeholder='Describe what to make. Use {{trigger.message}} for data from earlier steps.' />
    </>
  );
}

function PairsField({ label, draft, set, name }: { label: string; draft: Draft; set: SetDraft; name: string }) {
  const colors = useColors();
  const rows: { key: string; value: string }[] = Array.isArray(draft[name]) ? draft[name] : [];
  const update = (next: { key: string; value: string }[]) => set({ [name]: next });
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{label}</Text>
      {rows.map((row, index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Field value={row.key ?? ''} placeholder='Key' autoCapitalize='none' onChangeText={(text) => update(rows.map((item, at) => (at === index ? { ...item, key: text } : item)))} />
          </View>
          <View style={{ flex: 1 }}>
            <Field value={row.value ?? ''} placeholder='Value' autoCapitalize='none' onChangeText={(text) => update(rows.map((item, at) => (at === index ? { ...item, value: text } : item)))} />
          </View>
          <Pressable accessibilityRole='button' accessibilityLabel='Remove row' hitSlop={8} onPress={() => update(rows.filter((_, at) => at !== index))}>
            <Icon name='close' size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      <Button small variant='ghost' title='Add row' icon={<Icon name='add' size={16} color={colors.text} />} onPress={() => update([...rows, { key: '', value: '' }])} />
    </View>
  );
}

export function StepFields({ node, draft, set }: { node: AutomationNode; draft: Draft; set: SetDraft }) {
  switch (node.type) {
    case 'trigger':
      return <TriggerFields draft={draft} set={set} />;
    case 'action':
      return <ActionFields draft={draft} set={set} />;
    case 'ai_generate':
      return <AiGenerateFields draft={draft} set={set} />;
    case 'prompt':
      return <TextField label='Instruction' name='instruction' draft={draft} set={set} multiline />;
    case 'condition': {
      const operator = String(draft.operator || 'equals');
      return (
        <>
          <TextField label='Field' name='field' draft={draft} set={set} placeholder='{{trigger.message}}' />
          <ChoiceField label='Operator' value={operator} options={idChoices(CONDITION_OPERATORS)} onChange={(value) => set({ operator: value })} />
          {operator !== 'is_empty' && operator !== 'is_not_empty' ? <TextField label='Value' name='value' draft={draft} set={set} /> : null}
        </>
      );
    }
    case 'delay':
      return (
        <>
          <TextField label='Wait' name='duration' draft={draft} set={set} numeric />
          <ChoiceField label='Unit' value={draft.unit || 'minutes'} options={idChoices(DELAY_UNITS)} onChange={(value) => set({ unit: value })} />
        </>
      );
    case 'transform':
      return (
        <>
          <PairsField label='Mappings' name='mappings' draft={draft} set={set} />
          <TextField label='Expression' name='expression' draft={draft} set={set} multiline placeholder='Optional JavaScript-style expression' />
        </>
      );
    case 'http_request':
      return (
        <>
          <ChoiceField label='Method' value={draft.method || 'GET'} options={asChoices(HTTP_METHODS)} onChange={(value) => set({ method: value })} />
          <TextField label='URL' name='url' draft={draft} set={set} placeholder='https://' />
          <PairsField label='Headers' name='headers' draft={draft} set={set} />
          {draft.method && draft.method !== 'GET' ? <TextField label='Body' name='body' draft={draft} set={set} multiline placeholder='{"key": "value"}' /> : null}
        </>
      );
    case 'upload':
      return (
        <>
          <ReadOnly label='File' value={draft.fileName} />
          <TextField label='File URL' name='fileUrl' draft={draft} set={set} placeholder='https://' />
        </>
      );
    default:
      return null;
  }
}

/** Step types with a typed editor; anything else falls back to plain text fields. */
export const TYPED_STEPS = new Set(['trigger', 'action', 'ai_generate', 'prompt', 'condition', 'delay', 'transform', 'http_request', 'upload']);

// ─── Connected app (Composio) events and actions ──────────────────────────────

type SchemaProperty = { type?: string | string[]; enum?: unknown[]; description?: string; title?: string; default?: unknown };
type Schema = { properties?: Record<string, SchemaProperty>; required?: string[] };
type CatalogItem = { slug: string; name?: string; description?: string; inputParameters?: Schema; config?: Schema };

function ComposioFields({ kind, draft, set }: { kind: 'tool' | 'trigger'; draft: Draft; set: SetDraft }) {
  const colors = useColors();
  const { active } = useIntegrations();
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const toolkit = String(draft.composioToolkit || '');
  const slugKey = kind === 'tool' ? 'composioToolSlug' : 'composioTriggerSlug';
  const argsKey = kind === 'tool' ? 'composioToolArguments' : 'composioTriggerConfig';
  const slug = String(draft[slugKey] || '');
  const args: Draft = draft[argsKey] && typeof draft[argsKey] === 'object' ? draft[argsKey] : {};

  // Searching the tool catalog waits for typing to pause.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const catalog = useQuery({
    queryKey: ['composio', kind, toolkit, kind === 'tool' ? query : ''],
    enabled: !!toolkit,
    staleTime: 10 * 60_000,
    queryFn: async () =>
      kind === 'tool'
        ? (await api<{ tools?: CatalogItem[] }>('integrations/composio/tools', { query: { toolkit, q: query || undefined } })).tools ?? []
        : (await api<{ triggers?: CatalogItem[] }>('integrations/composio/triggers', { query: { toolkit } })).triggers ?? [],
  });
  const items = useMemo(() => {
    const list = catalog.data ?? [];
    if (kind === 'tool' || !search.trim()) return list;
    const needle = search.trim().toLowerCase();
    return list.filter((item) => `${item.name} ${item.slug}`.toLowerCase().includes(needle));
  }, [catalog.data, kind, search]);
  const selected = (catalog.data ?? []).find((item) => item.slug === slug);
  const schema = (kind === 'tool' ? selected?.inputParameters : selected?.config) ?? {};

  const apps = useMemo(() => {
    const seen = new Map<string, string>();
    for (const connection of active) {
      if (connection.platform !== 'composio') continue;
      const value = String(connection.metadata?.toolkitSlug || connection.metadata?.appSlug || '').toLowerCase();
      if (value && !seen.has(value)) seen.set(value, connection.accountName || value);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label: value === label ? value.replace(/^\w/, (c) => c.toUpperCase()) : `${value.replace(/^\w/, (c) => c.toUpperCase())} · ${label}` }));
  }, [active]);

  const setArg = (key: string, value: unknown) => set({ [argsKey]: { ...args, [key]: value } });

  return (
    <>
      <ChoiceField
        label='App'
        value={toolkit}
        placeholder={apps.length ? 'Choose a connected app' : 'Connect an app in Plugins first'}
        options={apps}
        onChange={(value) => set({ composioToolkit: value, connectionToolkit: value, [slugKey]: '', [argsKey]: {} })}
      />
      {toolkit ? (
        <SelectField
          label={kind === 'tool' ? 'Action' : 'Event'}
          value={selected?.name || slug}
          placeholder={kind === 'tool' ? 'Choose what to do' : 'Choose what starts it'}
          onPress={() => setPicking(true)}
        />
      ) : null}
      {selected?.description ? <Text style={{ fontSize: 13, color: colors.textMuted }}>{selected.description}</Text> : null}
      {Object.entries(schema.properties ?? {}).map(([key, property]) => (
        <SchemaField key={key} name={key} property={property} required={schema.required?.includes(key)} value={args[key]} onChange={(value) => setArg(key, value)} />
      ))}
      <Drawer visible={picking} onClose={() => setPicking(false)} title={kind === 'tool' ? 'Choose an action' : 'Choose an event'} tall>
        <View style={{ gap: space.sm }}>
          <SearchField value={search} onChange={setSearch} placeholder='Search' />
          {catalog.isLoading || catalog.isFetching ? <ActivityIndicator style={{ marginVertical: space.md }} /> : null}
          {catalog.isError ? <Text style={{ fontSize: 13, color: colors.danger }}>We couldn’t load this app’s {kind === 'tool' ? 'actions' : 'events'}. Try again.</Text> : null}
          {!catalog.isLoading && !items.length && !catalog.isError ? <Text style={{ fontSize: 14, color: colors.textMuted }}>Nothing found.</Text> : null}
          {items.map((item) => {
            const active = item.slug === slug;
            return (
              <Pressable
                key={item.slug}
                accessibilityRole='button'
                accessibilityState={{ selected: active }}
                onPress={() => {
                  set({ [slugKey]: item.slug, [argsKey]: {}, title: item.name || draft.title });
                  setPicking(false);
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.sm, borderRadius: radius.md, backgroundColor: pressed ? colors.surfacePressed : 'transparent' })}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, color: colors.text }}>{item.name || item.slug}</Text>
                  {item.description ? (
                    <Text numberOfLines={2} style={{ fontSize: 12.5, color: colors.textMuted }}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                {active ? <Icon name='checkmark-circle' size={22} color={colors.success} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Drawer>
    </>
  );
}

/** One argument from the tool's schema: a switch, a choice, JSON, a number or text. */
function SchemaField({ name, property, required, value, onChange }: { name: string; property: SchemaProperty; required?: boolean; value: unknown; onChange: (value: unknown) => void }) {
  const types = Array.isArray(property.type) ? property.type : [property.type];
  const label = `${property.title || name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}${required ? ' *' : ''}`;
  const structured = types.includes('object') || types.includes('array');
  const [text, setText] = useState(() => (structured ? (value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)) : ''));

  if (types.includes('boolean')) return <Toggle label={label} description={property.description} value={value === true || value === 'true'} onChange={onChange} />;
  if (property.enum?.length)
    return (
      <ChoiceField
        label={label}
        value={value === undefined ? undefined : String(value)}
        options={property.enum.map((option) => ({ value: String(option), label: String(option) }))}
        onChange={(picked) => onChange(property.enum!.find((option) => String(option) === picked) ?? picked)}
      />
    );
  if (structured)
    return (
      <Field
        label={label}
        value={text}
        multiline
        autoCapitalize='none'
        autoCorrect={false}
        placeholder={types.includes('array') ? '["…"]' : '{ "key": "value" }'}
        onChangeText={(next) => {
          setText(next);
          try {
            onChange(next.trim() ? JSON.parse(next) : undefined);
          } catch {
            onChange(next);
          }
        }}
      />
    );
  const numeric = types.includes('number') || types.includes('integer');
  return (
    <Field
      label={label}
      value={value === undefined || value === null ? '' : String(value)}
      placeholder={property.description?.slice(0, 80)}
      autoCapitalize='none'
      keyboardType={numeric ? 'numeric' : 'default'}
      onChangeText={(next) => onChange(numeric && next.trim() !== '' && !Number.isNaN(Number(next)) ? Number(next) : next)}
    />
  );
}
