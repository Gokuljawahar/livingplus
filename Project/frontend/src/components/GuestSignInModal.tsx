import { useRef, useState } from 'react';
import { Check, Loader2, Phone, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useOtpCooldown } from '../hooks/useOtpCooldown';
import { normalizePhoneDigits, saveGuestSession, type GuestSession } from '../utils/guest-session';
import { phoneOtpErrorMessage, startPhoneVerification, type PhoneChallenge } from '../utils/phone-otp';

interface Props {
  open: boolean;
  onClose: () => void;
  onVerified: (session: GuestSession) => void;
  title?: string;
  subtitle?: string;
}

export default function GuestSignInModal({
  open,
  onClose,
  onVerified,
  title = 'Verify your phone number',
  subtitle = 'One quick code lets you save PGs, view owner phone numbers, and book a bed with no password.'
}: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const { cooldown, startCooldown } = useOtpCooldown();
  const challenge = useRef<PhoneChallenge<'BOOKING'> | null>(null);

  if (!open) return null;

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length < 10) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    setLoading(true);
    try {
      challenge.current = await startPhoneVerification(digits, 'BOOKING');
      if (challenge.current.devCode) toast.success(`Demo code: ${challenge.current.devCode}`);
      else toast.success('Verification code sent');
      setStep('code');
      startCooldown();
    } catch (error) {
      toast.error(phoneOtpErrorMessage(error, 'Could not send code'));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (!challenge.current) {
      toast.error('Request a new code first');
      return;
    }
    setLoading(true);
    try {
      const data = await challenge.current.verify(code);
      const session = saveGuestSession(digits, data.phoneToken, data.guestToken);
      toast.success('Phone verified');
      onVerified(session);
      onClose();
    } catch (error) {
      toast.error(phoneOtpErrorMessage(error, 'Invalid verification code'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-signin-title"
        className="w-full max-w-md rounded-t-[var(--radius-card)] bg-canvas p-6 shadow-[var(--shadow-float)] sm:rounded-[var(--radius-card)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-navy-700">
              <ShieldCheck className="h-4 w-4 text-positive" /> Guest access
            </p>
            <h2 id="guest-signin-title" className="mt-1 text-xl font-bold text-navy-900">{title}</h2>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-surface"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'phone' ? (
          <form onSubmit={requestCode} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-navy-900">
              Mobile number
              <span className="relative mt-1.5 block">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  required
                  type="tel"
                  autoFocus
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="98765 43210"
                  autoComplete="tel"
                  className="w-full rounded-[var(--radius-field)] border border-field-border bg-canvas py-2.5 pl-10 pr-3 text-ink outline-none focus:border-navy-900"
                />
              </span>
            </label>
            <button type="submit" disabled={loading || cooldown > 0} className="btn-primary w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {cooldown > 0 ? `Send again in ${cooldown}s` : 'Send verification code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-5 space-y-4">
            <p className="flex items-center gap-2 rounded-[var(--radius-field)] bg-positive-bg px-3 py-2 text-sm font-medium text-positive">
              <Check className="h-4 w-4 shrink-0" /> Code sent to +{normalizePhoneDigits(phone)}
            </p>
            <label className="block text-sm font-medium text-navy-900">
              6-digit verification code
              <input
                required
                autoFocus
                aria-label="6-digit verification code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className="mt-1.5 block w-full rounded-[var(--radius-field)] border border-field-border bg-canvas px-3 py-2.5 text-ink tabular tracking-[0.2em] outline-none focus:border-navy-900"
              />
            </label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setStep('phone')} className="btn-secondary">
                Change number
              </button>
              <button type="submit" disabled={loading || code.trim().length < 4} className="btn-primary flex-1">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />} Verify & continue
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
