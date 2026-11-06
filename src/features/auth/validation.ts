// Same rules as the web app's utils/Regex.ts.
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export const MIN_PASSWORD_LENGTH = 8;

export function emailError(email: string) {
  if (!email.trim()) return 'Enter your email address';
  return EMAIL_REGEX.test(email.trim()) ? undefined : 'Enter a valid email address';
}

export function passwordError(password: string) {
  if (!password) return 'Enter a password';
  return password.length >= MIN_PASSWORD_LENGTH
    ? undefined
    : `Use at least ${MIN_PASSWORD_LENGTH} characters`;
}
