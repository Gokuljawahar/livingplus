import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, PhoneCall, Sparkles, TrendingUp } from 'lucide-react';
import BrandLogo from '../components/ui/BrandLogo';
import { OwnerLeadForm } from '../features/discovery/OwnerLeadModal';
import { ROUTES } from '../utils/app-areas';

export default function ListYourPgPage() {
  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-40 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to={ROUTES.guestHome} aria-label="Living Plus home">
            <BrandLogo tone="dark" />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link
              to={ROUTES.guestHome}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Browse PGs
            </Link>
            <Link
              to={ROUTES.ownerLogin}
              className="rounded-[var(--radius-button)] bg-white/10 px-3 py-2 font-semibold text-white hover:bg-white/20"
            >
              Owner sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:items-start">
          <div className="space-y-6">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-navy-900">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Built for PG & Hostel Owners
              </span>
              <h1 className="mt-3 text-3xl font-bold leading-tight text-navy-900 sm:text-4xl">
                Fill empty beds faster without configuring software yourself
              </h1>
              <p className="mt-3 text-base text-muted">
                Tell us about your PG, hostel, or co-living property. Our dedicated onboarding team collects your photos, room tariffs, food options, and facilities — and publishes a rich, high-converting listing for you.
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  icon: PhoneCall,
                  title: '1. Share basic PG details in 60 seconds',
                  copy: 'Leave your name, phone, property name, and locality. No lengthy forms or spreadsheets needed.'
                },
                {
                  icon: Camera,
                  title: '2. We collect photos, rooms & facilities',
                  copy: 'Our onboarding specialist coordinates with you over WhatsApp or phone to capture room types, rent, deposit, and photos.'
                },
                {
                  icon: TrendingUp,
                  title: '3. Go live & receive verified bed requests',
                  copy: 'Students and IT professionals discover your full PG showcase and send OTP-verified bed requests straight to you.'
                }
              ].map((step) => (
                <div key={step.title} className="flex gap-3.5 rounded-[var(--radius-card)] border border-hairline bg-canvas p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-info-bg text-navy-900">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-navy-900">{step.title}</h2>
                    <p className="mt-0.5 text-sm text-muted">{step.copy}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5">
              <p className="text-sm font-bold text-navy-900">Included with every partner PG</p>
              <ul className="mt-3 space-y-2 text-sm text-ink">
                {[
                  'Full-page gallery showcase with categorized amenities',
                  'Multi-PG & multi-room tariff support (Private, 2/3/4-sharing)',
                  'Verified Owner badge to build instant tenant trust',
                  'Ready-to-use Owner Portal & Resident Portal once live'
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-6 sm:p-8">
            <h2 className="text-xl font-bold text-navy-900">Partner with Living Plus</h2>
            <p className="mt-1 text-sm text-muted">Fill in your details and our team will call you to complete onboarding.</p>
            <div className="mt-5">
              <OwnerLeadForm />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
