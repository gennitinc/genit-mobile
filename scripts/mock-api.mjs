// In-memory stand-in for the Genit auth and onboarding API, so these flows can be
// exercised without touching a real database or sending email. Every code is 123456.
//
//   npm run mock-api
//   EXPO_PUBLIC_API_URL=http://localhost:8787/api/v1/ npx expo start
//
// Status codes and response shapes mirror gennit-v1-server's auth controllers,
// including the quirks: 401 for a taken email and 203 for a bad reset code.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const CODE = '123456';
const users = new Map();
const sessions = new Map();

const findByToken = (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  return sessions.get(token);
};

function publicUser(user) {
  const { password: _password, ...rest } = user;
  return rest;
}

function startSession(user) {
  const token = randomUUID();
  sessions.set(token, user);
  return token;
}

const routes = {
  'POST auth/sign-up': ({ body }) => {
    if (!body.email || (body.password ?? '').length < 8) {
      return [400, { message: 'A valid email and password of at least 8 characters are required' }];
    }
    if (users.has(body.email)) return [401, { message: 'Email Already Exists' }];
    const user = {
      _id: randomUUID(),
      email: body.email,
      username: body.username,
      userdp: body.userdp,
      password: body.password,
      emailVerified: false,
      signInType: 'email',
      onboarding: null,
    };
    users.set(body.email, user);
    return [200, { message: 'Please check your email', token: startSession(user), user: publicUser(user) }];
  },
  'POST auth/sign-in': ({ body }) => {
    const user = users.get(body.email);
    if (!user) return [404, { message: 'User not found' }];
    if (user.password !== body.password) return [400, { message: 'Invalid Credentials' }];
    return [200, { message: 'Account signed in successfully', token: startSession(user), user: publicUser(user) }];
  },
  // Reads the ID token without verifying it, unlike the real server. This only tests the app's flow.
  'POST auth/google': ({ body }) => {
    if (!body.idToken) return [401, { message: 'Invalid Google sign-in' }];
    const { email, name, picture } = JSON.parse(Buffer.from(body.idToken.split('.')[1], 'base64url').toString());
    let user = users.get(email);
    if (!user) {
      user = {
        _id: randomUUID(),
        email,
        username: name,
        userdp: picture,
        emailVerified: true,
        signInType: 'google',
        onboarding: null,
      };
      users.set(email, user);
    }
    return [200, { message: 'Account signed in successfully', token: startSession(user), user: publicUser(user) }];
  },
  'GET auth/logout': ({ req, user }) => {
    if (!user) return [401, { message: 'Invalid token' }];
    sessions.delete(req.headers.authorization.split(' ')[1]);
    return [200, { message: 'User signed out' }];
  },
  'POST auth/verify-email': ({ body }) => {
    if (body.verificationCode) {
      if (body.verificationCode === '000000') {
        return [401, { message: 'Verification code expired. A new verification code has been sent to your email.' }];
      }
      if (body.verificationCode !== CODE) return [400, { message: 'Invalid verification code' }];
      for (const user of users.values()) if (!user.emailVerified) user.emailVerified = true;
      return [200, { message: 'Email verified successfully' }];
    }
    return users.has(body.email)
      ? [200, { message: 'A new verification code has been sent to your email.' }]
      : [400, { message: 'User not found' }];
  },
  'POST auth/forgot-password': ({ body }) =>
    users.has(body.email)
      ? [200, { message: 'Password reset code has been sent to your email' }]
      : [404, { message: 'User not found' }],
  'POST auth/verifypasswordresetoken': ({ body }) =>
    body.token === CODE
      ? [200, { message: 'Valid reset code' }]
      : [400, { message: 'Invalid or expired reset code' }],
  'POST auth/updatepassword': ({ body }) => {
    if (body.token !== CODE) return [203, { message: 'Reset code is invalid or expired' }];
    // The real server finds the user by code; the mock has no per-user codes.
    for (const user of users.values()) user.password = body.newPassword;
    return [200, { message: 'Password reset successful' }];
  },
  'POST auth/close-account': ({ user }) => {
    if (!user) return [401, { message: 'Invalid token' }];
    users.delete(user.email);
    for (const [token, owner] of sessions) if (owner === user) sessions.delete(token);
    return [200, { message: 'Account closed successfully' }];
  },
  'GET user/active-user': ({ user }) =>
    user ? [200, { user: publicUser(user) }] : [401, { message: 'Invalid token' }],
  'POST auth/onboarding/save': ({ body, user, multipart }) => {
    if (!user) return [401, { message: 'Invalid token' }];
    user.onboarding = { onboardingCompleted: false, onboardingStep: 'brand-basics', ...user.onboarding, ...body };
    if (multipart) user.onboarding.brandLogo = 'https://www.trygenit.com/icon-512x512.png';
    return [200, { success: true, message: 'Onboarding data saved successfully', onboarding: user.onboarding }];
  },
  'POST auth/onboarding/extract-brand': async ({ body, user }) => {
    if (!user) return [401, { message: 'Invalid token' }];
    if (body.url.includes('fail')) return [500, { success: false, message: 'Failed to extract brand data' }];
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return [
      200,
      {
        success: true,
        brand: {
          companyWebsite: `https://${body.url}`,
          businessName: 'Acme Studio',
          businessBio: 'Design tools for small teams.',
          industry: 'Software',
          brandLogo: '',
          brandColors: ['#4F46E5', '#F59E0B', '#0F172A'],
          primaryColor: '#4F46E5',
          secondaryColor: '#F59E0B',
          fontHeadline: 'Poppins',
          fontBody: 'Inter',
          aboutUs: 'Acme helps small teams ship polished design work.',
          mission: 'Make good design the default.',
          vision: 'Every team has a design studio in their pocket.',
          slogan: 'Design, handled.',
          values: ['Craft', 'Clarity'],
          voiceTone: ['Warm', 'Direct'],
          socials: { instagram: 'instagram.com/acme' },
          source: 'website',
          pagesVisited: [],
        },
      },
    ];
  },
};

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const multipart = req.headers['content-type']?.startsWith('multipart/') ?? false;
  const body = !multipart && chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  const path = req.url.replace(/^\/api\/v1\//, '').split('?')[0];

  const handler = routes[`${req.method} ${path}`];
  const [status, payload] = handler
    ? await handler({ req, body, multipart, user: findByToken(req) })
    : [404, { message: `No mock for ${req.method} ${path}` }];

  const upload = multipart ? Buffer.concat(chunks).toString('latin1').split('\r\n\r\n')[0].split('\r\n').slice(1).join('; ') : '';
  console.log(`${req.method} ${path} -> ${status}${upload ? ` [${upload}]` : ''}`);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}).listen(PORT, () => console.log(`Mock Genit API on http://localhost:${PORT}/api/v1/ (all codes: ${CODE})`));
