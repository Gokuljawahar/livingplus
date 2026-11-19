// "Sign in with Google" linking for staff, shown on the account security page.
// Linking happens while signed in with the password, which proves the person
// controls both accounts; Google sign-in then matches this link, never an
// unverified email. Hidden when the server has Google sign-in turned off.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link2, Loader2, Unlink } from 'lucide-react';
import { useAuth } from '../context/auth';
import {
  googleSignInErrorMessage,
  isGoogleSignInCancelled,
  linkGoogleAccount,
  loadGoogleSignInConfig,
  unlinkGoogleAccount
} from '../utils/google-sign-in';

export default function GoogleLinkSection() {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const { data: config } = useQuery({ queryKey: ['google-sign-in-config'], queryFn: loadGoogleSignInConfig, staleTime: 5 * 60_000 });

  // Residents use phone OTP instead.
  if (!config || !user || user.role === 'PG_TENANT') return null;
  const linked = Boolean(user.googleLinked);

  const link = async () => {
    setBusy(true);
    try {
      updateUser(await linkGoogleAccount(config));
      toast.success('Google account linked. You can now sign in with Google.');
    } catch (error) {
      if (!isGoogleSignInCancelled(error)) toast.error(googleSignInErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm('Stop signing in with Google? You will use your mobile number and password.')) return;
    setBusy(true);
    try {
      updateUser(await unlinkGoogleAccount());
      toast.success('Google account unlinked');
    } catch (error) {
      toast.error(googleSignInErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="google-link-heading" className="mt-6 rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
      <h2 id="google-link-heading" className="text-sm font-bold uppercase tracking-wider text-slate-400">Sign in with Google</h2>
      <p className="mt-2 text-sm text-slate-600">
        {linked
          ? 'A Google account is linked. You can sign in with Google or with your password.'
          : 'Link your Google account to sign in with one tap next time.'}
      </p>
      <button
        type="button"
        onClick={() => void (linked ? unlink() : link())}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : linked ? <Unlink className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {linked ? 'Unlink Google account' : 'Link Google account'}
      </button>
    </section>
  );
}
