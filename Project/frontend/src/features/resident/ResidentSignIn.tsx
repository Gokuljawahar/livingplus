import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Loader2, ReceiptIndianRupee, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import SplitAuthLayout from '../../components/SplitAuthLayout';
import { Button } from '../../components/ui';
import { useAuth } from '../../context/auth';
import { useOtpCooldown } from '../../hooks/useOtpCooldown';
import { ROUTES } from '../../utils/app-areas';
import { phoneOtpErrorMessage, startPhoneVerification, type PhoneChallenge } from '../../utils/phone-otp';
import { RESIDENT_SITE_KEY } from '../../utils/session';
import type { PgSite } from './types';

interface Props {
  site: PgSite;
  onAuthenticated: () => void;
}

export default function ResidentSignIn({ site, onAuthenticated }: Props) {
  const { login } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const challenge = useRef<PhoneChallenge<'TENANT_LOGIN'> | null>(null);
  const [loading, setLoading] = useState(false);
  const { cooldown, startCooldown } = useOtpCooldown();

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      challenge.current = await startPhoneVerification(phone, 'TENANT_LOGIN');
      if (challenge.current.devCode) toast.success(`Demo code: ${challenge.current.devCode}`);
      else toast.success('Code sent');
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
    if (!challenge.current) {
      toast.error('Request a new code first');
      return;
    }
    setLoading(true);
    try {
      const data = await challenge.current.verify(code);
      login(data.token, data.user);
      localStorage.setItem(RESIDENT_SITE_KEY, site.slug);
      toast.success('Welcome back');
      onAuthenticated();
    } catch (error) {
      toast.error(phoneOtpErrorMessage(error, 'Invalid code'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SplitAuthLayout
      panelTitle="Your stay, in your pocket"
      panelCopy="Sign in with the phone number on your stay. Rent, food, maintenance and room requests, all in one place."
      bullets={[
        { icon: Building2, heading: 'Your stays', text: 'Rooms, rent and deposits' },
        { icon: ReceiptIndianRupee, heading: 'Money clarity', text: 'Dues and verifications' },
        { icon: Wrench, heading: 'Get help fast', text: 'Maintenance and room changes' }
      ]}
      mobileTitle={site.name}
      mobileSubtitle="Resident login · use the phone number on your stay."
    >
      <div className="hidden lg:block">
        <p className="text-xs font-bold text-amber-600">Resident login</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-900">{site.name}</h1>
        {site.locality && <p className="text-sm text-muted">{[site.locality, site.city].filter(Boolean).join(', ')}</p>}
        <p className="mt-2 text-sm text-muted">Log in with the phone number on your stay. No password needed.</p>
      </div>
      {step === 'phone' ? (
        <>
          <form onSubmit={requestCode} className="mt-5 space-y-3">
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full rounded-[var(--radius-input)] border border-hairline px-3 py-2.5 text-sm text-ink"
            />
            <Button type="submit" disabled={loading || cooldown > 0} className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}
            </Button>
          </form>
          <p className="mt-5 border-t border-hairline pt-4 text-center text-sm text-muted">
            Not staying here yet?{' '}
            <a href={ROUTES.guestHome} className="font-bold text-navy-900 hover:underline">Browse PGs</a>
            {' · '}
            <Link to={ROUTES.residentFinder} className="font-bold text-navy-900 hover:underline">Different PG</Link>
          </p>
        </>
      ) : (
        <form onSubmit={verifyCode} className="mt-5 space-y-3">
          <input
            required
            aria-label="6-digit verification code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            inputMode="numeric"
            className="w-full rounded-[var(--radius-input)] border border-hairline px-3 py-2.5 text-sm text-ink"
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify & open my stays
          </Button>
          <button type="button" onClick={() => setStep('phone')} className="text-sm font-semibold text-muted hover:text-ink">
            Use a different number
          </button>
        </form>
      )}
    </SplitAuthLayout>
  );
}
