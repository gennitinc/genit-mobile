import { useAuth } from '@/features/auth/auth-context';

/** Plugins anyone can connect (the server allows only these on the free plan). */
export const FREE_PLUGINS = new Set(['gmail', 'outlook']);

/** Whether connecting this plugin needs a paid plan. */
export function isProPlugin(item: { platform: string; appSlug?: string }) {
  return !FREE_PLUGINS.has((item.appSlug ?? item.platform).toLowerCase());
}

export function isFreePlan(plan?: string | null) {
  return !plan || plan === 'Basic';
}

/** True for the free (Basic) plan, where Pro features show a gold crown and ask to upgrade. */
export function useIsFreePlan() {
  const { user } = useAuth();
  return isFreePlan(user?.userPlan);
}

/** Gold, for the crown on Pro features. */
export const PRO_GOLD = '#E5A400';
