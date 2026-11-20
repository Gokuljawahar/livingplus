// Timestamped move-in / move-out room condition (notes + photos). Records can be
// added by staff or the resident and are never edited, so they settle deposit
// questions fairly at move-out.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { apiErrorMessage } from '../utils/api-error';

type Report = { id: string; kind: 'MOVE_IN' | 'MOVE_OUT'; notes?: string | null; photoUrls: string[]; photoViews?: (string | null)[]; createdByRole?: string | null; createdAt: string };

const KIND = { MOVE_IN: 'Move-in', MOVE_OUT: 'Move-out' };
const BY: Record<string, string> = { RESIDENT: 'resident', PG_OWNER: 'owner', PG_WARDEN: 'warden' };

export default function ConditionRecords({ tenantId, viewer }: { tenantId: string; viewer: 'staff' | 'resident' }) {
  const queryClient = useQueryClient();
  const queryKey = ['condition-reports', tenantId];
  const { data: reports = [], isPending } = useQuery({
    queryKey,
    queryFn: async (): Promise<Report[]> => (await api.get('/pg/condition-reports', { params: { tenantId } })).data
  });
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<'MOVE_IN' | 'MOVE_OUT'>('MOVE_IN');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!notes.trim() && !files.length) {
      toast.error('Add a photo or a note');
      return;
    }
    setSaving(true);
    try {
      const photoUrls: string[] = [];
      for (const file of files.slice(0, 8)) {
        const upload = new FormData();
        upload.append('image', file);
        photoUrls.push((await api.post('/upload-s3', upload, { headers: { 'Content-Type': 'multipart/form-data' } })).data.fileKey);
      }
      await api.post('/pg/condition-reports', { tenantId, kind, notes, photoUrls });
      toast.success(`${KIND[kind]} record saved`);
      setAdding(false);
      setNotes('');
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the record'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Room condition records" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-sans text-base font-semibold text-navy-900">Room condition</h4>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="btn-secondary min-h-9 px-3 py-1.5 text-sm">
            <Camera className="h-4 w-4" aria-hidden="true" /> Add a record
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        {viewer === 'resident'
          ? 'Photograph the room when you move in and when you leave. Records can\'t be changed later, so they protect your deposit.'
          : 'Timestamped photos and notes from move-in and move-out. Records can\'t be changed later.'}
      </p>

      {adding && (
        <form onSubmit={save} className="mt-3 space-y-3 rounded-[14px] border border-hairline bg-surface p-4">
          <fieldset className="flex gap-2">
            <legend className="sr-only">Record type</legend>
            {(['MOVE_IN', 'MOVE_OUT'] as const).map((value) => (
              <label key={value} className={`flex min-h-11 cursor-pointer items-center rounded-[10px] border px-3 ${kind === value ? 'border-navy-900 bg-amber-50 font-medium text-navy-900' : 'border-hairline bg-white'}`}>
                <input type="radio" name={`kind-${tenantId}`} className="sr-only" checked={kind === value} onChange={() => setKind(value)} />
                {KIND[value]}
              </label>
            ))}
          </fieldset>
          <label className="block text-sm font-medium text-navy-900">
            Photos <span className="font-normal text-muted">(up to 8)</span>
            <input type="file" accept="image/*" capture="environment" multiple onChange={(event) => setFiles([...(event.target.files ?? [])].slice(0, 8))} className="mt-1 block w-full text-sm" />
          </label>
          <label className="block text-sm font-medium text-navy-900">
            Notes
            <textarea rows={2} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="e.g. Wardrobe hinge loose, window has a small crack" className="mt-1 block w-full rounded-[6px] border border-field-border bg-white px-3 py-2" />
          </label>
          <div className="flex gap-2">
            <button disabled={saving} className="btn-secondary">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save record</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 px-3 font-medium text-muted hover:text-navy-900">Cancel</button>
          </div>
        </form>
      )}

      {isPending ? null : reports.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No records yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="rounded-[14px] border border-hairline bg-white p-3">
              <p className="text-sm">
                <span className="font-semibold text-navy-900">{KIND[report.kind]}</span>
                <span className="text-muted"> · {new Date(report.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · by {BY[report.createdByRole || ''] ?? 'staff'}</span>
              </p>
              {report.notes && <p className="mt-1 text-ink">{report.notes}</p>}
              {report.photoUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {report.photoUrls.map((key, index) => (
                    <img key={key} src={report.photoViews?.[index] ?? undefined} alt={`${KIND[report.kind]} photo`} loading="lazy" className="h-20 w-24 rounded-[10px] bg-surface object-cover" />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
