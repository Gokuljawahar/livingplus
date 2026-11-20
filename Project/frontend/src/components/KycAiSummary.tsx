// What the AI read from a KYC document (DESIGN.md: one colour and one word per
// state). It assists the owner; only the owner marks KYC verified.
import { AlertTriangle, CheckCircle2, ScanText } from 'lucide-react';

export interface KycAiCheck {
  checkedAt: string;
  documentType: string;
  nameMatch: 'match' | 'partial' | 'mismatch' | 'unknown';
  typeMatch: boolean | null;
  idNumberLast4: string;
  legible: boolean;
  flags: string[];
}

const TYPE_LABELS: Record<string, string> = {
  AADHAAR: 'Aadhaar', PAN: 'PAN card', PASSPORT: 'Passport', DRIVING_LICENSE: 'Driving licence',
  STUDENT_ID: 'Student ID', WORK_ID: 'Work ID', OTHER_ID: 'Other ID', NOT_AN_ID: 'Not an ID'
};

export default function KycAiSummary({ check, audience }: { check: KycAiCheck | null | undefined; audience: 'owner' | 'resident' }) {
  if (!check) return null;
  const clean = check.flags.length === 0;
  return (
    <div className={`mt-2 rounded-[10px] px-3 py-2 text-sm ${clean ? 'bg-positive-bg text-positive' : 'bg-attention-bg text-attention'}`}>
      <p className="flex items-center gap-1.5 font-medium">
        {clean ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        <ScanText className="h-4 w-4" aria-hidden="true" />
        AI read a {TYPE_LABELS[check.documentType] ?? check.documentType}
        {check.idNumberLast4 ? ` ending ${check.idNumberLast4}` : ''}
        {check.nameMatch === 'match' ? ', name matches' : ''}
      </p>
      {!clean && (
        <ul className="mt-1 list-disc pl-6">
          {check.flags.map((flag) => <li key={flag}>{flag}</li>)}
        </ul>
      )}
      <p className="mt-1 text-[13px] opacity-90">
        {audience === 'owner' ? 'A check to help you. Look at the document before marking KYC verified.' : 'Your PG owner still reviews the document before verifying it.'}
      </p>
    </div>
  );
}
