import { api, ApiError } from '@/lib/api';

export type ReferredUser = {
  _id: string;
  username: string;
  email: string;
  userdp?: string;
  referredAt: string;
  daysActive: number;
  isActive: boolean;
};

export type ReferralStats = {
  totalRevenue: number;
  revenueChange: number;
  revenueShare: number;
  totalSupporters: number;
  activeSupporters: number;
  expiringSupporters: number;
  referralLink: string;
  referredUsers: ReferredUser[];
};

export const creatorKeys = { status: ['creator', 'status'] as const, stats: ['creator', 'stats'] as const };

/** A 404 from the server also means "not enrolled". */
export const getEnrollment = () =>
  api<{ isEnrolled: boolean }>('referral/status')
    .then((data) => !!data.isEnrolled)
    .catch((error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      throw error;
    });

export const getStats = () => api<ReferralStats>('referral/stats');

export const joinProgram = () => api('referral/join', { method: 'POST' });

export function qrImageUrl(link: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
}

export function embedCode(link: string) {
  return `<a href="${link}" target="_blank" rel="noopener noreferrer">Join me on genit</a>`;
}
