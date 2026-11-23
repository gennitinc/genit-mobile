import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Drawer } from '@/components/drawer';
import { Icon } from '@/components/icon';
import { Card, Chip, ChipRow, Empty, IconButton, LoadError, Loading, Page, Pill, Row, SectionTitle, Segmented, Stat } from '@/components/kit';
import { PullRefresh } from '@/components/pull-refresh';
import { Banner, Button, Field } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import {
  billingKeys,
  type BillingRecord,
  type CreditRange,
  type CreditTransaction,
  createTopUpCheckout,
  creditsFor,
  CREDITS_PER_USD,
  getBillingHistory,
  getCustomerPortalUrl,
  isValidTopUp,
  MIN_TOP_UP,
} from '@/features/billing/billing-api';
import { currentOrganization } from '@/features/orgs/orgs-api';
import { errorMessage } from '@/lib/api';
import { dateTime, shortDate } from '@/lib/format';
import { space, useColors } from '@/lib/theme';

const PRESETS = [10, 25, 50, 100];

const RANGES: { value: CreditRange; label: string }[] = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All' },
];

const dollars = (amount: number) => `$${amount.toFixed(2)}`;

export default function BillingScreen() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const org = currentOrganization(user);
  const [range, setRange] = useState<CreditRange>('30');
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [error, setError] = useState('');
  const history = useQuery({ queryKey: billingKeys.history(range), queryFn: () => getBillingHistory(range) });

  const refresh = async () => {
    await Promise.all([refreshUser(), queryClient.invalidateQueries({ queryKey: billingKeys.all })]);
  };

  // Payment happens on the provider's page; the balance is re-read once it closes.
  const openThenRefresh = async (url: string) => {
    await WebBrowser.openBrowserAsync(url);
    await refresh();
  };

  const portal = useMutation({
    mutationFn: getCustomerPortalUrl,
    onMutate: () => setError(''),
    onSuccess: openThenRefresh,
    onError: () => setError('Could not open invoices and receipts. Please try again in a moment.'),
  });

  const plan = user?.userPlan || 'Basic';
  const isFree = plan.toLowerCase() === 'basic';

  return (
    <Page title='Billing' back={() => router.back()} actions={<IconButton icon='refresh' label='Refresh' busy={history.isFetching} onPress={() => void refresh()} />}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: space.xxl, gap: space.lg }}
        refreshControl={<PullRefresh onRefresh={refresh} />}
      >
        <Banner message={error} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Stat label='Current plan' value={plan} hint={isFree ? 'Free plan' : org?.businessPlan || 'Active subscription'} />
          <Stat label='Credit balance' value={(user?.creditsRemaining ?? 0).toLocaleString()} hint={`Pay what you want from $${MIN_TOP_UP}`} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title='Top up credits' flex icon={<Icon name='add' size={18} color={colors.onPrimary} />} onPress={() => setTopUpOpen(true)} />
          <Button title='Invoices & receipts' variant='secondary' flex loading={portal.isPending} onPress={() => portal.mutate()} />
        </View>

        {history.isLoading ? (
          <Loading />
        ) : history.isError ? (
          <LoadError error={history.error} onRetry={history.refetch} />
        ) : (
          <>
            <View style={{ gap: space.sm }}>
              <SectionTitle title='Billing history' />
              {history.data?.billingHistory.length ? (
                <Card style={{ paddingHorizontal: 0, paddingVertical: space.xs, gap: 0 }}>
                  {history.data.billingHistory.map((record, index) => (
                    <BillingRow key={record._id || record.invoiceId || record.providerId || index} record={record} />
                  ))}
                </Card>
              ) : (
                <Empty icon='card-outline' title='No billing activity yet' message='Completed subscriptions and credit top-ups will appear here.' />
              )}
            </View>

            <View style={{ gap: space.sm }}>
              <SectionTitle title='Credit activity' />
              <Segmented options={RANGES} value={range} onChange={setRange} />
              {history.data?.creditTransactions.length ? (
                <Card style={{ paddingHorizontal: 0, paddingVertical: space.xs, gap: 0 }}>
                  {history.data.creditTransactions.map((transaction) => (
                    <CreditRow key={transaction._id} transaction={transaction} />
                  ))}
                </Card>
              ) : (
                <Empty icon='flash-outline' title='No credit activity yet' message='Charges and automatic refunds will appear here.' />
              )}
            </View>
          </>
        )}
      </ScrollView>

      <TopUpDrawer visible={topUpOpen} onClose={() => setTopUpOpen(false)} onCheckout={openThenRefresh} />
    </Page>
  );
}

function BillingRow({ record }: { record: BillingRecord }) {
  const title = record.invoiceNumber
    ? `Invoice #${record.invoiceNumber}`
    : record.description || (record.type === 'credit_topup' ? 'Credit top up' : 'Subscription');
  const amount = typeof record.amount === 'number' ? dollars(record.amount) : '—';
  const status = record.status ? record.status.charAt(0).toUpperCase() + record.status.slice(1) : '';
  return (
    <Row
      title={title}
      subtitle={[amount, status, shortDate(record.billingPeriodStart || record.createdAt)].filter(Boolean).join(' · ')}
      onPress={record.invoicePdfUrl ? () => void WebBrowser.openBrowserAsync(record.invoicePdfUrl!) : undefined}
      trailing={record.invoicePdfUrl ? <IconButton icon='download-outline' label='Download invoice' onPress={() => void WebBrowser.openBrowserAsync(record.invoicePdfUrl!)} /> : undefined}
    />
  );
}

function CreditRow({ transaction }: { transaction: CreditTransaction }) {
  const charged = transaction.settledAmount ?? transaction.amount;
  const refunded = transaction.status === 'refunded';
  const credited = transaction.direction === 'credit';
  const reason = String(transaction.reason).replaceAll('_', ' ');
  return (
    <Row
      title={reason.charAt(0).toUpperCase() + reason.slice(1)}
      subtitle={`${dateTime(transaction.createdAt)}${transaction.balanceAfter !== undefined ? ` · ${transaction.balanceAfter.toLocaleString()} remaining` : ''}`}
      trailing={<Pill label={refunded ? 'Refunded' : `${credited ? '+' : '−'}${charged.toLocaleString()}`} tone={refunded || credited ? 'success' : 'neutral'} />}
    />
  );
}

function TopUpDrawer({ visible, onClose, onCheckout }: { visible: boolean; onClose: () => void; onCheckout: (url: string) => Promise<void> }) {
  const colors = useColors();
  const [text, setText] = useState(String(MIN_TOP_UP));
  const [error, setError] = useState('');
  const amount = Number(text);
  const valid = isValidTopUp(amount);

  const checkout = useMutation({
    mutationFn: () => createTopUpCheckout(amount),
    onMutate: () => setError(''),
    onSuccess: async (url) => {
      onClose();
      await onCheckout(url);
    },
    onError: (caught) => setError(errorMessage(caught) || 'Please check the amount and try again.'),
  });

  return (
    <Drawer
      visible={visible}
      onClose={onClose}
      title='Top up credits'
      footer={
        <Button
          title={valid ? `Continue with $${amount.toLocaleString()}` : `Minimum $${MIN_TOP_UP}`}
          disabled={!valid}
          loading={checkout.isPending}
          onPress={() => checkout.mutate()}
        />
      }
    >
      <View style={{ paddingHorizontal: space.page, gap: space.lg }}>
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textMuted }}>
          Choose how much to add. Every $1 gives you {CREDITS_PER_USD} credits. You’ll pay securely on the checkout page.
        </Text>
        <Banner message={error} />
        <ChipRow>
          {PRESETS.map((preset) => (
            <Chip key={preset} label={`$${preset}`} active={amount === preset} onPress={() => setText(String(preset))} />
          ))}
        </ChipRow>
        <Field
          label='Amount in US dollars'
          value={text}
          onChangeText={(value) => setText(value.replace(/[^0-9.]/g, ''))}
          keyboardType='decimal-pad'
          leading={<Text style={{ fontSize: 16, color: colors.textMuted }}>$</Text>}
          error={text && !valid ? `Enter at least $${MIN_TOP_UP}, in whole cents` : undefined}
        />
        <View style={{ alignItems: 'center', gap: 2, paddingVertical: space.sm }}>
          <Text style={{ fontSize: 32, fontWeight: '700', color: colors.text }}>{valid ? creditsFor(amount).toLocaleString() : '—'}</Text>
          <Text style={{ fontSize: 14, color: colors.textMuted }}>credits</Text>
        </View>
      </View>
    </Drawer>
  );
}
