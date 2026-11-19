import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/auth';
import api from '../api/axios';
import { LogIn, Loader2, X, Phone, MessageCircle } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import logo from '../assets/logo_bg_black.png';
import { areaOf, ROUTES } from '../utils/app-areas';
import { apiErrorMessage } from '../utils/api-error';
import { loginSchema, type LoginForm } from '../validation/forms';
import type { User } from '../context/auth';
import {
  googleSignInErrorMessage,
  isGoogleSignInCancelled,
  loadGoogleSignInConfig,
  signInWithGoogle,
  type FirebaseWebConfig
} from '../utils/google-sign-in';


/** Only return to a page inside the area this account belongs to. */
function safeRedirect(raw: string | null, home: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return home;
  return areaOf(raw) === areaOf(home) ? raw : home;
}

export default function LoginPage() {
  const { register, control, handleSubmit, setError, clearErrors, formState: { errors, isSubmitting: loading } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });
  // One message under the password field: a field problem or the server's answer.
  const error = errors.root?.server?.message || errors.email?.message || errors.password?.message || '';
  const [showSupportModal, setShowSupportModal] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [googleConfig, setGoogleConfig] = useState<FirebaseWebConfig | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    let active = true;
    loadGoogleSignInConfig().then((config) => {
      if (active) setGoogleConfig(config);
    });
    return () => {
      active = false;
    };
  }, []);

  const finishLogin = (token: string, loggedUser: User) => {
    if (loggedUser?.role === 'PG_TENANT') {
      setError('root.server', { message: 'Residents sign in on their PG\'s resident site with a phone code.' });
      return;
    }
    login(token, loggedUser);
    const home = ROUTES.ownerHome;
    navigate(safeRedirect(new URLSearchParams(location.search).get('redirect'), home), { replace: true });
  };

  const onGoogleSignIn = async () => {
    if (!googleConfig) return;
    clearErrors('root.server');
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle(googleConfig);
      finishLogin(result.token, result.user);
    } catch (err) {
      if (!isGoogleSignInCancelled(err)) setError('root.server', { message: googleSignInErrorMessage(err) });
    } finally {
      setGoogleLoading(false);
    }
  };

  const onSubmit = async ({ email, password }: LoginForm) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      finishLogin(response.data.token, response.data.user);
    } catch (err) {
      setError('root.server', { message: apiErrorMessage(err, 'Failed to login. Please check your credentials.') });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFB] flex flex-col justify-start pt-6 sm:pt-0 sm:justify-center items-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src={logo} alt="Living Plus" className="h-36 sm:h-24 w-auto mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-slate-900">Owner sign in</h1>
          <p className="text-slate-500 mt-2">Sign in to run your PG: bookings, residents, rent and more</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mobile Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  aria-label="Mobile number"
                  {...register('email', { onChange: () => clearErrors('root.server') })}
                  className="w-full bg-slate-50 border-slate-100 rounded-xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-[#02224B] focus:bg-white transition-all"
                  placeholder="Enter mobile number"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <PasswordInput
                    value={field.value}
                    autoComplete="current-password"
                    required={false}
                    onChange={(value) => {
                      field.onChange(value);
                      clearErrors('root.server');
                    }}
                    inputClassName={error ? 'focus:ring-red-500 border-red-200' : 'focus:ring-[#02224B]'}
                  />
                )}
              />
              {error && (
                <p role="alert" className="text-red-500 text-xs mt-2 font-medium">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-slate-300 text-[#02224B] focus:ring-[#02224B]" />
                <span className="text-xs text-slate-500 font-medium">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                className="text-xs font-bold text-[#02224B] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary justify-center py-3.5 text-base shadow-lg shadow-blue-900/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {googleConfig && (
            <>
              <div className="flex items-center gap-3 my-6" aria-hidden="true">
                <div className="h-px flex-1 bg-slate-100" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">or</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <p className="mb-3 text-sm text-slate-600">
                New to LivingPlus? <Link to={ROUTES.ownerRegister} className="text-[#02224B] font-bold hover:underline">Register your PG</Link>
              </p>
            <p className="text-xs text-slate-500 font-medium">
              Need help? <button onClick={() => setShowSupportModal(true)} className="text-[#02224B] font-bold hover:underline">Contact Support</button>
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Looking for a PG? <a href={ROUTES.guestHome} className="font-bold text-[#02224B] hover:underline">Browse PGs</a>
              {' · '}Resident? <a href={ROUTES.residentFinder} className="font-bold text-[#02224B] hover:underline">Sign in on your PG's site</a>
            </p>
          </div>
        </div>
      </div>

      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="p-8">
              <button
                onClick={() => setShowSupportModal(false)}
                className="absolute right-6 top-6 p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>

              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-[#02224B]" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Contact Support</h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Please reach out to your administrator to reset your password or for any account assistance.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                <p className="text-xs text-slate-600 leading-relaxed">
                  For password resets or login credentials, contact your property manager or system administrator directly.
                </p>
              </div>

              <button
                onClick={() => setShowSupportModal(false)}
                className="w-full mt-6 py-3 bg-[#02224B] text-white rounded-xl font-bold hover:bg-[#011630] transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
