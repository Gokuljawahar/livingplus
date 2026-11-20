// /stay: residents pick their PG to open its resident site (/stay/<slug>).
// Most residents arrive straight from the link their PG shares; this page is the fallback.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, Loader2, MapPin, Search } from 'lucide-react';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
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
    queryKey: queryKeys.pgSites(term),
    queryFn: async (): Promise<PgSite[]> => (await api.get('/pg/sites', { params: term ? { search: term } : {} })).data,
    placeholderData: (previous) => previous
  });
  const resume = savedSite();

  return (
    <main className="min-h-screen bg-surface">
      <header className="bg-navy-900 text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to={ROUTES.guestHome} className="flex items-center gap-2.5 font-bold tracking-tight text-white hover:opacity-95 transition-opacity">
            <div className="h-8 w-8 rounded-lg bg-amber-500 flex items-center justify-center text-navy-900 shadow-xs">
              <Building2 className="h-5 w-5" />
            </div>
            <span>LivingPlus <span className="text-amber-500">· Residents</span></span>
          </Link>
          <a href={ROUTES.guestHome} className="text-xs sm:text-sm font-semibold text-blue-100 hover:text-white bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-xl transition-colors">
            Looking for a PG?
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="text-center sm:text-left mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-navy-900 tracking-tight">Find your PG site</h1>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-xl">
            Each property has its own private resident site. Search by property name or locality to open your stay, check dues, meals, and maintenance.
          </p>
        </div>

        {resume && (
          <Link
            to={ROUTES.residentSite(resume)}
            className="mb-6 flex items-center justify-between rounded-2xl border border-amber-300 bg-amber-50/80 px-5 py-4 text-sm font-bold text-navy-900 hover:bg-amber-100/80 transition-all shadow-sm"
          >
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Continue to your active PG portal
            </span>
            <ArrowRight className="h-4 w-4 text-navy-900" />
          </Link>
        )}

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-navy-900/15 focus-within:border-navy-900 transition-all">
          <Search className="h-5 w-5 text-slate-400 shrink-0" />
          <span className="sr-only">Search PGs</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type your PG name or locality (e.g. Velachery, Thoraipakkam)…"
            className="w-full text-sm font-medium outline-none placeholder:text-slate-400"
          />
        </label>

        <div className="mt-4 rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-sm">
          <ul className="divide-y divide-slate-100">
            {isPending && (
              <li className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-navy-900" />
                <span className="text-xs">Finding PG portals…</span>
              </li>
            )}
            {!isPending && sites.length === 0 && (
              <li className="py-12 px-4 text-center text-xs text-slate-500 font-medium">
                No PG matches “{term}”. Check the spelling or ask your PG owner for your direct link.
              </li>
            )}
            {sites.map((site) => (
              <li key={site.slug}>
                <Link
                  to={ROUTES.residentSite(site.slug)}
                  className="flex items-center justify-between gap-4 p-4 sm:px-5 hover:bg-slate-50/70 transition-colors group"
                >
                  <div>
                    <span className="block font-bold text-slate-900 group-hover:text-navy-900 transition-colors text-sm sm:text-base">
                      {site.name}
                    </span>
                    {(site.locality || site.city) && (
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        {[site.locality, site.city].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-navy-900 transition-transform">
                    <span className="hidden sm:inline">Open Portal</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-navy-900" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
