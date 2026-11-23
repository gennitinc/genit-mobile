import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Drawer, OptionsDrawer } from '@/components/drawer';
import { Loading, Pill, SectionTitle, SelectField } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { space, useColors } from '@/lib/theme';

import { fetchTemplates, type InboxConversation, inboxKeys, whatsappWindowClosed } from '../inbox-api';
import { callController } from './call-controller';
import { createCall, endCall, fetchConversationCalls, requestCallPermission } from './calls-api';

const PROVIDER = { google_meet: 'Google Meet', microsoft_teams: 'Microsoft Teams' } as const;

/** Chat platforms Genit can call on: WhatsApp natively, the rest with a meeting link sent in the chat. Email has none. */
export const CALL_PLATFORMS = new Set(['whatsapp', 'instagram', 'messenger', 'facebook', 'telegram', 'x', 'linkedin', 'slack']);

export function CallDrawer({
  conversation,
  visible,
  onClose,
  callType = 'video',
}: {
  conversation: InboxConversation;
  visible: boolean;
  onClose: () => void;
  /** Which header button opened it: the meeting link is sent as an audio or a video call. */
  callType?: 'audio' | 'video';
}) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [templatePicker, setTemplatePicker] = useState(false);

  const windowClosed = whatsappWindowClosed(conversation);
  const calls = useQuery({
    queryKey: inboxKeys.calls(conversation._id),
    queryFn: () => fetchConversationCalls(conversation._id),
    enabled: visible,
    refetchInterval: visible ? 5000 : false,
  });
  const templates = useQuery({
    queryKey: inboxKeys.templates(conversation._id),
    queryFn: () => fetchTemplates(conversation._id),
    enabled: visible && windowClosed,
  });
  const template = templates.data?.find((item) => item.id === templateId);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      setMessage('');
      queryClient.invalidateQueries({ queryKey: inboxKeys.calls(conversation._id) });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const capabilities = calls.data?.capabilities;
  const providers = capabilities?.meetingLink.providers ?? (capabilities?.meetingLink.provider ? [capabilities.meetingLink.provider] : []);
  const native = capabilities?.whatsappNative;

  return (
    <>
      <Drawer visible={visible} onClose={onClose} title={`${callType === 'audio' ? 'Voice' : 'Video'} call ${conversation.customerName}`}>
        <Banner message={error} />
        <Banner tone='success' message={notice} />
        {calls.isLoading ? (
          <Loading />
        ) : calls.isError ? (
          <Banner message={errorMessage(calls.error)} />
        ) : (
          <>
            <Field label='Message (optional)' value={message} onChangeText={setMessage} placeholder='Sent with the invite or request' multiline />

            {conversation.platform !== 'whatsapp' ? null : native?.available ? (
              native.permissionGranted ? (
                <Button
                  title='Start WhatsApp call'
                  loading={busy}
                  onPress={() =>
                    run(async () => {
                      await callController.startOutbound(conversation._id, conversation.customerName);
                      onClose();
                    }, 'Calling…')
                  }
                />
              ) : (
                <View style={{ gap: space.sm }}>
                  <Text style={{ fontSize: 14, color: colors.textMuted }}>
                    WhatsApp needs the customer’s permission before you can call them. Send a request; they’ll get a prompt to allow calls.
                  </Text>
                  {windowClosed ? (
                    <SelectField
                      label='Template (required after 24 hours)'
                      value={template?.name}
                      onPress={() => setTemplatePicker(true)}
                    />
                  ) : null}
                  <Button
                    title='Request call permission'
                    variant='secondary'
                    loading={busy}
                    disabled={windowClosed && !template}
                    onPress={() =>
                      run(
                        () =>
                          requestCallPermission(conversation._id, {
                            message: message.trim() || undefined,
                            template: windowClosed && template ? { name: template.name, language: template.language || 'en_US' } : undefined,
                          }),
                        'Permission request sent.'
                      )
                    }
                  />
                </View>
              )
            ) : native?.reason ? (
              <Banner message={native.reason} />
            ) : null}

            {capabilities?.meetingLink.available
              ? providers.map((provider) => (
                  <Button
                    key={provider}
                    title={`Send ${PROVIDER[provider]} ${callType === 'audio' ? 'voice' : 'video'} call link`}
                    variant='secondary'
                    loading={busy}
                    onPress={() =>
                      run(async () => {
                        const call = await createCall(conversation._id, {
                          mode: 'meeting_link',
                          callType,
                          meetingProvider: provider,
                          message: message.trim() || undefined,
                        });
                        if (call.joinUrl) await WebBrowser.openBrowserAsync(call.joinUrl);
                      }, 'Call invitation sent.')
                    }
                  />
                ))
              : (
                <Banner message='Connect Google Meet, or reconnect Outlook with Teams, to send call links in this chat.' />
              )}

            <SectionTitle title='History' />
            {(calls.data?.calls ?? []).length === 0 ? (
              <Text style={{ fontSize: 14, color: colors.textFaint }}>No calls yet</Text>
            ) : (
              calls.data!.calls.map((call) => (
                <View key={call._id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: colors.text }}>
                      {call.mode === 'meeting_link' ? `${PROVIDER[call.metadata?.meetingProvider ?? 'google_meet']} link` : `WhatsApp ${call.direction} call`}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>{dateTime(call.createdAt)}</Text>
                    {call.error ? <Text style={{ fontSize: 12, color: colors.danger }}>{call.error}</Text> : null}
                  </View>
                  <Pill label={call.status.replace('_', ' ')} tone={call.status === 'failed' ? 'danger' : call.status === 'answered' ? 'success' : 'neutral'} />
                  {call.joinUrl && !['ended', 'failed'].includes(call.status) ? (
                    <Button title='Join' variant='ghost' small onPress={() => void WebBrowser.openBrowserAsync(call.joinUrl!)} />
                  ) : null}
                  {['invited', 'ringing', 'answered'].includes(call.status) ? (
                    <Button title='End' variant='ghost' small disabled={busy} onPress={() => run(() => endCall(call._id), 'Call ended.')} />
                  ) : null}
                </View>
              ))
            )}
          </>
        )}
      </Drawer>
      <OptionsDrawer
        visible={templatePicker}
        onClose={() => setTemplatePicker(false)}
        title='Template'
        value={templateId}
        options={(templates.data ?? []).map((item) => ({ value: item.id, label: item.name, description: item.language }))}
        onSelect={setTemplateId}
      />
    </>
  );
}
