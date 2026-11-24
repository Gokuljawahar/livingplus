import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  Heart,
  Lock,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  categorizeAmenities,
  CHENNAI_LANDMARKS,
  distanceKm,
  formatDistance,
  PROPERTY_TYPE_LABELS,
  type PropertyType
} from '@livingplus/shared';
import api from '../api/axios';
import { queryKeys } from '../api/query-keys';
import GuestSignInModal from '../components/GuestSignInModal';
import { SecureImage } from '../components/SecureImage';
import BrandLogo from '../components/ui/BrandLogo';
import PgPlaceholder from '../components/ui/PgPlaceholder';
import { useAuth } from '../context/auth';
import BookingModal from '../features/discovery/BookingModal';
import {
  availabilityText,
  computePriceFacts,
  GENDER_LABELS,
  ROOM_TYPE_LABELS,
  type PGProperty,
  type PGPropertyRoom
} from '../features/discovery/types';
import { ROUTES } from '../utils/app-areas';
import { getGuestSession, type GuestSession } from '../utils/guest-session';
import { rupees } from '../utils/money';
import { getSavedPgIds, toggleSavedPg } from '../utils/saved-pgs';

export default function PGDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [guest, setGuest] = useState<GuestSession | null>(() => getGuestSession());
  const guestPhone = guest?.phone || '';
  const [savedIds, setSavedIds] = useState<string[]>(() => (guest?.phone ? getSavedPgIds(guest.phone) : []));
  const [signInOpen, setSignInOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'contact' | null>(null);
  const [roomFilter, setRoomFilter] = useState<string>('ALL');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [bookingState, setBookingState] = useState<{ open: boolean; bedId: string; vibeOpen: boolean }>({
    open: false,
    bedId: '',
    vibeOpen: false
  });

  const {
    data: property,
    isPending: loading,
    isError
  } = useQuery({
    queryKey: queryKeys.propertyDetail(slug),
    queryFn: async (): Promise<PGProperty> => (await api.get(`/pg/properties/${encodeURIComponent(slug)}`)).data,
    enabled: Boolean(slug)
  });

  const allPhotos = useMemo(() => {
    if (!property) return [];
    const set = new Set<string>(property.photoUrls || []);
    for (const room of property.rooms || []) {
      for (const p of room.photoUrls || []) set.add(p);
    }
    return [...set];
  }, [property]);

  const nearbyDistances = useMemo(() => {
    if (!property || property.latitude == null || property.longitude == null) return [];
    return CHENNAI_LANDMARKS.map((place) => ({
      place,
      km: distanceKm({ latitude: property.latitude!, longitude: property.longitude! }, place)
    }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 4);
  }, [property]);

  const matchesAnyOpenRoom = (room: PGPropertyRoom) => room.availableBeds > 0;

  if (loading) {
    return (
      <main className="min-h-screen bg-surface">
        <header className="bg-navy-900 px-4 py-3 text-white sm:px-6">
          <div className="mx-auto max-w-7xl"><BrandLogo tone="dark" /></div>
        </header>
        <div className="mx-auto max-w-7xl animate-pulse space-y-6 px-4 py-8 sm:px-6">
          <div className="h-8 w-1/3 rounded bg-hairline" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="aspect-[16/10] rounded-[var(--radius-card)] bg-hairline md:col-span-2" />
            <div className="aspect-[4/3] rounded-[var(--radius-card)] bg-hairline" />
          </div>
        </div>
      </main>
    );
  }

  if (isError || !property) {
    return (
      <main className="flex min-h-screen flex-col bg-surface text-ink">
        <header className="bg-navy-900 px-4 py-3 text-white sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <Link to={ROUTES.guestHome}><BrandLogo tone="dark" /></Link>
            <Link to={ROUTES.listYourPg} className="text-sm font-semibold text-amber-500 hover:underline">List Your PG</Link>
          </div>
        </header>
        <div className="mx-auto my-auto max-w-md px-4 py-16 text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted" />
          <h1 className="mt-4 text-2xl font-bold text-navy-900">PG listing not found</h1>
          <p className="mt-2 text-sm text-muted">This PG may have been unpublished or moved. Explore all verified stays across Chennai.</p>
          <Link to={ROUTES.guestHome} className="btn-primary mt-6">Back to all PGs</Link>
        </div>
      </main>
    );
  }

  const facts = computePriceFacts(property, matchesAnyOpenRoom);
  const categorizedFacilities = categorizeAmenities(property.amenities || []);
  const roomTypesPresent = [...new Set(property.rooms.map((r) => r.roomType || 'SHARED'))];
  const visibleRooms =
    roomFilter === 'ALL' ? property.rooms : property.rooms.filter((r) => (r.roomType || 'SHARED') === roomFilter);
  const isSaved = savedIds.includes(property.id);
  const isSignedIn = Boolean(user || guestPhone);
  const propertyTypeLabel = PROPERTY_TYPE_LABELS[(property.propertyType || 'PG') as PropertyType] || 'Paying Guest (PG)';
  const totalBedsCount = property.totalBeds ?? property.rooms.reduce((sum, r) => sum + (r.totalBeds ?? r.beds.length), 0);

  const handleSaveClick = () => {
    if (!guestPhone) {
      setPendingAction('save');
      setSignInOpen(true);
      return;
    }
    const next = toggleSavedPg(guestPhone, property.id);
    setSavedIds(next);
    toast.success(next.includes(property.id) ? 'Saved to your shortlist' : 'Removed from saved PGs');
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: property.name, text: `${property.name} in ${property.locality}`, url: shareUrl });
        return;
      } catch {
        // Fallback to clipboard copy.
      }
    }
    await navigator.clipboard.writeText(shareUrl).catch(() => undefined);
    toast.success('PG link copied');
  };

  const openBooking = (bedId = '', vibeOpen = false) => {
    if (property.isOwnStay) {
      toast('You already stay at this PG. Use Room change in your Resident Portal.');
      return;
    }
    setBookingState({ open: true, bedId, vibeOpen });
  };

  const handleGuestVerified = async (session: GuestSession) => {
    setGuest(session);
    if (pendingAction === 'save') {
      const next = toggleSavedPg(session.phone, property.id);
      setSavedIds(next);
    } else {
      setSavedIds(getSavedPgIds(session.phone));
    }
    setPendingAction(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.propertyDetail(slug) });
  };

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="sticky top-0 z-40 bg-navy-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link to={ROUTES.guestHome} aria-label="Living Plus home">
              <BrandLogo tone="dark" />
            </Link>
            <Link
              to={ROUTES.guestHome}
              className="hidden items-center gap-1.5 rounded-[var(--radius-button)] bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" /> All PGs
            </Link>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              to={ROUTES.listYourPg}
              className="hidden rounded-[var(--radius-button)] bg-amber-500 px-3 py-1.5 font-bold text-navy-900 hover:bg-amber-600 sm:inline-flex"
            >
              List Your PG
            </Link>
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/20"
            >
              <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Share</span>
            </button>
            <button
              type="button"
              onClick={handleSaveClick}
              aria-pressed={isSaved}
              className={`inline-flex items-center gap-1.5 rounded-[var(--radius-button)] px-3 py-1.5 font-semibold transition-colors ${
                isSaved ? 'bg-amber-500 text-navy-900' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Heart className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-5 sm:px-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted sm:text-sm">
          <Link to={ROUTES.guestHome} className="font-medium hover:text-navy-900 hover:underline">Chennai PGs</Link>
          <span>/</span>
          <span>{property.locality}</span>
          <span>/</span>
          <span className="font-semibold text-navy-900">{property.name}</span>
        </nav>

        {/* Hero Photo Gallery */}
        <section aria-label="Property photos" className="relative overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-canvas">
          {allPhotos.length === 0 ? (
            <div className="aspect-[16/7] w-full"><PgPlaceholder name={property.name} /></div>
          ) : allPhotos.length === 1 ? (
            <button
              type="button"
              onClick={() => setLightboxIndex(0)}
              className="block aspect-[16/8] w-full overflow-hidden bg-closed-bg text-left"
            >
              <SecureImage srcKey={allPhotos[0]} alt={property.name} className="h-full w-full object-cover" />
            </button>
          ) : (
            <div className="grid gap-2 md:grid-cols-3 md:grid-rows-2 md:h-[380px]">
              <button
                type="button"
                onClick={() => setLightboxIndex(0)}
                className="relative overflow-hidden bg-closed-bg md:col-span-2 md:row-span-2"
              >
                <SecureImage
                  srcKey={allPhotos[0]}
                  alt={`${property.name} main view`}
                  className="aspect-[16/10] h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                />
              </button>
              {allPhotos.slice(1, 3).map((photo, idx) => (
                <button
                  key={photo}
                  type="button"
                  onClick={() => setLightboxIndex(idx + 1)}
                  className="relative hidden overflow-hidden bg-closed-bg md:block"
                >
                  <SecureImage
                    srcKey={photo}
                    alt={`${property.name} photo ${idx + 2}`}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                  />
                </button>
              ))}
            </div>
          )}

          {allPhotos.length > 0 && (
            <button
              type="button"
              onClick={() => setLightboxIndex(0)}
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-navy-900/90 px-3.5 py-2 text-xs font-semibold text-white shadow-[var(--shadow-float)] hover:bg-navy-900"
            >
              <Camera className="h-4 w-4" /> View all {allPhotos.length} {allPhotos.length === 1 ? 'photo' : 'photos'}
            </button>
          )}
        </section>

        {/* Main 2-column Detail Body */}
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_380px] lg:items-start">
          {/* Left Detailed Showcase */}
          <div className="space-y-8">
            {/* Title, Badges & Key Facts */}
            <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-info-bg px-3 py-1 text-xs font-bold text-navy-900">
                  {propertyTypeLabel}
                </span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-navy-900">
                  For {GENDER_LABELS[property.genderPolicy] || property.genderPolicy}
                </span>
                {property.ownerVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-positive-bg px-3 py-1 text-xs font-bold text-positive">
                    <Check className="h-3.5 w-3.5" /> Verified Owner
                  </span>
                )}
                {property.onboardedByAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-semibold text-navy-900">
                    <ShieldCheck className="h-3.5 w-3.5 text-amber-600" /> Inspected & Listed by Living Plus
                  </span>
                )}
              </div>

              <h1 className="mt-3 font-display text-2xl font-bold text-navy-900 sm:text-3xl">{property.name}</h1>
              {property.tagline && <p className="mt-1.5 text-base font-medium text-ink">{property.tagline}</p>}

              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <MapPin className="h-4 w-4 shrink-0 text-navy-700" />
                <span>
                  {property.address}, {property.locality}, {property.city}
                  {property.pincode ? ` – ${property.pincode}` : ''}
                </span>
                {property.landmark && <span className="text-ink">· {property.landmark}</span>}
              </p>

              {/* Key Facts Strip */}
              <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-hairline pt-5 sm:grid-cols-4">
                <div className="rounded-[var(--radius-field)] bg-surface p-3">
                  <dt className="text-xs font-medium text-muted">Monthly Rent</dt>
                  <dd className="tabular mt-1 text-base font-bold text-navy-900">
                    {facts.from === null
                      ? 'On request'
                      : facts.to !== null && facts.to !== facts.from
                      ? `${rupees(facts.from)} – ${rupees(facts.to)}`
                      : rupees(facts.from)}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-field)] bg-surface p-3">
                  <dt className="text-xs font-medium text-muted">Security Deposit</dt>
                  <dd className="tabular mt-1 text-base font-bold text-navy-900">
                    {facts.deposit === 'Deposit not listed' ? 'Ask owner' : facts.deposit.replace('Deposit ', '')}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-field)] bg-surface p-3">
                  <dt className="text-xs font-medium text-muted">Food</dt>
                  <dd className="mt-1 text-base font-bold text-navy-900">{facts.food || 'Ask owner'}</dd>
                </div>
                <div className="rounded-[var(--radius-field)] bg-surface p-3">
                  <dt className="text-xs font-medium text-muted">Live Beds</dt>
                  <dd className={`tabular mt-1 text-base font-bold ${property.availableBeds > 0 ? 'text-positive' : 'text-muted'}`}>
                    {property.availableBeds} / {totalBedsCount} free
                  </dd>
                </div>
              </dl>
            </section>

            {/* Overview & Highlights */}
            {(property.description || (property.highlights && property.highlights.length > 0)) && (
              <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
                <h2 className="text-xl font-bold text-navy-900">About this property</h2>
                {property.description && <p className="mt-2 leading-relaxed text-ink">{property.description}</p>}
                {property.highlights && property.highlights.length > 0 && (
                  <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                    {property.highlights.map((highlight) => (
                      <div key={highlight} className="flex items-start gap-2 rounded-[var(--radius-field)] bg-surface p-3 text-sm font-medium text-navy-900">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                        <span>{highlight}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Rooms & Sharing Options */}
            <section id="rooms" className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-navy-900">Rooms & sharing options</h2>
                  <p className="text-sm text-muted">Pick a room type to check rent, deposit, room amenities, and open beds.</p>
                </div>
                {roomTypesPresent.length > 1 && (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter rooms by sharing type">
                    <button
                      type="button"
                      onClick={() => setRoomFilter('ALL')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        roomFilter === 'ALL' ? 'bg-navy-900 text-white' : 'bg-surface text-ink hover:bg-hairline'
                      }`}
                    >
                      All ({property.rooms.length})
                    </button>
                    {roomTypesPresent.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setRoomFilter(type)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          roomFilter === type ? 'bg-navy-900 text-white' : 'bg-surface text-ink hover:bg-hairline'
                        }`}
                      >
                        {ROOM_TYPE_LABELS[type] || type}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-4">
                {visibleRooms.map((room) => {
                  const firstBed = room.beds[0];
                  const roomTotalBeds = room.totalBeds ?? room.beds.length;
                  return (
                    <article
                      key={room.id}
                      className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-hairline bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-1 gap-4">
                        {room.photoUrls?.[0] ? (
                          <SecureImage
                            srcKey={room.photoUrls[0]}
                            alt={`Room ${room.roomNumber}`}
                            className="hidden h-24 w-32 shrink-0 rounded-[var(--radius-field)] object-cover sm:block"
                          />
                        ) : (
                          <div className="hidden h-24 w-32 shrink-0 items-center justify-center rounded-[var(--radius-field)] bg-canvas text-navy-700 sm:flex">
                            <BedDouble className="h-8 w-8" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-navy-900">
                              Room {room.roomNumber} · {ROOM_TYPE_LABELS[room.roomType || 'SHARED'] || room.roomType}
                            </h3>
                            {room.hasAc && (
                              <span className="rounded-full bg-info-bg px-2.5 py-0.5 text-xs font-semibold text-navy-900">AC</span>
                            )}
                            {room.foodIncluded ? (
                              <span className="rounded-full bg-positive-bg px-2.5 py-0.5 text-xs font-semibold text-positive">Meals included</span>
                            ) : (room.foodCharge ?? 0) > 0 ? (
                              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-navy-900">
                                +{rupees(room.foodCharge!)}/mo food
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {[
                              room.block ? `${room.block}` : null,
                              room.floor != null ? `Floor ${room.floor}` : null,
                              `${room.availableBeds} of ${roomTotalBeds} beds available`
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          {room.description && <p className="mt-1.5 text-sm text-ink">{room.description}</p>}
                          {room.amenities && room.amenities.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {room.amenities.map((item) => (
                                <span key={item} className="rounded-full border border-hairline bg-canvas px-2.5 py-0.5 text-xs text-ink">
                                  {item}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-t border-hairline pt-3 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                        <div className="sm:text-right">
                          <p className="tabular text-xl font-bold text-navy-900">
                            {rupees(room.monthlyRent)}<span className="text-xs font-normal text-muted">/mo</span>
                          </p>
                          <p className="text-xs text-muted">
                            Deposit: {(room.depositAmount ?? 0) > 0 ? rupees(room.depositAmount!) : 'Ask owner'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!firstBed || property.isOwnStay}
                          onClick={() => openBooking(firstBed?.id || '', false)}
                          className="btn-primary px-4 py-2 text-sm"
                        >
                          {firstBed ? 'Book this room' : 'Full'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* VibeCheck Roommate Matching Callout */}
            {property.serviceSettings?.vibeCheck !== false && property.availableBeds > 0 && (
              <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-navy-900/15 bg-amber-50/70 p-5 sm:p-6">
                <div className="max-w-xl">
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
                    <Sparkles className="h-4 w-4" /> Roommate Compatibility
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-navy-900">Not sure which room suits your routine?</h2>
                  <p className="mt-1 text-sm text-ink">
                    Take the 60-second VibeCheck to match beds by sleep timings, cleanliness, and noise preference — zero private details shared.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openBooking('', true)}
                  className="btn-secondary shrink-0 border-navy-900"
                >
                  Take VibeCheck
                </button>
              </section>
            )}

            {/* Categorized Facilities & Amenities */}
            {categorizedFacilities.length > 0 && (
              <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
                <h2 className="text-xl font-bold text-navy-900">All facilities & amenities</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {categorizedFacilities.map((group) => (
                    <div key={group.category} className="rounded-[var(--radius-field)] border border-hairline bg-surface p-4">
                      <h3 className="text-sm font-bold text-navy-900">{group.category}</h3>
                      <ul className="mt-2.5 space-y-1.5">
                        {group.items.map((item) => (
                          <li key={item} className="flex items-center gap-2 text-sm text-ink">
                            <Check className="h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Food & Dining + House Rules */}
            {(property.foodDetails || (property.houseRules && property.houseRules.length > 0)) && (
              <div className="grid gap-6 md:grid-cols-2">
                {property.foodDetails && (
                  <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
                    <h2 className="flex items-center gap-2 text-lg font-bold text-navy-900">
                      <UtensilsCrossed className="h-5 w-5 text-amber-600" /> Food & dining
                    </h2>
                    <p className="mt-2.5 text-sm leading-relaxed text-ink">{property.foodDetails}</p>
                  </section>
                )}
                {property.houseRules && property.houseRules.length > 0 && (
                  <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
                    <h2 className="text-lg font-bold text-navy-900">House rules</h2>
                    <ul className="mt-2.5 space-y-2 text-sm text-ink">
                      {property.houseRules.map((rule) => (
                        <li key={rule} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-navy-900" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {/* Location & Nearby Landmarks */}
            <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-bold text-navy-900">
                    <Compass className="h-5 w-5 text-navy-700" /> Location & nearby places
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {property.address}, {property.locality}, {property.city}
                  </p>
                </div>
                {property.latitude != null && property.longitude != null && (
                  <a
                    href={`https://maps.google.com/?q=${property.latitude},${property.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary text-sm"
                  >
                    Open in Google Maps <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {property.nearbyPlaces && property.nearbyPlaces.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Transit & neighborhood</h3>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink">
                      {property.nearbyPlaces.map((place) => (
                        <li key={place} className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-navy-700" />
                          <span>{place}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {nearbyDistances.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Distances to campuses & IT parks</h3>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink">
                      {nearbyDistances.map(({ place, km }) => (
                        <li key={place.id} className="flex items-center justify-between gap-3">
                          <span className="truncate">{place.name}</span>
                          <span className="tabular shrink-0 font-semibold text-navy-900">{formatDistance(km)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right Sticky Booking & Owner Contact Card */}
          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 shadow-[var(--shadow-float)]">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm text-muted">Starting rent</p>
                <span className={`text-xs font-bold ${property.availableBeds > 0 ? 'text-positive' : 'text-muted'}`}>
                  {availabilityText(property.availableBeds)}
                </span>
              </div>
              <p className="mt-1">
                {facts.from !== null ? (
                  <>
                    <span className="tabular text-3xl font-bold text-navy-900">{rupees(facts.from)}</span>
                    <span className="text-sm text-muted">/month</span>
                  </>
                ) : (
                  <span className="text-xl font-bold text-navy-900">Rent on request</span>
                )}
              </p>

              <dl className="mt-4 divide-y divide-hairline border-y border-hairline text-sm">
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Deposit</dt>
                  <dd className="tabular font-semibold text-navy-900">
                    {facts.deposit === 'Deposit not listed' ? 'Ask owner' : facts.deposit.replace('Deposit ', '')}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Food</dt>
                  <dd className="font-semibold text-navy-900">{facts.food || 'Ask owner'}</dd>
                </div>
                <div className="flex justify-between py-2.5">
                  <dt className="text-muted">Gender policy</dt>
                  <dd className="font-semibold text-navy-900">{GENDER_LABELS[property.genderPolicy] || property.genderPolicy}</dd>
                </div>
              </dl>

              {property.isOwnStay ? (
                <p className="mt-4 rounded-[var(--radius-field)] bg-amber-50 p-3 text-sm font-medium text-navy-900">
                  You already have an active stay here. Use Room change in your Resident Portal to switch rooms.
                </p>
              ) : (
                <button
                  type="button"
                  disabled={!property.availableBeds}
                  onClick={() => openBooking('', false)}
                  className="btn-primary mt-5 w-full text-base"
                >
                  {property.availableBeds ? 'Request a bed' : 'Fully occupied'}
                </button>
              )}

              {/* Gated Owner Contact Box */}
              <div className="mt-4 rounded-[var(--radius-field)] border border-hairline bg-surface p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted">Property Owner Contact</p>
                  {property.ownerVerified && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-positive">
                      <Check className="h-3.5 w-3.5" /> Verified
                    </span>
                  )}
                </div>
                {property.ownerName && <p className="mt-1 text-sm font-bold text-navy-900">{property.ownerName}</p>}

                {isSignedIn ? (
                  property.managerPhone ? (
                    <div className="mt-3 space-y-2">
                      <p className="tabular flex items-center gap-2 text-sm font-bold text-navy-900">
                        <Phone className="h-4 w-4 text-positive" /> +{property.managerPhone}
                      </p>
                      <a
                        href={`https://wa.me/${property.managerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I'm interested in ${property.name} in ${property.locality} on Living Plus.`)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary w-full text-sm"
                      >
                        <MessageCircle className="h-4 w-4" /> WhatsApp Owner
                      </a>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted">Owner phone is not listed; submit a bed request above and we’ll connect you.</p>
                  )
                ) : (
                  <div className="mt-2.5 space-y-2.5">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                      <Lock className="h-4 w-4 text-muted" />
                      {property.hasContactPhone ? '+91 98•••• ••••' : 'Verify to request & connect'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingAction('contact');
                        setSignInOpen(true);
                      }}
                      className="btn-secondary w-full text-sm"
                    >
                      Verify phone to view contact
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-4 text-xs text-muted">
              <p className="font-bold text-navy-900">What Living Plus checks</p>
              <ul className="mt-2 space-y-1.5 text-ink">
                {property.ownerVerified && (
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-positive" /> Owner phone verified via OTP</li>
                )}
                {property.onboardedByAdmin && (
                  <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-positive" /> Photos & rooms verified by onboarding ops</li>
                )}
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-positive" /> Live bed availability synced in real time</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-positive" /> Zero brokerage fees</li>
              </ul>
            </div>
          </aside>
        </div>
      </main>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && allPhotos[lightboxIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Property photo gallery"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy-900/95 p-4 text-white"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setLightboxIndex(null);
            if (e.key === 'ArrowRight') setLightboxIndex((i) => (i === null ? 0 : (i + 1) % allPhotos.length));
            if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i === null ? 0 : (i - 1 + allPhotos.length) % allPhotos.length));
          }}
        >
          <div className="flex w-full max-w-5xl items-center justify-between pb-3">
            <p className="text-sm font-semibold">
              {property.name} · Photo {lightboxIndex + 1} of {allPhotos.length}
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => setLightboxIndex(null)}
              aria-label="Close gallery"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative flex w-full max-w-5xl flex-1 items-center justify-center">
            {allPhotos.length > 1 && (
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => setLightboxIndex((lightboxIndex - 1 + allPhotos.length) % allPhotos.length)}
                className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-navy-900/70 hover:bg-navy-900"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            <SecureImage
              srcKey={allPhotos[lightboxIndex]}
              alt={`${property.name} gallery ${lightboxIndex + 1}`}
              className="max-h-[75vh] w-auto max-w-full rounded-[var(--radius-card)] object-contain"
            />
            {allPhotos.length > 1 && (
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => setLightboxIndex((lightboxIndex + 1) % allPhotos.length)}
                className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-navy-900/70 hover:bg-navy-900"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
          {allPhotos.length > 1 && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {allPhotos.map((key, idx) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className={`h-14 w-20 shrink-0 overflow-hidden rounded-[var(--radius-field)] border-2 ${
                    idx === lightboxIndex ? 'border-amber-500' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <SecureImage srcKey={key} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {bookingState.open && (
        <BookingModal
          key={`${property.id}-${bookingState.bedId}-${bookingState.vibeOpen}`}
          property={property}
          matchesRoom={matchesAnyOpenRoom}
          guest={guest}
          defaultName={user?.name || ''}
          onGuestChange={setGuest}
          initialStep="bed"
          initialBedId={bookingState.bedId}
          initialVibeOpen={bookingState.vibeOpen}
          onClose={() => setBookingState({ open: false, bedId: '', vibeOpen: false })}
          onSubmitted={async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.properties() });
            await queryClient.invalidateQueries({ queryKey: queryKeys.propertyDetail(slug) });
            setBookingState({ open: false, bedId: '', vibeOpen: false });
            if (getGuestSession()) navigate(ROUTES.guestRequests);
          }}
        />
      )}

      <GuestSignInModal
        open={signInOpen}
        onClose={() => {
          setSignInOpen(false);
          setPendingAction(null);
        }}
        onVerified={(session) => void handleGuestVerified(session)}
      />
    </div>
  );
}
