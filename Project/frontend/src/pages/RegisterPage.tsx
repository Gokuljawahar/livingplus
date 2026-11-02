import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PhoneInput } from '../components/PhoneInput';
import { Building2, BedDouble, ClipboardList, Loader2, Eye, EyeOff } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';
import LogoLoader from '../components/LogoLoader';
import logo from '../assets/logo_bg_white.png';
import logoBlack from '../assets/logo_bg_black.png';
import { pgHostUrl, resolveAppHost } from '../utils/pg-host';

export default function RegisterPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [nextLoginUrl, setNextLoginUrl] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    propertyName: '',
    phone: '',
    propertyAddress: '',
    locality: '',
    contactPhone: '',
    city: 'Chennai',
    genderPolicy: 'ANY',
    businessLogo: '',
    password: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (resolveAppHost().kind !== 'public') navigate('/', { replace: true });
  }, [navigate]);

  const handleContinue = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.phone) newErrors.phone = 'Phone number is required';
    else if (formData.phone.replace(/\D/g, '').length < 10) newErrors.phone = 'Enter a valid 10-digit number';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setStep(2);
  };

  const validatePassword = (pass: string) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return regex.test(pass);
  };

  const handleRegister = async () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Owner name is required';
    if (!formData.propertyName.trim()) newErrors.propertyName = 'PG name is required';
    if (!formData.propertyAddress.trim()) newErrors.propertyAddress = 'Property address is required';
    if (!formData.locality.trim()) newErrors.locality = 'Locality is required';
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (!validatePassword(formData.password)) {
      newErrors.password = 'Must contain 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      const payload = {
        name: formData.name.trim(),
        propertyName: formData.propertyName,
        phone: formattedPhone,
        contactPhone: formData.contactPhone,
        propertyAddress: formData.propertyAddress,
        locality: formData.locality,
        city: formData.city,
        genderPolicy: formData.genderPolicy,
        businessLogo: formData.businessLogo,
        password: formData.password
      };

      const response = await api.post('/auth/register', payload);
      if (!response.data.pgSlug) throw new Error('The property was created without a PG address');
      setNextLoginUrl(`${pgHostUrl(response.data.pgSlug)}/login`);

      toast.success(
        <div>
          <p className="font-bold">PG account created</p>
          <p className="text-sm mt-1">Set up rooms, beds and booking availability.</p>
        </div>,
        { duration: 4000 }
      );
      setShowLoader(true);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showLoader && <LogoLoader onComplete={() => {
        if (nextLoginUrl) window.location.assign(nextLoginUrl);
      }} />}
      <div className="min-h-screen lg:h-screen bg-slate-50 flex">
        {/* Left Side: Animated Illustration */}
        <div className="hidden lg:flex w-[45%] bg-[#02224B] text-white p-8 lg:p-10 flex-col justify-between relative overflow-hidden">
          {/* Background Patterns */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-10 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob"></div>
            <div className="absolute top-40 right-10 w-72 h-72 bg-[#FEB109] rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-80 h-80 bg-blue-400 rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
          </div>

          <div className="relative z-10">
            <Link to="/" className="inline-block -ml-6 -mt-4">
              <img src={logo} alt="Living Plus" className="h-24 scale-[1.2] origin-left object-contain" />
            </Link>

            <div className="mt-0 space-y-4">
              <h1 className="text-3xl font-bold leading-tight">
                Run your PG with room to grow
              </h1>
              <p className="text-blue-100 text-base max-w-md leading-relaxed">
                Keep rooms, booking requests, residents, rent and maintenance together in one workspace.
              </p>

              <div className="space-y-5 mt-8">
                <div className="flex items-center gap-3 text-blue-50">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Property setup</h3>
                    <p className="text-blue-200/80 text-xs">Organize rooms and beds</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-blue-50">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <BedDouble className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Booking requests</h3>
                    <p className="text-blue-200/80 text-xs">Review requests and move-ins</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-blue-50">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Daily operations</h3>
                    <p className="text-blue-200/80 text-xs">Track occupancy and maintenance</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 text-blue-200 text-sm mt-8">
            © {new Date().getFullYear()} Living Plus. All rights reserved.
          </div>
        </div>

        {/* Right Side: Registration Form */}
        <div className="flex-1 flex flex-col justify-start py-8 lg:py-12 px-4 sm:px-6 lg:px-20 xl:px-32 relative min-h-screen lg:min-h-0 lg:overflow-y-auto">
          <div className="absolute top-8 right-8 hidden lg:block">
            <Link to="/" className="text-sm font-medium text-slate-500 hover:text-[#02224B] transition-colors">
              Back to home
            </Link>
          </div>

          <div className="mx-auto w-full max-w-md">
            {/* Mobile Header */}
            <div className="lg:hidden mb-8 text-center">
              <img src={logoBlack} alt="Living Plus" className="h-36 mx-auto mb-4 object-contain" />
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                Create Your PG Account
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Set up your property operations
              </p>
            </div>

            <div className="hidden lg:block mb-10">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">
                Create Your PG Account
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Set up your property operations
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-6">
              <div
                className="bg-[#02224B] h-full transition-all duration-500 ease-out"
                style={{ width: `${(step / 2) * 100}%` }}
              />
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              {step === 1 && (
                <div className="space-y-6 animate-in slide-in-from-right fade-in duration-500">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Owner phone (Login ID)</label>
                    <PhoneInput
                      value={formData.phone}
                      onChange={(val) => {
                        setFormData({ ...formData, phone: val });
                        if (errors.phone) setErrors({ ...errors, phone: '' });
                      }}
                      onBlur={() => { }}
                      placeholder="Phone number"
                      error={!!errors.phone}
                      required
                    />
                    {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                  </div>

                  <button
                    onClick={handleContinue}
                    disabled={loading || formData.phone.replace(/\D/g, '').length !== 12}
                    className="w-full py-4 bg-[#02224B] hover:bg-[#0A3B75] text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 mt-8 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3 animate-in slide-in-from-right fade-in duration-500">


                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Owner name</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => {
                          setFormData({ ...formData, name: e.target.value });
                          if (errors.name) setErrors({ ...errors, name: '' });
                        }}
                        className={`w-full px-4 py-3 bg-slate-50 border-slate-200 rounded-xl focus:ring-[#02224B] focus:border-[#02224B] ${errors.name ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                        placeholder="Your full name"
                      />
                    </div>
                    {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">PG / Hostel name</label>
                    <input
                      required
                      type="text"
                      value={formData.propertyName}
                      onChange={(e) => {
                        setFormData({ ...formData, propertyName: e.target.value });
                        if (errors.propertyName) setErrors({ ...errors, propertyName: '' });
                      }}
                      className={`w-full border border-slate-200 bg-slate-50 px-4 py-3 focus:border-[#02224B] focus:ring-[#02224B] ${errors.propertyName ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                      placeholder="e.g. Cedar House PG"
                    />
                    {errors.propertyName && <p className="mt-1 text-xs text-red-500">{errors.propertyName}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-slate-700">Street address
                      <input required value={formData.propertyAddress} onChange={(e) => setFormData({ ...formData, propertyAddress: e.target.value })} className="mt-1.5 w-full border border-slate-200 bg-slate-50 px-3 py-2.5" placeholder="Building and street" />
                      {errors.propertyAddress && <span className="mt-1 block text-xs text-red-500">{errors.propertyAddress}</span>}
                    </label>
                    <label className="block text-sm font-medium text-slate-700">Locality
                      <input required value={formData.locality} onChange={(e) => setFormData({ ...formData, locality: e.target.value })} className="mt-1.5 w-full border border-slate-200 bg-slate-50 px-3 py-2.5" placeholder="Neighbourhood" />
                      {errors.locality && <span className="mt-1 block text-xs text-red-500">{errors.locality}</span>}
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-slate-700">City
                      <input required value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="mt-1.5 w-full border border-slate-200 bg-slate-50 px-3 py-2.5" />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">Resident policy
                      <select value={formData.genderPolicy} onChange={(e) => setFormData({ ...formData, genderPolicy: e.target.value })} className="mt-1.5 w-full border border-slate-200 bg-white px-3 py-2.5">
                        <option value="ANY">All residents</option><option value="MEN">Men</option><option value="WOMEN">Women</option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-slate-700">Public WhatsApp contact <span className="font-normal text-slate-400">(optional)</span>
                    <PhoneInput value={formData.contactPhone} onChange={(value) => setFormData({ ...formData, contactPhone: value })} className="mt-1.5" />
                  </label>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Set Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => {
                          setFormData({ ...formData, password: e.target.value });
                          if (errors.password) setErrors({ ...errors, password: '' });
                        }}
                        className={`w-full border border-slate-200 bg-slate-50 px-4 py-3 pr-11 focus:border-[#02224B] focus:ring-[#02224B] ${errors.password ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                        placeholder="••••••••"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {errors.password ? <p className="mt-1 text-xs text-red-500">{errors.password}</p> : <p className="mt-1 text-xs text-slate-400">Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
                    <div className="relative">
                      <input type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={(e) => {
                        setFormData({ ...formData, confirmPassword: e.target.value });
                        if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                      }} className={`w-full border border-slate-200 bg-slate-50 px-4 py-3 pr-11 focus:border-[#02224B] focus:ring-[#02224B] ${errors.confirmPassword ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                        placeholder="••••••••"
                      />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>
                    )}
                  </div>

                  <button
                    onClick={handleRegister}
                    disabled={loading}
                    className="w-full py-3 bg-[#02224B] hover:bg-[#0A3B75] text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-70"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create PG owner account'}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-8 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-[#02224B] hover:underline">
                Sign in
              </Link>
            </div>
            <div className="mt-6 text-center lg:hidden">
              <Link to="/" className="text-sm font-medium text-slate-500 hover:text-[#02224B] transition-colors flex items-center justify-center gap-1">
                &larr; Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
