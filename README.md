# Genit mobile

The Genit iOS and Android app, built with Expo (SDK 58) and Expo Router. It currently covers authentication and onboarding, using the same API as the web app.

## Run it

```bash
npm install
npm start
```

Press `i` for the iOS Simulator or `a` for Android. In development the app calls `http://localhost:8000/api/v1/`; release builds call the live server. Copy `.env.example` to `.env.local` to change this. A physical device needs your computer's LAN IP.

### Without a real backend

`gennit-v1-server/.env` points at the production database, so running that server locally writes real accounts and sends real email. To work on these flows safely, use the in-memory mock, where every code is `123456`:

```bash
npm run mock-api
```

```bash
EXPO_PUBLIC_API_URL=http://localhost:8787/api/v1/ npm start
```

Sending `000000` as an email code simulates an expired code. Importing a URL containing `fail` simulates a failed import.

## Google Sign-In

The button stays hidden until this is set up, and it can't run in Expo Go.

1. In Google Cloud Console, in the project that owns the web app's client ID, create an iOS OAuth client with the bundle ID `com.trygenit.app`. For Android, create an Android client with the same package name and your signing certificate's SHA-1.
2. In `.env.local`, set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (the web app's client ID) and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
3. On the server, set `GOOGLE_IOS_CLIENT_ID` and `GOOGLE_ANDROID_CLIENT_ID`, or it rejects tokens from the app.
4. Make a development build with `npx expo run:ios`, or with `eas build --profile development`.

The mock API accepts Google sign-in without verifying the token, so only the real server proves the whole flow.

## How it fits together

- `src/app/` holds the routes. `_layout.tsx` decides which screens exist from the account's stage: signed out, needs verification, needs onboarding, or ready.
- `src/features/auth/auth-context.tsx` owns the session. The token lives in the device keychain through `expo-secure-store`.
- `src/features/onboarding/` holds the three onboarding steps. Progress is saved to the server, so a relaunch resumes where the user left off.
- `src/lib/api.ts` is the API client. A 401 from a signed-in route ends the session.

## Checks

```bash
npx tsc --noEmit
```

```bash
npx expo lint
```

```bash
npx expo-doctor
```
