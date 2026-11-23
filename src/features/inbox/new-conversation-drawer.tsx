import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BrandLogo } from '@/components/brand-logo';
import { useState } from 'react';

import { Drawer, OptionsDrawer } from '@/components/drawer';
import { Icon } from '@/components/icon';
import { SelectField } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import type { IntegrationConnection } from '@/features/integrations/integrations-api';
import { errorMessage } from '@/lib/api';
import { platformMeta } from '@/lib/platforms';
import { useColors } from '@/lib/theme';

import { accountLabel, canStartConversation, inboxPlatform } from './inbox-accounts';
import { createConversation, type InboxConversation, inboxKeys, isEmail, sendMessage } from './inbox-api';

const RECIPIENT_HINT: Record<string, { label: string; placeholder: string; keyboard: 'email-address' | 'phone-pad' | 'default' }> = {
  gmail: { label: 'Email address', placeholder: 'name@company.com', keyboard: 'email-address' },
  outlook: { label: 'Email address', placeholder: 'name@company.com', keyboard: 'email-address' },
  email: { label: 'Email address', placeholder: 'name@company.com', keyboard: 'email-address' },
  whatsapp: { label: 'Phone number', placeholder: '+1 555 123 4567', keyboard: 'phone-pad' },
};

export function NewConversationDrawer({
  visible,
  onClose,
  accounts,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  accounts: IntegrationConnection[];
  onCreated: (conversation: InboxConversation) => void;
}) {
  const queryClient = useQueryClient();
  const startable = accounts.filter(canStartConversation);
  const [accountId, setAccountId] = useState('');
  const [picker, setPicker] = useState(false);
  const [name, setName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const account = startable.find((item) => item._id === accountId) ?? startable[0];
  const platform = account ? inboxPlatform(account) : '';
  const colors = useColors();
  const hint = RECIPIENT_HINT[platform] ?? { label: 'Username', placeholder: '@handle', keyboard: 'default' as const };

  const reset = () => {
    setName('');
    setRecipient('');
    setSubject('');
    setMessage('');
    setError('');
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error('Choose an account.');
      const handle = recipient.trim();
      const conversation = await createConversation({
        integrationId: account._id,
        platform,
        customerName: name.trim(),
        customerId: handle,
        customerHandle: handle,
        subject: isEmail(platform) ? subject.trim() || undefined : undefined,
      });
      // WhatsApp can only open with an approved template, chosen in the thread.
      if (platform !== 'whatsapp') await sendMessage(conversation._id, message.trim(), []);
      return conversation;
    },
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: inboxKeys.all });
      reset();
      onClose();
      onCreated(conversation);
    },
    onError: (caught) => setError(errorMessage(caught)),
  });

  const submit = () => {
    if (!account) return setError('Connect a channel that can start conversations first.');
    if (!name.trim()) return setError('Enter a name.');
    if (!recipient.trim()) return setError(`Enter the ${hint.label.toLowerCase()}.`);
    if (platform !== 'whatsapp' && !message.trim()) return setError('Write the first message.');
    setError('');
    create.mutate();
  };

  return (
    <>
      <Drawer
        visible={visible}
        onClose={onClose}
        title='Start a conversation'
        footer={
          <Button
            title={platform === 'whatsapp' ? 'Continue' : 'Send'}
            icon={<Icon name={platform === 'whatsapp' ? 'arrow-forward' : 'send'} size={18} color={colors.onPrimary} />}
            loading={create.isPending}
            disabled={!account}
            onPress={submit}
          />
        }
      >
        <Banner message={error} />
        {startable.length === 0 ? (
          <Banner message='None of your connected channels can start new conversations. Connect Gmail, Outlook, WhatsApp, Instagram, Messenger or Telegram.' />
        ) : (
          <>
            <SelectField
              label='Send from'
              value={account ? `${accountLabel(account)} · ${platformMeta(platform).label}` : undefined}
              leading={account ? <BrandLogo platform={platform} size={22} /> : <Icon name='apps' size={20} color={colors.textMuted} />}
              onPress={() => setPicker(true)}
            />
            <Field label='Name' value={name} onChangeText={setName} placeholder='Who are you writing to?' leading={<Icon name='person-circle-outline' size={20} color={colors.textMuted} />} />
            <Field
              label={hint.label}
              value={recipient}
              onChangeText={setRecipient}
              placeholder={hint.placeholder}
              keyboardType={hint.keyboard}
              leading={<Icon name={hint.keyboard === 'email-address' ? 'mail-outline' : hint.keyboard === 'phone-pad' ? 'call-outline' : 'at'} size={20} color={colors.textMuted} />}
              autoCapitalize='none'
              autoCorrect={false}
            />
            {isEmail(platform) ? <Field label='Subject' value={subject} onChangeText={setSubject} leading={<Icon name='document-text-outline' size={20} color={colors.textMuted} />} /> : null}
            {platform === 'whatsapp' ? (
              <Banner tone='success' message="WhatsApp conversations start with an approved template. You'll pick one next." />
            ) : (
              <Field label='Message' value={message} onChangeText={setMessage} multiline placeholder='Write your first message' />
            )}
          </>
        )}
      </Drawer>
      <OptionsDrawer
        visible={picker}
        onClose={() => setPicker(false)}
        title='Send from'
        value={account?._id}
        options={startable.map((item) => ({ value: item._id, label: accountLabel(item), description: platformMeta(inboxPlatform(item)).label, icon: <BrandLogo platform={inboxPlatform(item)} size={24} /> }))}
        onSelect={setAccountId}
      />
    </>
  );
}
