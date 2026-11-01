import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { Mail, Loader2, ArrowLeft, ShieldCheck } from 'lucide-react';

export default function ForgotPassword() {
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email: contact });
      setSuccess(true);
      toast.success('Reset instructions sent!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to process request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFB] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#02224B] rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4 shadow-lg shadow-blue-950/10">
            C
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Reset Password</h1>
          <p className="text-slate-500 mt-2">Enter your mobile number or email to receive instructions</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          {success ? (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Instructions Sent</h2>
                <p className="text-slate-500 mt-2">Please check your registered contact for password reset instructions.</p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full btn-primary justify-center py-3.5"
              >
                Back to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mobile Number or Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="w-full bg-slate-50 border-slate-100 rounded-xl py-3 pl-11 pr-4 text-sm focus:ring-2 focus:ring-[#02224B] focus:bg-white transition-all"
                    placeholder="Enter Mobile Number"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary justify-center py-3.5 shadow-lg shadow-blue-950/10 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Send Instructions'
                )}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </button>

              <div className="pt-4 border-t border-slate-50 text-center">
                <p className="text-xs text-slate-500 font-medium">
                  Having trouble? Contact your PG administrator to reset your password.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}