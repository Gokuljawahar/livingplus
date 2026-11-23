// The Living Plus mark and wordmark, the same on all three sites. On dark
// backgrounds the mark sits on a white tile so its navy house stays visible.
import mark from '../../assets/logo-mark.png';

export default function BrandLogo({ tone = 'light', size = 'md' }: { tone?: 'light' | 'dark'; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`flex ${box} shrink-0 items-center justify-center rounded-[10px] ${tone === 'dark' ? 'bg-white' : ''}`} aria-hidden="true">
        <img src={mark} alt="" className="h-[85%] w-[85%] object-contain" />
      </span>
      <span className={`font-display font-bold tracking-tight ${size === 'lg' ? 'text-2xl' : 'text-xl'} ${tone === 'dark' ? 'text-white' : 'text-navy-900'}`}>
        Living <span className="text-amber-500">Plus</span>
      </span>
    </span>
  );
}
