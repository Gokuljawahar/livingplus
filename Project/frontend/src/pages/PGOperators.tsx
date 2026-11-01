import { useEffect, useState } from 'react';
import { BedDouble, Loader2, MapPin, Plus, Search, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

type Operator = {
  id: string;
  name: string;
  locality: string;
  city: string;
  genderPolicy: string;
  status: string;
  owner: { id: string; name: string; phone: string; email?: string | null } | null;
  rooms: { id: string; totalBeds: number; occupiedBeds: number }[];
};

const emptyForm = {
  ownerName: '',
  propertyName: '',
  email: '',
  phone: '',
  password: '',
  address: '',
  locality: '',
  city: 'Chennai',
  genderPolicy: 'ANY',
  amenities: ''
};

export default function PGOperators() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const loadOperators = async () => {
    try {
      setLoading(true);
      const response = await api.get('/pg/admin/operators');
      setOperators(response.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not load PG operators');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOperators();
  }, []);

  const filteredOperators = operators.filter((operator) => {
    const query = search.trim().toLowerCase();
    return !query || `${operator.name} ${operator.locality} ${operator.city} ${operator.owner?.name || ''} ${operator.owner?.phone || ''}`.toLowerCase().includes(query);
  });

  const createOperator = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/pg/admin/operators', {
        ...form,
        amenities: form.amenities.split(',').map((item) => item.trim()).filter(Boolean)
      });
      toast.success('PG owner and property created');
      setForm(emptyForm);
      setShowCreateForm(false);
      await loadOperators();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not create PG operator');
    } finally {
      setSaving(false);
    }
  };

  const deleteProperty = async (operator: Operator) => {
    if (!window.confirm(`Delete ${operator.name}? Active tenants and bookings must be resolved first.`)) return;
    try {
      await api.delete(`/pg/admin/operators/${operator.id}`);
      toast.success('PG property deleted');
      await loadOperators();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Could not delete PG property');
    }
  };

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">Platform administration</p>
          <h1 className="mt-1 text-2xl font-bold text-[#02224B]">PG Operators</h1>
          <p className="mt-1 text-sm text-slate-500">Manage PG owner accounts and their properties.</p>
        </div>
        <button onClick={() => setShowCreateForm((open) => !open)} className="inline-flex items-center justify-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0A3B75]">
          <Plus className="h-4 w-4" /> Add PG operator
        </button>
      </header>

      {showCreateForm && <form onSubmit={createOperator} className="border border-slate-200 bg-white p-5 md:p-6">
        <div className="flex items-center justify-between gap-4"><h2 className="font-semibold text-slate-900">Create owner and first property</h2><button type="button" onClick={() => setShowCreateForm(false)} className="text-sm font-semibold text-slate-500">Cancel</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <input required placeholder="Owner full name" value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm" />
          <input required type="tel" placeholder="Owner phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm" />
          <input type="email" placeholder="Email (optional)" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm" />
          <input required type="password" minLength={8} placeholder="Temporary password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm" />
          <input required placeholder="PG / hostel name" value={form.propertyName} onChange={(event) => setForm({ ...form, propertyName: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm" />
          <input required placeholder="Street address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm" />
          <input required placeholder="Locality" value={form.locality} onChange={(event) => setForm({ ...form, locality: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm" />
          <input required placeholder="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm" />
          <select value={form.genderPolicy} onChange={(event) => setForm({ ...form, genderPolicy: event.target.value })} className="border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="ANY">All residents</option><option value="WOMEN">Women</option><option value="MEN">Men</option></select>
          <input placeholder="Amenities, separated by commas" value={form.amenities} onChange={(event) => setForm({ ...form, amenities: event.target.value })} className="border border-slate-300 px-3 py-2.5 text-sm sm:col-span-2 xl:col-span-3" />
        </div>
        <button disabled={saving} className="mt-4 inline-flex items-center gap-2 bg-[#02224B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create owner account</button>
      </form>}

      <label className="flex max-w-lg items-center gap-3 border-b-2 border-slate-300 px-1 py-3 focus-within:border-[#02224B]">
        <Search className="h-5 w-5 shrink-0 text-slate-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search owner, PG, locality, or phone" className="w-full bg-transparent text-sm outline-none" />
      </label>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#02224B]" /></div> : (
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {filteredOperators.map((operator) => {
            const beds = operator.rooms.reduce((total, room) => total + room.totalBeds, 0);
            const occupied = operator.rooms.reduce((total, room) => total + room.occupiedBeds, 0);
            return <article key={operator.id} className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-[#02224B]">{operator.name}</h2><span className="border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">{operator.genderPolicy === 'ANY' ? 'Co-living' : operator.genderPolicy}</span></div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4" />{operator.locality}, {operator.city}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600"><span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{operator.owner?.name || 'Owner not assigned'} · {operator.owner?.phone || ''}</span><span className="inline-flex items-center gap-1.5"><BedDouble className="h-4 w-4" />{occupied}/{beds} beds occupied</span></p>
              </div>
              <button onClick={() => void deleteProperty(operator)} className="inline-flex shrink-0 items-center gap-2 border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 className="h-4 w-4" />Delete PG</button>
            </article>;
          })}
          {!filteredOperators.length && <p className="py-10 text-center text-sm text-slate-500">No PG operators found.</p>}
        </div>
      )}
    </section>
  );
}
