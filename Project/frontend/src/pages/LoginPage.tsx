import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { LogIn, Loader2, X, Phone, MessageCircle } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import logo from '../assets/logo_bg_black.png';
import { resolveAppHost } from '../utils/pg-host';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSupportModal, setShowSupportModal] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', { email, password });
      const loggedUser = response.data.user;
      login(response.data.token, loggedUser);

      const searchParams = new URLSearchParams(location.search);
      const host = resolveAppHost();
      const defaultUrl = loggedUser?.role === 'SUPER_ADMIN'
        ? '/pg/operators'
        : loggedUser?.role === 'PG_TENANT'
          ? '/resident'
          : host.kind === 'property' ? '/owner/manage' : '/pg/manage';
      const redirectUrl = searchParams.get('redirect') || defaultUrl;

      navigate(redirectUrl, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to login. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFB] flex flex-col justify-start pt-6 sm:pt-0 sm:justify-center items-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img src={logo} alt="Living Plus" className="h-36 sm:h-24 w-auto mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-slate-900">Welcome Back</h1>
          <p className="text-slate-500 mt-2">Sign in to your PG operations workspace</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mobile Number</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  className="w-full bg-slate-50 border-slate-100 rounded-xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-[#02224B] focus:bg-white transition-all"
                  placeholder="Enter mobile number"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
              <PasswordInput
                value={password}
                autoComplete="current-password"
                onChange={(value) => {
                  setPassword(value);
                  if (error) setError('');
                }}
                inputClassName={error ? 'focus:ring-red-500 border-red-200' : 'focus:ring-[#02224B]'}
              />
              {error && (
                <p className="text-red-500 text-xs mt-2 font-medium">{error}</p>
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

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500 font-medium">
              Need help? <button onClick={() => setShowSupportModal(true)} className="text-[#02224B] font-bold hover:underline">Contact Support</button>
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
