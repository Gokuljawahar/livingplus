import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpDown,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronDown,
  IndianRupee,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { RESIDENT_TOKEN_KEY } from '../utils/session';
import { resolveAppHost } from '../utils/pg-host';
import {
  clearGuestSession,
  getGuestSession,
  updateGuestToken,
  type GuestSession,
} from '../utils/guest-session';
import { SecureImage } from '../components/SecureImage';
import AIChatPanel from '../components/AIChatPanel';
import GuestLoginGate from '../components/GuestLoginGate';
import MyRequests from '../components/MyRequests';
import { useOtpCooldown } from '../hooks/useOtpCooldown';
import { apiErrorMessage, apiErrorStatus } from '../utils/api-error';

interface PGProperty {
  id: string;
  name: string;
  description?: string | null;
  address: string;
  locality: string;
  city: string;
  genderPolicy: string;
  managerPhone?: string | null;
  amenities: string[];
  houseRules: string[];
  photoUrls: string[];
  availableBeds: number;
  rooms: {
    id: string;
    roomNumber: string;
    roomType?: string;
    hasAc?: boolean;
    foodIncluded?: boolean;
    monthlyRent: number;
    availableBeds: number;
    beds: { id: string; label: string }[];
  }[];
}

interface ResidentStay {
  id: string;
  name: string;
  status: string;
  monthlyRent: number;
  property: { id: string; name: string; locality: string; city: string };
  bed?: { label: string; room: { roomNumber: string; roomType: string } } | null;
}

const ROOM_TYPES = [
  { value: 'PRIVATE', label: 'Private room' },
  { value: 'DOUBLE', label: '2 sharing' },
  { value: 'TRIPLE', label: '3 sharing' },
  { value: 'SHARED', label: 'Shared dorm' },
];

const PRICE_BANDS = [
  { label: 'Under ₹5,000', min: '', max: '5000' },
  { label: '₹5,000 – ₹8,000', min: '5000', max: '8000' },
  { label: '₹8,000 – ₹12,000', min: '8000', max: '12000' },
  { label: 'Above ₹12,000', min: '12000', max: '' },
];

const SORTS = [
  { value: 'featured', label: 'Sort: Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'beds-desc', label: 'Most beds available' },
];

const GENDER_LABELS: Record<string, string> = { MEN: 'Men', WOMEN: 'Women', ANY: 'Co-living' };

export default function PGDiscovery() {
  const { user, logout: authLogout } = useAuth();
  const [guest, setGuest] = useState<GuestSession | null>(() => getGuestSession());
  const [activeTab, setActiveTab] = useState<'search' | 'requests'>('search');
  const [properties, setProperties] = useState<PGProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [stays, setStays] = useState<ResidentStay[]>([]);
  const [requestsRefresh, setRequestsRefresh] = useState(0);

  const signedIn = Boolean(user || guest);
  const guestPhone = guest?.phone || '';
  const canResidentSignIn =
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) || resolveAppHost().kind === 'property';
  const [aiRequest, setAiRequest] = useState<{ query: string; nonce: number } | null>(null);
  const isStaff = ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'].includes(user?.role || '');
  const isOnboarded = stays.length > 0 || user?.role === 'PG_TENANT';

  // Amazon-style search state: one text box plus a sidebar of refinements.
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Booking-request modal state.
  const [selectedProperty, setSelectedProperty] = useState<PGProperty | null>(null);
  const [selectedBed, setSelectedBed] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneToken, setPhoneToken] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [request, setRequest] = useState({ residentName: '', phone: '', email: '', moveInDate: '', notes: '' });
  const { cooldown: otpCooldown, startCooldown: startOtpCooldown } = useOtpCooldown();

  useEffect(() => {
    if (!signedIn) return;
    const loadProperties = async () => {
      setLoading(true);
      try {
        const response = await api.get('/pg/properties');
        setProperties(response.data);
      } catch {
        toast.error('Could not load PG listings');
      } finally {
        setLoading(false);
      }
    };
    void loadProperties();
  }, [signedIn]);

  // Onboarded residents see their profile strip above search. Only attempted
  // when a resident token actually exists so guests never hit a 401.
  useEffect(() => {
    if (!signedIn || !localStorage.getItem(RESIDENT_TOKEN_KEY)) return;
    const loadStays = async () => {
      try {
        const response = await api.get('/pg/tenant/stays');
        setStays(response.data || []);
      } catch {
        setStays([]);
      }
    };
    void loadStays();
  }, [signedIn, user]);

  const toggleInList = (list: string[], value: string, set: (next: string[]) => void) => {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const matchesRoom = (room: PGProperty['rooms'][number]) => {
    if (!room.availableBeds) return false;
    if (roomTypes.length && (!room.roomType || !roomTypes.includes(room.roomType))) return false;
    if (acOnly && !room.hasAc) return false;
    if (foodOnly && !room.foodIncluded) return false;
    return true;
  };

  const startingRent = (property: PGProperty) =>
    property.rooms
      .filter(matchesRoom)
      .reduce((lowest, room) => Math.min(lowest, room.monthlyRent), Number.POSITIVE_INFINITY);

  // A resident's own PG never appears in "search other PGs" here. Room moves
  // inside it happen through the room change section of the resident portal.
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

  const queryFiltered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return visibleProperties.filter((property) => {
      const haystack = `${property.name} ${property.locality} ${property.city} ${property.address}`.toLowerCase();
      const matchesText = !text || haystack.includes(text);
      const matchesScope = !queryScope || queryScope === property.locality;
      return matchesText && matchesScope;
    });
  }, [visibleProperties, query, queryScope]);

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
    const rentOf = (property: PGProperty) => startingRent(property);
    if (sort === 'price-asc') list.sort((a, b) => rentOf(a) - rentOf(b));
    if (sort === 'price-desc') list.sort((a, b) => rentOf(b) - rentOf(a));
    if (sort === 'beds-desc') list.sort((a, b) => b.availableBeds - a.availableBeds);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFiltered, gender, roomTypes, minRent, maxRent, acOnly, foodOnly, amenities, sort]);

  const activeFilterCount =
    (gender ? 1 : 0) +
    roomTypes.length +
    (minRent || maxRent ? 1 : 0) +
    (acOnly ? 1 : 0) +
    (foodOnly ? 1 : 0) +
    amenities.length;

  const clearFilters = () => {
    setGender('');
    setRoomTypes([]);
    setMinRent('');
    setMaxRent('');
    setAcOnly(false);
    setFoodOnly(false);
    setAmenities([]);
  };

  const signOut = () => {
    if (guest) {
      clearGuestSession();
      setGuest(null);
    }
    if (user) authLogout();
    setActiveTab('search');
  };

  const openRequest = (property: PGProperty) => {
    const verifiedPhone = guest?.phone || '';
    setSelectedProperty(property);
    setSelectedBed('');
    setRequest({ residentName: user?.name || '', phone: verifiedPhone, email: '', moveInDate: '', notes: '' });
    // Reuse the login OTP token for the first booking when the number matches.
    setPhoneToken(guest?.phoneToken || '');
    setOtpSent(Boolean(guest?.phoneToken));
    setOtpCode('');
  };

  const closeRequest = () => {
    setSelectedProperty(null);
    setSelectedBed('');
    setRequest({ residentName: '', phone: '', email: '', moveInDate: '', notes: '' });
    setOtpSent(false);
    setOtpCode('');
    setPhoneToken('');
  };

  const sendOtp = async () => {
    if (!request.phone.trim()) {
      toast.error('Enter your phone number first');
      return;
    }
    setOtpLoading(true);
    try {
      const response = await api.post('/auth/otp-request', { phone: request.phone, purpose: 'BOOKING' });
      if (response.data.devCode) toast.success(`Demo code: ${response.data.devCode}`);
      else toast.success('Verification code sent');
      setOtpSent(true);
      startOtpCooldown();
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, 'Could not send code'));
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    setOtpLoading(true);
    try {
      const response = await api.post('/auth/otp-verify', { phone: request.phone, code: otpCode, purpose: 'BOOKING' });
      setPhoneToken(response.data.phoneToken);
      if (guest && request.phone.replace(/\D/g, '') === guest.phone) updateGuestToken(response.data.phoneToken);
      toast.success('Phone verified');
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, 'Invalid code'));
    } finally {
      setOtpLoading(false);
    }
  };

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProperty || !selectedBed) return;
    setSubmitting(true);
    try {
      const response = await api.post('/pg/bookings', {
        ...request,
        propertyId: selectedProperty.id,
        bedId: selectedBed,
        phoneToken,
      });
      toast.success(response.data.message || 'Booking request submitted');
      // The OTP token is single-use; drop it but keep the guest signed in.
      setPhoneToken('');
      updateGuestToken('');
      setGuest(getGuestSession());
      const listings = await api.get('/pg/properties');
      setProperties(listings.data);
      closeRequest();
      if (guestPhone) {
        setRequestsRefresh((key) => key + 1);
        setActiveTab('requests');
      }
    } catch (error: unknown) {
      if (apiErrorStatus(error) === 403) {
        setPhoneToken('');
        updateGuestToken('');
        setGuest(getGuestSession());
        toast.error('Verification expired — please verify your number again');
      } else {
        toast.error(apiErrorMessage(error, 'Could not submit booking request'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!signedIn) {
    return <GuestLoginGate onVerified={(session) => setGuest(session)} />;
  }

  const profileName = stays[0]?.name || user?.name || null;

  const filterPanel = (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeFilterCount > 0 && (
            <span className="bg-[#02224B] px-1.5 py-0.5 text-[11px] font-bold text-white">{activeFilterCount}</span>
          )}
        </p>
        {activeFilterCount > 0 && (
          <button onClick={clearFilters} className="text-xs font-semibold text-slate-500 hover:text-[#02224B]">
            Clear all
          </button>
        )}
      </div>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Resident policy</h3>
        <div className="mt-2 space-y-1.5">
          {['', 'WOMEN', 'MEN', 'ANY'].map((value) => (
            <label key={value || 'all'} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="gender" checked={gender === value} onChange={() => setGender(value)} className="accent-[#02224B]" />
              {value === '' ? 'All' : GENDER_LABELS[value]}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Monthly rent</h3>
        <div className="mt-2 space-y-1.5">
          {PRICE_BANDS.map((band) => {
            const active = minRent === band.min && maxRent === band.max;
            return (
              <label key={band.label} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="price-band"
                  checked={active}
                  onChange={() => {
                    setMinRent(band.min);
                    setMaxRent(band.max);
                  }}
                  className="accent-[#02224B]"
                />
                {band.label}
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            aria-label="Minimum rent"
            type="number"
            min="0"
            value={minRent}
            onChange={(event) => setMinRent(event.target.value)}
            placeholder="Min"
            className="w-full border border-slate-300 px-2 py-1.5 text-sm"
          />
          <span className="text-slate-400">–</span>
          <input
            aria-label="Maximum rent"
            type="number"
            min="0"
            value={maxRent}
            onChange={(event) => setMaxRent(event.target.value)}
            placeholder="Max"
            className="w-full border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Room type</h3>
        <div className="mt-2 space-y-1.5">
          {ROOM_TYPES.map((type) => (
            <label key={type.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={roomTypes.includes(type.value)}
                onChange={() => toggleInList(roomTypes, type.value, setRoomTypes)}
                className="accent-[#02224B]"
              />
              {type.label}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Comfort</h3>
        <div className="mt-2 space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={acOnly} onChange={(event) => setAcOnly(event.target.checked)} className="accent-[#02224B]" />
            AC only
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={foodOnly} onChange={(event) => setFoodOnly(event.target.checked)} className="accent-[#02224B]" />
            Food included
          </label>
        </div>
      </section>

      {amenityCounts.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Amenities</h3>
          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {amenityCounts.map(([amenity, count]) => (
              <label key={amenity} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={amenities.includes(amenity)}
                  onChange={() => toggleInList(amenities, amenity, setAmenities)}
                  className="accent-[#02224B]"
                />
                <span className="flex-1">{amenity}</span>
                <span className="text-xs text-slate-400">({count})</span>
              </label>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      {/* Store-style header: brand, one search bar, account. */}
      <header className="bg-[#02224B] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <span className="flex items-center gap-2 text-lg font-bold">
            <Building2 className="h-5 w-5 text-[#FEB109]" /> LivingPlus PG
          </span>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setActiveTab('search');
            }}
            className="flex min-w-52 flex-1 items-stretch overflow-hidden bg-white text-slate-900"
            role="search"
          >
            <select
              aria-label="Search within locality"
              value={queryScope}
              onChange={(event) => setQueryScope(event.target.value)}
              className="hidden max-w-36 border-r border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600 outline-none sm:block"
            >
              <option value="">All localities</option>
              {localityOptions.map((locality) => (
                <option key={locality} value={locality}>
                  {locality}
                </option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search PG name, locality or landmark…"
              aria-label="Search PGs"
              className="w-full px-3 py-2.5 text-sm outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setAiRequest({ query, nonce: Date.now() })}
              aria-label="Ask AI about this search"
              title="Ask AI about this search"
              className="px-3 text-slate-400 hover:text-[#02224B]"
            >
              <Sparkles className="h-5 w-5" />
            </button>
            <button type="submit" aria-label="Search" className="bg-[#FEB109] px-4 text-[#02224B] hover:bg-[#e5a200]">
              <Search className="h-5 w-5" />
            </button>
          </form>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden items-center gap-1.5 font-medium text-blue-100 md:inline-flex">
              <UserRound className="h-4 w-4" />
              {profileName || (guestPhone ? `+${guestPhone}` : 'Guest')}
            </span>
            {signedIn && (
              <button
                onClick={signOut}
                className="inline-flex items-center gap-1 font-semibold text-blue-100 hover:text-white"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            )}
          </div>
        </div>
        <nav className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 text-sm">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-3 py-2 font-semibold ${activeTab === 'search' ? 'text-[#FEB109] underline underline-offset-4' : 'text-blue-100 hover:text-white'}`}
            >
              Search PGs
            </button>
            {guestPhone && (
              <button
                onClick={() => setActiveTab('requests')}
                className={`px-3 py-2 font-semibold ${activeTab === 'requests' ? 'text-[#FEB109] underline underline-offset-4' : 'text-blue-100 hover:text-white'}`}
              >
                My requests
              </button>
            )}
            {canResidentSignIn && (
              <Link to="/resident" className="px-3 py-2 font-semibold text-blue-100 hover:text-white">
                {stays.length > 0 ? 'My stays & profile' : 'Resident sign in'}
              </Link>
            )}
          </div>
        </nav>
      </header>

      {/* Onboarded residents see their profile strip above search. */}
      {stays.length > 0 && (
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <p className="text-sm text-slate-600">
              Welcome back, <span className="font-bold text-[#02224B]">{stays[0]?.name}</span>
            </p>
            {stays.slice(0, 3).map((stay) => (
              <p key={stay.id} className="flex items-center gap-1.5 text-sm text-slate-600">
                <BedDouble className="h-4 w-4 text-slate-400" />
                {stay.property.name}
                {stay.bed ? ` · Room ${stay.bed.room.roomNumber}, ${stay.bed.label}` : ''} · ₹
                {stay.monthlyRent.toLocaleString('en-IN')}/mo
              </p>
            ))}
            <Link to="/resident" className="ml-auto text-sm font-bold text-[#02224B] hover:underline">
              Open full profile →
            </Link>
            {ownPropertyIds.size > 0 && (
              <p className="w-full text-xs text-slate-500">
                Your current PG{ownPropertyIds.size > 1 ? 's are' : ' is'} hidden from search. To change rooms, use
                Room change in your{' '}
                <Link to="/resident" className="font-bold text-[#02224B] hover:underline">
                  resident portal
                </Link>
                .
              </p>
            )}
          </div>
        </section>
      )}

      {activeTab === 'requests' && guestPhone ? (
        <section className="mx-auto max-w-5xl px-4 py-8">
          <h1 className="text-xl font-bold text-[#02224B]">My booking requests</h1>
          <p className="mt-1 text-sm text-slate-500">Signed in as +{guestPhone}. Live status of every request from this number.</p>
          <div className="mt-4 border border-slate-200 bg-white px-5">
            <MyRequests phone={guestPhone} refreshKey={requestsRefresh} />
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-7xl gap-6 px-4 py-6 lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <details
            className="mb-4 border border-slate-200 bg-white lg:hidden"
            open={mobileFiltersOpen}
            onToggle={(event) => setMobileFiltersOpen((event.target as HTMLDetailsElement).open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-slate-900">
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Filters
                {activeFilterCount > 0 && (
                  <span className="bg-[#02224B] px-1.5 py-0.5 text-[11px] font-bold text-white">{activeFilterCount}</span>
                )}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </summary>
            <div className="border-t border-slate-100 px-4 py-4">{filterPanel}</div>
          </details>

          <aside className="hidden border border-slate-200 bg-white p-4 lg:block lg:self-start lg:sticky lg:top-4">
            {filterPanel}
          </aside>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <p className="text-sm text-slate-600">
                <span className="font-bold text-slate-900">{filteredProperties.length}</span>{' '}
                {filteredProperties.length === 1 ? 'result' : 'results'}
                {query.trim() ? (
                  <>
                    {' '}for <span className="font-semibold text-[#02224B]">“{query.trim()}”</span>
                  </>
                ) : (
                  ' across Chennai'
                )}
              </p>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <select
                  aria-label="Sort results"
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
                >
                  {SORTS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <div className="flex justify-center bg-white py-20">
                <Loader2 className="h-7 w-7 animate-spin text-[#02224B]" />
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="bg-white py-20 text-center">
                <Building2 className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">No PGs match those filters</p>
                <p className="mt-1 text-sm text-slate-500">Try a different search or clear some filters.</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="mt-4 border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProperties.map((property) => {
                  const rent = startingRent(property);
                  return (
                    <article key={property.id} className="flex flex-col border border-slate-200 bg-white">
                      <div className="aspect-[16/9] overflow-hidden bg-slate-200">
                        {property.photoUrls?.[0] ? (
                          <SecureImage srcKey={property.photoUrls[0]} alt={property.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Building2 className="h-9 w-9 text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-bold text-[#02224B]">{property.name}</h2>
                          <span className="bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold uppercase text-slate-600">
                            {GENDER_LABELS[property.genderPolicy] || property.genderPolicy}
                          </span>
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3.5 w-3.5" />
                          {property.locality}, {property.city}
                        </p>
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <BedDouble className="h-3.5 w-3.5" />
                          {property.availableBeds} {property.availableBeds === 1 ? 'bed' : 'beds'} available
                        </p>
                        {property.amenities?.length > 0 && (
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">{property.amenities.slice(0, 3).join(' · ')}</p>
                        )}
                        <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                          <p className="text-xs text-slate-500">
                            from{' '}
                            <span className="text-lg font-bold text-slate-900">
                              <IndianRupee className="mr-0.5 inline h-4 w-4" />
                              {Number.isFinite(rent) ? rent.toLocaleString('en-IN') : '—'}
                            </span>
                            /mo
                          </p>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => openRequest(property)}
                            disabled={!property.availableBeds}
                            className="flex-1 bg-[#02224B] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0A3B75] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Request a bed
                          </button>
                          {property.managerPhone && (
                            <a
                              href={`https://wa.me/${property.managerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I am interested in ${property.name} in ${property.locality}.`)}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`WhatsApp inquiry for ${property.name}`}
                              className="inline-flex items-center border border-slate-300 px-3 py-2 text-emerald-700"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {selectedProperty && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRequest();
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="booking-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-amber-700">Booking request</p>
                <h2 id="booking-title" className="mt-1 text-xl font-bold text-[#02224B]">
                  {selectedProperty.name}
                </h2>
              </div>
              <button onClick={closeRequest} aria-label="Close booking request" className="p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitRequest} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Available bed
                <select
                  required
                  value={selectedBed}
                  onChange={(event) => setSelectedBed(event.target.value)}
                  className="mt-1.5 w-full border border-slate-300 bg-white px-3 py-2.5"
                >
                  <option value="">Choose a bed</option>
                  {selectedProperty.rooms
                    .filter(matchesRoom)
                    .flatMap((room) =>
                      room.beds.map((bed) => (
                        <option key={bed.id} value={bed.id}>
                          Room {room.roomNumber} · {bed.label} · ₹{room.monthlyRent.toLocaleString('en-IN')}/month
                        </option>
                      ))
                    )}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Full name
                <input
                  required
                  value={request.residentName}
                  onChange={(event) => setRequest({ ...request, residentName: event.target.value })}
                  className="mt-1.5 w-full border border-slate-300 px-3 py-2.5"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  Phone
                  <input
                    required
                    type="tel"
                    value={request.phone}
                    onChange={(event) => {
                      const nextPhone = event.target.value;
                      setRequest({ ...request, phone: nextPhone });
                      if (guest && nextPhone.replace(/\D/g, '') !== guest.phone) {
                        setPhoneToken('');
                        setOtpSent(false);
                      }
                    }}
                    className="mt-1.5 w-full border border-slate-300 px-3 py-2.5"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Move-in date
                  <input
                    required
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={request.moveInDate}
                    onChange={(event) => setRequest({ ...request, moveInDate: event.target.value })}
                    className="mt-1.5 w-full border border-slate-300 px-3 py-2.5"
                  />
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                Email <span className="font-normal text-slate-400">(optional)</span>
                <input
                  type="email"
                  value={request.email}
                  onChange={(event) => setRequest({ ...request, email: event.target.value })}
                  className="mt-1.5 w-full border border-slate-300 px-3 py-2.5"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Note <span className="font-normal text-slate-400">(optional)</span>
                <textarea
                  rows={2}
                  value={request.notes}
                  onChange={(event) => setRequest({ ...request, notes: event.target.value })}
                  className="mt-1.5 w-full resize-y border border-slate-300 px-3 py-2.5"
                />
              </label>
              <div className="border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">
                  Phone verification {phoneToken ? <span className="font-semibold text-emerald-700">· verified</span> : null}
                </p>
                {!phoneToken && (
                  <div className="mt-2 flex flex-col gap-2">
                    {!otpSent ? (
                      <button
                        type="button"
                        disabled={otpLoading || otpCooldown > 0}
                        onClick={() => void sendOtp()}
                        className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                      >
                        {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Send verification code'}
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          aria-label="6-digit verification code"
                          value={otpCode}
                          onChange={(event) => setOtpCode(event.target.value)}
                          placeholder="6-digit code"
                          inputMode="numeric"
                          className="w-full border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={otpLoading || !otpCode}
                          onClick={() => void verifyOtp()}
                          className="shrink-0 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          Verify
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                disabled={submitting || !phoneToken}
                className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-3 font-semibold text-white hover:bg-[#0A3B75] disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                Send request
              </button>
            </form>
          </section>
        </div>
      )}

      <AIChatPanel hideLauncher limited={!isOnboarded && !isStaff} openRequest={aiRequest} />
    </main>
  );
}
