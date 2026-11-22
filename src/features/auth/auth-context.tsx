import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api, ApiError, setAuthToken, setSessionExpiredHandler } from '@/lib/api';
import type { OnboardingRecord, User } from '@/lib/types';

const TOKEN_KEY = 'genituToken';

/**
 * - `loading`: reading the stored session.
 * - `unreachable`: a session exists but the server could not confirm it. The
 *   token is kept so being offline never signs anyone out.
 */
type Status = 'loading' | 'unreachable' | 'signed-out' | 'signed-in';

type AuthResponse = { token: string; user: User };

export type SignUpInput = { email: string; password: string; referralCode?: string };

type AuthContextValue = {
  status: Status;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  closeAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
  retry: () => Promise<void>;
  /** Why the session couldn't be confirmed: no connection, or an error from the server. */
  unreachableReason: { offline: boolean; message: string } | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function avatarUrl(name: string) {
  const background = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `https://eu.ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${background}&color=ffffff`;
}

export function onboardingRecord(user: User | null): OnboardingRecord | null {
  return user?.onboarding && typeof user.onboarding === 'object' ? user.onboarding : null;
}

/** The furthest an account may go. It alone decides which screens exist. */
export function accountStage(user: User | null) {
  if (!user) return 'auth';
  if (!user.emailVerified) return 'verify';
  const onboarding = onboardingRecord(user);
  return onboarding?.onboardingCompleted || onboarding?.onboardingSkipped ? 'app' : 'onboarding';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [unreachableReason, setUnreachableReason] = useState<AuthContextValue['unreachableReason']>(null);
  const [user, setUser] = useState<User | null>(null);

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setUser(null);
    setStatus('signed-out');
  }, []);

  const refreshUser = useCallback(async () => {
    const { user: activeUser } = await api<{ user: User }>('user/active-user');
    setUser(activeUser);
    setStatus('signed-in');
  }, []);

  /** A session the server rejected has already been cleared by the 401 handler. */
  const restore = useCallback(async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) {
      setStatus('signed-out');
      return;
    }
    setAuthToken(token);
    try {
      await refreshUser();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return;
      // Only a failed connection is "offline"; anything else is the server's answer.
      const offline = !(error instanceof ApiError) || error.isNetworkError;
      setUnreachableReason({ offline, message: error instanceof Error ? error.message : '' });
      setStatus('unreachable');
    }
  }, [refreshUser]);

  useEffect(() => {
    setSessionExpiredHandler(() => void clearSession());
    // restore() only sets state after awaiting storage, not synchronously as the rule assumes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
    return () => setSessionExpiredHandler(null);
  }, [clearSession, restore]);

  const retry = useCallback(async () => {
    setStatus('loading');
    await restore();
  }, [restore]);

  const startSession = useCallback(
    async ({ token }: AuthResponse) => {
      setAuthToken(token);
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      // The sign-in responses don't populate onboarding, and routing depends on it.
      await refreshUser();
    },
    [refreshUser]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const body = { email: normalizeEmail(email), password };
      await startSession(await api<AuthResponse>('auth/sign-in', { body }));
    },
    [startSession]
  );

  const signUp = useCallback(
    async ({ email, password, referralCode }: SignUpInput) => {
      const normalized = normalizeEmail(email);
      const username = normalized.split('@')[0];
      const body = {
        email: normalized,
        password,
        username,
        userdp: avatarUrl(username),
        ...(referralCode ? { referralCode } : {}),
      };
      await startSession(await api<AuthResponse>('auth/sign-up', { body }));
    },
    [startSession]
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      await startSession(await api<AuthResponse>('auth/google', { body: { idToken } }));
    },
    [startSession]
  );

  const signOut = useCallback(async () => {
    // The local session ends even if the server can't be told about it.
    await api('auth/logout').catch(() => undefined);
    await clearSession();
  }, [clearSession]);

  const closeAccount = useCallback(async () => {
    await api('auth/close-account', { method: 'POST' });
    await clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      status,
      user,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      closeAccount,
      refreshUser,
      retry,
      unreachableReason,
    }),
    [status, user, signIn, signUp, signInWithGoogle, signOut, closeAccount, refreshUser, retry, unreachableReason]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
