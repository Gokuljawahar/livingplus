import { Link } from 'react-router-dom';
import logo from '../assets/logo_bg_white.png';
import logoBlack from '../assets/logo_bg_black.png';

export type SplitAuthBullet = {
  icon: React.ComponentType<{ className?: string }>;
  heading: string;
  text: string;
};

type SplitAuthLayoutProps = {
  panelTitle: string;
  panelCopy: string;
  bullets: SplitAuthBullet[];
  mobileTitle: string;
  mobileSubtitle: string;
  children: React.ReactNode;
};

/**
 * Owner-style split auth: navy brand panel on the left, form on the right.
 * Guest and resident sign-in reuse this so every login in the product shares
 * one shape; the panel carries no animation, only the brand and the facts.
 */
export default function SplitAuthLayout({
  panelTitle,
  panelCopy,
  bullets,
  mobileTitle,
  mobileSubtitle,
  children
}: SplitAuthLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 lg:flex lg:h-screen">
      <div className="hidden w-[45%] flex-col justify-between bg-[#02224B] p-8 text-white lg:flex lg:p-10">
        <div>
          <Link to="/" className="inline-block">
            <img src={logo} alt="Living Plus" className="h-24 origin-left object-contain" />
          </Link>
          <div className="mt-4 space-y-4">
            <h1 className="text-3xl font-bold leading-tight">{panelTitle}</h1>
            <p className="max-w-md text-base leading-relaxed text-blue-100">{panelCopy}</p>
            <div className="mt-8 space-y-5">
              {bullets.map((bullet) => (
                <div key={bullet.heading} className="flex items-center gap-3 text-blue-50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                    <bullet.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{bullet.heading}</h3>
                    <p className="text-xs text-blue-200/80">{bullet.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="text-sm text-blue-200">© {new Date().getFullYear()} Living Plus. All rights reserved.</div>
      </div>

      <div className="flex min-h-screen flex-1 flex-col justify-start px-4 py-8 sm:px-6 lg:min-h-0 lg:overflow-y-auto lg:py-12 lg:px-20 xl:px-32">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <img src={logoBlack} alt="Living Plus" className="mx-auto mb-4 h-36 object-contain" />
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{mobileTitle}</h2>
            <p className="mt-2 text-sm text-slate-500">{mobileSubtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
