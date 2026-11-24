import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpDown,
  Building2,
  Camera,
  CheckCircle2,
  ChevronDown,
  Heart,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCheck
} from 'lucide-react';
import { CHENNAI_LANDMARKS, distanceKm, PROPERTY_TYPES, PROPERTY_TYPE_SHORT_LABELS } from '@livingplus/shared';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
import AIChatPanel from '../components/AIChatPanel';
import GuestLoginGate from '../components/GuestLoginGate';
import GuestSignInModal from '../components/GuestSignInModal';
import MyRequests from '../components/MyRequests';
import BrandLogo from '../components/ui/BrandLogo';
import { useAuth } from '../context/auth';
import FilterSheet from '../features/discovery/FilterSheet';
import OwnerLeadModal from '../features/discovery/OwnerLeadModal';
import PropertyCard from '../features/discovery/PropertyCard';
import { keywordMatch, SORTS, type PGProperty, type ResidentStay } from '../features/discovery/types';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ROUTES } from '../utils/app-areas';
import { clearGuestSession, getGuestSession, type GuestSession } from '../utils/guest-session';
import { getSavedPgIds, toggleSavedPg } from '../utils/saved-pgs';
import { RESIDENT_SITE_KEY, RESIDENT_TOKEN_KEY } from '../utils/session';

export default function PGDiscovery() {
  const { user, logout: authLogout } = useAuth();
  const [guest, setGuest] = useState<GuestSession | null>(() => getGuestSession());
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: 'search' | 'requests' = location.pathname === ROUTES.guestRequests ? 'requests' : 'search';
  const [requestsRefresh] = useState(0);

  const signedIn = Boolean(user || guest);
  const { data: properties = [], isPending: loading } = useQuery({
    queryKey: queryKeys.properties(),
    queryFn: async (): Promise<PGProperty[]> => (await api.get('/pg/properties')).data,
    meta: { errorMessage: 'Could not load PG listings' }
  });
  const { data: stays = [] } = useQuery({
    queryKey: queryKeys.resident.stays(user?.id ?? null),
    queryFn: async (): Promise<ResidentStay[]> => (await api.get('/pg/tenant/stays')).data || [],
    enabled: Boolean(localStorage.getItem(RESIDENT_TOKEN_KEY))
  });

  const guestPhone = guest?.phone || '';
  const [savedIds, setSavedIds] = useState<string[]>(() => (guest?.phone ? getSavedPgIds(guest.phone) : []));
  const [savedOnly, setSavedOnly] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const [ownerLeadOpen, setOwnerLeadOpen] = useState(false);

  const residentSiteSlug = localStorage.getItem(RESIDENT_TOKEN_KEY) ? localStorage.getItem(RESIDENT_SITE_KEY) : null;
  const residentHome = residentSiteSlug ? ROUTES.residentSite(residentSiteSlug) : ROUTES.residentFinder;
  const [aiRequest, setAiRequest] = useState<{ query: string; nonce: number } | null>(null);
  const isStaff = ['PG_OWNER', 'PG_WARDEN'].includes(user?.role || '');
  const isOnboarded = stays.length > 0 || user?.role === 'PG_TENANT';

  const [query, setQuery] = useState('');
  const [queryScope, setQueryScope] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [gender, setGender] = useState('');
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  const [minRent, setMinRent] = useState('');
  const [maxRent, setMaxRent] = useState('');
  const [acOnly, setAcOnly] = useState(false);
  const [foodOnly, setFoodOnly] = useState(false);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [sort, setSort] = useState('featured');
  const [nearId, setNearId] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const nearPlace = CHENNAI_LANDMARKS.find((place) => place.id === nearId) ?? null;
  const distanceTo = useCallback(
    (property: PGProperty): number | null =>
      nearPlace && property.latitude != null && property.longitude != null
        ? distanceKm({ latitude: property.latitude, longitude: property.longitude }, nearPlace)
        : null,
    [nearPlace]
  );

  const matchesRoom = useCallback(
    (room: PGProperty['rooms'][number]) => {
      if (!room.availableBeds) return false;
      if (roomTypes.length && (!room.roomType || !roomTypes.includes(room.roomType))) return false;
      if (acOnly && !room.hasAc) return false;
      if (foodOnly && !room.foodIncluded) return false;
      return true;
    },
    [roomTypes, acOnly, foodOnly]
  );

  const ownPropertyIds = useMemo(
    () =>
      new Set(
        stays
          .filter((stay) => ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'].includes(stay.status))
          .map((stay) => stay.property.id)
      ),
    [stays]
  );
  const visibleProperties = useMemo(
    () => (ownPropertyIds.size ? properties.filter((property) => !ownPropertyIds.has(property.id)) : properties),
    [properties, ownPropertyIds]
  );

  const searchText = useDebouncedValue(query.trim(), 350);
  const { data: semanticScores = null } = useQuery({
    queryKey: queryKeys.search(searchText),
    queryFn: async (): Promise<Map<string, number> | null> => {
      const data = (await api.get('/pg/search', { params: { q: searchText } })).data as {
        semantic?: boolean;
        results?: { propertyId: string; score: number }[];
      };
      return data.semantic ? new Map((data.results || []).map((r) => [r.propertyId, r.score])) : null;
    },
    enabled: searchText.length >= 3,
    retry: false,
    staleTime: 5 * 60_000
  });

  const queryFiltered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return visibleProperties.filter((property) => {
      const matchesText = !text || keywordMatch(property, text) || Boolean(semanticScores?.has(property.id));
      const matchesScope = !queryScope || queryScope === property.locality;
      const matchesType = !propertyType || (property.propertyType || 'PG') === propertyType;
      return matchesText && matchesScope && matchesType;
    });
  }, [visibleProperties, query, queryScope, propertyType, semanticScores]);

  const amenityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const property of queryFiltered) {
      for (const amenity of property.amenities || []) counts.set(amenity, (counts.get(amenity) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [queryFiltered]);

  const localityOptions = useMemo(
    () => [...new Set(visibleProperties.map((property) => property.locality).filter(Boolean))].sort(),
    [visibleProperties]
  );

  const filteredProperties = useMemo(() => {
    const min = minRent ? Number(minRent) : 0;
    const max = maxRent ? Number(maxRent) : Number.POSITIVE_INFINITY;
    const savedSet = new Set(savedIds);
    const list = queryFiltered.filter((property) => {
      if (savedOnly && !savedSet.has(property.id)) return false;
      if (gender && property.genderPolicy !== 'ANY' && property.genderPolicy !== gender) return false;
      if (amenities.length && !amenities.every((amenity) => (property.amenities || []).includes(amenity))) return false;
      const rooms = property.rooms.filter(matchesRoom);
      if (!rooms.length) return false;
      const rent = rooms.reduce((lowest, room) => Math.min(lowest, room.monthlyRent), Number.POSITIVE_INFINITY);
      return rent >= min && rent <= max;
    });
    const rentOf = (property: PGProperty) =>
      property.rooms.filter(matchesRoom).reduce((lowest, room) => Math.min(lowest, room.monthlyRent), Number.POSITIVE_INFINITY);
    const text = query.trim().toLowerCase();
    if (sort === 'featured' && text && semanticScores) {
      const rank = (property: PGProperty) => (keywordMatch(property, text) ? 1 : 0) + (semanticScores.get(property.id) ?? 0);
      list.sort((a, b) => rank(b) - rank(a));
    }
    if (sort === 'price-asc') list.sort((a, b) => rentOf(a) - rentOf(b));
    if (sort === 'price-desc') list.sort((a, b) => rentOf(b) - rentOf(a));
    if (sort === 'beds-desc') list.sort((a, b) => b.availableBeds - a.availableBeds);
    if (sort === 'featured' && nearPlace) list.sort((a, b) => (distanceTo(a) ?? Infinity) - (distanceTo(b) ?? Infinity));
    return list;
  }, [queryFiltered, savedOnly, savedIds, gender, minRent, maxRent, amenities, sort, query, semanticScores, nearPlace, matchesRoom, distanceTo]);

  const activeFilterCount =
    (gender ? 1 : 0) +
    (propertyType ? 1 : 0) +
    (savedOnly ? 1 : 0) +
    roomTypes.length +
    (minRent || maxRent ? 1 : 0) +
    (acOnly ? 1 : 0) +
    (foodOnly ? 1 : 0) +
    amenities.length;

  const clearFilters = () => {
    setGender('');
    setPropertyType('');
    setSavedOnly(false);
    setRoomTypes([]);
    setMinRent('');
    setMaxRent('');
    setAcOnly(false);
    setFoodOnly(false);
    setAmenities([]);
    setNearId('');
    setQueryScope('');
    setQuery('');
  };

  const handleToggleSave = (propertyId: string) => {
    if (!guestPhone) {
      setPendingSaveId(propertyId);
      setSignInOpen(true);
      return;
    }
    setSavedIds(toggleSavedPg(guestPhone, propertyId));
  };

  const handleGuestVerified = (session: GuestSession) => {
    setGuest(session);
    if (pendingSaveId) {
      setSavedIds(toggleSavedPg(session.phone, pendingSaveId));
      setPendingSaveId(null);
    } else {
      setSavedIds(getSavedPgIds(session.phone));
    }
  };

  const signOut = () => {
    if (guest) {
      clearGuestSession();
      setGuest(null);
      setSavedIds([]);
      setSavedOnly(false);
    }
    if (user) authLogout();
    navigate(ROUTES.guestHome);
  };

  if (activeTab === 'requests' && !guestPhone) {
    return <GuestLoginGate onVerified={handleGuestVerified} />;
  }

  const profileName = stays[0]?.name || user?.name || null;
  const quickChips: { label: string; active: boolean; toggle: () => void }[] = [
    { label: 'Women', active: gender === 'WOMEN', toggle: () => setGender(gender === 'WOMEN' ? '' : 'WOMEN') },
    { label: 'Men', active: gender === 'MEN', toggle: () => setGender(gender === 'MEN' ? '' : 'MEN') },
    { label: 'Co-living', active: gender === 'ANY', toggle: () => setGender(gender === 'ANY' ? '' : 'ANY') },
    {
      label: 'Under ₹8,000',
      active: !minRent && maxRent === '8000',
      toggle: () => {
        setMinRent('');
        setMaxRent(maxRent === '8000' && !minRent ? '' : '8000');
      }
    },
    { label: 'Food available', active: foodOnly, toggle: () => setFoodOnly(!foodOnly) },
    { label: 'AC', active: acOnly, toggle: () => setAcOnly(!acOnly) }
  ];

  const totalOpenBeds = visibleProperties.reduce((sum, p) => sum + p.availableBeds, 0);

  return (
    <main className="flex min-h-screen flex-col bg-surface text-ink">
      <a href="#results" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-[var(--radius-field)] focus:bg-canvas focus:px-3 focus:py-2">
        Skip to results
      </a>

      <header className="sticky top-0 z-40 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to={ROUTES.guestHome} aria-label="Living Plus home">
            <BrandLogo tone="dark" />
          </Link>

          <nav aria-label="Primary navigation" className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setOwnerLeadOpen(true)}
              className="hidden items-center gap-1.5 rounded-[var(--radius-button)] bg-amber-500 px-3.5 py-2 font-bold text-navy-900 transition-colors hover:bg-amber-600 sm:inline-flex"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              List Your PG
              <span className="rounded-full bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Free</span>
            </button>
            <Link
              to={ROUTES.guestRequests}
              className="hidden rounded-[var(--radius-button)] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:block"
            >
              My requests
            </Link>
            <a href={residentHome} className="hidden rounded-[var(--radius-button)] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:block">
              {stays.length > 0 ? 'My stay' : 'Residents'}
            </a>
            <a href={ROUTES.ownerLogin} className="hidden rounded-[var(--radius-button)] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:block">
              Owner login
            </a>
            {!signedIn ? (
              <button
                type="button"
                onClick={() => setSignInOpen(true)}
                className="hidden rounded-[var(--radius-button)] border border-white/25 px-3 py-1.5 font-semibold text-white hover:bg-white/10 md:inline-flex"
              >
                Sign in
              </button>
            ) : (
              <button
                type="button"
                onClick={signOut}
                className="hidden items-center gap-1.5 rounded-[var(--radius-button)] border border-white/20 px-3 py-1.5 font-medium text-white/90 hover:bg-white/10 md:inline-flex"
                title={profileName || (guestPhone ? `+${guestPhone}` : undefined)}
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            )}

            <details className="relative md:hidden">
              <summary aria-label="Menu" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[var(--radius-button)] hover:bg-white/10">
                <Menu className="h-6 w-6" />
              </summary>
              <div className="absolute right-0 mt-2 w-60 rounded-[var(--radius-card)] border border-hairline bg-canvas p-2 text-navy-900 shadow-[var(--shadow-float)]">
                <button
                  type="button"
                  onClick={() => setOwnerLeadOpen(true)}
                  className="mb-1 flex w-full items-center justify-between rounded-[var(--radius-button)] bg-amber-50 px-3 py-2.5 text-left font-bold text-navy-900"
                >
                  <span>List Your PG</span>
                  <span className="text-xs text-amber-700">Free</span>
                </button>
                <Link to={ROUTES.guestRequests} className="block rounded-[var(--radius-button)] px-3 py-2.5 font-medium hover:bg-surface">My requests</Link>
                <a href={residentHome} className="block rounded-[var(--radius-button)] px-3 py-2.5 font-medium hover:bg-surface">{stays.length > 0 ? 'My stay' : 'Residents'}</a>
                <a href={ROUTES.ownerLogin} className="block rounded-[var(--radius-button)] px-3 py-2.5 font-medium hover:bg-surface">Owner login</a>
                {!signedIn ? (
                  <button type="button" onClick={() => setSignInOpen(true)} className="block w-full rounded-[var(--radius-button)] px-3 py-2.5 text-left font-semibold hover:bg-surface">Sign in</button>
                ) : (
                  <button type="button" onClick={signOut} className="block w-full rounded-[var(--radius-button)] px-3 py-2.5 text-left font-medium hover:bg-surface">Sign out</button>
                )}
              </div>
            </details>
          </nav>
        </div>
      </header>

      <nav aria-label="Guest" className="border-b border-hairline bg-canvas">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex gap-6">
            {[
              { to: ROUTES.guestHome, label: 'Find a PG', active: activeTab === 'search' },
              { to: ROUTES.guestRequests, label: 'My requests', active: activeTab === 'requests' }
            ].map((tab) => (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={tab.active ? 'page' : undefined}
                className={`-mb-px border-b-2 py-3 text-[15px] font-semibold ${tab.active ? 'border-navy-900 text-navy-900' : 'border-transparent text-muted hover:text-navy-900'}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
          {guestPhone && (
            <p className="hidden text-xs font-medium text-muted sm:block">
              Signed in as <span className="font-semibold text-navy-900">+{guestPhone}</span>
            </p>
          )}
        </div>
      </nav>

      {stays.length > 0 && (
        <section className="border-b border-hairline bg-amber-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm sm:px-6">
            <p>
              You're staying at <span className="font-semibold text-navy-900">{stays[0]?.property.name}</span>
              {ownPropertyIds.size > 0 ? '. It is hidden from these results; to move rooms, use Room change on your resident site.' : '.'}
            </p>
            <a href={residentHome} className="font-semibold text-navy-700 underline-offset-2 hover:underline">Open your resident site</a>
          </div>
        </section>
      )}

      {activeTab === 'requests' && guestPhone ? (
        <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <h1 className="text-2xl font-bold">My requests</h1>
          <p className="mt-1 text-muted">Requests sent from +{guestPhone}, with their latest status.</p>
          <div className="mt-5 rounded-[var(--radius-card)] border border-hairline bg-canvas px-5">
            <MyRequests
              guestToken={guest?.guestToken || ''}
              refreshKey={requestsRefresh}
              onSessionExpired={() => {
                clearGuestSession();
                setGuest(null);
              }}
            />
          </div>
        </section>
      ) : (
        <>
          {/* NoBroker-style Search Hero + Owner Onboarding Banner */}
          <section className="border-b border-hairline bg-gradient-to-b from-navy-900 via-navy-900 to-navy-700 text-white">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div className="max-w-2xl">
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-amber-500">
                    <ShieldCheck className="h-3.5 w-3.5" /> Zero brokerage · Verified PG listings in Chennai
                  </p>
                  <h1 className="mt-3 font-display text-2xl font-bold leading-tight text-white sm:text-4xl">
                    Verified PGs, Hostels & Co-Living — direct from owners
                  </h1>
                  <p className="mt-2 text-sm text-white/80 sm:text-base">
                    Explore full room tariffs, real facilities, live bed counts ({totalOpenBeds} beds ready), and roommate VibeCheck before you visit.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOwnerLeadOpen(true)}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-card)] border border-amber-500/40 bg-white/10 px-4 py-3 text-left transition-colors hover:bg-white/15"
                >
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-500">Are you a PG owner?</p>
                    <p className="text-sm font-semibold text-white">We photograph, configure & list your PG for free</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-amber-500" />
                </button>
              </div>

              {/* Property Type Tabs */}
              <div className="mt-6 flex flex-wrap gap-1.5" role="tablist" aria-label="Accommodation type">
                {[
                  { value: '', label: 'All stays' },
                  ...PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_SHORT_LABELS[t] }))
                ].map((tab) => {
                  const active = propertyType === tab.value;
                  return (
                    <button
                      key={tab.value || 'all'}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setPropertyType(tab.value)}
                      className={`rounded-t-[var(--radius-button)] px-4 py-2 text-sm font-semibold transition-colors ${
                        active ? 'bg-canvas text-navy-900' : 'bg-white/10 text-white/85 hover:bg-white/20'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Unified Search Bar */}
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="flex flex-col gap-2 rounded-b-[var(--radius-card)] rounded-tr-[var(--radius-card)] bg-canvas p-2 text-ink shadow-[var(--shadow-float)] sm:flex-row sm:items-center"
              >
                <select
                  aria-label="Locality"
                  value={queryScope}
                  onChange={(event) => setQueryScope(event.target.value)}
                  className="rounded-[var(--radius-field)] border border-hairline bg-surface px-3 py-2.5 text-sm font-semibold text-navy-900 outline-none sm:w-44 sm:border-0 sm:bg-transparent"
                >
                  <option value="">All localities</option>
                  {localityOptions.map((locality) => (
                    <option key={locality} value={locality}>{locality}</option>
                  ))}
                </select>
                <span className="hidden h-6 w-px bg-hairline sm:block" aria-hidden="true" />
                <div className="flex flex-1 items-center gap-1">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search PG name, locality or landmark"
                    aria-label="Search PGs"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-ink outline-none placeholder:text-muted"
                  />
                  <button
                    type="button"
                    onClick={() => setAiRequest({ query, nonce: Date.now() })}
                    aria-label="Ask the assistant about this search"
                    title="Ask the assistant about this search"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-navy-700 hover:bg-surface"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </button>
                  <button type="submit" className="btn-primary shrink-0 px-5">
                    <Search className="h-4 w-4" aria-hidden="true" /> Search
                  </button>
                </div>
              </form>
            </div>
          </section>

          <section id="results" className="mx-auto w-full max-w-7xl px-4 pb-12 pt-5 sm:px-6">
            {/* Locality Quick-Browse Pills */}
            {localityOptions.length > 0 && (
              <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted">Popular areas:</span>
                <button
                  type="button"
                  onClick={() => setQueryScope('')}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    !queryScope ? 'bg-navy-900 text-white' : 'bg-canvas text-ink border border-hairline hover:border-field-border'
                  }`}
                >
                  All Chennai
                </button>
                {localityOptions.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setQueryScope(queryScope === loc ? '' : loc)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      queryScope === loc ? 'bg-navy-900 text-white' : 'bg-canvas text-ink border border-hairline hover:border-field-border'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}

            {/* Quick Filters + Near Campus/Office + Saved */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Quick filters">
              <label className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border pl-3 pr-2 text-sm font-medium ${nearPlace ? 'border-navy-900 bg-amber-50 text-navy-900' : 'border-hairline bg-canvas text-ink hover:border-field-border'}`}>
                <MapPin className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Near your campus or office</span>
                <select
                  id="near-place"
                  value={nearId}
                  onChange={(event) => setNearId(event.target.value)}
                  className="max-w-56 cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium outline-none"
                  style={{ fontSize: '14px' }}
                >
                  <option value="">Near my campus or office</option>
                  <optgroup label="Campuses">
                    {CHENNAI_LANDMARKS.filter((place) => place.kind === 'campus').map((place) => (
                      <option key={place.id} value={place.id}>Near {place.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Offices">
                    {CHENNAI_LANDMARKS.filter((place) => place.kind === 'office').map((place) => (
                      <option key={place.id} value={place.id}>Near {place.name}</option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              </label>

              {quickChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  aria-pressed={chip.active}
                  onClick={chip.toggle}
                  className={`h-9 shrink-0 rounded-full border px-4 text-sm font-medium ${chip.active ? 'border-navy-900 bg-amber-50 text-navy-900' : 'border-hairline bg-canvas text-ink hover:border-field-border'}`}
                >
                  {chip.label}
                </button>
              ))}

              <button
                type="button"
                aria-pressed={savedOnly}
                onClick={() => {
                  if (!guestPhone) {
                    setSignInOpen(true);
                    return;
                  }
                  setSavedOnly((v) => !v);
                }}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${
                  savedOnly ? 'border-navy-900 bg-amber-50 text-navy-900' : 'border-hairline bg-canvas text-ink hover:border-field-border'
                }`}
              >
                <Heart className={`h-4 w-4 ${savedOnly ? 'fill-current' : ''}`} />
                Saved {guestPhone && savedIds.length > 0 ? `(${savedIds.length})` : ''}
              </button>

              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-canvas px-4 text-sm font-medium text-ink hover:border-field-border"
              >
                <SlidersHorizontal className="h-4 w-4" /> More filters
                {activeFilterCount > 0 && <span className="tabular rounded-full bg-navy-900 px-1.5 text-xs text-white">{activeFilterCount}</span>}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink" aria-live="polite">
                <span className="tabular font-semibold text-navy-900">{filteredProperties.length}</span>{' '}
                {filteredProperties.length === 1 ? 'PG' : 'PGs'}
                {query.trim() ? <> for “{query.trim()}”</> : queryScope ? <> in {queryScope}</> : ' in Chennai'}
                {nearPlace && sort === 'featured' && <span className="hidden text-muted sm:inline">, nearest to {nearPlace.name.split(',')[0]} first</span>}
                {query.trim() && semanticScores && semanticScores.size > 0 && (
                  <span className="ml-2 text-sm text-muted" title="Includes PGs that match what you described, not just the exact words">including close matches</span>
                )}
              </p>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Sort</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="rounded-[var(--radius-field)] bg-transparent py-1 font-medium text-navy-900 outline-none"
                >
                  {SORTS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading PGs">
                {[0, 1, 2, 3].map((key) => (
                  <div key={key} className="animate-pulse rounded-[var(--radius-card)] border border-hairline bg-canvas p-3">
                    <div className="aspect-[4/3] rounded-[var(--radius-field)] bg-hairline" />
                    <div className="mt-3 h-4 w-2/3 rounded bg-hairline" />
                    <div className="mt-2 h-3 w-1/3 rounded bg-hairline" />
                  </div>
                ))}
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="mt-6 rounded-[var(--radius-card)] border border-hairline bg-canvas px-6 py-12 text-center">
                <h2 className="text-xl font-semibold">No PGs match these filters</h2>
                <p className="mx-auto mt-1 max-w-sm text-muted">
                  {savedOnly ? 'You have not saved any matching PGs yet.' : 'Remove a filter or raise your budget to see more PGs.'}
                </p>
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearFilters} className="btn-secondary mt-5">Clear filters</button>
                )}
              </div>
            ) : (
              <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProperties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    matchesRoom={matchesRoom}
                    nearName={nearPlace ? nearPlace.name.split(',')[0] : null}
                    distanceKmValue={distanceTo(property)}
                    saved={savedIds.includes(property.id)}
                    onToggleSave={handleToggleSave}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Owner Visibility & Done-For-You Concierge Section */}
          <section className="border-t border-hairline bg-canvas py-12">
            <div className="mx-auto max-w-7xl px-4 sm:px-6">
              <div className="rounded-[var(--radius-card)] border border-hairline bg-gradient-to-br from-navy-900 to-navy-700 p-6 text-white sm:p-10">
                <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
                  <div>
                    <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-navy-900">
                      <Sparkles className="h-3.5 w-3.5" /> For PG, Hostel & Co-Living Owners
                    </p>
                    <h2 className="mt-3 font-display text-2xl font-bold text-white sm:text-3xl">
                      Reach thousands of students & IT professionals — with zero setup work
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
                      Don’t waste hours configuring portals. Share your contact details and our concierge team collects your room tariffs, photos, and facilities across all your PGs and publishes a verified showcase page for you.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" onClick={() => setOwnerLeadOpen(true)} className="btn-primary">
                        List Your PG — Free Onboarding
                      </button>
                      <Link
                        to={ROUTES.listYourPg}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-button)] border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                      >
                        Learn how it works <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    {[
                      { icon: UserCheck, title: '1. Submit inquiry', text: 'Tell us how many PGs & rooms you have in 60 seconds.' },
                      { icon: Camera, title: '2. We collect & build', text: 'Our ops team gathers photos, amenities, rules & tariffs.' },
                      { icon: CheckCircle2, title: '3. Published & booking-ready', text: 'Go live on Living Plus and receive verified bed requests.' }
                    ].map((step) => (
                      <div key={step.title} className="flex items-start gap-3 rounded-[var(--radius-button)] bg-white/10 p-3.5">
                        <step.icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                        <div>
                          <p className="text-sm font-bold text-white">{step.title}</p>
                          <p className="text-xs text-white/80">{step.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      <footer className="mt-auto border-t border-hairline bg-canvas">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted sm:px-6">
          <BrandLogo />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={residentHome} className="hover:text-navy-900">Residents</a>
            <Link to={ROUTES.listYourPg} className="font-semibold text-navy-900 hover:underline">List your PG</Link>
            <Link to={ROUTES.ownerLogin} className="hover:text-navy-900">Owner sign in</Link>
            <Link to={ROUTES.adminLogin} className="hover:text-navy-900">Onboarding ops</Link>
            <Link to="/privacy-policy" className="hover:text-navy-900">Privacy</Link>
            <Link to="/terms" className="hover:text-navy-900">Terms</Link>
          </nav>
          <p>© 2026 Living Plus, Chennai</p>
        </div>
      </footer>

      <FilterSheet
        open={mobileFiltersOpen}
        onClose={() => setMobileFiltersOpen(false)}
        filteredCount={filteredProperties.length}
        activeFilterCount={activeFilterCount}
        onClearFilters={clearFilters}
        gender={gender}
        setGender={setGender}
        minRent={minRent}
        setMinRent={setMinRent}
        maxRent={maxRent}
        setMaxRent={setMaxRent}
        roomTypes={roomTypes}
        setRoomTypes={setRoomTypes}
        acOnly={acOnly}
        setAcOnly={setAcOnly}
        foodOnly={foodOnly}
        setFoodOnly={setFoodOnly}
        amenities={amenities}
        setAmenities={setAmenities}
        amenityCounts={amenityCounts}
      />

      <OwnerLeadModal open={ownerLeadOpen} onClose={() => setOwnerLeadOpen(false)} />

      <GuestSignInModal
        open={signInOpen}
        onClose={() => {
          setSignInOpen(false);
          setPendingSaveId(null);
        }}
        onVerified={handleGuestVerified}
      />

      <AIChatPanel hideLauncher limited={!isOnboarded && !isStaff} openRequest={aiRequest} />
    </main>
  );
}
