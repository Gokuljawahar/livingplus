import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ClipboardList, Loader2, Phone, Search, ShieldCheck } from 'lucide-react';
import SplitAuthLayout from './SplitAuthLayout';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { normalizePhoneDigits, saveGuestSession, type GuestSession } from '../utils/guest-session';
import { useOtpCooldown } from '../hooks/useOtpCooldown';
import { resolveAppHost } from '../utils/pg-host';

interface GuestLoginGateProps {
  onVerified: (session: GuestSession) => void;
}

/**
 * Phone-OTP login gate for PG browsing. Guests verify their number once,
 * then browse listings and view their own booking requests. No password.
 */
export default function GuestLoginGate({ onVerified }: GuestLoginGateProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);
  const { cooldown, startCooldown } = useOtpCooldown();
  const { login } = useAuth();
  const navigate = useNavigate();

  const requestCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    if (digits.length < 10) {
      toast.error('Enter a valid phone number');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/auth/otp-request', { phone: digits, purpose: 'BOOKING' });
      if (response.data.devCode) toast.success(`Demo code: ${response.data.devCode}`);
      else toast.success('Verification code sent');
      setStep('code');
      startCooldown();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not send code');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = normalizePhoneDigits(phone);
    setLoading(true);
    try {
      const response = await api.post('/auth/otp-verify', { phone: digits, code, purpose: 'BOOKING' });
      const session = saveGuestSession(digits, response.data.phoneToken);
      onVerified(session);
      const resident = response.data.resident;
      if (resident?.token && resident?.user) {
        login(resident.token, resident.user);
        const canReachResident = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) || resolveAppHost().kind === 'property';
        if (canReachResident) {
          toast.success('Welcome back — opening your stays');
          navigate('/resident');
          return;
        }
        toast.success('Resident account found — sign in on your PG site to open it');
        return;
      }
      toast.success('Signed in — happy house hunting');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SplitAuthLayout
      panelTitle="Find a PG without the broker chase"
      panelCopy="Verify your number once, browse verified PGs with real availability, and track every request you raise."
      bullets={[
        { icon: ShieldCheck, heading: 'One verification', text: 'OTP sign-in, no passwords' },
        { icon: Search, heading: 'Verified listings', text: 'Real beds, real rents' },
        { icon: ClipboardList, heading: 'Request tracking', text: 'Watch your booking status' }
      ]}
      mobileTitle="Sign in to browse PGs"
      mobileSubtitle="Verify your phone number once to continue."
    >
      <div className="hidden lg:block">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-700">
          <Building2 className="h-4 w-4" /> PG listings
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[#02224B]">Sign in to browse PGs</h1>
        <p className="mt-2 text-sm text-slate-500">
          Verify your phone number once. Residents go straight to their stays — everyone else can search stays and track booking requests.
        </p>
      </div>
        {step === 'phone' ? (
          <form onSubmit={requestCode} className="mt-5 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Phone number
              <span className="relative mt-1.5 block">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="98765 43210"
                  autoComplete="tel"
                  className="w-full border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                />
              </span>
            </label>
            <button
              disabled={loading || cooldown > 0}
              className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-5 space-y-3">
            <p className="flex items-center gap-1.5 text-sm text-slate-600">
              <ShieldCheck className="h-4 w-4 text-emerald-700" /> Code sent to +{normalizePhoneDigits(phone)}
            </p>
            <input
              required
              aria-label="6-digit verification code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-full border border-slate-300 px-3 py-2.5 text-sm"
            />
            <button
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Verify & browse PGs
            </button>
            <button type="button" onClick={() => setStep('phone')} className="text-sm font-semibold text-slate-500">
              Use a different number
            </button>
          </form>
        )}
        {(['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) || resolveAppHost().kind === 'property') && (
          <p className="mt-5 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
            Already onboarded?{' '}
            <a href="/resident" className="font-bold text-[#02224B] hover:underline">
              Open My stays
            </a>
          </p>
        )}
    </SplitAuthLayout>
  );
}
