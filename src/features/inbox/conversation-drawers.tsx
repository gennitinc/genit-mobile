import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Drawer, OptionsDrawer } from '@/components/drawer';
import { Empty, Loading, Pill, SelectField } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { space, useColors } from '@/lib/theme';

import {
  fetchTemplates,
  type InboxConversation,
  inboxKeys,
  sendTemplate,
  templateBody,
  templateVariableSections,
  updateConversation,
} from './inbox-api';

export function ContactDrawer({
  conversation,
  visible,
  onClose,
}: {
  conversation: InboxConversation;
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() => ({
    customerName: conversation.customerName,
    customerHandle: conversation.customerHandle ?? '',
    subject: conversation.subject ?? '',
    labels: conversation.labels.join(', '),
    notes: conversation.notes ?? '',
  }));

  const save = useMutation({
    mutationFn: () =>
      updateConversation(conversation._id, {
        customerName: form.customerName.trim() || conversation.customerName,
        subject: form.subject.trim(),
        notes: form.notes.trim(),
        labels: form.labels
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      onClose();
    },
  });

  return (
    <Drawer visible={visible} onClose={onClose} title='Contact details' tall footer={<Button title='Save' loading={save.isPending} onPress={() => save.mutate()} />}>
      {save.isError ? <Banner message={errorMessage(save.error)} /> : null}
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Pill label={conversation.status} tone={conversation.status === 'open' ? 'primary' : 'neutral'} />
        <Text style={{ fontSize: 13, color: colors.textMuted }}>
          Started {shortDate(conversation.createdAt)} · Updated {shortDate(conversation.updatedAt)}
        </Text>
      </View>
      <Field label='Name' value={form.customerName} onChangeText={(customerName) => setForm({ ...form, customerName })} />
      <Field label='Handle' value={form.customerHandle} editable={false} />
      <Field label='Subject' value={form.subject} onChangeText={(subject) => setForm({ ...form, subject })} />
      <Field label='Labels' value={form.labels} onChangeText={(labels) => setForm({ ...form, labels })} placeholder='vip, follow-up' autoCapitalize='none' />
      <Field label='Private notes' value={form.notes} onChangeText={(notes) => setForm({ ...form, notes })} multiline placeholder='Only your team sees these' />
    </Drawer>
  );
}

export function TemplateDrawer({ conversationId, visible, onClose }: { conversationId: string; visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const templates = useQuery({
    queryKey: inboxKeys.templates(conversationId),
    queryFn: () => fetchTemplates(conversationId),
    enabled: visible,
  });
  const [templateId, setTemplateId] = useState('');
  const [picker, setPicker] = useState(false);
  const [values, setValues] = useState<string[]>([]);
  const [error, setError] = useState('');

  const approved = (templates.data ?? []).filter((template) => !template.status || template.status.toUpperCase() === 'APPROVED');
  const template = approved.find((item) => item.id === templateId);
  const sections = templateVariableSections(template);
  const variableCount = sections.reduce((total, section) => total + section.count, 0);

  const send = useMutation({
    mutationFn: () => {
      if (!template) throw new Error('Choose a template.');
      const filled = values.slice(0, variableCount).map((value) => value.trim());
      return sendTemplate(conversationId, {
        name: template.name,
        language: template.language || 'en_US',
        components: filled.length
          ? sections.map((section, index) => {
              const offset = sections.slice(0, index).reduce((total, item) => total + item.count, 0);
              return {
                type: section.type,
                parameters: filled.slice(offset, offset + section.count).map((text) => ({ type: 'text' as const, text })),
              };
            })
          : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.messages(conversationId) });
      setTemplateId('');
      setValues([]);
      onClose();
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const submit = () => {
    if (!template) return setError('Choose a template.');
    if (Array.from({ length: variableCount }, (_, i) => values[i]?.trim()).some((value) => !value)) {
      return setError('Fill in every template variable.');
    }
    setError('');
    send.mutate();
  };

  return (
    <>
      <Drawer visible={visible} onClose={onClose} title='Send a template' tall footer={<Button title='Send template' loading={send.isPending} disabled={!template} onPress={submit} />}>
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textMuted }}>
          WhatsApp only allows free-form replies within 24 hours of the customer’s last message. After that, start with an approved template.
        </Text>
        <Banner message={error} />
        {templates.isLoading ? (
          <Loading />
        ) : templates.isError ? (
          <Banner message={errorMessage(templates.error)} />
        ) : approved.length === 0 ? (
          <Empty icon='document-text-outline' title='No approved templates' message='Create and get templates approved in WhatsApp Manager first.' />
        ) : (
          <>
            <SelectField label='Template' value={template ? `${template.name} (${template.language ?? 'en_US'})` : undefined} onPress={() => setPicker(true)} />
            {template ? (
              <View style={{ padding: space.md, borderRadius: 12, backgroundColor: colors.surface }}>
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text }}>{templateBody(template)}</Text>
              </View>
            ) : null}
            {Array.from({ length: variableCount }, (_, index) => (
              <Field
                key={index}
                label={`Variable {{${index + 1}}}`}
                value={values[index] ?? ''}
                onChangeText={(text) =>
                  setValues((current) => {
                    const next = [...current];
                    next[index] = text;
                    return next;
                  })
                }
              />
            ))}
          </>
        )}
      </Drawer>
      <OptionsDrawer
        visible={picker}
        onClose={() => setPicker(false)}
        title='Template'
        value={templateId}
        options={approved.map((item) => ({ value: item.id, label: item.name, description: [item.language, item.category].filter(Boolean).join(' · ') }))}
        onSelect={(id) => {
          setTemplateId(id);
          setValues([]);
        }}
      />
    </>
  );
}

export function EditMessageDrawer({
  initial,
  visible,
  onClose,
  onSave,
}: {
  initial: string;
  visible: boolean;
  onClose: () => void;
  onSave: (content: string) => Promise<unknown>;
}) {
  const [text, setText] = useState(initial);
  const [opened, setOpened] = useState(visible);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (visible !== opened) {
    setOpened(visible);
    if (visible) {
      setText(initial);
      setError('');
    }
  }
  return (
    <Drawer
      visible={visible}
      onClose={onClose}
      title='Edit message'
      footer={
        <Button
          title='Save'
          loading={busy}
          disabled={!text.trim()}
          onPress={async () => {
            setBusy(true);
            try {
              await onSave(text.trim());
              onClose();
            } catch (caught) {
              setError(errorMessage(caught));
            } finally {
              setBusy(false);
            }
          }}
        />
      }
    >
      <Banner message={error} />
      <Field value={text} onChangeText={setText} multiline autoFocus />
    </Drawer>
  );
}
