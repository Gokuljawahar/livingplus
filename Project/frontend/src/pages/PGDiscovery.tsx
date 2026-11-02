import { useEffect, useState } from 'react';
import { BedDouble, Building2, CalendarDays, CheckCircle2, IndianRupee, Loader2, MapPin, MessageCircle, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { SecureImage } from '../components/SecureImage';
import AIChatPanel from '../components/AIChatPanel';

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
  rooms: { id: string; roomNumber: string; roomType?: string; hasAc?: boolean; foodIncluded?: boolean; monthlyRent: number; availableBeds: number; beds: { id: string; label: string }[] }[];
}

export default function PGDiscovery() {
  const [properties, setProperties] = useState<PGProperty[]>([]);
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [maxRent, setMaxRent] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('');
  const [acFilter, setAcFilter] = useState('');
  const [foodFilter, setFoodFilter] = useState('');
  const [amenityFilter, setAmenityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState<PGProperty | null>(null);
  const [selectedBed, setSelectedBed] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [phoneToken, setPhoneToken] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [request, setRequest] = useState({ residentName: '', phone: '', email: '', moveInDate: '', notes: '' });
  const [trackDialog, setTrackDialog] = useState(false);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackForm, setTrackForm] = useState({ bookingRef: '', phone: '' });
  const [trackedBooking, setTrackedBooking] = useState<any>(null);

  useEffect(() => {
    const loadProperties = async () => {
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
  }, []);

  const matchesRoom = (room: PGProperty['rooms'][number]) => {
    if (!room.availableBeds) return false;
    if (roomTypeFilter && room.roomType !== roomTypeFilter) return false;
    if (acFilter === 'AC' && !room.hasAc) return false;
    if (acFilter === 'NON_AC' && room.hasAc) return false;
    if (foodFilter === 'INCLUDED' && !room.foodIncluded) return false;
    if (foodFilter === 'NOT_INCLUDED' && room.foodIncluded) return false;
    return true;
  };

  const amenityOptions = [...new Set(properties.flatMap((property) => property.amenities || []))].sort();

  const filteredProperties = properties.filter((property) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || `${property.name} ${property.locality} ${property.city} ${property.address}`.toLowerCase().includes(query);
    const matchesGender = !genderFilter || property.genderPolicy === 'ANY' || property.genderPolicy === genderFilter;
    const matchingRooms = property.rooms.filter(matchesRoom);
    const startingRent = matchingRooms.reduce((lowest, room) => Math.min(lowest, room.monthlyRent), Number.POSITIVE_INFINITY);
    const matchesBudget = !maxRent || startingRent <= Number(maxRent);
    const matchesAmenity = !amenityFilter || (property.amenities || []).includes(amenityFilter);
    return matchesQuery && matchesGender && matchesBudget && matchesAmenity && matchingRooms.length > 0;
  });

  const closeRequest = () => {
    setSelectedProperty(null);
    setSelectedBed('');
    setRequest({ residentName: '', phone: '', email: '', moveInDate: '', notes: '' });
    setOtpSent(false); setOtpCode(''); setPhoneToken('');
  };

  const sendOtp = async () => {
    if (!request.phone.trim()) { toast.error('Enter your phone number first'); return; }
    setOtpLoading(true);
    try {
      const response = await api.post('/auth/otp-request', { phone: request.phone, purpose: 'BOOKING' });
      if (response.data.devCode) toast.success(`Demo code: ${response.data.devCode}`);
      else toast.success('Verification code sent');
      setOtpSent(true);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not send code');
    } finally {
      setOtpLoading(false);
    }
  };

  const verifyOtp = async () => {
    setOtpLoading(true);
    try {
      const response = await api.post('/auth/otp-verify', { phone: request.phone, code: otpCode, purpose: 'BOOKING' });
      setPhoneToken(response.data.phoneToken);
      toast.success('Phone verified');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invalid code');
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
        phoneToken
      });
      const selectedRoom = selectedProperty.rooms.find((room) => room.beds.some((bed) => bed.id === selectedBed));
      const selectedBedDetails = selectedRoom?.beds.find((bed) => bed.id === selectedBed);
      setTrackForm({ bookingRef: response.data.bookingRef, phone: request.phone });
      setTrackedBooking({
        ...response.data,
        phone: request.phone,
        moveInDate: request.moveInDate,
        property: { name: selectedProperty.name },
        room: selectedRoom ? { roomNumber: selectedRoom.roomNumber } : null,
        bedLabel: selectedBedDetails?.label || null
      });
      setTrackDialog(true);
      toast.success(response.data.message || 'Booking request submitted');
      const listings = await api.get('/pg/properties');
      setProperties(listings.data);
      closeRequest();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not submit booking request');
    } finally {
      setSubmitting(false);
    }
  };

  const trackBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTrackLoading(true);
    try {
      const response = await api.get(`/pg/bookings/${encodeURIComponent(trackForm.bookingRef)}/status`, { params: { phone: trackForm.phone } });
      setTrackedBooking({ ...response.data, phone: trackForm.phone });
    } catch (error: any) {
      setTrackedBooking(null);
      toast.error(error.response?.data?.message || 'Could not find that booking');
    } finally {
      setTrackLoading(false);
    }
  };

  const cancelBooking = async () => {
    if (!trackedBooking?.bookingRef) return;
    try {
      await api.post(`/pg/bookings/${encodeURIComponent(trackedBooking.bookingRef)}/cancel`, { phone: trackForm.phone });
      setTrackedBooking({ ...trackedBooking, status: 'CANCELLED' });
      toast.success('Booking request cancelled');
      const listings = await api.get('/pg/properties');
      setProperties(listings.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not cancel booking');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="/" className="flex items-center gap-2 font-semibold text-[#02224B]">
            <Building2 className="h-5 w-5" /> PG OS
          </a>
          <div className="flex items-center gap-4">
            <button onClick={() => setTrackDialog(true)} className="text-sm font-semibold text-slate-600 hover:text-[#02224B]">Track booking</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-10">
        <div className="flex flex-col gap-6 border-b border-slate-200 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Chennai stays</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#02224B]">Find your next stay</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-600">Browse available rooms and send a booking request directly to the property owner.</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-[minmax(220px,1fr)_150px_160px] md:max-w-2xl">
            <label className="flex items-center gap-3 border-b-2 border-slate-300 px-1 py-3 focus-within:border-[#02224B]">
              <Search className="h-5 w-5 shrink-0 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search locality or property" />
            </label>
            <select aria-label="Filter by resident policy" value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)} className="border-b-2 border-slate-300 bg-transparent px-2 py-3 text-sm focus:border-[#02224B]">
              <option value="">All resident policies</option><option value="WOMEN">Women</option><option value="MEN">Men</option><option value="ANY">Co-living</option>
            </select>
            <input aria-label="Maximum monthly rent" type="number" min="1" value={maxRent} onChange={(event) => setMaxRent(event.target.value)} className="border-b-2 border-slate-300 bg-transparent px-2 py-3 text-sm focus:border-[#02224B]" placeholder="Max rent / month" />
            <select aria-label="Filter by room type" value={roomTypeFilter} onChange={(event) => setRoomTypeFilter(event.target.value)} className="border-b-2 border-slate-300 bg-transparent px-2 py-3 text-sm focus:border-[#02224B]">
              <option value="">Any room type</option><option value="PRIVATE">Private</option><option value="DOUBLE">2 sharing</option><option value="TRIPLE">3 sharing</option><option value="SHARED">Shared dorm</option>
            </select>
            <select aria-label="Filter by air conditioning" value={acFilter} onChange={(event) => setAcFilter(event.target.value)} className="border-b-2 border-slate-300 bg-transparent px-2 py-3 text-sm focus:border-[#02224B]">
              <option value="">AC / Non-AC</option><option value="AC">AC only</option><option value="NON_AC">Non-AC only</option>
            </select>
            <select aria-label="Filter by food" value={foodFilter} onChange={(event) => setFoodFilter(event.target.value)} className="border-b-2 border-slate-300 bg-transparent px-2 py-3 text-sm focus:border-[#02224B]">
              <option value="">Food: any</option><option value="INCLUDED">Food included</option><option value="NOT_INCLUDED">Food not included</option>
            </select>
            <select aria-label="Filter by amenity" value={amenityFilter} onChange={(event) => setAmenityFilter(event.target.value)} className="border-b-2 border-slate-300 bg-transparent px-2 py-3 text-sm focus:border-[#02224B]">
              <option value="">Any amenity</option>{amenityOptions.map((amenity) => <option key={amenity} value={amenity}>{amenity}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-[#02224B]" /></div>
        ) : filteredProperties.length === 0 ? (
          <div className="py-20 text-center">
            <Building2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No available properties found</p>
            <p className="mt-1 text-sm text-slate-500">Try another search or check back later.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredProperties.map((property) => {
              const startingRent = property.rooms.filter(matchesRoom).reduce((lowest, room) => Math.min(lowest, room.monthlyRent), Number.POSITIVE_INFINITY);
              return (
                <article key={property.id} className="grid gap-5 py-7 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-center">
                  <div className="aspect-[4/3] overflow-hidden bg-slate-200">
                    {property.photoUrls?.[0] ? <SecureImage srcKey={property.photoUrls[0]} alt={property.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Building2 className="h-9 w-9 text-slate-400" /></div>}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold text-[#02224B]">{property.name}</h2>
                      <span className="border border-slate-200 px-2 py-1 text-[11px] font-semibold uppercase text-slate-500">{property.genderPolicy === 'ANY' ? 'All residents' : property.genderPolicy}</span>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" />{property.locality}, {property.city}</p>
                    <p className="mt-1 text-sm text-slate-500">{property.address}</p>
                    {property.description && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{property.description}</p>}
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1.5"><BedDouble className="h-4 w-4" />{property.availableBeds} beds available</span>
                      {property.amenities?.length > 0 && <span>{property.amenities.join(' · ')}</span>}
                      {property.managerPhone && <a href={`https://wa.me/${property.managerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I am interested in ${property.name} in ${property.locality}.`)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-emerald-700"><MessageCircle className="h-4 w-4" />WhatsApp inquiry</a>}
                    </div>
                    {property.photoUrls?.length > 1 && <div className="mt-3 flex gap-2 overflow-x-auto">{property.photoUrls.slice(1).map((photo) => <SecureImage key={photo} srcKey={photo} alt={property.name} className="h-12 w-16 shrink-0 object-cover" />)}</div>}
                    {property.houseRules?.length > 0 && <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer font-semibold text-[#02224B]">House rules</summary><ul className="mt-2 list-inside list-disc space-y-1">{property.houseRules.map((rule) => <li key={rule}>{rule}</li>)}</ul></details>}
                  </div>
                  <div className="flex items-center justify-between gap-5 border-t border-slate-100 pt-4 md:min-w-56 md:flex-col md:items-end md:border-0 md:pt-0">
                    <p className="text-right text-sm text-slate-500">Monthly from <span className="block text-xl font-bold text-slate-900"><IndianRupee className="mr-0.5 inline h-4 w-4" />{Number.isFinite(startingRent) ? startingRent.toLocaleString('en-IN') : '—'}</span></p>
                    <button onClick={() => setSelectedProperty(property)} disabled={!property.availableBeds} className="bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0A3B75] disabled:cursor-not-allowed disabled:opacity-50">Request a bed</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selectedProperty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRequest(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="booking-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase text-amber-700">Booking request</p><h2 id="booking-title" className="mt-1 text-xl font-bold text-[#02224B]">{selectedProperty.name}</h2></div>
              <button onClick={closeRequest} aria-label="Close booking request" className="p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submitRequest} className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-700">Available bed
                <select required value={selectedBed} onChange={(event) => setSelectedBed(event.target.value)} className="mt-1.5 w-full border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">Choose a bed</option>
                  {selectedProperty.rooms.filter(matchesRoom).flatMap((room) => room.beds.map((bed) => <option key={bed.id} value={bed.id}>Room {room.roomNumber} · {bed.label} · ₹{room.monthlyRent.toLocaleString('en-IN')}/month</option>))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Full name<input required value={request.residentName} onChange={(event) => setRequest({ ...request, residentName: event.target.value })} className="mt-1.5 w-full border border-slate-300 px-3 py-2.5" /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">Phone<input required type="tel" value={request.phone} onChange={(event) => setRequest({ ...request, phone: event.target.value })} className="mt-1.5 w-full border border-slate-300 px-3 py-2.5" /></label>
                <label className="block text-sm font-medium text-slate-700">Move-in date<input required type="date" min={new Date().toISOString().slice(0, 10)} value={request.moveInDate} onChange={(event) => setRequest({ ...request, moveInDate: event.target.value })} className="mt-1.5 w-full border border-slate-300 px-3 py-2.5" /></label>
              </div>
              <label className="block text-sm font-medium text-slate-700">Email <span className="font-normal text-slate-400">(optional)</span><input type="email" value={request.email} onChange={(event) => setRequest({ ...request, email: event.target.value })} className="mt-1.5 w-full border border-slate-300 px-3 py-2.5" /></label>
              <label className="block text-sm font-medium text-slate-700">Note <span className="font-normal text-slate-400">(optional)</span><textarea rows={2} value={request.notes} onChange={(event) => setRequest({ ...request, notes: event.target.value })} className="mt-1.5 w-full resize-y border border-slate-300 px-3 py-2.5" /></label>
              <div className="border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">Phone verification {phoneToken ? <span className="font-semibold text-emerald-700">· verified</span> : null}</p>
                {!phoneToken && (
                  <div className="mt-2 flex flex-col gap-2">
                    {!otpSent
                      ? <button type="button" disabled={otpLoading} onClick={() => void sendOtp()} className="border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Send verification code</button>
                      : <div className="flex gap-2"><input aria-label="6-digit verification code" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="6-digit code" inputMode="numeric" className="w-full border border-slate-300 bg-white px-3 py-2 text-sm" /><button type="button" disabled={otpLoading || !otpCode} onClick={() => void verifyOtp()} className="shrink-0 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Verify</button></div>}
                  </div>
                )}
              </div>
              <button disabled={submitting || !phoneToken} className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-3 font-semibold text-white hover:bg-[#0A3B75] disabled:opacity-60">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}Send request</button>
            </form>
          </section>
        </div>
      )}

      <AIChatPanel />

      {trackDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setTrackDialog(false); setTrackedBooking(null); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="track-title" className="w-full max-w-md bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase text-amber-700">Guest self-service</p><h2 id="track-title" className="mt-1 text-xl font-bold text-[#02224B]">Track a booking</h2></div><button onClick={() => { setTrackDialog(false); setTrackedBooking(null); }} aria-label="Close booking tracker" className="p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <form onSubmit={trackBooking} className="mt-5 space-y-3">
              <input required value={trackForm.bookingRef} onChange={(event) => setTrackForm({ ...trackForm, bookingRef: event.target.value })} placeholder="Booking reference" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <input required type="tel" value={trackForm.phone} onChange={(event) => setTrackForm({ ...trackForm, phone: event.target.value })} placeholder="Phone used for request" className="w-full border border-slate-300 px-3 py-2.5 text-sm" />
              <button disabled={trackLoading} className="flex w-full items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{trackLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Check status</button>
            </form>
            {trackedBooking && <div className="mt-5 border-t border-slate-200 pt-4"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><p className="font-semibold text-slate-900">{trackedBooking.status.replace('_', ' ')}</p></div>{trackedBooking.rejectionReason && <p className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Reason: {trackedBooking.rejectionReason}</p>}<p className="mt-2 text-sm text-slate-600">{trackedBooking.property?.name} · {trackedBooking.room ? `Room ${trackedBooking.room.roomNumber}, ${trackedBooking.bedLabel}` : 'Bed pending assignment'}</p><p className="mt-1 text-xs text-slate-500">Reference {trackedBooking.bookingRef} · Move-in {trackedBooking.moveInDate && !Number.isNaN(new Date(trackedBooking.moveInDate).getTime()) ? new Date(trackedBooking.moveInDate).toLocaleDateString() : 'Not set'}</p>{trackedBooking.status === 'PENDING' && <button onClick={() => void cancelBooking()} className="mt-4 border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Cancel request</button>}</div>}
          </section>
        </div>
      )}
    </main>
  );
}