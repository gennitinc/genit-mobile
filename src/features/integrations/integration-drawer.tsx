import { BrandLogo } from '@/components/brand-logo';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { ConfirmDrawer, Drawer } from '@/components/drawer';
import { Avatar, Pill, Toggle } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { radius, space, useColors } from '@/lib/theme';

import { connectIntegration } from './connect';
import {
  type CatalogItem,
  connectionsFor,
  SINGLE_ACCOUNT_PLATFORMS,
  disconnectIntegration,
  type IntegrationConnection,
  integrationsKey,
  setPrimaryIntegration,
  updateInboxSettings,
  updateTelegramSettings,
  useIntegrations,
} from './integrations-api';

const INBOX_PLATFORMS = new Set(['instagram', 'linkedin', 'x', 'gmail', 'outlook', 'whatsapp', 'messenger', 'telegram', 'facebook']);

type Props = { item: CatalogItem | null; onClose: () => void };

/** Connect an account, or manage the ones already connected for this platform. */
export function IntegrationDrawer({ item, onClose }: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { integrations } = useIntegrations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [disconnecting, setDisconnecting] = useState<IntegrationConnection | null>(null);

  const connections = item ? connectionsFor(item, integrations) : [];
  // One account per social plugin: once it's connected, the button reconnects
  // that account instead of adding another.
  const singleAccount = !!item && !item.appSlug && SINGLE_ACCOUNT_PLATFORMS.has(item.platform);
  const activeCount = connections.filter((connection) => connection.status === 'active').length;
  const hasActive = activeCount > 0;
  const limited = singleAccount && hasActive;
  const refresh = () => queryClient.invalidateQueries({ queryKey: integrationsKey });

  const close = () => {
    setError('');
    setNotice('');
    onClose();
  };

  const connect = async () => {
    if (!item) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await connectIntegration(item);
      if (result.status === 'connected') {
        setNotice(result.accountName ? `Connected ${result.accountName}.` : `${item.name} is connected.`);
        await refresh();
        // Webhook-saved connections can show up a moment later.
        setTimeout(refresh, 4000);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer visible={!!item} onClose={close} title={item?.name}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surface,
            }}
          >
            {/* The plugin's real logo, the same one its row shows. */}
            {item?.logo ? (
              <Image source={{ uri: item.logo }} style={{ width: 30, height: 30, borderRadius: 6 }} contentFit='contain' />
            ) : (
              <BrandLogo platform={item?.appSlug ?? item?.platform} size={30} />
            )}
          </View>
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.textMuted }}>{item?.description}</Text>
        </View>

        <Banner message={error} />
        <Banner tone='success' message={notice} />

        {connections.map((connection) => (
          <ConnectionCard
            key={connection._id}
            connection={connection}
            showInboxSettings={INBOX_PLATFORMS.has(item?.platform ?? '')}
            onChanged={refresh}
            onDisconnect={() => setDisconnecting(connection)}
          />
        ))}

        {item?.status === 'soon' ? (
          <Pill label='Coming soon' />
        ) : (
          <View style={{ gap: space.sm }}>
            <Button
              title={limited ? 'Reconnect' : connections.length ? 'Connect another account' : `Connect ${item?.name ?? ''}`}
              variant={connections.length ? 'secondary' : 'primary'}
              loading={busy}
              onPress={connect}
            />
            {limited ? (
              <Text style={{ fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center' }}>
                {activeCount > 1
                  ? `Only one ${item?.name} account can be connected to an organization. These stay connected, but no more can be added; disconnect the extras to keep one.`
                  : `One ${item?.name} account per organization. To use a different one, disconnect this account first.`}
              </Text>
            ) : null}
          </View>
        )}
      </Drawer>

      <ConfirmDrawer
        visible={!!disconnecting}
        onClose={() => setDisconnecting(null)}
        title='Disconnect account?'
        message={`Genit will stop posting, reading messages and syncing for ${disconnecting?.accountName ?? 'this account'}. You can connect it again later.`}
        confirmLabel='Disconnect'
        destructive
        onConfirm={async () => {
          if (!disconnecting) return;
          await disconnectIntegration(disconnecting._id);
          await refresh();
        }}
      />
    </>
  );
}

function ConnectionCard({
  connection,
  showInboxSettings,
  onChanged,
  onDisconnect,
}: {
  connection: IntegrationConnection;
  showInboxSettings: boolean;
  onChanged: () => void;
  onDisconnect: () => void;
}) {
  const colors = useColors();
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState<string>(connection.metadata?.inboxAutoReplyInstruction ?? '');
  const [saving, setSaving] = useState(false);
  const isTelegram = connection.platform === 'telegram';

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    setSaving(true);
    try {
      await action();
      onChanged();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const statusTone = connection.status === 'active' ? 'success' : 'danger';

  return (
    <View style={{ gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar uri={connection.accountAvatar} name={connection.accountName} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
            {connection.accountName}
          </Text>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            <Pill label={connection.status === 'active' ? 'Connected' : connection.status} tone={statusTone} />
            {connection.isPrimary ? <Pill label='Primary' tone='primary' /> : null}
          </View>
        </View>
      </View>
      <Banner message={error} />

      {showInboxSettings && connection.status === 'active' ? (
        <View style={{ gap: space.md }}>
          <Toggle
            label='AI auto-reply to messages'
            // The server stores this as inboxAutoReplyEnabled (telegramAutoReplyEnabled for Telegram).
            value={!!(connection.metadata?.inboxAutoReplyEnabled || connection.metadata?.telegramAutoReplyEnabled)}
            disabled={saving}
            onChange={(value) =>
              run(() =>
                isTelegram
                  ? updateTelegramSettings(connection._id, { autoReplyEnabled: value })
                  : updateInboxSettings(connection._id, { autoReplyEnabled: value })
              )
            }
          />
          {!isTelegram ? (
            <Toggle
              label='AI auto-reply to comments'
              value={!!connection.metadata?.commentAutoReplyEnabled}
              disabled={saving}
              onChange={(value) => run(() => updateInboxSettings(connection._id, { commentAutoReplyEnabled: value }))}
            />
          ) : null}
          {!isTelegram && connection.metadata?.inboxAutoReplyEnabled ? (
            <>
              <Field
                label='Reply instructions'
                value={instruction}
                onChangeText={setInstruction}
                placeholder='e.g. Keep it short and offer a call'
                multiline
              />
              <Button
                title='Save instructions'
                variant='secondary'
                small
                loading={saving}
                onPress={() => run(() => updateInboxSettings(connection._id, { autoReplyInstruction: instruction.trim() }))}
              />
            </>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {!connection.isPrimary && connection.status === 'active' ? (
          <Button title='Make primary' variant='secondary' small flex onPress={() => run(() => setPrimaryIntegration(connection._id))} />
        ) : null}
        <Button title='Disconnect' variant='danger' small flex onPress={onDisconnect} />
      </View>
    </View>
  );
}
