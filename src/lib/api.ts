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
  'auth/apple',
  'auth/apple/challenge',
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

export function getAuthToken() {
  return authToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

type QueryValue = string | number | boolean | null | undefined;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
  query?: Record<string, QueryValue>;
  timeoutMs?: number;
};

/** Builds `?a=1&b=2`, skipping empty values. */
export function queryString(query: Record<string, QueryValue> = {}) {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function apiUrl(path: string, query?: Record<string, QueryValue>) {
  return `${API_URL}${path}${queryString(query)}`;
}

/** Headers for requests made outside `api`, such as file downloads. */
export function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

// 203 is excluded on purpose: `auth/updatepassword` reports an invalid code with it.
const SUCCESS_STATUSES = new Set([200, 201, 204]);

const DEFAULT_TIMEOUT_MS = 30_000;

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = options.body || options.form ? 'POST' : 'GET', body, form, query, timeoutMs } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  // fetch sets the multipart boundary itself when given a FormData body.
  if (body) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(apiUrl(path, query), {
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

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!SUCCESS_STATUSES.has(response.status)) {
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
