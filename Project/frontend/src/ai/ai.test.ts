import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractVibeHabitsOnDevice,
  summarizeOwnerOpenTickets,
  triageMaintenanceIssue
} from './ai';
import { _resetDeviceModelForTests } from './device-model';
import { _resetFirebaseCacheForTests } from './firebase';
import {
  _resetHybridConfigForTests,
  setHybridConfigOverride
} from './remote-config';

const mocks = vi.hoisted(() => ({
  getApps: vi.fn(),
  initializeApp: vi.fn(),
  getAI: vi.fn(),
  getGenerativeModel: vi.fn(),
  generateContent: vi.fn(),
  initializeDeviceModel: vi.fn(),
  initializeAppCheck: vi.fn(),
  getRemoteConfig: vi.fn(),
  fetchAndActivate: vi.fn(),
  getValue: vi.fn(),
  rcIsSupported: vi.fn()
}));

vi.mock('firebase/app', () => ({
  getApps: mocks.getApps,
  initializeApp: mocks.initializeApp
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: mocks.initializeAppCheck,
  ReCaptchaV3Provider: class {},
  ReCaptchaEnterpriseProvider: class {}
}));

vi.mock('firebase/remote-config', () => ({
  getRemoteConfig: mocks.getRemoteConfig,
  fetchAndActivate: mocks.fetchAndActivate,
  getValue: mocks.getValue,
  isSupported: mocks.rcIsSupported
}));

vi.mock('firebase/ai', () => ({
  InferenceMode: {
    PREFER_ON_DEVICE: 'prefer_on_device',
    ONLY_ON_DEVICE: 'only_on_device',
    ONLY_IN_CLOUD: 'only_in_cloud',
    PREFER_IN_CLOUD: 'prefer_in_cloud'
  },
  InferenceSource: {
    ON_DEVICE: 'on_device',
    IN_CLOUD: 'in_cloud'
  },
  AgentPlatformBackend: class {},
  GoogleAIBackend: class {},
  Schema: {
    object: (cfg: unknown) => ({ type: 'object', ...(cfg as object) }),
    enumString: (cfg: unknown) => ({ type: 'string', ...(cfg as object) }),
    string: (cfg?: unknown) => ({ type: 'string', ...(cfg as object) }),
    integer: (cfg?: unknown) => ({ type: 'integer', ...(cfg as object) }),
    boolean: (cfg?: unknown) => ({ type: 'boolean', ...(cfg as object) }),
    array: (cfg: unknown) => ({ type: 'array', ...(cfg as object) })
  },
  getAI: mocks.getAI,
  getGenerativeModel: mocks.getGenerativeModel
}));

vi.mock('../api/axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        phoneVerification: {
          provider: 'firebase',
          firebase: {
            apiKey: 'AIzaTestWebKey',
            authDomain: 'livingplus-test.firebaseapp.com',
            projectId: 'livingplus-test',
            appId: '1:123:web:abc'
          }
        }
      }
    })
  }
}));

describe('Firebase AI Logic hybrid layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetFirebaseCacheForTests();
    _resetDeviceModelForTests();
    _resetHybridConfigForTests();

    const fakeApp = { name: 'livingplus' };
    mocks.getApps.mockReturnValue([fakeApp]);
    mocks.getAI.mockReturnValue({ app: fakeApp });
    mocks.getGenerativeModel.mockReturnValue({
      generateContent: mocks.generateContent,
      initializeDeviceModel: mocks.initializeDeviceModel
    });
    (globalThis as Record<string, unknown>).LanguageModel = undefined;
  });

  it('uses PREFER_ON_DEVICE by default and detects ON_DEVICE inferenceSource', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      response: {
        inferenceSource: 'on_device',
        text: () =>
          JSON.stringify({
            category: 'APPLIANCE',
            priority: 'NORMAL',
            title: 'Ceiling fan rattling in Room 204',
            description: 'Resident reports loud bearing noise from ceiling fan.',
            safetyRisk: false,
            residentTip: 'Switch off the fan regulator until inspection.'
          })
      }
    });

    const result = await triageMaintenanceIssue({ note: 'fan making loud noise' });

    expect(mocks.getGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        mode: 'prefer_on_device',
        inCloudParams: expect.objectContaining({ model: expect.any(String) }),
        onDeviceParams: expect.objectContaining({
          createOptions: expect.objectContaining({
            expectedInputs: [{ type: 'text', languages: ['en'] }]
          })
        })
      })
    );
    expect(result.source).toBe('on-device');
    expect(result.modeUsed).toBe('PREFER_ON_DEVICE');
    expect(result.data.category).toBe('APPLIANCE');
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('falls back cleanly to cloud inferenceSource when on-device is unavailable', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      response: {
        inferenceSource: 'in_cloud',
        text: () =>
          JSON.stringify({
            category: 'PLUMBING',
            priority: 'HIGH',
            title: 'Washbasin pipe leaking continuously',
            description: 'Water dripping under sink pipe in bathroom.',
            safetyRisk: false,
            residentTip: 'Keep a bucket underneath and close the angle valve.'
          })
      }
    });

    const result = await triageMaintenanceIssue({
      imageBase64: 'ZmFrZQ==',
      imageMimeType: 'image/jpeg'
    });

    expect(mocks.getGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        onDeviceParams: expect.objectContaining({
          createOptions: expect.objectContaining({
            expectedInputs: [{ type: 'image' }, { type: 'text', languages: ['en'] }]
          })
        })
      })
    );
    expect(result.source).toBe('cloud');
    expect(result.data.category).toBe('PLUMBING');
    expect(result.data.priority).toBe('HIGH');
  });

  it('forces URGENT priority when safetyRisk is true', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      response: {
        inferenceSource: 'on_device',
        text: () =>
          JSON.stringify({
            category: 'ELECTRICAL',
            priority: 'NORMAL',
            title: 'Sparking wall socket near geyser',
            description: 'Burnt marks and sparks coming from bathroom power socket.',
            safetyRisk: true,
            residentTip: 'Do not touch the switchboard. Turn off the room MCB immediately.'
          })
      }
    });

    const result = await triageMaintenanceIssue({ note: 'sparking socket near shower' });

    expect(result.data.safetyRisk).toBe(true);
    expect(result.data.priority).toBe('URGENT');
    expect(result.data.residentTip).toContain('MCB');
  });

  it('respects Remote Config / debug mode override (e.g. ONLY_IN_CLOUD)', async () => {
    setHybridConfigOverride({ triage_inference_mode: 'ONLY_IN_CLOUD' });
    mocks.generateContent.mockResolvedValueOnce({
      response: {
        inferenceSource: 'in_cloud',
        text: () =>
          JSON.stringify({
            category: 'CLEANING',
            priority: 'LOW',
            title: 'Corridor sweeping needed',
            description: 'Dust accumulated near stairs.',
            safetyRisk: false,
            residentTip: 'Housekeeping visits every morning at 9 AM.'
          })
      }
    });

    const result = await triageMaintenanceIssue({ note: 'hallway dusty' });

    expect(mocks.getGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'only_in_cloud' })
    );
    expect(result.source).toBe('cloud');
    expect(result.modeUsed).toBe('ONLY_IN_CLOUD');
  });

  it('throws on extractVibeHabitsOnDevice when Prompt API is unavailable, and succeeds when ready', async () => {
    await expect(extractVibeHabitsOnDevice('I study late till 1 am')).rejects.toThrow(/unavailable/i);

    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: vi.fn().mockResolvedValue('readily')
    };
    mocks.generateContent.mockResolvedValueOnce({
      response: {
        inferenceSource: 'on_device',
        text: () =>
          JSON.stringify({
            sleep: 2,
            wake: 2,
            tidiness: 0,
            noise: 0,
            guests: 0,
            kitchen: 1,
            schedule: 1,
            cooling: 1,
            summary: 'Quiet night-owl who keeps a tidy desk.'
          })
      }
    });

    const vibe = await extractVibeHabitsOnDevice('Night owl, tidy desk, quiet room');
    expect(mocks.getGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'only_on_device' })
    );
    expect(vibe.source).toBe('on-device');
    expect(vibe.data.answers.sleep).toBe(2);
    expect(vibe.data.summary).toContain('Quiet');
  });

  it('uses ONLY_IN_CLOUD for summarizeOwnerOpenTickets', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      response: {
        inferenceSource: 'in_cloud',
        text: () =>
          JSON.stringify({
            bullets: [
              '1 URGENT electrical socket sparking ticket needs immediate technician visit.',
              '2 rooms on Floor 2 reported low water pressure.',
              '1 routine hallway cleaning ticket queued for morning.'
            ],
            repeatedPatterns: ['Low water pressure reported in multiple Floor 2 rooms']
          })
      }
    });

    const digest = await summarizeOwnerOpenTickets([
      { id: '1', title: 'Sparking socket', category: 'ELECTRICAL', priority: 'URGENT', status: 'OPEN' }
    ]);

    expect(mocks.getGenerativeModel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mode: 'only_in_cloud' })
    );
    expect(digest.source).toBe('cloud');
    expect(digest.data.bullets).toHaveLength(3);
  });
});
