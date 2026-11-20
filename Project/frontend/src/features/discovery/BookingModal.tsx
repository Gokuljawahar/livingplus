import { useRef, useState } from 'react';
import { Check, Loader2, MessageCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { VibeAnswers, VibeMatch } from '@livingplus/shared';
import api from '../../api/axios';
import { SecureImage } from '../../components/SecureImage';
import VibeProfileBuilder from '../../components/VibeProfileBuilder';
import { useOtpCooldown } from '../../hooks/useOtpCooldown';
import { apiErrorMessage, apiErrorStatus } from '../../utils/api-error';
import {
  getGuestSession,
  normalizePhoneDigits,
  saveGuestSession,
  updateGuestToken,
  type GuestSession
} from '../../utils/guest-session';
import { rupees } from '../../utils/money';
import { phoneOtpErrorMessage, startPhoneVerification, type PhoneChallenge } from '../../utils/phone-otp';
import { hasKeyHabits, loadVibeAnswers, loadVibeSummary, saveVibeAnswers, saveVibeSummary } from '../../utils/vibe-storage';
import { availabilityText, computePriceFacts, GENDER_LABELS, type PGProperty } from './types';

interface Props {
  property: PGProperty;
  matchesRoom: (room: PGProperty['rooms'][number]) => boolean;
  guest: GuestSession | null;
  defaultName: string;
  onGuestChange: (session: GuestSession | null) => void;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}

const fieldClass = 'mt-1.5 block w-full rounded-[var(--radius-input)] border border-field-border bg-canvas px-3 py-2.5 text-ink outline-none focus:border-navy-900';
const labelClass = 'block text-sm font-medium text-navy-900';

export default function BookingModal({ property, matchesRoom, guest, defaultName, onGuestChange, onClose, onSubmitted }: Props) {
  const [step, setStep] = useState<'details' | 'bed' | 'you' | 'verify'>('details');
  const [selectedBed, setSelectedBed] = useState('');
  const [vibeAnswers, setVibeAnswers] = useState<VibeAnswers>(() => loadVibeAnswers());
  const [vibeSummary, setVibeSummary] = useState(() => loadVibeSummary());
  const [vibeOpen, setVibeOpen] = useState(false);
  const [vibeLoading, setVibeLoading] = useState(false);
  const [vibeMatches, setVibeMatches] = useState<Map<string, VibeMatch> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [otpSent, setOtpSent] = useState(Boolean(guest?.phoneToken));
  const [otpCode, setOtpCode] = useState('');
  const otpChallenge = useRef<PhoneChallenge<'BOOKING'> | null>(null);
  const [phoneToken, setPhoneToken] = useState(guest?.phoneToken || '');
  const [otpLoading, setOtpLoading] = useState(false);
  const [request, setRequest] = useState({
    residentName: defaultName,
    phone: guest?.phone || '',
    email: '',
    moveInDate: '',
    notes: ''
  });
  const { cooldown: otpCooldown, startCooldown: startOtpCooldown } = useOtpCooldown();

  const facts = computePriceFacts(property, matchesRoom);
  const vibeComplete = hasKeyHabits(vibeAnswers);
  const bedChoices = property.rooms
    .filter(matchesRoom)
    .flatMap((room) => room.beds.map((bed) => ({ room, bed, match: vibeMatches?.get(bed.id) ?? null })))
    .sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
  const selectedMatch = vibeMatches?.get(selectedBed) ?? null;
  const chosenBed = property.rooms.flatMap((room) => room.beds.map((bed) => ({ room, bed }))).find(({ bed }) => bed.id === selectedBed) ?? null;
  const stepIndex = step === 'bed' ? 1 : step === 'you' ? 2 : step === 'verify' ? 3 : 0;
  const stepTitle = { details: '', bed: 'Choose a bed', you: 'Your details', verify: 'Verify your phone' }[step];

  const runVibeCheck = async () => {
    setVibeLoading(true);
    try {
      saveVibeAnswers(vibeAnswers);
      saveVibeSummary(vibeSummary);
      const { beds } = (
        await api.post(`/pg/properties/${property.id}/vibecheck`, {
          answers: vibeAnswers,
          ...(vibeSummary ? { summary: vibeSummary } : {})
        })
      ).data as { beds: (VibeMatch & { bedId: string })[] };
      setVibeMatches(new Map(beds.map((bed) => [bed.bedId, bed])));
      setVibeOpen(false);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not run VibeCheck. Try again.'));
    } finally {
      setVibeLoading(false);
    }
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
      const digits = normalizePhoneDigits(request.phone);
      if (!guest || digits === guest.phone) onGuestChange(saveGuestSession(digits, data.phoneToken, data.guestToken));
      toast.success('Phone verified');
    } catch (error: unknown) {
      toast.error(phoneOtpErrorMessage(error, 'Invalid code'));
    } finally {
      setOtpLoading(false);
    }
  };

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBed) return;
    setSubmitting(true);
    try {
      const response = await api.post('/pg/bookings', {
        ...request,
        propertyId: property.id,
        bedId: selectedBed,
        phoneToken,
        ...(Object.keys(vibeAnswers).length ? { vibeAnswers, ...(vibeSummary ? { vibeSummary } : {}) } : {})
      });
      toast.success(response.data.message || 'Booking request submitted');
      setPhoneToken('');
      updateGuestToken('');
      onGuestChange(getGuestSession());
      await onSubmitted();
    } catch (error: unknown) {
      if (apiErrorStatus(error) === 403) {
        setPhoneToken('');
        updateGuestToken('');
        onGuestChange(getGuestSession());
        toast.error('Verification expired — please verify your number again');
      } else {
        toast.error(apiErrorMessage(error, 'Could not submit booking request'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-card)] bg-canvas shadow-[var(--shadow-float)] sm:rounded-[var(--radius-card)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            {step !== 'details' && <p className="text-sm text-muted">Step {stepIndex} of 3 · {stepTitle}</p>}
            <h2 id="booking-title" className="truncate text-xl font-bold text-ink">{property.name}</h2>
            {step === 'details' && <p className="text-sm text-muted">{property.locality}, {property.city}</p>}
            {step !== 'details' && (
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {[1, 2, 3].map((n) => (
                  <span key={n} className={`h-1 w-10 rounded-full ${n <= stepIndex ? 'bg-navy-900' : 'bg-hairline'}`} />
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close booking request" autoFocus className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-surface">
            <X className="h-5 w-5" />
          </button>
        </div>

        {step === 'details' ? (
          <>
            <div className="overflow-y-auto px-5 py-4">
              {property.photoUrls?.[0] && (
                <SecureImage srcKey={property.photoUrls[0]} alt={`Photo of ${property.name}`} className="mb-4 aspect-[4/3] w-full rounded-[var(--radius-card)] object-cover" />
              )}
              <dl className="divide-y divide-hairline">
                {[
                  ['For', GENDER_LABELS[property.genderPolicy] || property.genderPolicy],
                  ['Rent', facts.from === null ? 'Ask the owner' : facts.to !== null && facts.to !== facts.from ? `${rupees(facts.from)} – ${rupees(facts.to)} a month` : `${rupees(facts.from)} a month`],
                  ['Food', facts.food ?? 'Ask the owner'],
                  ['Deposit', facts.deposit === 'Deposit not listed' ? 'Not listed: ask the owner' : facts.deposit.replace('Deposit ', '')],
                  ['Beds', availabilityText(property.availableBeds)],
                  ['Address', property.address]
                ].map(([term, value]) => (
                  <div key={term} className="flex justify-between gap-4 py-2.5">
                    <dt className="text-muted">{term}</dt>
                    <dd className="tabular text-right font-medium text-navy-900">{value}</dd>
                  </div>
                ))}
              </dl>
              {property.description && <p className="mt-4 max-w-prose text-ink">{property.description}</p>}
              {(() => {
                const checked = [
                  [Boolean(property.ownerVerified), "Owner's phone number verified"],
                  [property.latitude != null && property.longitude != null, 'Location pinned on the map'],
                  [(property.photoUrls?.length ?? 0) > 0, `${property.photoUrls?.length ?? 0} photo${(property.photoUrls?.length ?? 0) === 1 ? '' : 's'} from the owner`],
                  [(property.houseRules?.length ?? 0) > 0, 'House rules shared up front']
                ]
                  .filter(([ok]) => ok)
                  .map(([, label]) => String(label));
                return (
                  checked.length > 0 && (
                    <>
                      <h3 className="mt-5 font-sans text-base font-semibold">What we've checked</h3>
                      <ul className="mt-2 space-y-1">
                        {checked.map((label) => (
                          <li key={label} className="flex items-center gap-2 text-ink">
                            <Check className="h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
                            <span>{label}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )
                );
              })()}
              {property.amenities?.length > 0 && (
                <>
                  <h3 className="mt-5 font-sans text-base font-semibold">What's here</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {property.amenities.map((amenity) => (
                      <li key={amenity} className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1 text-sm">
                        <Check className="h-3.5 w-3.5 text-positive" aria-hidden="true" />
                        {amenity}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {property.houseRules?.length > 0 && (
                <>
                  <h3 className="mt-5 font-sans text-base font-semibold">House rules</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
                    {property.houseRules.map((rule) => <li key={rule}>{rule}</li>)}
                  </ul>
                </>
              )}
              {property.managerPhone && (
                <a
                  href={`https://wa.me/${property.managerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello, I'm interested in ${property.name} in ${property.locality}.`)}`}
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
              <button onClick={() => setStep('bed')} disabled={!property.availableBeds} className="btn-primary">
                {property.availableBeds ? 'Request a bed' : 'Fully occupied'}
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
                    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-3" aria-live="polite">
                      {selectedMatch.score !== null ? (
                        <>
                          <p className="font-medium text-navy-900">
                            <span className="tabular">{selectedMatch.score}%</span> VibeCheck match with {selectedMatch.compared === 1 ? 'the resident' : `${selectedMatch.compared} residents`} of this room
                          </p>
                          <ul className="mt-1 space-y-0.5 text-sm text-ink">
                            {selectedMatch.reasons.map((reason) => (
                              <li key={reason} className="flex gap-1.5">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
                                {reason}
                              </li>
                            ))}
                            {selectedMatch.differences.map((difference) => <li key={difference} className="text-muted">{difference}</li>)}
                          </ul>
                        </>
                      ) : (
                        <p className="text-ink">Nobody in this room has taken VibeCheck yet, so there's no one to compare with.</p>
                      )}
                    </div>
                  )}

                  {property.serviceSettings?.vibeCheck === false ? null : !vibeOpen ? (
                    <div className="rounded-[var(--radius-card)] border border-hairline px-4 py-3">
                      <p className="font-medium text-navy-900">{vibeMatches ? 'Sorted by VibeCheck' : 'Find roommates like you'}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {vibeMatches ? 'Best match first.' : 'Match beds by sleep, tidiness and noise.'}
                      </p>
                      <button type="button" onClick={() => setVibeOpen(true)} className="btn-secondary mt-3">
                        {vibeMatches ? 'Change my answers' : 'Take VibeCheck'}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-[var(--radius-card)] border border-navy-900/20 px-4 py-4">
                      <div>
                        <VibeProfileBuilder
                          propertyId={property.id}
                          answers={vibeAnswers}
                          summary={vibeSummary}
                          onChange={(answers, summary) => {
                            setVibeAnswers(answers);
                            setVibeSummary(summary);
                          }}
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" disabled={!vibeComplete || vibeLoading} onClick={() => void runVibeCheck()} className="btn-secondary">
                          {vibeLoading && <Loader2 className="h-4 w-4 animate-spin" />} See my matches
                        </button>
                        <button type="button" onClick={() => setVibeOpen(false)} className="min-h-11 px-3 font-medium text-muted hover:text-navy-900">
                          Not now
                        </button>
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
                  <dl className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-1">
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
                    <p className="flex items-center gap-2 rounded-[var(--radius-button)] bg-positive-bg px-3 py-2.5 font-medium text-positive">
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
              <button type="button" onClick={() => setStep(step === 'bed' ? 'details' : step === 'you' ? 'bed' : 'you')} className="btn-secondary">
                Back
              </button>
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
  );
}
