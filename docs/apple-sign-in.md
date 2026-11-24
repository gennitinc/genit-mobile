# Sign in with Apple setup

The app offers Apple and Google alongside email/password on iOS. Google and email/password remain on Android. Apple's private credentials belong only on the server; the mobile app needs no Apple secret in `.env.local`.

## Apple Developer

1. Enable **Sign in with Apple** for the app identifier `com.genit.app` in Certificates, Identifiers & Profiles.
2. Create a Sign in with Apple key associated with that primary App ID. Download the `.p8` file and record its Key ID and your Team ID. Apple only allows the key download once.
3. Configure your email sender domain with Apple's private email relay if Genit sends mail to Hide My Email addresses.
4. Rebuild the iOS app. The Expo config now sets `ios.usesAppleSignIn` and includes `expo-apple-authentication`. A JavaScript update alone cannot add the native module or entitlement.

## Server environment

Placeholders were appended to `gennit-v1-server/.env` without overwriting existing values. `.env.apple.example` documents the same keys. Set them in the deployed server's environment as well; local `.env` changes do not update Railway.

| Variable | Value |
| --- | --- |
| `APPLE_CLIENT_ID` | `com.genit.app` (native iOS bundle ID, not a web Services ID) |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_KEY_ID` | ID of the Apple Sign in key |
| `APPLE_PRIVATE_KEY` | Entire `.p8` PEM, including BEGIN/END lines. Quoted literal `\n` separators or actual newlines are supported. |
| `APPLE_TOKEN_ENCRYPTION_KEY` | Generate once with `openssl rand -hex 32`; keep the same value across deployments. |

No key material is committed. The server creates short-lived Apple client-secret JWTs from the key. Do not paste these secrets into chat or put them in mobile environment variables. Losing or changing the token-encryption key without migrating stored tokens prevents revoking existing Apple authorizations during account deletion.

## Behavior and verification

The server issues a five-minute, single-use nonce; validates Apple's signature, issuer, audience, expiry and nonce; exchanges the authorization code and checks the resulting subject; then creates the existing Genit session. Refresh tokens are encrypted and excluded from user API responses. Account deletion revokes Apple authorization first and fails visibly if revocation fails.

Returning users are matched by Apple subject. New users may share their email or use Apple's relay address. If an email already belongs to another Genit account, automatic linking is refused; the user can use their existing login or Hide My Email. Authenticated account linking is not implemented.

Run server checks with `npx ts-node --files src/services/apple-identity.test.ts`. The tests use local signing keys and an isolated MongoDB, stub Apple network responses, and send no email. Mobile checks: `npx tsc --noEmit` and `npm run lint`.

Before submission, deploy the server, supply credentials, and test a fresh iOS build on a physical device: Share My Email, Hide My Email, returning sign-in, cancellation, email collision, Google sign-in and account deletion. Simulator and mocked tests cannot verify the Apple provisioning profile or real credentials. If any Google OAuth account existed before the new flow, test it too.

References: [Expo SDK 58 Apple authentication](https://docs.expo.dev/versions/v58.0.0/sdk/apple-authentication/), [Apple token exchange](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens), [Apple token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens).
