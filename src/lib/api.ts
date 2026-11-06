import { API_URL } from './config';

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  get isNetworkError() {
    return this.status === 0;
  }
}

/**
 * Routes that answer 401 for reasons other than a dead session: `sign-up` for a
 * taken email and `verify-email` for an expired code. These must not sign the
 * user out.
 */
const PUBLIC_PATHS = [
  'auth/sign-in',
  'auth/sign-up',
  'auth/google',
  'auth/forgot-password',
  'auth/verifypasswordresetoken',
  'auth/updatepassword',
  'auth/verify-email',
];

let authToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = options.body || options.form ? 'POST' : 'GET', body, form, timeoutMs } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  // fetch sets the multipart boundary itself when given a FormData body.
  if (body) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: form ?? (body ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      0,
      controller.signal.aborted
        ? 'That took too long. Please try again.'
        : "We couldn't reach Genit. Check your connection and try again."
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);

  // Only 200 counts as success: `auth/updatepassword` reports an invalid code
  // with a 203, which would otherwise pass an `ok` check.
  if (response.status !== 200) {
    if (response.status === 401 && !PUBLIC_PATHS.includes(path)) {
      onSessionExpired?.();
    }
    throw new ApiError(
      response.status,
      data?.message || data?.error || 'Something went wrong. Please try again.'
    );
  }

  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
