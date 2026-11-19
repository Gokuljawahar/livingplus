// The link an owner shares with residents: their PG's own resident site (/stay/<slug>).
import toast from 'react-hot-toast';
import { Copy, ExternalLink, Link2 } from 'lucide-react';
import { ROUTES } from '../utils/app-areas';

export default function ResidentSiteLink({ slug }: { slug: string }) {
  const url = `${window.location.origin}${ROUTES.residentSite(slug)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Resident link copied');
    } catch {
      toast.error('Could not copy. Select the link and copy it.');
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
      <Link2 className="h-4 w-4 shrink-0 text-amber-700" />
      <span className="font-semibold text-slate-700">Resident site</span>
      <span className="min-w-0 flex-1 truncate font-mono text-slate-600" title={url}>{url}</span>
      <button type="button" onClick={() => void copy()} aria-label="Copy resident link" className="inline-flex items-center gap-1 font-semibold text-[#02224B] hover:underline"><Copy className="h-3.5 w-3.5" /> Copy</button>
      <a href={url} target="_blank" rel="noreferrer" aria-label="Open resident site" className="inline-flex items-center gap-1 font-semibold text-[#02224B] hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Open</a>
    </div>
  );
}
