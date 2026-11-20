import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowUpDown, ChevronDown, LogOut, MapPin, Menu, MessageCircle, Search, SlidersHorizontal } from 'lucide-react';
import { CHENNAI_LANDMARKS, distanceKm } from '@livingplus/shared';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
import AIChatPanel from '../components/AIChatPanel';
import GuestLoginGate from '../components/GuestLoginGate';
import MyRequests from '../components/MyRequests';
import BrandLogo from '../components/ui/BrandLogo';
import { useAuth } from '../context/auth';
import BookingModal from '../features/discovery/BookingModal';
import FilterSheet from '../features/discovery/FilterSheet';
import PropertyCard from '../features/discovery/PropertyCard';
import { keywordMatch, SORTS, type PGProperty, type ResidentStay } from '../features/discovery/types';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ROUTES } from '../utils/app-areas';
import { clearGuestSession, getGuestSession, type GuestSession } from '../utils/guest-session';
import { RESIDENT_SITE_KEY, RESIDENT_TOKEN_KEY } from '../utils/session';

export default function PGDiscovery() {
  const { user, logout: authLogout } = useAuth();
  const [guest, setGuest] = useState<GuestSession | null>(() => getGuestSession());
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: 'search' | 'requests' = location.pathname === ROUTES.guestRequests ? 'requests' : 'search';
  const [requestsRefresh, setRequestsRefresh] = useState(0);

  const signedIn = Boolean(user || guest);
  const queryClient = useQueryClient();
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
  const residentSiteSlug = localStorage.getItem(RESIDENT_TOKEN_KEY) ? localStorage.getItem(RESIDENT_SITE_KEY) : null;
  const residentHome = residentSiteSlug ? ROUTES.residentSite(residentSiteSlug) : ROUTES.residentFinder;
  const [aiRequest, setAiRequest] = useState<{ query: string; nonce: number } | null>(null);
  const isStaff = ['PG_OWNER', 'PG_WARDEN'].includes(user?.role || '');
  const isOnboarded = stays.length > 0 || user?.role === 'PG_TENANT';

  const [query, setQuery] = useState('');
  const [queryScope, setQueryScope] = useState('');
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
  const [selectedProperty, setSelectedProperty] = useState<PGProperty | null>(null);

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
      return matchesText && matchesScope;
    });
  }, [visibleProperties, query, queryScope, semanticScores]);

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
    const list = queryFiltered.filter((property) => {
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
  }, [queryFiltered, gender, minRent, maxRent, amenities, sort, query, semanticScores, nearPlace, matchesRoom, distanceTo]);

  const activeFilterCount =
    (gender ? 1 : 0) + roomTypes.length + (minRent || maxRent ? 1 : 0) + (acOnly ? 1 : 0) + (foodOnly ? 1 : 0) + amenities.length;

  const clearFilters = () => {
    setGender('');
    setRoomTypes([]);
    setMinRent('');
    setMaxRent('');
    setAcOnly(false);
    setFoodOnly(false);
    setAmenities([]);
    setNearId('');
  };

  const signOut = () => {
    if (guest) {
      clearGuestSession();
      setGuest(null);
    }
    if (user) authLogout();
    navigate(ROUTES.guestHome);
  };

  if (activeTab === 'requests' && !guestPhone) {
    return <GuestLoginGate onVerified={(session) => setGuest(session)} />;
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

  return (
    <main className="flex min-h-screen flex-col bg-surface text-ink">
      <a href="#results" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-[var(--radius-field)] focus:bg-canvas focus:px-3 focus:py-2">
        Skip to results
      </a>
      <header className="sticky top-0 z-40 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to={ROUTES.guestHome} aria-label="Living Plus home">
            <BrandLogo tone="dark" />
          </Link>
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              if (activeTab !== 'search') navigate(ROUTES.guestHome);
            }}
            className="order-last flex w-full items-center gap-1 rounded-full bg-canvas p-1 pl-2 text-ink md:order-none md:w-auto md:flex-1"
          >
            <select
              aria-label="Locality"
              value={queryScope}
              onChange={(event) => setQueryScope(event.target.value)}
              className="hidden max-w-44 rounded-full bg-transparent px-2 py-1.5 text-sm font-medium text-navy-900 outline-none sm:block"
            >
              <option value="">All localities</option>
              {localityOptions.map((locality) => (
                <option key={locality} value={locality}>{locality}</option>
              ))}
            </select>
            <span className="hidden h-6 w-px bg-hairline sm:block" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search PG name, locality or landmark"
              aria-label="Search PGs"
              className="min-w-0 flex-1 bg-transparent px-2 py-1.5 outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={() => setAiRequest({ query, nonce: Date.now() })}
              aria-label="Ask the assistant about this search"
              title="Ask the assistant about this search"
              className="flex h-10 w-10 items-center justify-center rounded-full text-navy-700 hover:bg-surface"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
            <button type="submit" aria-label="Search" className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-navy-900 hover:bg-amber-600">
              <Search className="h-5 w-5" />
            </button>
          </form>
          <nav aria-label="Other sites" className="ml-auto flex items-center gap-1 text-sm md:ml-0">
            <a href={residentHome} className="hidden rounded-[var(--radius-button)] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:block">
              {stays.length > 0 ? 'My stay' : 'Residents'}
            </a>
            <a href={ROUTES.ownerLogin} className="hidden rounded-[var(--radius-button)] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:block">
              For PG owners
            </a>
            {signedIn && (
              <button onClick={signOut} className="hidden items-center gap-1.5 rounded-[var(--radius-button)] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:inline-flex" title={profileName || (guestPhone ? `+${guestPhone}` : undefined)}>
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            )}
            <details className="relative md:hidden">
              <summary aria-label="Menu" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[var(--radius-button)] hover:bg-white/10">
                <Menu className="h-6 w-6" />
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-[var(--radius-card)] border border-hairline bg-canvas p-2 text-navy-900 shadow-[var(--shadow-float)]">
                <a href={residentHome} className="block rounded-[var(--radius-button)] px-3 py-2.5 font-medium hover:bg-surface">{stays.length > 0 ? 'My stay' : 'Residents'}</a>
                <a href={ROUTES.ownerLogin} className="block rounded-[var(--radius-button)] px-3 py-2.5 font-medium hover:bg-surface">For PG owners</a>
                {signedIn && (
                  <button onClick={signOut} className="block w-full rounded-[var(--radius-button)] px-3 py-2.5 text-left font-medium hover:bg-surface">Sign out</button>
                )}
              </div>
            </details>
          </nav>
        </div>
      </header>

      <nav aria-label="Guest" className="border-b border-hairline bg-canvas">
        <div className="mx-auto flex max-w-7xl gap-6 px-4 sm:px-6">
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
        <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
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
        <section id="results" className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6">
          <h1 className="sr-only">PGs in Chennai</h1>
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
              {query.trim() ? <> for “{query.trim()}”</> : ' in Chennai'}
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
            <div className="mt-4 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading PGs">
              {[0, 1, 2, 3].map((key) => (
                <div key={key} className="animate-pulse">
                  <div className="aspect-[4/3] rounded-[var(--radius-card)] bg-hairline" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-hairline" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-hairline" />
                </div>
              ))}
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="mt-6 rounded-[var(--radius-card)] border border-hairline bg-canvas px-6 py-12 text-center">
              <h2 className="text-xl font-semibold">No PGs match these filters</h2>
              <p className="mx-auto mt-1 max-w-sm text-muted">Remove a filter or raise your budget to see more PGs.</p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="btn-secondary mt-5">Clear filters</button>
              )}
            </div>
          ) : (
            <ul className="mt-4 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProperties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  matchesRoom={matchesRoom}
                  nearName={nearPlace ? nearPlace.name.split(',')[0] : null}
                  distanceKmValue={distanceTo(property)}
                  onSelect={setSelectedProperty}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className="mt-auto border-t border-hairline bg-canvas">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted sm:px-6">
          <BrandLogo />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <a href={residentHome} className="hover:text-navy-900">Residents</a>
            <Link to={ROUTES.ownerRegister} className="font-medium text-navy-900 hover:underline">List your PG</Link>
            <Link to={ROUTES.ownerLogin} className="hover:text-navy-900">Owner sign in</Link>
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

      {selectedProperty && (
        <BookingModal
          key={selectedProperty.id}
          property={selectedProperty}
          matchesRoom={matchesRoom}
          guest={guest}
          defaultName={user?.name || ''}
          onGuestChange={setGuest}
          onClose={() => setSelectedProperty(null)}
          onSubmitted={async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.properties() });
            setSelectedProperty(null);
            if (getGuestSession()) {
              setRequestsRefresh((key) => key + 1);
              navigate(ROUTES.guestRequests);
            }
          }}
        />
      )}

      <AIChatPanel hideLauncher limited={!isOnboarded && !isStaff} openRequest={aiRequest} />
    </main>
  );
}
