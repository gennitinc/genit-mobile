import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { api, ApiError } from '@/lib/api';

import {
  type CatalogItem,
  effectivePlatform,
  type IntegrationConnection,
  type IntegrationsResponse,
  TOOLKIT_BY_PLATFORM,
} from './integrations-api';

/** Where the server sends the browser once the provider sign-in finishes. */
const RETURN_URL = Linking.createURL('integrations/callback');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isClientError(error: unknown) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** Managed connections are saved by a webhook, which can land a moment after the redirect. */
async function findNewConnection(item: CatalogItem, startedAt: number) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await wait(1500);
    const { integrations } = await api<IntegrationsResponse>('integrations');
    const match = integrations.find(
      (connection) =>
        connection.status === 'active' &&
        (item.appSlug
          ? connection.metadata?.toolkitSlug === item.appSlug
          : effectivePlatform(connection) === item.platform) &&
        Date.parse(connection.updatedAt) >= startedAt - 2000
    );
    if (match) return match;
  }
  return null;
}

async function syncConnection(item: CatalogItem, connectedAccountId?: string) {
  const toolkit = item.appSlug ?? TOOLKIT_BY_PLATFORM[item.platform];
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await wait(1500);
    try {
      const { integration } = await api<{ integration: IntegrationConnection }>('integrations/composio/sync', {
        body: { toolkit, platform: item.platform, connectedAccountId },
      });
      return integration;
    } catch (error) {
      lastError = error;
      if (isClientError(error)) break;
    }
  }
  throw lastError;
}

export type ConnectResult =
  | { status: 'connected'; accountName?: string }
  | { status: 'cancelled' };

/**
 * Connects an account through the provider's own sign-in page.
 *
 * The server redirects back to `genit://integrations/callback` (it accepts a
 * `returnUrl`), which closes the browser and carries the result here.
 */
export async function connectIntegration(item: CatalogItem): Promise<ConnectResult> {
  const startedAt = Date.now();
  const path = item.appSlug ? 'integrations/composio/connect-url' : `integrations/${item.platform}/connect-url`;
  const body = item.appSlug ? { toolkit: item.appSlug, returnUrl: RETURN_URL } : { returnUrl: RETURN_URL };

  const response = await api<{ authorizeUrl?: string; skipOAuth?: boolean }>(path, { body });
  if (response.skipOAuth) return { status: 'connected' };
  if (!response.authorizeUrl?.startsWith('https://')) {
    throw new ApiError(0, 'The provider returned an invalid sign-in link.');
  }

  const result = await WebBrowser.openAuthSessionAsync(response.authorizeUrl, RETURN_URL);

  if (result.type === 'success') {
    const { queryParams } = Linking.parse(result.url);
    const param = (key: string) => {
      const value = queryParams?.[key];
      return typeof value === 'string' && value ? value : undefined;
    };
    const error = param('error');
    if (error) throw new ApiError(400, error);

    const sessionUri = param('session_uri');
    if (sessionUri) {
      const { integration } = await api<{ integration: IntegrationConnection }>(
        'integrations/composio/complete-auth',
        { body: { sessionUri, platform: item.platform } }
      );
      return { status: 'connected', accountName: integration.accountName };
    }

    try {
      const integration = await syncConnection(item, param('connected_account_id'));
      return { status: 'connected', accountName: integration.accountName };
    } catch (error) {
      const found = await findNewConnection(item, startedAt);
      if (found) return { status: 'connected', accountName: found.accountName };
      throw error;
    }
  }

  // The browser was closed by hand. The sign-in may still have completed.
  const found = await findNewConnection(item, startedAt);
  return found ? { status: 'connected', accountName: found.accountName } : { status: 'cancelled' };
}
