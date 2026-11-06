import { Redirect } from 'expo-router';

import { accountStage, useAuth } from '@/features/auth/auth-context';

const DESTINATIONS = {
  auth: '/welcome',
  verify: '/verify-email',
  onboarding: '/onboarding',
  app: '/home',
} as const;

/** App launches and guard changes land here, then go to wherever the account is up to. */
export default function IndexRoute() {
  const { user } = useAuth();
  return <Redirect href={DESTINATIONS[accountStage(user)]} />;
}
