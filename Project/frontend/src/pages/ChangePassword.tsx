import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Lock, Loader2, ArrowLeft } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';

export default function ChangePassword() {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setLoading(true);

    try {
      await api.post('/auth/change-password', {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword
      });
      toast.success('Password updated successfully. Please log in again.');
      
      // Force logout after password change
      setTimeout(() => {
        logout();
        navigate('/');
      }, 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-[#02224B] rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4 shadow-lg shadow-blue-950/10">
          <Lock className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Change Password</h1>
        <p className="text-slate-500 mt-2">Update your account security</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current Password</label>
            <PasswordInput
              value={formData.currentPassword}
              autoComplete="current-password"
              ariaLabel="Current password"
              onChange={(value) => setFormData({...formData, currentPassword: value})}
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-50">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">New Password</label>
              <PasswordInput
                value={formData.newPassword}
                autoComplete="new-password"
                ariaLabel="New password"
                onChange={(value) => setFormData({...formData, newPassword: value})}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Confirm New Password</label>
              <PasswordInput
                value={formData.confirmPassword}
                autoComplete="new-password"
                ariaLabel="Confirm new password"
                onChange={(value) => setFormData({...formData, confirmPassword: value})}
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
              'Update Password'
            )}
          </button>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </form>
      </div>
    </div>
  );
}