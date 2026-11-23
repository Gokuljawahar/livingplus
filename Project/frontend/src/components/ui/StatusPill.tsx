import { statusLabel, statusTone, TONES } from '../../utils/status';

export default function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium ${TONES[statusTone(status)]} ${className}`}>
      {statusLabel(status)}
    </span>
  );
}
