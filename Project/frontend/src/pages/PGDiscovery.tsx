import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Loader2,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
import { useAuth } from '../context/auth';
import { RESIDENT_TOKEN_KEY } from '../utils/session';
import { ROUTES } from '../utils/app-areas';
import { RESIDENT_SITE_KEY } from '../utils/session';
import {
  clearGuestSession,
  getGuestSession,
  normalizePhoneDigits,
  saveGuestSession,
  updateGuestToken,
  type GuestSession,
} from '../utils/guest-session';
import { SecureImage } from '../components/SecureImage';
import BrandLogo from '../components/ui/BrandLogo';
import PgPlaceholder from '../components/ui/PgPlaceholder';
import AIChatPanel from '../components/AIChatPanel';
import GuestLoginGate from '../components/GuestLoginGate';
import MyRequests from '../components/MyRequests';
import VibeProfileBuilder from '../components/VibeProfileBuilder';
import { hasKeyHabits, loadVibeAnswers, loadVibeSummary, saveVibeAnswers, saveVibeSummary } from '../utils/vibe-storage';
import { CHENNAI_LANDMARKS, distanceKm, formatDistance, type VibeAnswers, type VibeMatch } from '@livingplus/shared';
import { useOtpCooldown } from '../hooks/useOtpCooldown';
import { apiErrorMessage, apiErrorStatus } from '../utils/api-error';
import { phoneOtpErrorMessage, startPhoneVerification, type PhoneChallenge } from '../utils/phone-otp';

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
  serviceSettings?: { vibeCheck?: boolean } | null;
  /** An owner proved their phone with a code. */
  ownerVerified?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  rooms: {
    id: string;
    roomNumber: string;
    roomType?: string;
    hasAc?: boolean;
    foodIncluded?: boolean;
    foodCharge?: number | null;
    depositAmount?: number | null;
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
  { value: 'featured', label: 'Best match' },
  { value: 'price-asc', label: 'Lowest rent' },
  { value: 'price-desc', label: 'Highest rent' },
  { value: 'beds-desc', label: 'Most beds free' },
];

const GENDER_LABELS: Record<string, string> = { MEN: 'Men', WOMEN: 'Women', ANY: 'Co-living' };

const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;

function keywordMatch(property: PGProperty, text: string): boolean {
  return `${property.name} ${property.locality} ${property.city} ${property.address}`.toLowerCase().includes(text);
}

export default function PGDiscovery() {
  const { user, logout: authLogout } = useAuth();
  const [guest, setGuest] = useState<GuestSession | null>(() => getGuestSession());
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: 'search' | 'requests' = location.pathname === ROUTES.guestRequests ? 'requests' : 'search';
  const [requestsRefresh, setRequestsRefresh] = useState(0);

  const signedIn = Boolean(user || guest);
  const queryClient = useQueryClient();
  const { data: properties = [], isPending: propertiesPending } = useQuery({
    queryKey: queryKeys.properties(),
    queryFn: async (): Promise<PGProperty[]> => (await api.get('/pg/properties')).data,
    meta: { errorMessage: 'Could not load PG listings' }
  });
  const loading = propertiesPending;
  // Onboarded residents see their profile strip above search. Only attempted
  // when a resident token actually exists so guests never hit a 401.
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
  const [nearId, setNearId] = useState('');
  const nearPlace = CHENNAI_LANDMARKS.find((place) => place.id === nearId) ?? null;
  const distanceTo = (property: PGProperty): number | null =>
    nearPlace && property.latitude != null && property.longitude != null ? distanceKm({ latitude: property.latitude, longitude: property.longitude }, nearPlace) : null;
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Booking-request modal state.
  const [selectedProperty, setSelectedProperty] = useState<PGProperty | null>(null);
  const [selectedBed, setSelectedBed] = useState('');
  const [step, setStep] = useState<'details' | 'bed' | 'you' | 'verify'>('details');
  // VibeCheck: answers live on this device; matches are per PG.
  const [vibeAnswers, setVibeAnswers] = useState<VibeAnswers>(() => loadVibeAnswers());
  const [vibeSummary, setVibeSummary] = useState(() => loadVibeSummary());
  const [vibeOpen, setVibeOpen] = useState(false);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [vibeMatches, setVibeMatches] = useState<Map<string, VibeMatch> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const otpChallenge = useRef<PhoneChallenge<'BOOKING'> | null>(null);
  const [phoneToken, setPhoneToken] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [request, setRequest] = useState({ residentName: '', phone: '', email: '', moveInDate: '', notes: '' });
  const { cooldown: otpCooldown, startCooldown: startOtpCooldown } = useOtpCooldown();

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

  // Meaning-based matches from /pg/search once typing pauses. Any failure
  // (or semantic search being off) leaves plain keyword search in place.
  const searchText = useDebouncedValue(query.trim(), 350);
  const { data: semanticScores = null } = useQuery({
    queryKey: queryKeys.search(searchText),
    queryFn: async (): Promise<Map<string, number> | null> => {
      const data = (await api.get('/pg/search', { params: { q: searchText } })).data as { semantic?: boolean; results?: { propertyId: string; score: number }[] };
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
    const rentOf = (property: PGProperty) => startingRent(property);
    const text = query.trim().toLowerCase();
    if (sort === 'featured' && text && semanticScores) {
      // Exact text hits first, then the closest matches by meaning.
      const rank = (property: PGProperty) => (keywordMatch(property, text) ? 1 : 0) + (semanticScores.get(property.id) ?? 0);
      list.sort((a, b) => rank(b) - rank(a));
    }
    if (sort === 'price-asc') list.sort((a, b) => rentOf(a) - rentOf(b));
    if (sort === 'price-desc') list.sort((a, b) => rentOf(b) - rentOf(a));
    if (sort === 'beds-desc') list.sort((a, b) => b.availableBeds - a.availableBeds);
    // "Near" without an explicit sort: nearest first, PGs without a pinned location last.
    if (sort === 'featured' && nearPlace) list.sort((a, b) => (distanceTo(a) ?? Infinity) - (distanceTo(b) ?? Infinity));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryFiltered, gender, roomTypes, minRent, maxRent, acOnly, foodOnly, amenities, sort, query, semanticScores, nearId]);

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

  const openRequest = (property: PGProperty) => {
    const verifiedPhone = guest?.phone || '';
    setSelectedProperty(property);
    setStep('details');
    setVibeMatches(null);
    setVibeOpen(false);
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
      otpChallenge.current = await startPhoneVerification(request.phone, 'BOOKING');
      if (otpChallenge.current.devCode) toast.success(`Demo code: ${otpChallenge.current.devCode}`);
      else toast.success('Verification code sent');
      setOtpSent(true);
      startOtpCooldown();
    } catch (error: unknown) {
      toast.error(phoneOtpErrorMessage(error, 'Could not send code'));
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpChallenge.current) {
      toast.error('Request a new code first');
      return;
    }
    setOtpLoading(true);
    try {
      const data = await otpChallenge.current.verify(otpCode);
      setPhoneToken(data.phoneToken);
      // The first verification also signs the guest in, so "My requests" works without a second code.
      const digits = normalizePhoneDigits(request.phone);
      if (!guest || digits === guest.phone) setGuest(saveGuestSession(digits, data.phoneToken, data.guestToken));
      toast.success('Phone verified');
    } catch (error: unknown) {
      toast.error(phoneOtpErrorMessage(error, 'Invalid code'));
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
        ...(Object.keys(vibeAnswers).length ? { vibeAnswers, ...(vibeSummary ? { vibeSummary } : {}) } : {}),
      });
      toast.success(response.data.message || 'Booking request submitted');
      // The OTP token is single-use; drop it but keep the guest signed in.
      setPhoneToken('');
      updateGuestToken('');
      setGuest(getGuestSession());
      await queryClient.invalidateQueries({ queryKey: queryKeys.properties() });
      closeRequest();
      if (getGuestSession()) {
        setRequestsRefresh((key) => key + 1);
        navigate(ROUTES.guestRequests);
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

  // Browsing is open to everyone; only "My requests" needs a verified phone.
  if (activeTab === 'requests' && !guestPhone) {
    return <GuestLoginGate onVerified={(session) => setGuest(session)} />;
  }

  const profileName = stays[0]?.name || user?.name || null;

  const filterPanel = (
    <div className="space-y-6">
      {activeFilterCount > 0 && (
        <button onClick={clearFilters} className="text-sm font-semibold text-navy-700 underline-offset-2 hover:underline">
          Clear all filters
        </button>
      )}

      <section>
        <h3 className="text-xs font-bold text-slate-500">Resident policy</h3>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          {['', 'WOMEN', 'MEN', 'ANY'].map((value) => {
            const isChecked = gender === value;
            return (
              <label
                key={value || 'all'}
                className={`flex cursor-pointer items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  isChecked
                    ? 'border-navy-900 bg-navy-900 text-white shadow-sm'
                    : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="gender"
                  checked={isChecked}
                  onChange={() => setGender(value)}
                  className="sr-only"
                />
                {value === '' ? 'All PGs' : GENDER_LABELS[value]}
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-500">Monthly budget</h3>
        <div className="mt-2.5 space-y-1.5">
          {PRICE_BANDS.map((band) => {
            const active = minRent === band.min && maxRent === band.max;
            return (
              <label
                key={band.label}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  active
                    ? 'border-amber-400 bg-amber-50/70 text-slate-900 font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{band.label}</span>
                <input
                  type="radio"
                  name="price-band"
                  checked={active}
                  onChange={() => {
                    setMinRent(band.min);
                    setMaxRent(band.max);
                  }}
                  className="accent-navy-900 h-3.5 w-3.5"
                />
              </label>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">₹</span>
            <input
              aria-label="Minimum rent"
              type="number"
              min="0"
              value={minRent}
              onChange={(event) => setMinRent(event.target.value)}
              placeholder="Min"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-6 pr-2 text-xs font-medium focus:bg-white focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-all"
            />
          </div>
          <span className="text-slate-400 text-xs font-bold">–</span>
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">₹</span>
            <input
              aria-label="Maximum rent"
              type="number"
              min="0"
              value={maxRent}
              onChange={(event) => setMaxRent(event.target.value)}
              placeholder="Max"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-6 pr-2 text-xs font-medium focus:bg-white focus:border-navy-900 focus:ring-1 focus:ring-navy-900 outline-none transition-all"
            />
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-500">Room sharing</h3>
        <div className="mt-2.5 space-y-1.5">
          {ROOM_TYPES.map((type) => {
            const isChecked = roomTypes.includes(type.value);
            return (
              <label
                key={type.value}
                className={`flex cursor-pointer items-center justify-between px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  isChecked
                    ? 'border-navy-900 bg-navy-900/5 text-navy-900 font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{type.label}</span>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleInList(roomTypes, type.value, setRoomTypes)}
                  className="accent-navy-900 h-3.5 w-3.5 rounded"
                />
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-slate-500">Amenities & Inclusions</h3>
        <div className="mt-2.5 space-y-2">
          <label className="flex cursor-pointer items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all">
            <span>Air Conditioning (AC)</span>
            <input
              type="checkbox"
              checked={acOnly}
              onChange={(event) => setAcOnly(event.target.checked)}
              className="accent-navy-900 h-3.5 w-3.5 rounded"
            />
          </label>
          <label className="flex cursor-pointer items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all">
            <span>Home-Style Food Included</span>
            <input
              type="checkbox"
              checked={foodOnly}
              onChange={(event) => setFoodOnly(event.target.checked)}
              className="accent-navy-900 h-3.5 w-3.5 rounded"
            />
          </label>
        </div>
      </section>

      {amenityCounts.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-slate-500">Popular facilities</h3>
          <div className="mt-2.5 max-h-48 space-y-1 overflow-y-auto pr-1">
            {amenityCounts.map(([amenity, count]) => {
              const isChecked = amenities.includes(amenity);
              return (
                <label key={amenity} className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleInList(amenities, amenity, setAmenities)}
                    className="accent-navy-900 h-3.5 w-3.5 rounded"
                  />
                  <span className="flex-1 font-medium">{amenity}</span>
                  <span className="text-[11px] text-slate-400 font-semibold">{count}</span>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );

  const priceFacts = (property: PGProperty) => {
    const open = property.rooms.filter(matchesRoom);
    const rooms = open.length ? open : property.rooms;
    const cheapest = rooms.reduce<PGProperty['rooms'][number] | null>((low, room) => (!low || room.monthlyRent < low.monthlyRent ? room : low), null);
    const rents = rooms.map((room) => room.monthlyRent);
    return {
      from: cheapest?.monthlyRent ?? null,
      to: rents.length ? Math.max(...rents) : null,
      food: !cheapest ? null : (cheapest.foodCharge ?? 0) > 0 ? `+ ${rupees(cheapest.foodCharge!)} food (optional)` : cheapest.foodIncluded ? 'Food included' : 'No food',
      deposit: cheapest && (cheapest.depositAmount ?? 0) > 0 ? `Deposit ${rupees(cheapest.depositAmount!)}` : 'Deposit not listed'
    };
  };
  const availabilityText = (beds: number) => (beds <= 0 ? 'Fully occupied' : beds <= 3 ? `${beds} bed${beds === 1 ? '' : 's'} left` : `${beds} beds available`);
  const quickChips: { label: string; active: boolean; toggle: () => void }[] = [
    { label: 'Women', active: gender === 'WOMEN', toggle: () => setGender(gender === 'WOMEN' ? '' : 'WOMEN') },
    { label: 'Men', active: gender === 'MEN', toggle: () => setGender(gender === 'MEN' ? '' : 'MEN') },
    { label: 'Co-living', active: gender === 'ANY', toggle: () => setGender(gender === 'ANY' ? '' : 'ANY') },
    { label: 'Under ₹8,000', active: !minRent && maxRent === '8000', toggle: () => { setMinRent(''); setMaxRent(maxRent === '8000' && !minRent ? '' : '8000'); } },
    { label: 'Food available', active: foodOnly, toggle: () => setFoodOnly(!foodOnly) },
    { label: 'AC', active: acOnly, toggle: () => setAcOnly(!acOnly) }
  ];
  const facts = selectedProperty ? priceFacts(selectedProperty) : null;
  const vibeComplete = hasKeyHabits(vibeAnswers);
  const runVibeCheck = async () => {
    if (!selectedProperty) return;
    setVibeLoading(true);
    try {
      saveVibeAnswers(vibeAnswers);
      saveVibeSummary(vibeSummary);
      const { beds } = (await api.post(`/pg/properties/${selectedProperty.id}/vibecheck`, { answers: vibeAnswers, ...(vibeSummary ? { summary: vibeSummary } : {}) })).data as { beds: (VibeMatch & { bedId: string })[] };
      setVibeMatches(new Map(beds.map((bed) => [bed.bedId, bed])));
      setVibeOpen(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not run VibeCheck. Try again.'));
    } finally {
      setVibeLoading(false);
    }
  };
  const bedChoices = selectedProperty
    ? selectedProperty.rooms.filter(matchesRoom).flatMap((room) => room.beds.map((bed) => ({ room, bed, match: vibeMatches?.get(bed.id) ?? null })))
        .sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1))
    : [];
  const selectedMatch = vibeMatches?.get(selectedBed) ?? null;
  const chosenBed = selectedProperty?.rooms.flatMap((room) => room.beds.map((bed) => ({ room, bed }))).find(({ bed }) => bed.id === selectedBed) ?? null;
  const stepIndex = step === 'bed' ? 1 : step === 'you' ? 2 : step === 'verify' ? 3 : 0;
  const stepTitle = { details: '', bed: 'Choose a bed', you: 'Your details', verify: 'Verify your phone' }[step];
  const fieldClass = 'mt-1.5 block w-full rounded-[6px] border border-field-border bg-white px-3 py-2.5 text-ink outline-none focus:border-navy-900';
  const labelClass = 'block text-sm font-medium text-navy-900';

  return (
    <main className="flex min-h-screen flex-col bg-surface text-ink">
      <a href="#results" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-[6px] focus:bg-white focus:px-3 focus:py-2">
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
            className="order-last flex w-full items-center gap-1 rounded-full bg-white p-1 pl-2 text-ink md:order-none md:w-auto md:flex-1"
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
            <a href={residentHome} className="hidden rounded-[8px] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:block">
              {stays.length > 0 ? 'My stay' : 'Residents'}
            </a>
            <a href={ROUTES.ownerLogin} className="hidden rounded-[8px] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:block">
              For PG owners
            </a>
            {signedIn && (
              <button onClick={signOut} className="hidden items-center gap-1.5 rounded-[8px] px-3 py-2 font-medium text-white/85 hover:bg-white/10 hover:text-white md:inline-flex" title={profileName || (guestPhone ? `+${guestPhone}` : undefined)}>
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            )}
            <details className="relative md:hidden">
              <summary aria-label="Menu" className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-[8px] hover:bg-white/10">
                <Menu className="h-6 w-6" />
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-[14px] border border-hairline bg-white p-2 text-navy-900 shadow-[var(--shadow-float)]">
                <a href={residentHome} className="block rounded-[8px] px-3 py-2.5 font-medium hover:bg-surface">{stays.length > 0 ? 'My stay' : 'Residents'}</a>
                <a href={ROUTES.ownerLogin} className="block rounded-[8px] px-3 py-2.5 font-medium hover:bg-surface">For PG owners</a>
                {signedIn && (
                  <button onClick={signOut} className="block w-full rounded-[8px] px-3 py-2.5 text-left font-medium hover:bg-surface">Sign out</button>
                )}
              </div>
            </details>
          </nav>
        </div>
      </header>

      <nav aria-label="Guest" className="border-b border-hairline bg-white">
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
          <div className="mt-5 rounded-[14px] border border-hairline bg-white px-5">
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
            <label className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border pl-3 pr-2 text-sm font-medium ${nearPlace ? 'border-navy-900 bg-amber-50 text-navy-900' : 'border-hairline bg-white text-ink hover:border-field-border'}`}>
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
                  {CHENNAI_LANDMARKS.filter((place) => place.kind === 'campus').map((place) => <option key={place.id} value={place.id}>Near {place.name}</option>)}
                </optgroup>
                <optgroup label="Offices">
                  {CHENNAI_LANDMARKS.filter((place) => place.kind === 'office').map((place) => <option key={place.id} value={place.id}>Near {place.name}</option>)}
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
                className={`h-9 shrink-0 rounded-full border px-4 text-sm font-medium ${chip.active ? 'border-navy-900 bg-amber-50 text-navy-900' : 'border-hairline bg-white text-ink hover:border-field-border'}`}
              >
                {chip.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-white px-4 text-sm font-medium text-ink hover:border-field-border"
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
                className="rounded-[6px] bg-transparent py-1 font-medium text-navy-900 outline-none"
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
                  <div className="aspect-[4/3] rounded-[14px] bg-hairline" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-hairline" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-hairline" />
                </div>
              ))}
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="mt-6 rounded-[14px] border border-hairline bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-semibold">No PGs match these filters</h2>
              <p className="mx-auto mt-1 max-w-sm text-muted">Remove a filter or raise your budget to see more PGs.</p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="btn-secondary mt-5">Clear filters</button>
              )}
            </div>
          ) : (
            <ul className="mt-4 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredProperties.map((property) => {
                const price = priceFacts(property);
                return (
                  <li key={property.id}>
                    <button
                      type="button"
                      onClick={() => openRequest(property)}
                      className="group block w-full rounded-[14px] text-left"
                      aria-label={`${property.name}, ${property.locality}. ${price.from !== null ? `From ${rupees(price.from)} a month.` : ''} ${availabilityText(property.availableBeds)}`}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-closed-bg">
                        {property.photoUrls?.[0] ? (
                          <SecureImage srcKey={property.photoUrls[0]} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                        ) : (
                          <PgPlaceholder name={property.name} />
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[13px] font-semibold text-navy-900 shadow-[var(--shadow-float)]">
                          {GENDER_LABELS[property.genderPolicy] || property.genderPolicy}
                        </span>
                        {property.ownerVerified && (
                          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[13px] font-semibold text-positive shadow-[var(--shadow-float)]">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Verified owner
                          </span>
                        )}
                      </div>
                      <div className="mt-3">
                        <div className="flex items-start justify-between gap-3">
                          <h2 className="font-sans text-[17px] font-semibold leading-snug text-navy-900 group-hover:underline">{property.name}</h2>
                          <span className={`shrink-0 text-sm font-medium ${property.availableBeds <= 0 ? 'text-muted' : property.availableBeds <= 3 ? 'text-attention' : 'text-positive'}`}>
                            {availabilityText(property.availableBeds)}
                          </span>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {property.locality}, {property.city}
                        </p>
                        {nearPlace && (() => {
                          const km = distanceTo(property);
                          return (
                            <p className="mt-0.5 text-sm font-medium text-navy-700">
                              {km === null ? `Distance to ${nearPlace.name.split(',')[0]} not known yet` : `${formatDistance(km)} to ${nearPlace.name.split(',')[0]}`}
                            </p>
                          );
                        })()}
                        {price.from !== null && (
                          <p className="mt-1.5 text-ink">
                            <span className="tabular font-semibold text-navy-900">{rupees(price.from)}</span>/mo
                            <span className="text-sm text-muted"> {price.food}</span>
                          </p>
                        )}
                        {price.deposit !== 'Deposit not listed' && <p className="text-sm text-muted">{price.deposit}</p>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <footer className="mt-auto border-t border-hairline bg-white">
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

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileFiltersOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="filters-title" className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[14px] bg-white p-5 shadow-[var(--shadow-float)] sm:rounded-[14px]">
            <div className="flex items-center justify-between">
              <h2 id="filters-title" className="text-xl font-semibold">Filters</h2>
              <button onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-2">{filterPanel}</div>
            <button onClick={() => setMobileFiltersOpen(false)} className="btn-primary mt-6 w-full">
              Show {filteredProperties.length} {filteredProperties.length === 1 ? 'PG' : 'PGs'}
            </button>
          </section>
        </div>
      )}

      {selectedProperty && facts && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeRequest(); }}
          onKeyDown={(event) => { if (event.key === 'Escape') closeRequest(); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="booking-title" className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[14px] bg-white shadow-[var(--shadow-float)] sm:rounded-[14px]">
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
              <div className="min-w-0">
                {step !== 'details' && (
                  <p className="text-sm text-muted">Step {stepIndex} of 3 · {stepTitle}</p>
                )}
                <h2 id="booking-title" className="truncate text-xl font-bold">{selectedProperty.name}</h2>
                {step === 'details' && <p className="text-sm text-muted">{selectedProperty.locality}, {selectedProperty.city}</p>}
                {step !== 'details' && (
                  <div className="mt-2 flex gap-1" aria-hidden="true">
                    {[1, 2, 3].map((n) => <span key={n} className={`h-1 w-10 rounded-full ${n <= stepIndex ? 'bg-navy-900' : 'bg-hairline'}`} />)}
                  </div>
                )}
              </div>
              <button onClick={closeRequest} aria-label="Close booking request" autoFocus className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface">
                <X className="h-5 w-5" />
              </button>
            </div>

            {step === 'details' ? (
              <>
                <div className="overflow-y-auto px-5 py-4">
                  {selectedProperty.photoUrls?.[0] && (
                    <SecureImage srcKey={selectedProperty.photoUrls[0]} alt={`Photo of ${selectedProperty.name}`} className="mb-4 aspect-[4/3] w-full rounded-[14px] object-cover" />
                  )}
                  <dl className="divide-y divide-hairline">
                    {[
                      ['For', GENDER_LABELS[selectedProperty.genderPolicy] || selectedProperty.genderPolicy],
                      ['Rent', facts.from === null ? 'Ask the owner' : facts.to !== null && facts.to !== facts.from ? `${rupees(facts.from)} – ${rupees(facts.to)} a month` : `${rupees(facts.from)} a month`],
                      ['Food', facts.food ?? 'Ask the owner'],
                      ['Deposit', facts.deposit === 'Deposit not listed' ? 'Not listed: ask the owner' : facts.deposit.replace('Deposit ', '')],
                      ['Beds', availabilityText(selectedProperty.availableBeds)],
                      ['Address', selectedProperty.address]
                    ].map(([term, value]) => (
                      <div key={term} className="flex justify-between gap-4 py-2.5">
                        <dt className="text-muted">{term}</dt>
                        <dd className="tabular text-right font-medium text-navy-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {selectedProperty.description && <p className="mt-4 max-w-prose text-ink">{selectedProperty.description}</p>}
                  {(() => {
                    const checked = [
                      [Boolean(selectedProperty.ownerVerified), "Owner's phone number verified"],
                      [selectedProperty.latitude != null && selectedProperty.longitude != null, 'Location pinned on the map'],
                      [(selectedProperty.photoUrls?.length ?? 0) > 0, `${selectedProperty.photoUrls?.length ?? 0} photo${(selectedProperty.photoUrls?.length ?? 0) === 1 ? '' : 's'} from the owner`],
                      [(selectedProperty.houseRules?.length ?? 0) > 0, 'House rules shared up front']
                    ].filter(([ok]) => ok).map(([, label]) => String(label));
                    return checked.length > 0 && (
                      <>
                        <h3 className="mt-5 font-sans text-base font-semibold">What we've checked</h3>
                        <ul className="mt-2 space-y-1">
                          {checked.map((label) => (
                            <li key={label} className="flex items-center gap-2 text-ink"><Check className="h-4 w-4 shrink-0 text-positive" aria-hidden="true" /><span>{label}</span></li>
                          ))}
                        </ul>
                      </>
                    );
                  })()}
                  {selectedProperty.amenities?.length > 0 && (
                    <>
                      <h3 className="mt-5 font-sans text-base font-semibold">What's here</h3>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {selectedProperty.amenities.map((amenity) => (
                          <li key={amenity} className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-sm"><Check className="h-3.5 w-3.5 text-positive" aria-hidden="true" />{amenity}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {selectedProperty.houseRules?.length > 0 && (
                    <>
                      <h3 className="mt-5 font-sans text-base font-semibold">House rules</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                        {selectedProperty.houseRules.map((rule) => <li key={rule}>{rule}</li>)}
                      </ul>
                    </>
                  )}
                  {selectedProperty.managerPhone && (
                    <a
                      href={`https://wa.me/${selectedProperty.managerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I'm interested in ${selectedProperty.name} in ${selectedProperty.locality}.`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary mt-5 w-full"
                    >
                      <MessageCircle className="h-4 w-4" /> Message the owner on WhatsApp
                    </a>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-hairline px-5 py-3">
                  <p className="text-ink">
                    {facts.from !== null ? <>From <span className="tabular font-semibold text-navy-900">{rupees(facts.from)}</span>/mo</> : 'Rent on request'}
                  </p>
                  <button onClick={() => setStep('bed')} disabled={!selectedProperty.availableBeds} className="btn-primary">
                    {selectedProperty.availableBeds ? 'Request a bed' : 'Fully occupied'}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={submitRequest} className="flex min-h-0 flex-1 flex-col">
                <div className="space-y-4 overflow-y-auto px-5 py-4">
                  {step === 'bed' && (
                    <>
                      <label className={labelClass}>
                        Available bed
                        <select required value={selectedBed} onChange={(event) => setSelectedBed(event.target.value)} className={fieldClass}>
                          <option value="">Choose a bed</option>
                          {bedChoices.map(({ room, bed, match }) => (
                            <option key={bed.id} value={bed.id}>
                              Room {room.roomNumber}, {bed.label} · {rupees(room.monthlyRent)}/mo{match ? (match.score !== null ? ` · ${match.score}% match` : ' · no roommates yet') : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      {vibeMatches && selectedBed && selectedMatch && (
                        <div className="rounded-[14px] border border-hairline bg-surface px-4 py-3" aria-live="polite">
                          {selectedMatch.score !== null ? (
                            <>
                              <p className="font-medium text-navy-900">
                                <span className="tabular">{selectedMatch.score}%</span> VibeCheck match with {selectedMatch.compared === 1 ? 'the resident' : `${selectedMatch.compared} residents`} of this room
                              </p>
                              <ul className="mt-1 space-y-0.5 text-sm text-ink">
                                {selectedMatch.reasons.map((reason) => <li key={reason} className="flex gap-1.5"><Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden="true" />{reason}</li>)}
                                {selectedMatch.differences.map((difference) => <li key={difference} className="text-muted">{difference}</li>)}
                              </ul>
                            </>
                          ) : (
                            <p className="text-ink">Nobody in this room has taken VibeCheck yet, so there's no one to compare with.</p>
                          )}
                        </div>
                      )}

                      {selectedProperty.serviceSettings?.vibeCheck === false ? null : !vibeOpen ? (
                        <div className="rounded-[14px] border border-hairline px-4 py-3">
                          <p className="font-medium text-navy-900">{vibeMatches ? 'Sorted by VibeCheck' : 'Find roommates like you'}</p>
                          <p className="mt-0.5 text-sm text-muted">
                            {vibeMatches ? 'Best match first.' : 'Match beds by sleep, tidiness and noise.'}
                          </p>
                          <button type="button" onClick={() => setVibeOpen(true)} className="btn-secondary mt-3">
                            {vibeMatches ? 'Change my answers' : 'Take VibeCheck'}
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-[14px] border border-navy-900/20 px-4 py-4">
                          <div><VibeProfileBuilder propertyId={selectedProperty.id} answers={vibeAnswers} summary={vibeSummary} onChange={(answers, summary) => { setVibeAnswers(answers); setVibeSummary(summary); }} /></div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" disabled={!vibeComplete || vibeLoading} onClick={() => void runVibeCheck()} className="btn-secondary">
                              {vibeLoading && <Loader2 className="h-4 w-4 animate-spin" />} See my matches
                            </button>
                            <button type="button" onClick={() => setVibeOpen(false)} className="min-h-11 px-3 font-medium text-muted hover:text-navy-900">Not now</button>
                          </div>
                        </div>
                      )}
                      <label className={labelClass}>
                        Move-in date
                        <input required type="date" min={new Date().toISOString().slice(0, 10)} value={request.moveInDate} onChange={(event) => setRequest({ ...request, moveInDate: event.target.value })} className={fieldClass} />
                      </label>
                    </>
                  )}
                  {step === 'you' && (
                    <>
                      <label className={labelClass}>
                        Full name
                        <input required autoComplete="name" value={request.residentName} onChange={(event) => setRequest({ ...request, residentName: event.target.value })} className={fieldClass} />
                      </label>
                      <label className={labelClass}>
                        Phone
                        <input
                          required
                          type="tel"
                          autoComplete="tel"
                          value={request.phone}
                          onChange={(event) => {
                            const nextPhone = event.target.value;
                            setRequest({ ...request, phone: nextPhone });
                            if (normalizePhoneDigits(nextPhone) !== (guest?.phone || '')) {
                              setPhoneToken('');
                              setOtpSent(false);
                            }
                          }}
                          aria-describedby="phone-hint"
                          className={fieldClass}
                        />
                      </label>
                      <p id="phone-hint" className="-mt-2 text-sm text-muted">We'll text you a code.</p>
                      <label className={labelClass}>
                        Email <span className="font-normal text-muted">(optional)</span>
                        <input type="email" autoComplete="email" value={request.email} onChange={(event) => setRequest({ ...request, email: event.target.value })} className={fieldClass} />
                      </label>
                      <label className={labelClass}>
                        Note for the owner <span className="font-normal text-muted">(optional)</span>
                        <textarea rows={2} value={request.notes} onChange={(event) => setRequest({ ...request, notes: event.target.value })} className={`${fieldClass} resize-y`} />
                      </label>
                    </>
                  )}
                  {step === 'verify' && (
                    <>
                      <dl className="rounded-[14px] border border-hairline bg-surface px-4 py-1">
                        {[
                          ['Bed', chosenBed ? `Room ${chosenBed.room.roomNumber}, ${chosenBed.bed.label}` : ''],
                          ['Move-in', request.moveInDate ? new Date(`${request.moveInDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''],
                          ['Rent', chosenBed ? `${rupees(chosenBed.room.monthlyRent)} a month` : ''],
                          ['Food', chosenBed ? ((chosenBed.room.foodCharge ?? 0) > 0 ? `${rupees(chosenBed.room.foodCharge!)} a month (optional)` : chosenBed.room.foodIncluded ? 'Included' : 'Not available') : ''],
                          ['Deposit', chosenBed && (chosenBed.room.depositAmount ?? 0) > 0 ? rupees(chosenBed.room.depositAmount!) : 'Not listed: ask the owner']
                        ].map(([term, value]) => (
                          <div key={term} className="flex justify-between gap-4 py-2">
                            <dt className="text-muted">{term}</dt>
                            <dd className="tabular text-right font-medium text-navy-900">{value}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="text-sm text-muted">The bed is held while the owner reviews. Cancel anytime.</p>
                      {phoneToken ? (
                        <p className="flex items-center gap-2 rounded-[10px] bg-positive-bg px-3 py-2.5 font-medium text-positive">
                          <Check className="h-4 w-4" aria-hidden="true" /> +{normalizePhoneDigits(request.phone)} is verified
                        </p>
                      ) : !otpSent ? (
                        <button type="button" disabled={otpLoading || otpCooldown > 0} onClick={() => void sendOtp()} className="btn-secondary w-full">
                          {otpLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                          {otpCooldown > 0 ? `Send again in ${otpCooldown}s` : `Send code to +${normalizePhoneDigits(request.phone)}`}
                        </button>
                      ) : (
                        <div className="flex items-end gap-2">
                          <label className={`${labelClass} flex-1`}>
                            Verification code
                            <input aria-label="6-digit verification code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${fieldClass} tabular tracking-[0.2em]`} />
                          </label>
                          <button type="button" disabled={otpLoading || !otpCode} onClick={() => void verifyOtp()} className="btn-secondary">
                            {otpLoading && <Loader2 className="h-4 w-4 animate-spin" />} Verify
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
                  <button type="button" onClick={() => setStep(step === 'bed' ? 'details' : step === 'you' ? 'bed' : 'you')} className="btn-secondary">Back</button>
                  {step === 'verify' ? (
                    <button type="submit" disabled={submitting || !phoneToken} className="btn-primary">
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Send request
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={(event) => {
                        const form = (event.currentTarget as HTMLButtonElement).form;
                        if (form && !form.reportValidity()) return;
                        setStep(step === 'bed' ? 'you' : 'verify');
                      }}
                    >
                      Next
                    </button>
                  )}
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      <AIChatPanel hideLauncher limited={!isOnboarded && !isStaff} openRequest={aiRequest} />
    </main>
  );
}
