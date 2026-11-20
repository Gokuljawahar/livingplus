// AI-assisted KYC (buildathon answers Q10/Q12): one structured Gemini call reads an
// uploaded ID and reports the document type, the name on it, the last 4
// digits of its number and whether it is legible. We compare that with what
// the resident declared and flag mismatches. The owner still verifies; the AI
// only helps. The full ID number is never requested or stored.
import { z } from 'zod';
import { KYC_TYPES } from '@livingplus/shared';
import { aiEnabled, generateStructured } from './ai-provider.js';
import { readStoredFile } from './storage.js';

export const MAX_KYC_BYTES = 8 * 1024 * 1024;

const extraction = z.object({
  documentType: z.enum([...KYC_TYPES, 'OTHER_ID', 'NOT_AN_ID']).describe('Which identity document this is'),
  nameOnDocument: z.string().describe('The holder name exactly as printed, or empty if unreadable'),
  idNumberLast4: z.string().describe('Only the last 4 characters of the document number, or empty'),
  legible: z.boolean().describe('Whether the name and number are clearly readable'),
  notes: z.array(z.string()).describe('Short plain-language problems, e.g. "photo is blurred", "document looks expired"')
});
export type KycExtraction = z.infer<typeof extraction>;

const PROMPT = [
  'You help a PG (paying-guest accommodation) owner check an identity document a resident uploaded.',
  'Look at the document and report only: the document type, the holder name as printed, the LAST 4 characters of the document number, whether it is legible, and short notes on any problems (blurred, cropped, expired, edited, not an ID).',
  'Never output the full document number, the address, the date of birth or the photo description.',
  'Indian document types: AADHAAR, PAN, PASSPORT, DRIVING_LICENSE, STUDENT_ID, WORK_ID. Use OTHER_ID for other IDs and NOT_AN_ID if it is not an identity document.'
].join(' ');

export interface KycCheck {
  checkedAt: string;
  documentType: string;
  /** "match" | "partial" | "mismatch" | "unknown" */
  nameMatch: 'match' | 'partial' | 'mismatch' | 'unknown';
  typeMatch: boolean | null;
  idNumberLast4: string;
  legible: boolean;
  flags: string[];
}

let override: ((data: Buffer, contentType: string) => Promise<KycExtraction>) | null = null;
/** Test hook: replace the model call (null restores). */
export function setKycReaderForTests(reader: typeof override): void {
  override = reader;
}

async function readDocument(data: Buffer, contentType: string): Promise<KycExtraction> {
  if (override) return override(data, contentType);
  if (!aiEnabled()) throw new Error('AI_ORCHESTRATOR_NOT_CONFIGURED');
  return generateStructured({
    system: 'You read identity documents for a paying-guest housing platform. Answer with one JSON object only.',
    parts: [{ text: PROMPT }, { inlineData: { mimeType: contentType, data: data.toString('base64') } }],
    schema: extraction
  });
}

const tokens = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1);

/** How well the printed name matches the name the resident gave. */
export function compareNames(declared: string, printed: string): KycCheck['nameMatch'] {
  const a = tokens(declared);
  const b = tokens(printed);
  if (!a.length || !b.length) return 'unknown';
  const shared = a.filter((t) => b.includes(t)).length;
  if (shared === Math.min(a.length, b.length)) return 'match';
  return shared > 0 ? 'partial' : 'mismatch';
}

export async function checkKycDocument(input: { fileKey: string; declaredType: string | null; residentName: string }): Promise<KycCheck> {
  const { data, contentType } = await readStoredFile(input.fileKey);
  if (!data.length || data.length > MAX_KYC_BYTES) throw new Error('KYC_FILE_INVALID');
  const found = await readDocument(data, contentType);
  const nameMatch = compareNames(input.residentName, found.nameOnDocument || '');
  const typeMatch = input.declaredType ? found.documentType === input.declaredType : null;
  const flags = [
    ...(found.documentType === 'NOT_AN_ID' ? ['This does not look like an identity document'] : []),
    ...(!found.legible ? ['Name or number is hard to read'] : []),
    ...(nameMatch === 'mismatch' ? ['Name on the document does not match the resident'] : nameMatch === 'partial' ? ['Name only partly matches the resident'] : []),
    ...(typeMatch === false ? [`Uploaded as ${input.declaredType?.replace('_', ' ').toLowerCase()}, but looks like ${found.documentType.replace('_', ' ').toLowerCase()}`] : []),
    ...found.notes.slice(0, 3)
  ];
  return {
    checkedAt: new Date().toISOString(),
    documentType: found.documentType,
    nameMatch,
    typeMatch,
    idNumberLast4: String(found.idNumberLast4 || '').replace(/\s/g, '').slice(-4),
    legible: found.legible,
    flags
  };
}
