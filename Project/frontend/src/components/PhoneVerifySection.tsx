// Existing owners and wardens prove their phone number once. An owner's
// verified phone is what makes their PGs show "Verified owner" to guests.
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/auth';
import { apiErrorMessage } from '../utils/api-error';
import { phoneOtpErrorMessage, startPhoneVerification, type PhoneChallenge } from '../utils/phone-otp';

export default function PhoneVerifySection() {
  const { user, updateUser } = useAuth();
  const challenge = useRef<PhoneChallenge<'BOOKING'> | null>(null);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user || user.role === 'PG_TENANT' || !user.phone) return null;

  const send = async () => {
    setBusy(true);
    try {
      challenge.current = await startPhoneVerification(user.phone!, 'BOOKING');
      if (challenge.current.devCode) toast.success(`Demo code: ${challenge.current.devCode}`);
      else toast.success('Code sent');
      setSent(true);
    } catch (error) {
      toast.error(phoneOtpErrorMessage(error, 'Could not send the code'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!challenge.current) return;
    setBusy(true);
    try {
      const { phoneToken } = await challenge.current.verify(code);
      const { user: updated } = (await api.post('/auth/verify-phone', { phoneToken })).data;
      updateUser(updated);
      toast.success('Phone verified. Your PGs now show "Verified owner".');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'That code did not work'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="phone-verify-heading" className="mt-6 rounded-[14px] border border-hairline bg-white p-6">
      <h2 id="phone-verify-heading" className="text-xl font-semibold">Phone verification</h2>
      {user.phoneVerified ? (
        <p className="mt-2 flex items-center gap-2 text-positive"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> +{user.phone} is verified.</p>
      ) : (
        <>
          <p className="mt-1 text-muted">Verify +{user.phone} so guests see your PGs as run by a verified owner.</p>
          {sent && (
            <label className="mt-3 block text-sm font-medium text-navy-900">
              Code
              <input aria-label="6-digit verification code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                className="tabular mt-1 block w-40 rounded-[6px] border border-field-border px-3 py-2.5 tracking-[0.2em]" />
            </label>
          )}
          <button type="button" disabled={busy || (sent && code.length < 6)} onClick={() => void (sent ? verify() : send())} className="btn-secondary mt-3">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {sent ? 'Verify' : 'Send code'}
          </button>
        </>
      )}
    </section>
  );
}
