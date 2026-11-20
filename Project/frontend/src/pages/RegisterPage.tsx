import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterForm } from '../validation/forms';
import { Link } from 'react-router-dom';
import { PhoneInput } from '../components/PhoneInput';
import { Building2, BedDouble, ClipboardList, Loader2 } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import api from '../api/axios';
import toast from 'react-hot-toast';
import LogoLoader from '../components/LogoLoader';
import logo from '../assets/logo_bg_white.png';
import logoBlack from '../assets/logo_bg_black.png';
import { ROUTES } from '../utils/app-areas';
import { apiErrorMessage } from '../utils/api-error';
import { phoneOtpErrorMessage, startPhoneVerification, type PhoneChallenge } from '../utils/phone-otp';

export default function RegisterPage() {

  const [step, setStep] = useState(1);
  const [showLoader, setShowLoader] = useState(false);
  const [nextLoginUrl, setNextLoginUrl] = useState('');

  const { register, control, handleSubmit, trigger, formState: { errors, isSubmitting: loading } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '', propertyName: '', phone: '', propertyAddress: '', locality: '', contactPhone: '',
      city: 'Chennai', genderPolicy: 'ANY', businessLogo: '', password: '', confirmPassword: ''
    }
  });
  const phone = useWatch({ control, name: 'phone' });

  // Owners prove their phone with a code, so guests can trust "Verified owner".
  const challenge = useRef<PhoneChallenge<'BOOKING'> | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [phoneToken, setPhoneToken] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleContinue = async () => {
    if (!await trigger('phone')) return;
    setVerifying(true);
    try {
      if (!codeSent) {
        challenge.current = await startPhoneVerification(phone, 'BOOKING');
        if (challenge.current.devCode) toast.success(`Demo code: ${challenge.current.devCode}`);
        else toast.success('Code sent');
        setCodeSent(true);
        return;
      }
      if (!challenge.current) return;
      const data = await challenge.current.verify(code);
      setPhoneToken(data.phoneToken);
      toast.success('Phone verified');
      setStep(2);
    } catch (error) {
      toast.error(phoneOtpErrorMessage(error, codeSent ? 'That code did not work' : 'Could not send the code'));
    } finally {
      setVerifying(false);
    }
  };

  const onRegister = async (formData: RegisterForm) => {
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
        password: formData.password,
        phoneToken
      };

      const response = await api.post('/auth/register', payload);
      if (!response.data.pgSlug) throw new Error('The property was created without a PG address');
      setNextLoginUrl(ROUTES.ownerLogin);

      toast.success(
        <div>
          <p className="font-bold">PG account created</p>
          <p className="text-sm mt-1">Set up rooms, beds and booking availability.</p>
        </div>,
        { duration: 4000 }
      );
      setShowLoader(true);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Registration failed'));
    }
  };

  return (
    <>
      {showLoader && <LogoLoader onComplete={() => {
        if (nextLoginUrl) window.location.assign(nextLoginUrl);
      }} />}
      <div className="min-h-screen lg:h-screen bg-surface flex">
        {/* Left Side: Animated Illustration */}
        <div className="hidden lg:flex w-[45%] bg-navy-900 text-white p-8 lg:p-10 flex-col justify-between relative overflow-hidden">
          {/* Background Patterns */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-10 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob"></div>
            <div className="absolute top-40 right-10 w-72 h-72 bg-amber-500 rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-80 h-80 bg-info-bg rounded-full mix-blend-overlay filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
          </div>

          <div className="relative z-10">
            <Link to="/" className="inline-block -ml-6 -mt-4">
              <img src={logo} alt="Living Plus" className="h-24 scale-[1.2] origin-left object-contain" />
            </Link>

            <div className="mt-0 space-y-4">
              <h1 className="text-3xl font-bold leading-tight">
                Run your PG with room to grow
              </h1>
              <p className="text-info text-base max-w-md leading-relaxed">
                Keep rooms, booking requests, residents, rent and maintenance together in one workspace.
              </p>

              <div className="space-y-5 mt-8">
                <div className="flex items-center gap-3 text-info">
                  <div className="w-10 h-10 rounded-[var(--radius-button)] bg-white/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Property setup</h3>
                    <p className="text-info/80 text-xs">Organize rooms and beds</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-info">
                  <div className="w-10 h-10 rounded-[var(--radius-button)] bg-white/10 flex items-center justify-center">
                    <BedDouble className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Booking requests</h3>
                    <p className="text-info/80 text-xs">Review requests and move-ins</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-info">
                  <div className="w-10 h-10 rounded-[var(--radius-button)] bg-white/10 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">Daily operations</h3>
                    <p className="text-info/80 text-xs">Track occupancy and maintenance</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 text-info text-sm mt-8">
            © {new Date().getFullYear()} Living Plus. All rights reserved.
          </div>
        </div>

        {/* Right Side: Registration Form */}
        <div className="flex-1 flex flex-col justify-start py-8 lg:py-12 px-4 sm:px-6 lg:px-20 xl:px-32 relative min-h-screen lg:min-h-0 lg:overflow-y-auto">
          <div className="absolute top-8 right-8 hidden lg:block">
            <Link to="/" className="text-sm font-medium text-muted hover:text-navy-900 transition-colors">
              Back to home
            </Link>
          </div>

          <div className="mx-auto w-full max-w-md">
            {/* Mobile Header */}
            <div className="lg:hidden mb-8 text-center">
              <img src={logoBlack} alt="Living Plus" className="h-36 mx-auto mb-4 object-contain" />
              <h2 className="text-xl font-bold tracking-tight text-ink">
                Create Your PG Account
              </h2>
              <p className="mt-2 text-sm text-muted">
                Set up your property operations
              </p>
            </div>

            <div className="hidden lg:block mb-10">
              <h2 className="text-3xl font-bold tracking-tight text-ink">
                Create Your PG Account
              </h2>
              <p className="mt-2 text-sm text-muted">
                Set up your property operations
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-surface h-1.5 rounded-full overflow-hidden mb-6">
              <div
                className="bg-navy-900 h-full transition-all duration-500 ease-out"
                style={{ width: `${(step / 2) * 100}%` }}
              />
            </div>

            <div className="bg-white rounded-3xl p-6 border border-hairline">
              {step === 1 && (
                <div className="space-y-6 animate-in slide-in-from-right fade-in duration-500">
                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">Owner phone (Login ID)</label>
                    <Controller
                      name="phone"
                      control={control}
                      render={({ field }) => (
                        <PhoneInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="Phone number" error={!!errors.phone} required />
                      )}
                    />
                    {errors.phone && <p className="mt-1 text-xs text-negative">{errors.phone.message}</p>}
                  </div>

                  {codeSent && (
                    <label className="block text-sm font-medium text-ink">
                      Code sent to {phone}
                      <input aria-label="6-digit verification code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                        className="tabular mt-2 block w-full rounded-[6px] border border-field-border px-3 py-2.5 tracking-[0.2em]" />
                      <button type="button" onClick={() => { setCodeSent(false); setCode(''); }} className="mt-2 text-sm font-medium text-navy-700 underline-offset-2 hover:underline">Change number</button>
                    </label>
                  )}
                  <button
                    onClick={() => void handleContinue()}
                    disabled={loading || verifying || phone.replace(/\D/g, '').length !== 12 || (codeSent && code.length < 6)}
                    className="w-full py-4 bg-navy-900 hover:bg-navy-700 text-white rounded-[var(--radius-button)] font-medium transition-colors flex items-center justify-center gap-2 mt-8 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                    {codeSent ? 'Verify and continue' : 'Send code'}
                  </button>
                  <p className="text-sm text-muted">We verify your number so guests see you as a verified owner.</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3 animate-in slide-in-from-right fade-in duration-500">


                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">Owner name</label>
                    <div className="relative">
                      <input
                        type="text"
                        aria-label="Owner name"
                        {...register('name')}
                        className={`w-full px-4 py-3 bg-surface border-hairline rounded-[var(--radius-button)] focus:ring-navy-900 focus:border-navy-900 ${errors.name ? 'border-negative/30 focus:border-negative focus:ring-negative' : ''}`}
                        placeholder="Your full name"
                      />
                    </div>
                    {errors.name && <p className="mt-1 text-xs text-negative">{errors.name.message}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">PG / Hostel name</label>
                    <input
                      type="text"
                      aria-label="PG / Hostel name"
                      {...register('propertyName')}
                      className={`w-full border border-hairline bg-surface px-4 py-3 focus:border-navy-900 focus:ring-navy-900 ${errors.propertyName ? 'border-negative/30 focus:border-negative focus:ring-negative' : ''}`}
                      placeholder="e.g. Cedar House PG"
                    />
                    {errors.propertyName && <p className="mt-1 text-xs text-negative">{errors.propertyName.message}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-ink">Street address
                      <input {...register('propertyAddress')} className="mt-1.5 w-full border border-hairline bg-surface px-3 py-2.5" placeholder="Building and street" />
                      {errors.propertyAddress && <span className="mt-1 block text-xs text-negative">{errors.propertyAddress.message}</span>}
                    </label>
                    <label className="block text-sm font-medium text-ink">Locality
                      <input {...register('locality')} className="mt-1.5 w-full border border-hairline bg-surface px-3 py-2.5" placeholder="Neighbourhood" />
                      {errors.locality && <span className="mt-1 block text-xs text-negative">{errors.locality.message}</span>}
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-ink">City
                      <input {...register('city')} className="mt-1.5 w-full border border-hairline bg-surface px-3 py-2.5" />
                    </label>
                    <label className="block text-sm font-medium text-ink">Resident policy
                      <select {...register('genderPolicy')} className="mt-1.5 w-full border border-hairline bg-white px-3 py-2.5">
                        <option value="ANY">All residents</option><option value="MEN">Men</option><option value="WOMEN">Women</option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-ink">Public WhatsApp contact <span className="font-normal text-muted">(optional)</span>
                    <Controller name="contactPhone" control={control} render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} className="mt-1.5" />} />
                  </label>

                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">Set Password</label>
                    <Controller
                      name="password"
                      control={control}
                      render={({ field }) => (
                    <PasswordInput
                      value={field.value}
                      autoComplete="new-password"
                      ariaLabel="Set password"
                      required={false}
                      onChange={field.onChange}
                      inputClassName={`border border-hairline px-4 ${errors.password ? 'border-negative/30 focus:border-negative focus:ring-negative' : 'focus:border-navy-900 focus:ring-navy-900'}`}
                    />
                      )}
                    />
                    {errors.password ? <p className="mt-1 text-xs text-negative">{errors.password.message}</p> : <p className="mt-1 text-xs text-muted">Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink mb-2">Confirm Password</label>
                    <Controller
                      name="confirmPassword"
                      control={control}
                      render={({ field }) => (
                    <PasswordInput
                      value={field.value}
                      autoComplete="new-password"
                      ariaLabel="Confirm password"
                      required={false}
                      onChange={field.onChange}
                      inputClassName={`border border-hairline px-4 ${errors.confirmPassword ? 'border-negative/30 focus:border-negative focus:ring-negative' : 'focus:border-navy-900 focus:ring-navy-900'}`}
                    />
                      )}
                    />
                    {errors.confirmPassword && (
                      <p className="mt-1 text-xs text-negative">{errors.confirmPassword.message}</p>
                    )}
                  </div>

                  <button
                    onClick={handleSubmit(onRegister)}
                    disabled={loading}
                    className="w-full py-3 bg-navy-900 hover:bg-navy-700 text-white rounded-[var(--radius-button)] font-medium transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-70"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create PG owner account'}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-8 text-center text-sm text-muted">
              Already have an account?{' '}
              <Link to={ROUTES.ownerLogin} className="font-semibold text-navy-900 hover:underline">
                Sign in
              </Link>
            </div>
            <div className="mt-6 text-center lg:hidden">
              <Link to="/" className="text-sm font-medium text-muted hover:text-navy-900 transition-colors flex items-center justify-center gap-1">
                &larr; Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
