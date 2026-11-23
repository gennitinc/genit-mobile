import { api } from '@/lib/api';

/** Same limits as the server, which checks them again. */
export const MIN_TOP_UP = 10;
export const MAX_TOP_UP = 999999.99;
export const CREDITS_PER_USD = 50;

export type BillingRecord = {
  _id?: string;
  invoiceId?: string;
  providerId?: string;
  invoiceNumber?: string;
  description?: string;
  type?: string;
  status?: string;
  amount?: number;
  billingPeriodStart?: string;
  createdAt?: string;
  invoicePdfUrl?: string;
};

export type CreditTransaction = {
  _id: string;
  amount: number;
  settledAmount?: number;
  direction?: 'debit' | 'credit';
  reason: string;
  status?: string;
  balanceAfter?: number;
  createdAt: string;
};

export type CreditRange = '30' | '90' | 'all';

export const billingKeys = {
  all: ['billing'] as const,
  history: (range: CreditRange) => ['billing', 'history', range] as const,
};

/** Billing records plus the latest 50 credit transactions in the range. */
export function getBillingHistory(range: CreditRange) {
  const query =
    range === 'all' ? {} : { creditFrom: new Date(Date.now() - Number(range) * 86_400_000).toISOString(), creditTo: new Date().toISOString() };
  return api<{ billingHistory: BillingRecord[]; creditTransactions: CreditTransaction[] }>('payment/billing-history', { query });
}

export const creditsFor = (amount: number) => Math.floor((Math.round(amount * 100) * CREDITS_PER_USD) / 100);

export function isValidTopUp(amount: number) {
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && amount >= MIN_TOP_UP && amount <= MAX_TOP_UP && Math.abs(amount * 100 - cents) < 0.001;
}

export const createTopUpCheckout = (amount: number) =>
  api<{ checkoutUrl: string }>('payment/top-up/create', { body: { amount } }).then((result) => result.checkoutUrl);

export const getCustomerPortalUrl = () =>
  api<{ customerPortalUrl: string }>('payment/portal').then((result) => result.customerPortalUrl);
