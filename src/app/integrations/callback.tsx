import { Redirect } from 'expo-router';

/**
 * Account sign-in returns to genit://integrations/callback. The in-app browser
 * normally consumes that link itself; if the system opens the app with it
 * instead, send the user back to where their account is up to.
 */
export default function IntegrationCallback() {
  return <Redirect href='/' />;
}
