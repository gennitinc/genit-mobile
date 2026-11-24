const LIVE_API_URL = 'https://gennit-v1-server-production.up.railway.app/api/v1/';

/** The live server, the same one the web app uses. Set EXPO_PUBLIC_API_URL to use a local server instead. */
export const API_URL = withTrailingSlash(process.env.EXPO_PUBLIC_API_URL || LIVE_API_URL);

/** The marketing site (legal pages, contact). The product itself is on app.trygenit.com. */
export const WEB_URL = 'https://trygenit.com';

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  ?.replace(/^["']|["']$/g, '')
  .trim();
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  ?.replace(/^["']|["']$/g, '')
  .trim();

function withTrailingSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}
