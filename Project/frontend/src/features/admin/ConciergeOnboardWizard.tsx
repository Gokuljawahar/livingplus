import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Trash2,
  Upload,
  UserPlus,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { SecureImage } from '../../components/SecureImage';
import { usePlatformCatalog } from '../../hooks/usePlatformCatalog';
import { apiErrorMessage } from '../../utils/api-error';
import { ROUTES } from '../../utils/app-areas';
import type { AdminOwner, OnboardRoomDraft, OwnerLead } from './types';

interface Props {
  owners: AdminOwner[];
  prefillLead: OwnerLead | null;
  onClearLead: () => void;
  onCompleted: () => void;
}

const fieldClass =
  'mt-1 block w-full rounded-[var(--radius-field)] border border-field-border bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-navy-900';
const labelClass = 'block text-xs font-semibold text-navy-900';

function emptyRoom(index: number): OnboardRoomDraft {
  return {
    roomNumber: `${100 + index + 1}`,
    block: 'Main',
    floor: '1',
    roomType: index === 0 ? 'DOUBLE' : 'TRIPLE',
    monthlyRent: index === 0 ? '9000' : '7500',
    depositAmount: index === 0 ? '9000' : '7500',
    maintenanceFee: '0',
    utilitiesSurcharge: '0',
    hasAc: false,
    foodIncluded: false,
    foodCharge: '0',
    numberOfBeds: index === 0 ? '2' : '3',
    description: '',
    amenities: ['Attached Bath', 'Wardrobe'],
    photoUrls: []
  };
}

function generateStrongPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `Pg@${suffix}9!`;
}

export default function ConciergeOnboardWizard({ owners, prefillLead, onClearLead, onCompleted }: Props) {
  const { catalog } = usePlatformCatalog();
  const [ownerMode, setOwnerMode] = useState<'new' | 'existing'>('new');
  const [existingOwnerId, setExistingOwnerId] = useState('');
  const [ownerName, setOwnerName] = useState(prefillLead?.ownerName || '');
  const [ownerPhone, setOwnerPhone] = useState(prefillLead?.phone || '');
  const [ownerEmail, setOwnerEmail] = useState(prefillLead?.email || '');
  const [ownerPassword, setOwnerPassword] = useState(() => generateStrongPassword());

  const [propName, setPropName] = useState(prefillLead?.propertyName || '');
  const [propertyType, setPropertyType] = useState(prefillLead?.propertyType || 'PG');
  const [genderPolicy, setGenderPolicy] = useState(prefillLead?.genderPolicy || 'ANY');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState(prefillLead?.notes || '');
  const [address, setAddress] = useState(prefillLead?.address || '');
  const [locality, setLocality] = useState(prefillLead?.locality || '');
  const [city, setCity] = useState(prefillLead?.city || catalog.defaultCity || 'Chennai');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [contactPhone, setContactPhone] = useState(prefillLead?.phone || '');
  const [upiId, setUpiId] = useState('');
  const [featured, setFeatured] = useState(false);

  const [amenities, setAmenities] = useState<string[]>(
    Array.isArray(prefillLead?.amenities) && prefillLead.amenities.length > 0
      ? prefillLead.amenities
      : ['Wi-Fi', 'CCTV surveillance', 'RO drinking water', 'Power backup']
  );
  const [customAmenity, setCustomAmenity] = useState('');
  const [highlightsText, setHighlightsText] = useState('');
  const [foodDetails, setFoodDetails] = useState('');
  const [nearbyText, setNearbyText] = useState('');
  const [rulesText, setRulesText] = useState(() => catalog.defaultHouseRules.join('\n'));
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [rooms, setRooms] = useState<OnboardRoomDraft[]>(() => [
    {
      ...emptyRoom(0),
      ...(prefillLead?.startingRent ? { monthlyRent: String(prefillLead.startingRent), depositAmount: String(prefillLead.startingRent) } : {})
    }
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [publishedResult, setPublishedResult] = useState<{
    property: { id: string; slug: string; name: string; status: string };
    owner: { id: string; name: string; phone: string; created: boolean };
  } | null>(null);

  const uploadFiles = async (files: FileList | null, onUploaded: (keys: string[]) => void) => {
    if (!files || !files.length) return;
    setUploadingPhotos(true);
    try {
      const keys = await Promise.all(
        Array.from(files).map(async (file) => {
          const data = new FormData();
          data.append('image', file);
          const res = await api.post('/upload-s3', data, { headers: { 'Content-Type': 'multipart/form-data' } });
          return res.data.fileKey as string;
        })
      );
      onUploaded(keys);
      toast.success(`${keys.length} photo${keys.length === 1 ? '' : 's'} uploaded`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Photo upload failed'));
    } finally {
      setUploadingPhotos(false);
    }
  };

  const toggleAmenity = (item: string) => {
    setAmenities((prev) => (prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]));
  };

  const addCustomAmenity = () => {
    const clean = customAmenity.trim();
    if (!clean) return;
    if (!amenities.includes(clean)) setAmenities((prev) => [...prev, clean]);
    setCustomAmenity('');
  };

  const updateRoom = (idx: number, patch: Partial<OnboardRoomDraft>) => {
    setRooms((prev) => prev.map((room, i) => (i === idx ? { ...room, ...patch } : room)));
  };

  const submitOnboarding = async (status: 'ACTIVE' | 'INACTIVE') => {
    if (!propName.trim() || !address.trim() || !locality.trim()) {
      toast.error('Property name, street address, and locality are required');
      return;
    }
    if (ownerMode === 'existing' && !existingOwnerId) {
      toast.error('Select an existing owner or switch to Create New Owner');
      return;
    }
    if (ownerMode === 'new' && (!ownerName.trim() || !ownerPhone.trim())) {
      toast.error('Owner name and mobile number are required');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...(prefillLead?.id ? { leadId: prefillLead.id } : {}),
        ...(ownerMode === 'existing'
          ? { existingOwnerId }
          : { ownerName: ownerName.trim(), ownerPhone: ownerPhone.trim(), ownerEmail: ownerEmail.trim() || undefined, ownerPassword }),
        property: {
          name: propName.trim(),
          propertyType,
          genderPolicy,
          tagline: tagline.trim() || undefined,
          description: description.trim() || undefined,
          address: address.trim(),
          locality: locality.trim(),
          city: city.trim() || 'Chennai',
          landmark: landmark.trim() || undefined,
          pincode: pincode.trim() || undefined,
          latitude: latitude.trim() || undefined,
          longitude: longitude.trim() || undefined,
          contactPhone: (contactPhone || ownerPhone).trim() || undefined,
          upiId: upiId.trim() || undefined,
          amenities,
          highlights: highlightsText.split('\n').map((s) => s.trim()).filter(Boolean),
          foodDetails: foodDetails.trim() || undefined,
          nearbyPlaces: nearbyText.split('\n').map((s) => s.trim()).filter(Boolean),
          houseRules: rulesText.split('\n').map((s) => s.trim()).filter(Boolean),
          photoUrls,
          status,
          featured
        },
        rooms: rooms.map((room) => ({
          roomNumber: room.roomNumber.trim(),
          block: room.block.trim() || undefined,
          floor: room.floor.trim() || undefined,
          roomType: room.roomType,
          monthlyRent: Number(room.monthlyRent),
          depositAmount: Number(room.depositAmount) || 0,
          maintenanceFee: Number(room.maintenanceFee) || 0,
          utilitiesSurcharge: Number(room.utilitiesSurcharge) || 0,
          hasAc: room.hasAc,
          foodIncluded: room.foodIncluded,
          foodCharge: Number(room.foodCharge) || 0,
          numberOfBeds: Number(room.numberOfBeds) || 1,
          description: room.description.trim() || undefined,
          amenities: room.amenities,
          photoUrls: room.photoUrls
        }))
      };
      const res = await api.post('/admin/onboard', payload);
      setPublishedResult(res.data);
      toast.success(status === 'ACTIVE' ? 'PG published live to marketplace!' : 'PG saved as draft');
      onCompleted();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not complete onboarding'));
    } finally {
      setSubmitting(false);
    }
  };

  if (publishedResult) {
    const isLive = publishedResult.property.status === 'ACTIVE';
    return (
      <div className="mx-auto max-w-2xl rounded-[var(--radius-card)] border border-hairline bg-canvas p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-positive-bg text-positive">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-2xl font-bold text-navy-900">
          {isLive ? `${publishedResult.property.name} is live!` : `${publishedResult.property.name} saved as draft`}
        </h2>
        <p className="mt-2 text-sm text-muted">
          Linked to owner <strong className="text-navy-900">{publishedResult.owner.name}</strong> (+{publishedResult.owner.phone})
          {publishedResult.owner.created ? ' — new owner account provisioned.' : '.'}
        </p>

        {ownerMode === 'new' && publishedResult.owner.created && (
          <div className="mx-auto mt-4 max-w-md rounded-[var(--radius-field)] border border-hairline bg-surface p-4 text-left text-xs">
            <p className="font-bold text-navy-900">Share Owner Portal Credentials</p>
            <p className="mt-1 text-ink">Login URL: <span className="font-mono">/owner/login</span></p>
            <p className="text-ink">Mobile: <span className="font-mono">{publishedResult.owner.phone}</span></p>
            <p className="text-ink">Password: <span className="font-mono">{ownerPassword}</span></p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {isLive && (
            <a
              href={ROUTES.propertyDetail(publishedResult.property.slug)}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              View Live PG Page <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              setOwnerMode('existing');
              setExistingOwnerId(publishedResult.owner.id);
              setPublishedResult(null);
              setPropName('');
              setTagline('');
              setDescription('');
              setAddress('');
              setPhotoUrls([]);
              setRooms([emptyRoom(0)]);
              onClearLead();
            }}
            className="btn-secondary"
          >
            <Plus className="h-4 w-4" /> Add another PG for {publishedResult.owner.name}
          </button>
          <button
            type="button"
            onClick={() => {
              onClearLead();
              setPublishedResult(null);
              setOwnerMode('new');
              setOwnerName('');
              setOwnerPhone('');
              setOwnerEmail('');
              setOwnerPassword(generateStrongPassword());
              setPropName('');
              setTagline('');
              setDescription('');
              setAddress('');
              setLocality('');
              setPhotoUrls([]);
              setRooms([emptyRoom(0)]);
            }}
            className="btn-secondary"
          >
            Onboard a different owner
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {prefillLead && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm">
          <div>
            <p className="font-bold text-navy-900">
              Onboarding from inquiry: {prefillLead.propertyName} ({prefillLead.ownerName})
            </p>
            <p className="text-xs text-muted">
              Publishing this PG will automatically mark the lead as Published and link it to the owner.
            </p>
          </div>
          <button type="button" onClick={onClearLead} className="text-xs font-semibold text-navy-900 underline">
            Detach lead
          </button>
        </div>
      )}

      {/* Section 1: Owner Account */}
      <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <h2 className="text-lg font-bold text-navy-900">1. Owner account</h2>
            <p className="text-xs text-muted">Provision an owner account automatically or attach to a multi-PG owner.</p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setOwnerMode('new')}
              className={`rounded-[var(--radius-button)] px-3 py-1.5 text-xs font-semibold ${
                ownerMode === 'new' ? 'bg-navy-900 text-white' : 'bg-surface text-ink'
              }`}
            >
              <UserPlus className="mr-1 inline h-3.5 w-3.5" /> New owner
            </button>
            <button
              type="button"
              onClick={() => setOwnerMode('existing')}
              className={`rounded-[var(--radius-button)] px-3 py-1.5 text-xs font-semibold ${
                ownerMode === 'existing' ? 'bg-navy-900 text-white' : 'bg-surface text-ink'
              }`}
            >
              Existing owner ({owners.length})
            </button>
          </div>
        </div>

        {ownerMode === 'existing' ? (
          <div className="mt-4 max-w-md">
            <label className={labelClass}>
              Select PG owner *
              <select
                value={existingOwnerId}
                onChange={(e) => setExistingOwnerId(e.target.value)}
                className={fieldClass}
              >
                <option value="">Choose an owner...</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name} · {owner.phone || owner.email} ({owner.propertyCount} PG{owner.propertyCount === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className={labelClass}>
              Owner full name *
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Suresh Krishnan" className={fieldClass} />
            </label>
            <label className={labelClass}>
              Owner mobile (login ID) *
              <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="9840012345" className={fieldClass} />
            </label>
            <label className={labelClass}>
              Email (optional)
              <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@example.com" className={fieldClass} />
            </label>
            <div>
              <label className={labelClass} htmlFor="onboard-owner-pass">Initial portal password *</label>
              <div className="mt-1 flex gap-1.5">
                <input
                  id="onboard-owner-pass"
                  value={ownerPassword}
                  onChange={(e) => setOwnerPassword(e.target.value)}
                  className="min-w-0 flex-1 rounded-[var(--radius-field)] border border-field-border bg-canvas px-3 py-2 font-mono text-xs text-ink outline-none focus:border-navy-900"
                />
                <button
                  type="button"
                  title="Generate new password"
                  onClick={() => setOwnerPassword(generateStrongPassword())}
                  className="rounded-[var(--radius-field)] border border-hairline bg-surface px-2.5 text-ink hover:bg-hairline"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Property Details & Location */}
      <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
        <div className="border-b border-hairline pb-3">
          <h2 className="text-lg font-bold text-navy-900">2. PG identity & location</h2>
          <p className="text-xs text-muted">Everything guests see on the marketplace card and PG overview page.</p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            PG / Property name *
            <input value={propName} onChange={(e) => setPropName(e.target.value)} placeholder="Palm Grove Women's Residence" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Accommodation type
            <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className={fieldClass}>
              {catalog.propertyTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Resident policy
            <select value={genderPolicy} onChange={(e) => setGenderPolicy(e.target.value)} className={fieldClass}>
              {catalog.genderPolicies.map((policy) => (
                <option key={policy.value} value={policy.value}>{policy.label}</option>
              ))}
            </select>
          </label>
          <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
            Short tagline (shown on marketplace card & hero)
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Calm lake-view PG 5 mins from Tidel Park with home-cooked meals" className={fieldClass} />
          </label>
          <label className={`${labelClass} sm:col-span-2 lg:col-span-3`}>
            Full description
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe neighborhood vibe, room comfort, security, and who stays here..." className={`${fieldClass} resize-y`} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            Street address *
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="14, Lake View Road, Perungudi" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Locality *
            <input value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Perungudi" className={fieldClass} />
          </label>
          <label className={labelClass}>
            City
            <input value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass} />
          </label>
          <label className={labelClass}>
            Landmark
            <input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Near Perungudi MRTS" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Pincode
            <input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="600096" className={fieldClass} />
          </label>
          <label className={labelClass}>
            Public WhatsApp / Contact phone
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Defaults to owner phone" className={fieldClass} />
          </label>
          <label className={labelClass}>
            UPI ID (optional)
            <input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="pgname@okicici" className={fieldClass} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Latitude
              <input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="12.9653" className={fieldClass} />
            </label>
            <label className={labelClass}>
              Longitude
              <input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="80.2461" className={fieldClass} />
            </label>
          </div>
        </div>

        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-field)] border border-hairline bg-surface px-3.5 py-2 text-xs font-semibold text-navy-900">
          <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="h-4 w-4 rounded accent-navy-900" />
          Mark as Featured listing (pinned at top of marketplace)
        </label>
      </section>

      {/* Section 3: Categorized Facilities, Highlights, Food & Rules */}
      <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
        <div className="border-b border-hairline pb-3">
          <h2 className="text-lg font-bold text-navy-900">3. Facilities, food & house rules</h2>
          <p className="text-xs text-muted">Select all amenities available so tenants can filter and see full details.</p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {catalog.amenityCategories.map((group) => (
            <div key={group.category} className="rounded-[var(--radius-field)] border border-hairline bg-surface p-3.5">
              <p className="text-xs font-bold text-navy-900">{group.category}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {group.options.map((option) => {
                  const active = amenities.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleAmenity(option)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                        active
                          ? 'border-navy-900 bg-navy-900 text-white'
                          : 'border-hairline bg-canvas text-ink hover:border-field-border'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={customAmenity}
            onChange={(e) => setCustomAmenity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomAmenity();
              }
            }}
            placeholder="Add custom facility (e.g. Terrace garden, EV charging)"
            className="w-72 rounded-[var(--radius-field)] border border-hairline bg-surface px-3 py-2 text-xs outline-none focus:border-navy-900 focus:bg-canvas"
          />
          <button type="button" onClick={addCustomAmenity} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add facility
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Key highlights (one per line)
            <textarea
              rows={3}
              value={highlightsText}
              onChange={(e) => setHighlightsText(e.target.value)}
              placeholder={'5 mins walk to Tidel Park\nZero brokerage — direct owner listing'}
              className={`${fieldClass} resize-y`}
            />
          </label>
          <label className={labelClass}>
            Nearby transit & landmarks (one per line)
            <textarea
              rows={3}
              value={nearbyText}
              onChange={(e) => setNearbyText(e.target.value)}
              placeholder={'Perungudi MRTS · 600 m\nRMZ Millennia · 2.1 km'}
              className={`${fieldClass} resize-y`}
            />
          </label>
          <label className={labelClass}>
            Food & dining details
            <textarea
              rows={3}
              value={foodDetails}
              onChange={(e) => setFoodDetails(e.target.value)}
              placeholder="Home-cooked South & North Indian meals, RO drinking water..."
              className={`${fieldClass} resize-y`}
            />
          </label>
          <label className={labelClass}>
            House rules (one per line)
            <textarea
              rows={3}
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              className={`${fieldClass} resize-y`}
            />
          </label>
        </div>
      </section>

      {/* Section 4: Photo Gallery */}
      <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <h2 className="text-lg font-bold text-navy-900">4. Property photos</h2>
            <p className="text-xs text-muted">Upload exterior, common area, dining, and lounge photos collected from the owner.</p>
          </div>
          <label className="btn-secondary cursor-pointer text-xs">
            {uploadingPhotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload photos
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => void uploadFiles(e.target.files, (keys) => setPhotoUrls((prev) => [...prev, ...keys]))}
            />
          </label>
        </div>

        {photoUrls.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-[var(--radius-field)] border border-dashed border-field-border bg-surface py-8 text-center">
            <ImagePlus className="h-8 w-8 text-muted" />
            <p className="mt-2 text-xs font-medium text-muted">No photos uploaded yet. Upload 3+ clear photos for best conversions.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {photoUrls.map((key, idx) => (
              <div key={key} className="group relative overflow-hidden rounded-[var(--radius-field)] border border-hairline bg-surface">
                <SecureImage srcKey={key} alt={`PG photo ${idx + 1}`} className="aspect-[4/3] w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrls((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Remove photo"
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-navy-900/80 text-white hover:bg-negative"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {idx === 0 && (
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-navy-900">
                    Cover
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 5: Rooms & Beds */}
      <section className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <h2 className="text-lg font-bold text-navy-900">5. Rooms, sharing & beds</h2>
            <p className="text-xs text-muted">Add every room option so guests can pick a specific sharing type & bed.</p>
          </div>
          <button
            type="button"
            onClick={() => setRooms((prev) => [...prev, emptyRoom(prev.length)])}
            className="btn-secondary text-xs"
          >
            <Plus className="h-4 w-4" /> Add room
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {rooms.map((room, idx) => (
            <div key={idx} className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-navy-900">Room #{idx + 1}</p>
                {rooms.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRooms((prev) => prev.filter((_, i) => i !== idx))}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-negative hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <label className={labelClass}>
                  Room no. *
                  <input
                    value={room.roomNumber}
                    onChange={(e) => updateRoom(idx, { roomNumber: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  Sharing type
                  <select
                    value={room.roomType}
                    onChange={(e) => updateRoom(idx, { roomType: e.target.value as OnboardRoomDraft['roomType'] })}
                    className={fieldClass}
                  >
                    <option value="PRIVATE">Private</option>
                    <option value="DOUBLE">2 sharing</option>
                    <option value="TRIPLE">3 sharing</option>
                    <option value="SHARED">Shared dorm</option>
                  </select>
                </label>
                <label className={labelClass}>
                  Monthly rent (₹) *
                  <input
                    type="number"
                    min="1"
                    value={room.monthlyRent}
                    onChange={(e) => updateRoom(idx, { monthlyRent: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  Deposit (₹)
                  <input
                    type="number"
                    min="0"
                    value={room.depositAmount}
                    onChange={(e) => updateRoom(idx, { depositAmount: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  Beds *
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={room.numberOfBeds}
                    onChange={(e) => updateRoom(idx, { numberOfBeds: e.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className={labelClass}>
                  Food / mo (₹)
                  <input
                    type="number"
                    min="0"
                    value={room.foodCharge}
                    onChange={(e) => updateRoom(idx, { foodCharge: e.target.value })}
                    className={fieldClass}
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-navy-900">
                  <input type="checkbox" checked={room.hasAc} onChange={(e) => updateRoom(idx, { hasAc: e.target.checked })} className="rounded accent-navy-900" />
                  AC room
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-navy-900">
                  <input type="checkbox" checked={room.foodIncluded} onChange={(e) => updateRoom(idx, { foodIncluded: e.target.checked })} className="rounded accent-navy-900" />
                  Meals included in rent
                </label>
                <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-navy-700 hover:underline">
                  <Upload className="h-3.5 w-3.5" /> Room photos ({room.photoUrls.length})
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) =>
                      void uploadFiles(e.target.files, (keys) =>
                        updateRoom(idx, { photoUrls: [...room.photoUrls, ...keys] })
                      )
                    }
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {catalog.roomAmenityOptions.map((opt) => {
                  const active = room.amenities.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        updateRoom(idx, {
                          amenities: active ? room.amenities.filter((a) => a !== opt) : [...room.amenities, opt]
                        })
                      }
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        active ? 'border-navy-900 bg-navy-900 text-white' : 'border-hairline bg-canvas text-ink'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              <input
                value={room.description}
                onChange={(e) => updateRoom(idx, { description: e.target.value })}
                placeholder="Room note (e.g. Spacious balcony room facing courtyard)"
                className={`${fieldClass} mt-3`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Sticky Submit Actions */}
      <div className="flex flex-wrap items-center justify-end gap-3 rounded-[var(--radius-card)] border border-hairline bg-canvas p-4">
        <button
          type="button"
          disabled={submitting || uploadingPhotos}
          onClick={() => void submitOnboarding('INACTIVE')}
          className="btn-secondary"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save as Draft
        </button>
        <button
          type="button"
          disabled={submitting || uploadingPhotos}
          onClick={() => void submitOnboarding('ACTIVE')}
          className="btn-primary"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          Publish Live to Marketplace
        </button>
      </div>
    </div>
  );
}
