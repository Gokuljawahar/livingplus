// /stay: residents pick their PG to open its resident site (/stay/<slug>).
// Most residents arrive straight from the link their PG shares; this page is the fallback.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, Loader2, MapPin, Search } from 'lucide-react';
import api from '../api/axios';
import { ROUTES } from '../utils/app-areas';
import { RESIDENT_SITE_KEY, RESIDENT_TOKEN_KEY } from '../utils/session';

type PgSite = { slug: string; name: string; locality: string | null; city: string | null };

const savedSite = (): string | null => {
  try {
    return localStorage.getItem(RESIDENT_TOKEN_KEY) ? localStorage.getItem(RESIDENT_SITE_KEY) : null;
  } catch {
    return null;
  }
};

export default function ResidentFinder() {
  const [search, setSearch] = useState('');
  const term = search.trim();
  const { data: sites = [], isPending } = useQuery({
    queryKey: ['pg-sites', term],
    queryFn: async (): Promise<PgSite[]> => (await api.get('/pg/sites', { params: term ? { search: term } : {} })).data,
    placeholderData: (previous) => previous
  });
  const resume = savedSite();

  return (
    <main className="min-h-screen bg-[#F8FAFB]">
      <header className="bg-[#02224B] text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="flex items-center gap-2 font-bold"><Building2 className="h-5 w-5 text-[#FEB109]" /> LivingPlus · Residents</span>
          <a href={ROUTES.guestHome} className="text-sm font-semibold text-blue-100 hover:text-white">Looking for a PG?</a>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-[#02224B]">Find your PG</h1>
        <p className="mt-1 text-sm text-slate-500">Residents sign in on their PG's own page. Choose your PG, then sign in with the phone number on your stay.</p>

        {resume && (
          <Link to={ROUTES.residentSite(resume)} className="mt-6 flex items-center justify-between border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-[#02224B] hover:bg-amber-100">
            Continue to your PG <ArrowRight className="h-4 w-4" />
          </Link>
        )}

        <label className="mt-6 flex items-center gap-2 border border-slate-300 bg-white px-3 focus-within:border-[#02224B]">
          <Search className="h-4 w-4 text-slate-400" />
          <span className="sr-only">Search PGs</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PG name or locality" className="w-full py-2.5 text-sm outline-none" />
        </label>

        <ul className="mt-4 divide-y divide-slate-200 border border-slate-200 bg-white">
          {isPending && <li className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></li>}
          {!isPending && sites.length === 0 && <li className="py-8 text-center text-sm text-slate-500">No PG matches “{term}”.</li>}
          {sites.map((site) => (
            <li key={site.slug}>
              <Link to={ROUTES.residentSite(site.slug)} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <span>
                  <span className="block font-semibold text-[#02224B]">{site.name}</span>
                  {(site.locality || site.city) && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{[site.locality, site.city].filter(Boolean).join(', ')}</span>
                  )}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
