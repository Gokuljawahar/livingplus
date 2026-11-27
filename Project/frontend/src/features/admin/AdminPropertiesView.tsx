import { useState } from 'react';
import {
  BedDouble,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { SecureImage } from '../../components/SecureImage';
import { labelFromCatalog, usePlatformCatalog } from '../../hooks/usePlatformCatalog';
import { apiErrorMessage } from '../../utils/api-error';
import { ROUTES } from '../../utils/app-areas';
import { rupees } from '../../utils/money';
import type { AdminProperty } from './types';

interface Props {
  properties: AdminProperty[];
  loading: boolean;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  search: string;
  setSearch: (search: string) => void;
  onChanged: () => void;
}

export default function AdminPropertiesView({
  properties,
  loading,
  statusFilter,
  setStatusFilter,
  search,
  setSearch,
  onChanged
}: Props) {
  const { catalog } = usePlatformCatalog();
  const [editing, setEditing] = useState<AdminProperty | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    tagline: string;
    description: string;
    locality: string;
    amenities: string;
    foodDetails: string;
    houseRules: string;
  } | null>(null);
  const [newRoom, setNewRoom] = useState({
    roomNumber: '',
    roomType: 'DOUBLE',
    monthlyRent: '',
    depositAmount: '',
    numberOfBeds: '2',
    hasAc: false,
    foodIncluded: false
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const openEditor = (property: AdminProperty) => {
    setEditing(property);
    setEditDraft({
      name: property.name,
      tagline: property.tagline || '',
      description: property.description || '',
      locality: property.locality,
      amenities: (property.amenities || []).join(', '),
      foodDetails: property.foodDetails || '',
      houseRules: (property.houseRules || []).join('\n')
    });
  };

  const patchProperty = async (propertyId: string, body: Record<string, unknown>, message: string) => {
    setBusyId(propertyId);
    try {
      await api.patch(`/admin/properties/${propertyId}`, body);
      toast.success(message);
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update property'));
    } finally {
      setBusyId(null);
    }
  };

  const saveEditDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !editDraft) return;
    await patchProperty(
      editing.id,
      {
        name: editDraft.name,
        tagline: editDraft.tagline,
        description: editDraft.description,
        locality: editDraft.locality,
        amenities: editDraft.amenities.split(',').map((s) => s.trim()).filter(Boolean),
        foodDetails: editDraft.foodDetails,
        houseRules: editDraft.houseRules.split('\n').map((s) => s.trim()).filter(Boolean)
      },
      'Property listing updated'
    );
    setEditing(null);
  };

  const addRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusyId(editing.id);
    try {
      const res = await api.post(`/admin/properties/${editing.id}/rooms`, newRoom);
      setEditing({ ...editing, rooms: [...editing.rooms, res.data] });
      setNewRoom({
        roomNumber: '',
        roomType: 'DOUBLE',
        monthlyRent: '',
        depositAmount: '',
        numberOfBeds: '2',
        hasAc: false,
        foodIncluded: false
      });
      toast.success('Room added');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not add room'));
    } finally {
      setBusyId(null);
    }
  };

  const removeRoom = async (roomId: string) => {
    if (!editing) return;
    setBusyId(roomId);
    try {
      await api.delete(`/admin/properties/${editing.id}/rooms/${roomId}`);
      setEditing({ ...editing, rooms: editing.rooms.filter((r) => r.id !== roomId) });
      toast.success('Room removed');
      onChanged();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not remove room'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-hairline bg-canvas p-4">
        <div className="flex flex-wrap gap-1.5">
          {[
            { value: '', label: 'All PGs' },
            { value: 'ACTIVE', label: 'Published' },
            { value: 'INACTIVE', label: 'Drafts' }
          ].map((tab) => (
            <button
              key={tab.value || 'all'}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                statusFilter === tab.value ? 'bg-navy-900 text-white' : 'bg-surface text-ink hover:bg-hairline'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PG name or locality..."
            aria-label="Search marketplace properties"
            className="w-full rounded-[var(--radius-field)] border border-hairline bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-navy-900 focus:bg-canvas"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-navy-900" /></div>
      ) : properties.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-hairline bg-canvas p-10 text-center">
          <p className="font-semibold text-navy-900">No properties found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((property) => {
            const isLive = property.status === 'ACTIVE';
            const typeLabel = labelFromCatalog(catalog.propertyTypes, property.propertyType, true) || property.propertyType;
            return (
              <article key={property.id} className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-hairline bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  {property.photoUrls?.[0] ? (
                    <SecureImage srcKey={property.photoUrls[0]} alt={property.name} className="hidden h-20 w-28 shrink-0 rounded-[var(--radius-field)] object-cover sm:block" />
                  ) : (
                    <div className="hidden h-20 w-28 shrink-0 items-center justify-center rounded-[var(--radius-field)] bg-surface text-muted sm:flex">
                      <BedDouble className="h-7 w-7" />
                    </div>
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isLive ? 'bg-positive-bg text-positive' : 'bg-closed-bg text-muted'}`}>
                        {isLive ? 'Published' : 'Draft'}
                      </span>
                      <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold text-navy-900">
                        {typeLabel} · {property.genderPolicy}
                      </span>
                      {property.featured && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-navy-900">
                          <Sparkles className="h-3 w-3 text-amber-600" /> Featured
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-base font-bold text-navy-900">{property.name}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {property.locality}, {property.city}</span>
                      <span>{property.rooms.length} rooms · {property.availableBeds}/{property.totalBeds} beds open</span>
                      {property.owner && <span>Owner: <strong className="text-ink">{property.owner.name}</strong> ({property.owner.phone})</span>}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === property.id}
                    onClick={() => void patchProperty(property.id, { featured: !property.featured }, property.featured ? 'Removed from Featured' : 'Marked as Featured')}
                    className={`btn-secondary min-h-9 px-3 py-1.5 text-xs ${property.featured ? 'border-amber-500 bg-amber-50' : ''}`}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> {property.featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === property.id}
                    onClick={() => void patchProperty(property.id, { status: isLive ? 'INACTIVE' : 'ACTIVE' }, isLive ? 'Moved to drafts' : 'Published live')}
                    className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
                  >
                    {isLive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {isLive ? 'Unpublish' : 'Publish'}
                  </button>
                  <button type="button" onClick={() => openEditor(property)} className="btn-secondary min-h-9 px-3 py-1.5 text-xs">
                    <Pencil className="h-3.5 w-3.5" /> Edit / Rooms
                  </button>
                  {isLive && (
                    <a
                      href={ROUTES.propertyDetail(property.slug || property.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary min-h-9 px-3 py-1.5 text-xs"
                    >
                      View Live <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && editDraft && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-navy-900/50 sm:items-center sm:p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--radius-card)] bg-canvas shadow-[var(--shadow-float)] sm:rounded-[var(--radius-card)]"
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-navy-900">Edit {editing.name}</h2>
                <p className="text-xs text-muted">Update marketplace details or add rooms</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 overflow-y-auto p-5">
              <form onSubmit={saveEditDraft} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-navy-900">
                    PG Name
                    <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} className="mt-1 block w-full rounded-[var(--radius-field)] border border-field-border px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs font-semibold text-navy-900">
                    Locality
                    <input value={editDraft.locality} onChange={(e) => setEditDraft({ ...editDraft, locality: e.target.value })} className="mt-1 block w-full rounded-[var(--radius-field)] border border-field-border px-3 py-2 text-sm" />
                  </label>
                </div>
                <label className="block text-xs font-semibold text-navy-900">
                  Tagline
                  <input value={editDraft.tagline} onChange={(e) => setEditDraft({ ...editDraft, tagline: e.target.value })} className="mt-1 block w-full rounded-[var(--radius-field)] border border-field-border px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-semibold text-navy-900">
                  Description
                  <textarea rows={2} value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} className="mt-1 block w-full rounded-[var(--radius-field)] border border-field-border px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-semibold text-navy-900">
                  Amenities (comma-separated)
                  <input value={editDraft.amenities} onChange={(e) => setEditDraft({ ...editDraft, amenities: e.target.value })} className="mt-1 block w-full rounded-[var(--radius-field)] border border-field-border px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-semibold text-navy-900">
                  Food details
                  <input value={editDraft.foodDetails} onChange={(e) => setEditDraft({ ...editDraft, foodDetails: e.target.value })} className="mt-1 block w-full rounded-[var(--radius-field)] border border-field-border px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-semibold text-navy-900">
                  House rules (one per line)
                  <textarea rows={2} value={editDraft.houseRules} onChange={(e) => setEditDraft({ ...editDraft, houseRules: e.target.value })} className="mt-1 block w-full rounded-[var(--radius-field)] border border-field-border px-3 py-2 text-sm" />
                </label>
                <button type="submit" disabled={busyId === editing.id} className="btn-primary text-xs">
                  Save listing changes
                </button>
              </form>

              <div className="border-t border-hairline pt-4">
                <h3 className="text-sm font-bold text-navy-900">Rooms ({editing.rooms.length})</h3>
                <div className="mt-2 space-y-2">
                  {editing.rooms.map((room) => (
                    <div key={room.id} className="flex items-center justify-between rounded-[var(--radius-field)] border border-hairline bg-surface px-3 py-2 text-xs">
                      <span>
                        <strong>Room {room.roomNumber}</strong> · {room.roomType} · {rupees(room.monthlyRent)}/mo · {room.beds.length} beds
                      </span>
                      <button type="button" onClick={() => void removeRoom(room.id)} className="text-negative hover:underline">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={addRoom} className="mt-4 grid gap-2 rounded-[var(--radius-field)] border border-hairline bg-surface p-3 sm:grid-cols-4">
                  <input required placeholder="Room #" value={newRoom.roomNumber} onChange={(e) => setNewRoom({ ...newRoom, roomNumber: e.target.value })} className="rounded-[var(--radius-field)] border border-hairline bg-canvas px-2.5 py-1.5 text-xs" />
                  <select value={newRoom.roomType} onChange={(e) => setNewRoom({ ...newRoom, roomType: e.target.value })} className="rounded-[var(--radius-field)] border border-hairline bg-canvas px-2.5 py-1.5 text-xs">
                    <option value="PRIVATE">Private</option>
                    <option value="DOUBLE">2 sharing</option>
                    <option value="TRIPLE">3 sharing</option>
                    <option value="SHARED">Shared</option>
                  </select>
                  <input required type="number" placeholder="Rent ₹" value={newRoom.monthlyRent} onChange={(e) => setNewRoom({ ...newRoom, monthlyRent: e.target.value })} className="rounded-[var(--radius-field)] border border-hairline bg-canvas px-2.5 py-1.5 text-xs" />
                  <input required type="number" min="1" max="20" placeholder="Beds" value={newRoom.numberOfBeds} onChange={(e) => setNewRoom({ ...newRoom, numberOfBeds: e.target.value })} className="rounded-[var(--radius-field)] border border-hairline bg-canvas px-2.5 py-1.5 text-xs" />
                  <button type="submit" className="btn-secondary min-h-8 text-xs sm:col-span-4">
                    <Plus className="h-3.5 w-3.5" /> Add room to {editing.name}
                  </button>
                </form>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
