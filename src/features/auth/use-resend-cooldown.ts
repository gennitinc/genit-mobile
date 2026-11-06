import { useEffect, useState } from 'react';

const COOLDOWN_SECONDS = 30;

/** Keeps "Resend code" from being tapped repeatedly while an email is on its way. */
export function useResendCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const run = async (send: () => Promise<void>) => {
    setSending(true);
    try {
      await send();
      setSecondsLeft(COOLDOWN_SECONDS);
    } catch {
      // The caller has already shown the error; leave resend available.
    } finally {
      setSending(false);
    }
  };

  return {
    run,
    disabled: sending || secondsLeft > 0,
    label: sending ? 'Sending…' : secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : 'Resend code',
  };
}
