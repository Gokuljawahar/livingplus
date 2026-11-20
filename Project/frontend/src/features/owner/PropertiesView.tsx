import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { MapPicker } from '../../components/MapPicker';
import ResidentSiteLink from '../../components/ResidentSiteLink';
import { SecureImage } from '../../components/SecureImage';
import { Button, Card, EmptyState } from '../../components/ui';
import { apiErrorMessage } from '../../utils/api-error';
import { ownerPropertySchema, ownerRoomSchema, type OwnerPropertyForm, type OwnerRoomForm } from '../../validation/forms';
import { ownerInputClass, ownerLabelClass, showFirstError, type Property } from './types';

const EMPTY_PROPERTY_FORM: OwnerPropertyForm = {
  name: '',
  description: '',
  address: '',
  locality: '',
  contactPhone: '',
  upiId: '',
  city: 'Chennai',
  latitude: '',
  longitude: '',
  genderPolicy: 'ANY',
  amenities: '',
  houseRules: '',
  status: 'ACTIVE',
  bookingLockMinutes: '120',
  rentDay: '1',
  rentDueDay: '5'
};

const EMPTY_ROOM_FORM: OwnerRoomForm = {
  roomNumber: '',
  block: '',
  floor: '',
  roomType: 'SHARED',
  monthlyRent: '',
  depositAmount: '',
  maintenanceFee: '',
  utilitiesSurcharge: '',
  foodCharge: '',
  numberOfBeds: '1',
  hasAc: false,
  foodIncluded: false
};

interface Props {
  properties: Property[];
  selectedPropertyId: string;
  setSelectedPropertyId: (id: string) => void;
  canManageStaff: boolean;
  onChanged: () => void;
}

export default function PropertiesView({ properties, selectedPropertyId, setSelectedPropertyId, canManageStaff, onChanged }: Props) {
  const [editingPropertyId, setEditingPropertyId] = useState<string | null>(null);
  const [propertyFormOpen, setPropertyFormOpen] = useState(false);
  const [propertyPhotoFiles, setPropertyPhotoFiles] = useState<File[]>([]);
  const [existingPhotoUrls, setExistingPhotoUrls] = useState<string[]>([]);

  const propertyFormApi = useForm<OwnerPropertyForm>({ resolver: zodResolver(ownerPropertySchema), defaultValues: EMPTY_PROPERTY_FORM });
  const roomFormApi = useForm<OwnerRoomForm>({ resolver: zodResolver(ownerRoomSchema), defaultValues: EMPTY_ROOM_FORM });
  const saving = propertyFormApi.formState.isSubmitting || roomFormApi.formState.isSubmitting;
  const [mapAddress, mapLatitude, mapLongitude] = useWatch({ control: propertyFormApi.control, name: ['address', 'latitude', 'longitude'] });

  const showPropertyForm = propertyFormOpen || Boolean(editingPropertyId) || !properties.length;

  const startNewProperty = () => {
    setEditingPropertyId(null);
    propertyFormApi.reset(EMPTY_PROPERTY_FORM);
    setExistingPhotoUrls([]);
    setPropertyPhotoFiles([]);
  };

  const selectProperty = (property: Property) => {
    setSelectedPropertyId(property.id);
    setEditingPropertyId(property.id);
    propertyFormApi.reset({
      name: property.name,
      description: property.description || '',
      address: property.address,
      locality: property.locality,
      contactPhone: property.contactPhone || '',
      upiId: property.upiId || '',
      city: property.city,
      latitude: property.latitude == null ? '' : String(property.latitude),
      longitude: property.longitude == null ? '' : String(property.longitude),
      genderPolicy: property.genderPolicy,
      amenities: Array.isArray(property.amenities) ? property.amenities.join(', ') : '',
      houseRules: Array.isArray(property.houseRules) ? property.houseRules.join('\n') : '',
      status: property.status || 'ACTIVE',
      bookingLockMinutes: String(property.bookingLockMinutes ?? 120),
      rentDay: String(property.rentDay ?? 1),
      rentDueDay: String(property.rentDueDay ?? 5)
    });
    setExistingPhotoUrls(Array.isArray(property.photoUrls) ? property.photoUrls : []);
    setPropertyPhotoFiles([]);
  };

  const saveProperty = propertyFormApi.handleSubmit(async (propertyForm) => {
    const creatingProperty = !editingPropertyId;
    try {
      const newPhotoUrls = await Promise.all(
        propertyPhotoFiles.map(async (file) => {
          const upload = new FormData();
          upload.append('image', file);
          const result = await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } });
          return result.data.fileKey as string;
        })
      );
      const payload = {
        ...propertyForm,
        amenities: propertyForm.amenities.split(',').map((item) => item.trim()).filter(Boolean),
        houseRules: propertyForm.houseRules.split('\n').map((item) => item.trim()).filter(Boolean),
        photoUrls: [...existingPhotoUrls, ...newPhotoUrls]
      };
      const response = editingPropertyId
        ? await api.patch(`/pg/owner/properties/${editingPropertyId}`, payload)
        : await api.post('/pg/owner/properties', payload);
      if (creatingProperty && !response.data.slug) throw new Error('The property was created without a PG address');
      setSelectedPropertyId(response.data.id);
      setEditingPropertyId(null);
      propertyFormApi.reset(EMPTY_PROPERTY_FORM);
      setPropertyPhotoFiles([]);
      setExistingPhotoUrls([]);
      toast.success(editingPropertyId ? 'Property updated' : 'Property added');
      setPropertyFormOpen(false);
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not add property'));
    }
  }, showFirstError);

  const removeProperty = async (propertyId: string) => {
    if (!window.confirm('Delete this property and its archived records? Active tenants or bookings must be resolved first.')) return;
    try {
      await api.delete(`/pg/owner/properties/${propertyId}`);
      if (selectedPropertyId === propertyId) {
        setSelectedPropertyId('');
        startNewProperty();
      }
      toast.success('Property deleted');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not delete property'));
    }
  };

  const togglePublish = async (property: Property) => {
    try {
      await api.patch(`/pg/owner/properties/${property.id}`, { status: property.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE' });
      toast.success(property.status === 'INACTIVE' ? 'Property published' : 'Property unpublished');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update property'));
    }
  };

  const createRoom = roomFormApi.handleSubmit(async (roomForm) => {
    if (!selectedPropertyId) return;
    try {
      await api.post(`/pg/owner/properties/${selectedPropertyId}/rooms`, { ...roomForm, floor: roomForm.floor || null });
      roomFormApi.reset(EMPTY_ROOM_FORM);
      toast.success('Room and beds added');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not add room'));
    }
  }, showFirstError);

  const updateBedStatus = async (bedId: string, status: 'AVAILABLE' | 'MAINTENANCE') => {
    try {
      await api.patch(`/pg/owner/beds/${bedId}/status`, { status });
      toast.success(status === 'MAINTENANCE' ? 'Bed marked for maintenance' : 'Bed is available again');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update bed status'));
    }
  };

  return (
    <section className={`grid gap-8 pt-2 ${showPropertyForm ? 'xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]' : ''}`}>
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-muted">{properties.length} {properties.length === 1 ? 'PG' : 'PGs'}</p>
          {canManageStaff && !showPropertyForm && (
            <Button onClick={() => { startNewProperty(); setPropertyFormOpen(true); }}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add PG
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {properties.map((property) => {
            const beds = property.rooms.flatMap((room) => room.beds);
            const occupied = beds.filter((bed) => bed.status === 'OCCUPIED').length;
            const isSelected = selectedPropertyId === property.id;
            return (
              <div
                key={property.id}
                className={`overflow-hidden rounded-[var(--radius-card)] border transition-all ${
                  isSelected ? 'border-navy-900 bg-canvas ring-1 ring-navy-900/20' : 'border-hairline bg-canvas hover:border-field-border'
                }`}
              >
                <button onClick={() => selectProperty(property)} className={`block w-full p-4 text-left transition-colors ${isSelected ? 'bg-amber-50/40' : 'hover:bg-surface/60'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="block text-base font-bold text-navy-900">{property.name}</span>
                      <span className="mt-1 block text-xs font-medium text-muted">{property.locality}, {property.city} · {property.rooms.length} rooms</span>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${occupied === beds.length && beds.length > 0 ? 'border-amber-500/30 bg-amber-50 text-amber-600' : 'border-positive/30 bg-positive-bg text-positive'}`}>
                      {occupied}/{beds.length} occupied
                    </span>
                  </div>
                </button>
                {isSelected && (
                  <div className="space-y-4 border-t border-hairline bg-canvas p-4 pt-3">
                    {property.slug && <ResidentSiteLink slug={property.slug} />}
                    <div className="space-y-2.5">
                      {property.rooms.map((room) => (
                        <div key={room.id} className="space-y-2 rounded-[var(--radius-card)] border border-hairline bg-surface p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-ink">Room {room.roomNumber} · {room.roomType}</span>
                            <span className="rounded-[var(--radius-field)] border border-hairline bg-canvas px-2 py-0.5 font-semibold text-muted">
                              ₹{room.monthlyRent.toLocaleString('en-IN')} / mo
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {room.beds.map((bed) => (
                              <span key={bed.id} className="inline-flex items-center gap-1.5 rounded-[var(--radius-field)] border border-hairline bg-canvas px-2.5 py-1 text-xs font-medium text-ink">
                                <span className={`h-2 w-2 rounded-full ${bed.status === 'AVAILABLE' ? 'bg-positive' : bed.status === 'OCCUPIED' ? 'bg-info' : bed.status === 'MAINTENANCE' ? 'bg-negative' : 'bg-attention'}`} />
                                {bed.label} · {bed.status.toLowerCase().replace('_', ' ')}
                                {canManageStaff && ['AVAILABLE', 'MAINTENANCE'].includes(bed.status) && (
                                  <button
                                    type="button"
                                    title={bed.status === 'AVAILABLE' ? 'Mark bed for maintenance' : 'Mark bed available'}
                                    onClick={() => void updateBedStatus(bed.id, bed.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE')}
                                    className="ml-1 text-xs font-bold text-navy-900 hover:underline"
                                  >
                                    {bed.status === 'AVAILABLE' ? 'Repair' : 'Release'}
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {canManageStaff && (
                      <div className="flex gap-2 border-t border-hairline pt-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => void togglePublish(property)}>
                          {property.status === 'INACTIVE' ? 'Publish' : 'Unpublish'}
                        </Button>
                        <Button type="button" variant="danger" size="sm" onClick={() => void removeProperty(property.id)}>
                          Delete property
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!properties.length && <EmptyState title="Add a property to start managing rooms and beds." />}
        </div>

        {canManageStaff && selectedPropertyId && (
          <Card className="mt-6 p-6">
            <form onSubmit={createRoom}>
              <h3 className="text-sm font-bold text-ink">Add room and beds</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-ink">Room number<input required {...roomFormApi.register('roomNumber')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="text-xs font-semibold text-ink">Block / wing<input {...roomFormApi.register('block')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="text-xs font-semibold text-ink">Floor<input type="number" {...roomFormApi.register('floor')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="text-xs font-semibold text-ink">Sharing type
                  <select {...roomFormApi.register('roomType')} className={`mt-1 block ${ownerInputClass}`}>
                    <option value="PRIVATE">Private</option>
                    <option value="DOUBLE">2 sharing</option>
                    <option value="TRIPLE">3 sharing</option>
                    <option value="SHARED">Shared dorm</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink">Monthly rent<input required min="1" type="number" {...roomFormApi.register('monthlyRent')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="text-xs font-semibold text-ink">Deposit<input min="0" type="number" {...roomFormApi.register('depositAmount')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="text-xs font-semibold text-ink">Maintenance fee<input min="0" type="number" {...roomFormApi.register('maintenanceFee')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="text-xs font-semibold text-ink">Utilities<input min="0" type="number" {...roomFormApi.register('utilitiesSurcharge')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="text-xs font-semibold text-ink">Food / month (0 for none)<input min="0" type="number" {...roomFormApi.register('foodCharge')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="text-xs font-semibold text-ink">Number of beds<input required min="1" max="20" type="number" {...roomFormApi.register('numberOfBeds')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink"><input type="checkbox" {...roomFormApi.register('hasAc')} className="rounded accent-navy-900" />AC room</label>
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink"><input type="checkbox" {...roomFormApi.register('foodIncluded')} className="rounded accent-navy-900" />Food included</label>
              </div>
              <Button type="submit" size="sm" disabled={saving} className="mt-5">
                <Plus className="h-4 w-4" /> Add room
              </Button>
            </form>
          </Card>
        )}
      </div>

      {canManageStaff && showPropertyForm && (
        <Card className="h-fit p-6">
          <form onSubmit={saveProperty}>
            <div className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
              <h2 className="text-sm font-bold text-ink">{editingPropertyId ? 'Edit PG' : 'Add a PG'}</h2>
              {properties.length > 0 && (
                <button type="button" onClick={() => { startNewProperty(); setPropertyFormOpen(false); }} className="text-sm font-medium text-muted hover:text-navy-900">
                  Close
                </button>
              )}
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={ownerLabelClass}>Property name</label>
                <input required placeholder="Property name" {...propertyFormApi.register('name')} className={ownerInputClass} />
              </div>
              <div>
                <label className={ownerLabelClass}>Description</label>
                <textarea rows={2} placeholder="Description" {...propertyFormApi.register('description')} className={`${ownerInputClass} resize-y`} />
              </div>
              <div>
                <label className={ownerLabelClass}>Street address</label>
                <input required placeholder="Street address" {...propertyFormApi.register('address')} className={ownerInputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input required placeholder="Locality" {...propertyFormApi.register('locality')} className={`min-w-0 ${ownerInputClass}`} />
                <input placeholder="City" {...propertyFormApi.register('city')} className={`min-w-0 ${ownerInputClass}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="any" placeholder="Latitude (optional)" {...propertyFormApi.register('latitude')} className={`min-w-0 ${ownerInputClass}`} />
                <input type="number" step="any" placeholder="Longitude (optional)" {...propertyFormApi.register('longitude')} className={`min-w-0 ${ownerInputClass}`} />
              </div>
              {import.meta.env.VITE_GOOGLE_MAPS_API_KEY && (
                <MapPicker
                  apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                  defaultAddress={mapAddress}
                  initialCoordinates={mapLatitude && mapLongitude ? { lat: Number(mapLatitude), lng: Number(mapLongitude) } : null}
                  onAddressChange={(address) => propertyFormApi.setValue('address', address)}
                  onLocationSelect={(location) => {
                    propertyFormApi.setValue('address', location.address);
                    propertyFormApi.setValue('latitude', String(location.lat));
                    propertyFormApi.setValue('longitude', String(location.lng));
                    if (location.city) propertyFormApi.setValue('city', location.city);
                  }}
                />
              )}
              <input type="tel" placeholder="Public WhatsApp contact (optional)" {...propertyFormApi.register('contactPhone')} className={ownerInputClass} />
              <input type="text" placeholder="UPI ID for resident payments (optional)" {...propertyFormApi.register('upiId')} className={ownerInputClass} />
              <select {...propertyFormApi.register('genderPolicy')} className={ownerInputClass}>
                <option value="ANY">All residents</option>
                <option value="MEN">Men</option>
                <option value="WOMEN">Women</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select {...propertyFormApi.register('status')} className={`min-w-0 ${ownerInputClass}`}>
                  <option value="ACTIVE">Published</option>
                  <option value="INACTIVE">Unpublished</option>
                </select>
                <label className="min-w-0 text-xs font-semibold text-muted">Hold (min)<input type="number" min="10" max="1440" {...propertyFormApi.register('bookingLockMinutes')} className={`mt-1 block ${ownerInputClass}`} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="min-w-0 text-xs font-semibold text-muted">Rent cycle day<input type="number" min="1" max="28" {...propertyFormApi.register('rentDay')} className={`mt-1 block ${ownerInputClass}`} /></label>
                <label className="min-w-0 text-xs font-semibold text-muted">Rent due day<input type="number" min="1" max="28" {...propertyFormApi.register('rentDueDay')} className={`mt-1 block ${ownerInputClass}`} /></label>
              </div>
              <input placeholder="Amenities, separated by commas" {...propertyFormApi.register('amenities')} className={ownerInputClass} />
              <textarea rows={3} placeholder="House rules, one per line" {...propertyFormApi.register('houseRules')} className={`${ownerInputClass} resize-y`} />
              <div>
                <label className={ownerLabelClass}>Property photos</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => setPropertyPhotoFiles(Array.from(event.target.files || []))}
                  className="block w-full text-xs text-muted file:mr-3 file:rounded-[var(--radius-button)] file:border-0 file:bg-surface file:px-3 file:py-2 file:text-xs file:font-semibold"
                />
              </div>
              {existingPhotoUrls.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pt-1">
                  {existingPhotoUrls.map((photo) => (
                    <SecureImage key={photo} srcKey={photo} alt="Property" className="h-16 w-20 shrink-0 rounded-[var(--radius-field)] border border-hairline object-cover" />
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" disabled={saving} className="mt-5 w-full">
              <Plus className="h-4 w-4" /> {editingPropertyId ? 'Update property' : 'Save property'}
            </Button>
          </form>
        </Card>
      )}
    </section>
  );
}
