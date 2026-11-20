import type { ReactElement } from 'react';

// Shown when a PG has no photos yet: a simple building drawing that varies by
// PG (floors, lit windows, sky tint), so a page of new listings doesn't read as
// a wall of identical grey boxes. Says plainly that photos are missing.
const SKIES = ['var(--color-info-bg)', 'var(--color-amber-50)', 'var(--color-positive-bg)', 'var(--color-surface)'];

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

export default function PgPlaceholder({ name }: { name: string }) {
  const seed = hash(name);
  const floors = 3 + (seed % 3);
  const columns = 3 + ((seed >> 3) % 2);
  const sky = SKIES[(seed >> 5) % SKIES.length];
  const floorHeight = 22;
  const width = columns * 22 + 16;
  const height = floors * floorHeight + 30;
  const left = (240 - width) / 2;
  const top = 160 - height;
  const windows: ReactElement[] = [];
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      const lit = ((seed >> ((floor * columns + column) % 24)) & 3) === 0;
      windows.push(
        <rect key={`${floor}-${column}`} x={left + 10 + column * 22} y={top + 12 + floor * floorHeight} width="12" height="12" rx="2"
          fill={lit ? 'var(--color-amber-500)' : 'var(--color-canvas)'} opacity={lit ? 0.9 : 0.85} />
      );
    }
  }
  return (
    <div className="relative h-full w-full" style={{ background: sky }} aria-hidden="true">
      <svg viewBox="0 0 240 180" className="h-full w-full" preserveAspectRatio="xMidYMax meet">
        <rect x="0" y="160" width="240" height="20" fill="var(--color-navy-900)" opacity="0.06" />
        <rect x={left - 26} y={top + 40} width="22" height={height - 40} rx="3" fill="var(--color-navy-900)" opacity="0.08" />
        <rect x={left + width + 4} y={top + 24} width="26" height={height - 24} rx="3" fill="var(--color-navy-900)" opacity="0.08" />
        <rect x={left} y={top} width={width} height={height} rx="4" fill="var(--color-navy-700)" opacity="0.85" />
        {windows}
        <rect x={left + width / 2 - 8} y={160 - 20} width="16" height="20" rx="2" fill="var(--color-canvas)" opacity="0.9" />
      </svg>
      <span className="absolute bottom-2 right-3 text-xs font-medium text-muted">No photos yet</span>
    </div>
  );
}
