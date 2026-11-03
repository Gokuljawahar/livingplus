import { useEffect, useState } from 'react';

/** 30-second resend cooldown so code buttons can't be tapped into a rate limit. */
export function useOtpCooldown(seconds = 30) {
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  return { cooldown, startCooldown: () => setCooldown(seconds) };
}
