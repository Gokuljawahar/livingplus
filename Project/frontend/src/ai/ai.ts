import type {
  GenerativeModel,
  InferenceMode as FirebaseInferenceMode,
  Part,
  SchemaRequest,
  TypedSchema
} from 'firebase/ai';
import { ensureAppCheck } from './app-check';
import {
  checkOnDeviceModelStatus,
  recordInference
} from './device-model';
import { getLivingPlusFirebaseApp } from './firebase';
import {
  OWNER_DIGEST_PROMPT_V1,
  TRIAGE_PROMPTS,
  TRIAGE_PROMPT_V1,
  VIBE_ON_DEVICE_PROMPT_V1
} from './prompts';
import {
  getHybridRemoteConfig,
  type SymbolicInferenceMode
} from './remote-config';

export const MAINTENANCE_CATEGORIES = [
  'PLUMBING',
  'ELECTRICAL',
  'APPLIANCE',
  'CLEANING',
  'SAFETY',
  'PEST',
  'OTHER'
] as const;

export const MAINTENANCE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export interface HybridAIResult<T> {
  data: T;
  source: 'on-device' | 'cloud';
  latencyMs: number;
  modeUsed: SymbolicInferenceMode;
}

export interface MaintenanceTriageOutput {
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  title: string;
  description: string;
  safetyRisk: boolean;
  residentTip: string;
}

export interface VibeOnDeviceOutput {
  answers: Record<string, number | null>;
  summary: string;
}

export interface OwnerOpenTicketsDigest {
  bullets: string[];
  repeatedPatterns: string[];
}

export interface HybridModelOptions {
  multimodal?: boolean;
  responseSchema?: TypedSchema | SchemaRequest;
  responseJsonSchema?: Record<string, unknown>;
  systemInstruction?: string;
  cloudModelName?: string;
}

const MODE_MAP: Record<SymbolicInferenceMode, FirebaseInferenceMode> = {
  PREFER_ON_DEVICE: 'prefer_on_device',
  ONLY_ON_DEVICE: 'only_on_device',
  PREFER_IN_CLOUD: 'prefer_in_cloud',
  ONLY_IN_CLOUD: 'only_in_cloud'
};

function mapSymbolicMode(mode: SymbolicInferenceMode): FirebaseInferenceMode {
  return MODE_MAP[mode] ?? 'prefer_on_device';
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function parseJsonResponse<T>(rawText: string): T {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

function resolveSourceFromResponse(
  inferenceSource: string | undefined,
  mode: SymbolicInferenceMode,
  fallbackStatus: 'unavailable' | 'downloadable' | 'downloading' | 'ready'
): 'on-device' | 'cloud' {
  if (inferenceSource === 'on_device') return 'on-device';
  if (inferenceSource === 'in_cloud') return 'cloud';
  if (mode === 'ONLY_ON_DEVICE') return 'on-device';
  if (mode === 'PREFER_ON_DEVICE' && fallbackStatus === 'ready') return 'on-device';
  return 'cloud';
}

/**
 * Lazily initializes Firebase AI Logic (`firebase/ai` with `GoogleAIBackend`), ensures App Check,
 * and returns a hybrid `GenerativeModel` configured for on-device + cloud inference.
 */
export async function getHybridModel(
  mode: SymbolicInferenceMode,
  options: HybridModelOptions = {}
): Promise<GenerativeModel | null> {
  const app = await getLivingPlusFirebaseApp();
  if (!app) return null;

  await ensureAppCheck(app);

  const { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } = await import('firebase/ai');
  const ai = getAI(app, { backend: new GoogleAIBackend() });

  const rc = getHybridRemoteConfig();
  const cloudModel = options.cloudModelName || rc.cloud_model_name || 'gemini-2.5-flash';

  const resolvedMode =
    mode === 'ONLY_ON_DEVICE'
      ? InferenceMode.ONLY_ON_DEVICE
      : mode === 'ONLY_IN_CLOUD'
      ? InferenceMode.ONLY_IN_CLOUD
      : mode === 'PREFER_IN_CLOUD'
      ? InferenceMode.PREFER_IN_CLOUD
      : InferenceMode.PREFER_ON_DEVICE;

  const expectedInputs: Array<{ type: 'image' | 'text'; languages?: string[] }> = options.multimodal
    ? [{ type: 'image' }, { type: 'text', languages: ['en'] }]
    : [{ type: 'text', languages: ['en'] }];

  return getGenerativeModel(ai, {
    mode: resolvedMode ?? mapSymbolicMode(mode),
    inCloudParams: {
      model: cloudModel,
      ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
      generationConfig: {
        responseMimeType: 'application/json',
        ...(options.responseSchema ? { responseSchema: options.responseSchema } : {})
      }
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [...expectedInputs],
        expectedOutputs: [{ type: 'text', languages: ['en'] }]
      },
      ...(options.responseJsonSchema
        ? { promptOptions: { responseConstraint: options.responseJsonSchema } }
        : {})
    }
  });
}

function normalizeTriageOutput(raw: Partial<MaintenanceTriageOutput>): MaintenanceTriageOutput {
  const rawCat = String(raw.category || 'OTHER').toUpperCase() as MaintenanceCategory;
  const category: MaintenanceCategory = MAINTENANCE_CATEGORIES.includes(rawCat) ? rawCat : 'OTHER';

  const safetyRisk = Boolean(raw.safetyRisk);
  const rawPriority = String(raw.priority || 'NORMAL').toUpperCase() as MaintenancePriority;
  let priority: MaintenancePriority = MAINTENANCE_PRIORITIES.includes(rawPriority) ? rawPriority : 'NORMAL';

  // Critical safety rule: hazards must always be URGENT regardless of model priority estimate.
  if (safetyRisk) {
    priority = 'URGENT';
  }

  const title = String(raw.title || 'Maintenance issue').trim().slice(0, 120) || 'Maintenance issue';
  const description =
    String(raw.description || title).trim().slice(0, 1000) || 'Issue reported via resident Snap & Triage.';
  const residentTip =
    String(
      raw.residentTip ||
        (safetyRisk
          ? 'Keep clear of the hazard, turn off power/valve if safe, and alert the warden.'
          : 'Attach room details before submitting so staff can inspect faster.')
    )
      .trim()
      .slice(0, 160);

  return { category, priority, title, description, safetyRisk, residentTip };
}

const TRIAGE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: [...MAINTENANCE_CATEGORIES] },
    priority: { type: 'string', enum: [...MAINTENANCE_PRIORITIES] },
    title: { type: 'string' },
    description: { type: 'string' },
    safetyRisk: { type: 'boolean' },
    residentTip: { type: 'string' }
  },
  required: ['category', 'priority', 'title', 'description', 'safetyRisk', 'residentTip']
};

async function buildTriageResponseSchema() {
  const { Schema } = await import('firebase/ai');
  return Schema.object({
    properties: {
      category: Schema.enumString({ enum: [...MAINTENANCE_CATEGORIES] }),
      priority: Schema.enumString({ enum: [...MAINTENANCE_PRIORITIES] }),
      title: Schema.string(),
      description: Schema.string(),
      safetyRisk: Schema.boolean(),
      residentTip: Schema.string()
    }
  });
}

/**
 * Runs single-turn hybrid triage on a maintenance photo and/or text note using
 * `firebase/ai` (`PREFER_ON_DEVICE` by default via Remote Config).
 */
export async function triageMaintenanceIssue(input: {
  note?: string;
  imageBase64?: string;
  imageMimeType?: 'image/jpeg' | 'image/png';
  modeOverride?: SymbolicInferenceMode;
}): Promise<HybridAIResult<MaintenanceTriageOutput>> {
  const rc = getHybridRemoteConfig();
  const mode = input.modeOverride || rc.triage_inference_mode || 'PREFER_ON_DEVICE';
  const promptTemplate = TRIAGE_PROMPTS[rc.triage_prompt_version] || TRIAGE_PROMPT_V1;
  const promptText = input.note?.trim()
    ? `${promptTemplate}\n\nResident note: "${input.note.trim()}"`
    : `${promptTemplate}\n\nInspect the attached maintenance photo.`;

  const start = nowMs();
  const deviceStatus = await checkOnDeviceModelStatus();
  const schema = await buildTriageResponseSchema();

  const model = await getHybridModel(mode, {
    multimodal: Boolean(input.imageBase64),
    responseSchema: schema,
    responseJsonSchema: TRIAGE_JSON_SCHEMA
  });

  if (!model) {
    throw new Error('Firebase web config is missing. Configure VITE_FIREBASE_* in .env to run Firebase AI Logic.');
  }

  const parts: Array<string | Part> = [promptText];
  if (input.imageBase64) {
    parts.push({
      type: 'inlineData',
      inlineData: {
        mimeType: input.imageMimeType || 'image/jpeg',
        data: input.imageBase64
      }
    });
  }

  const result = await model.generateContent(parts);
  const latencyMs = Math.max(1, Math.round(nowMs() - start));
  const parsed = normalizeTriageOutput(parseJsonResponse<Partial<MaintenanceTriageOutput>>(result.response.text()));
  const source = resolveSourceFromResponse(result.response.inferenceSource, mode, deviceStatus);

  recordInference({ feature: 'Snap & Triage', source, latencyMs, mode });

  return {
    data: parsed,
    source,
    latencyMs,
    modeUsed: mode
  };
}

const VIBE_KEYS = ['sleep', 'wake', 'tidiness', 'noise', 'guests', 'kitchen', 'schedule', 'cooling'] as const;

const VIBE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    sleep: { type: ['integer', 'null'], minimum: 0, maximum: 2 },
    wake: { type: ['integer', 'null'], minimum: 0, maximum: 2 },
    tidiness: { type: ['integer', 'null'], minimum: 0, maximum: 2 },
    noise: { type: ['integer', 'null'], minimum: 0, maximum: 2 },
    guests: { type: ['integer', 'null'], minimum: 0, maximum: 2 },
    kitchen: { type: ['integer', 'null'], minimum: 0, maximum: 2 },
    schedule: { type: ['integer', 'null'], minimum: 0, maximum: 2 },
    cooling: { type: ['integer', 'null'], minimum: 0, maximum: 2 },
    summary: { type: 'string' }
  },
  required: [...VIBE_KEYS, 'summary']
};

/**
 * Extracts VibeCheck lifestyle habits purely on-device (`ONLY_ON_DEVICE`) so the
 * resident's free-text self-description never leaves the browser.
 */
export async function extractVibeHabitsOnDevice(text: string): Promise<HybridAIResult<VibeOnDeviceOutput>> {
  const start = nowMs();
  const status = await checkOnDeviceModelStatus();
  if (status === 'unavailable') {
    throw new Error('On-device Gemini Nano is unavailable in this browser.');
  }

  const { Schema } = await import('firebase/ai');
  const schema = Schema.object({
    properties: {
      sleep: Schema.integer({ nullable: true }),
      wake: Schema.integer({ nullable: true }),
      tidiness: Schema.integer({ nullable: true }),
      noise: Schema.integer({ nullable: true }),
      guests: Schema.integer({ nullable: true }),
      kitchen: Schema.integer({ nullable: true }),
      schedule: Schema.integer({ nullable: true }),
      cooling: Schema.integer({ nullable: true }),
      summary: Schema.string()
    }
  });

  const model = await getHybridModel('ONLY_ON_DEVICE', {
    multimodal: false,
    responseSchema: schema,
    responseJsonSchema: VIBE_JSON_SCHEMA
  });

  if (!model) {
    throw new Error('Firebase web config is missing for Firebase AI Logic.');
  }

  const result = await model.generateContent(`${VIBE_ON_DEVICE_PROMPT_V1}\n\nResident wrote:\n"${text.trim()}"`);
  const latencyMs = Math.max(1, Math.round(nowMs() - start));
  const raw = parseJsonResponse<Record<string, unknown>>(result.response.text());

  const answers: Record<string, number | null> = {};
  for (const key of VIBE_KEYS) {
    const val = raw[key];
    answers[key] = typeof val === 'number' && [0, 1, 2].includes(val) ? val : null;
  }

  const data: VibeOnDeviceOutput = {
    answers,
    summary: String(raw.summary || '').trim().slice(0, 240)
  };

  recordInference({ feature: 'VibeCheck On-Device', source: 'on-device', latencyMs, mode: 'ONLY_ON_DEVICE' });

  return {
    data,
    source: 'on-device',
    latencyMs,
    modeUsed: 'ONLY_ON_DEVICE'
  };
}

export interface OwnerTicketDigestInput {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  description?: string;
  tenantName?: string;
}

const OWNER_DIGEST_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    bullets: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
    repeatedPatterns: { type: 'array', items: { type: 'string' }, maxItems: 3 }
  },
  required: ['bullets', 'repeatedPatterns']
};

/**
 * Generates a 3-bullet cross-ticket digest for PG owners using `InferenceMode.ONLY_IN_CLOUD`
 * so cross-room reasoning runs on Cloud Gemini while resident triage runs on-device.
 */
export async function summarizeOwnerOpenTickets(
  tickets: OwnerTicketDigestInput[]
): Promise<HybridAIResult<OwnerOpenTicketsDigest>> {
  const start = nowMs();
  const { Schema } = await import('firebase/ai');
  const schema = Schema.object({
    properties: {
      bullets: Schema.array({ items: Schema.string() }),
      repeatedPatterns: Schema.array({ items: Schema.string() })
    }
  });

  const model = await getHybridModel('ONLY_IN_CLOUD', {
    multimodal: false,
    responseSchema: schema,
    responseJsonSchema: OWNER_DIGEST_JSON_SCHEMA
  });

  if (!model) {
    throw new Error('Firebase web config is missing for Cloud Gemini digest.');
  }

  const compactTickets = tickets.slice(0, 40).map((t) => ({
    title: t.title,
    category: t.category,
    priority: t.priority,
    status: t.status,
    details: (t.description || '').slice(0, 160)
  }));

  const result = await model.generateContent(
    `${OWNER_DIGEST_PROMPT_V1}\n\nOpen tickets (${compactTickets.length}):\n${JSON.stringify(compactTickets)}`
  );
  const latencyMs = Math.max(1, Math.round(nowMs() - start));
  const parsed = parseJsonResponse<Partial<OwnerOpenTicketsDigest>>(result.response.text());

  const data: OwnerOpenTicketsDigest = {
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 3).map(String) : [],
    repeatedPatterns: Array.isArray(parsed.repeatedPatterns) ? parsed.repeatedPatterns.slice(0, 3).map(String) : []
  };

  recordInference({ feature: 'Owner Ticket Digest', source: 'cloud', latencyMs, mode: 'ONLY_IN_CLOUD' });

  return {
    data,
    source: 'cloud',
    latencyMs,
    modeUsed: 'ONLY_IN_CLOUD'
  };
}
