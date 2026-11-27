import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stay } from './types';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const triageMaintenanceIssue = vi.hoisted(() => vi.fn());

vi.mock('../../api/axios', () => ({ default: api }));
vi.mock('../../ai/ai', () => ({ triageMaintenanceIssue }));
vi.mock('../../ai/device-model', () => ({
  useOnDeviceAI: () => ({ status: 'unavailable', downloadProgress: 0, enable: vi.fn() })
}));
vi.mock('../../ai/outbox', () => ({
  queueOfflineTicket: vi.fn(),
  useOfflineTicketOutbox: () => ({
    queuedTickets: [],
    isOnline: true,
    flushing: false,
    reloadOutbox: vi.fn(),
    flushOutbox: vi.fn()
  })
}));

import ResidentMaintenanceView from './ResidentMaintenanceView';

const SAMPLE_STAY: Stay = {
  id: 'tenant-1',
  name: 'Ananya Rao',
  status: 'ACTIVE',
  monthlyRent: 8500,
  depositAmount: 8500,
  depositReceived: 8500,
  moveInDate: '2026-10-01T00:00:00.000Z',
  property: {
    id: 'prop-1',
    name: "Palm Grove Women's Residence",
    address: '12 OMR Road',
    locality: 'Perungudi',
    city: 'Chennai'
  },
  bed: {
    label: 'Bed 1',
    room: { roomNumber: '102', roomType: 'DOUBLE' }
  },
  rentEntries: []
};

describe('ResidentMaintenanceView voice note triage', () => {
  beforeEach(() => {
    api.post.mockReset();
    triageMaintenanceIssue.mockReset();

    const stopTrack = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }]
        })
      }
    });

    class FakeMediaRecorder {
      state: RecordingState = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        this.state = 'recording';
        this.ondataavailable?.({ data: new Blob(['voice-bytes'], { type: 'audio/webm' }) } as BlobEvent);
      }

      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }

    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  });

  it('records a voice note, transcribes via /pg/ai/transcribe, and auto-triages the maintenance fields', async () => {
    api.post.mockResolvedValueOnce({
      data: { transcript: 'Bathroom geyser switch sparking near shower' }
    });
    triageMaintenanceIssue.mockResolvedValueOnce({
      source: 'cloud',
      latencyMs: 320,
      modeUsed: 'PREFER_ON_DEVICE',
      data: {
        category: 'ELECTRICAL',
        priority: 'URGENT',
        title: 'Sparking geyser switch',
        description: 'Geyser switch near the shower is sparking and needs urgent inspection.',
        safetyRisk: true,
        residentTip: 'Turn off the main MCB switch immediately and avoid touching the switch.'
      }
    });

    render(<ResidentMaintenanceView stays={[SAMPLE_STAY]} tickets={[]} onChanged={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Report an issue/i }));
    await userEvent.click(screen.getByRole('button', { name: /Record voice note/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/Recording voice note/i);

    await userEvent.click(screen.getByRole('button', { name: /Stop voice note/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/pg/ai/transcribe', expect.any(FormData));
    });
    await waitFor(() => {
      expect(triageMaintenanceIssue).toHaveBeenCalledWith({
        note: 'Bathroom geyser switch sparking near shower',
        imageBase64: undefined,
        imageMimeType: undefined
      });
    });

    expect(screen.getByDisplayValue('Sparking geyser switch')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Geyser switch near the shower is sparking/i)).toBeInTheDocument();
    expect(screen.getByText(/Safety risk flagged — Priority set to URGENT/i)).toBeInTheDocument();
  });
});
