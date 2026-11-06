const LIVE_API_URL = 'https://gennit-v1-server-production.up.railway.app/api/v1/';
const LOCAL_API_URL = 'http://localhost:8000/api/v1/';

const configured = process.env.EXPO_PUBLIC_API_URL;

/** Matches the web app: local server in development, live server in release builds. */
export const API_URL = withTrailingSlash(configured || (__DEV__ ? LOCAL_API_URL : LIVE_API_URL));

export const WEB_URL = 'https://www.trygenit.com';

export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

function withTrailingSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}
