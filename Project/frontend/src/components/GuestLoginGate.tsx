import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ClipboardList, Loader2, Phone, Search, ShieldCheck } from 'lucide-react';
import SplitAuthLayout from './SplitAuthLayout';
import toast from 'react-hot-toast';
import { normalizePhoneDigits, saveGuestSession, type GuestSession } from '../utils/guest-session';
import { useOtpCooldown } from '../hooks/useOtpCooldown';
import { ROUTES } from '../utils/app-areas';
import { phoneOtpErrorMessage, startPhoneVerification, type PhoneChallenge } from '../utils/phone-otp';

interface GuestLoginGateProps {
  onVerified: (session: GuestSession) => void;
}

/**
 * Phone-OTP sign-in for "My requests". Browsing never needs it; a guest who
 * already verified while requesting a bed skips it. No password.
 */
export default function GuestLoginGate({ onVerified }: GuestLoginGateProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const { cooldown, startCooldown } = useOtpCooldown();
  const challenge = useRef<PhoneChallenge<'BOOKING'> | null>(null);

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length < 10) {
      toast.error('Enter a valid phone number');
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
      onVerified(session);
      toast.success('Phone verified');
    } catch (error) {
      toast.error(phoneOtpErrorMessage(error, 'Invalid code'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SplitAuthLayout
      panelTitle="Track your booking requests"
      panelCopy="Verify the phone number you used when requesting a bed to see the live status of every request."
      bullets={[
        { icon: ShieldCheck, heading: 'One verification', text: 'OTP sign-in, no passwords' },
        { icon: ClipboardList, heading: 'Live status', text: 'Pending, approved or declined' },
        { icon: Search, heading: 'Keep browsing', text: 'Listings never need sign-in' }
      ]}
      mobileTitle="My booking requests"
      mobileSubtitle="Verify your phone number to see your requests."
    >
      <div className="hidden lg:block">
        <p className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
          <Building2 className="h-4 w-4" /> Guests
        </p>
        <h1 className="mt-1 text-2xl font-bold text-navy-900">My booking requests</h1>
        <p className="mt-2 text-sm text-muted">
          Verify the phone number you used when requesting a bed.
        </p>
      </div>
        {step === 'phone' ? (
          <form onSubmit={requestCode} className="mt-5 space-y-3">
            <label className="block text-sm font-medium text-ink">
              Phone number
              <span className="relative mt-1.5 block">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="98765 43210"
                  autoComplete="tel"
                  className="w-full border border-hairline py-2.5 pl-10 pr-3 text-sm"
                />
              </span>
            </label>
            <button
              disabled={loading || cooldown > 0}
              className="flex w-full items-center justify-center gap-2 bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-5 space-y-3">
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <ShieldCheck className="h-4 w-4 text-positive" /> Code sent to +{normalizePhoneDigits(phone)}
            </p>
            <input
              required
              aria-label="6-digit verification code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-full border border-hairline px-3 py-2.5 text-sm"
            />
            <button
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Verify & see requests
            </button>
            <button type="button" onClick={() => setStep('phone')} className="text-sm font-semibold text-muted">
              Use a different number
            </button>
          </form>
        )}
        <p className="mt-5 border-t border-hairline pt-4 text-center text-sm text-muted">
          <Link to={ROUTES.guestHome} className="font-bold text-navy-900 hover:underline">Back to PGs</Link>
          {' · '}Already living in a PG?{' '}
          <a href={ROUTES.residentFinder} className="font-bold text-navy-900 hover:underline">Resident sign in</a>
        </p>
    </SplitAuthLayout>
  );
}
