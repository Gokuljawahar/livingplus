import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveAction, LiveHandoff } from '../hooks/useVibeLive';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const voiceMock = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended' | 'failed',
  turns: [] as { role: 'assistant' | 'user'; text: string }[],
  error: '',
  latencyMs: null as number | null,
  actions: [] as LiveAction[],
  handoff: null as LiveHandoff | null,
  start: vi.fn(),
  sendText: vi.fn(),
  interrupt: vi.fn(),
  end: vi.fn()
}));

vi.mock('../api/axios', () => ({ default: api }));
vi.mock('../hooks/useVibeLive', () => ({ useVibeLive: () => voiceMock }));

import PgPulse from './PgPulse';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPulse(onGo: (target: 'rent' | 'bookings' | 'maintenance') => void = () => {}) {
  const client = makeClient();
  const makeUi = () => (
    <QueryClientProvider client={client}>
      <PgPulse onGo={onGo} />
    </QueryClientProvider>
  );
  const view = render(makeUi());
  return { ...view, refresh: () => view.rerender(makeUi()) };
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  voiceMock.start.mockReset();
  voiceMock.sendText.mockReset();
  voiceMock.interrupt.mockReset();
  voiceMock.end.mockReset();
  voiceMock.status = 'idle';
  voiceMock.turns = [];
  voiceMock.error = '';
  voiceMock.latencyMs = null;
  voiceMock.actions = [];
  voiceMock.handoff = null;

  api.get.mockResolvedValue({
    data: {
      timeline: [],
      stats: {
        beds: 10, occupied: 8, newResidents: 1, pendingRequests: 2,
        overdueCount: 1, overdueAmount: 9500,
        ticketsOpen: 1, ticketsOpened: 1, ticketsResolved: 2, avgFixHours: 3,
        mealOrders: 4, aiActions: 3
      }
    }
  });
});

describe('PgPulse (owner live voice briefing & actions)', () => {
  it('fetches a short-lived pass and opens the owner briefing WebSocket when Brief me is clicked', async () => {
    api.post.mockImplementation(async (url: string) => {
      if (url === '/pg/owner/pulse/brief') {
        return { data: { brief: { headline: 'Steady week', points: ['8 of 10 beds full'], suggestion: { text: 'Follow up on overdue rent', action: 'SEND_RENT_REMINDERS' }, ai: true } } };
      }
      if (url === '/pg/owner/briefing/pass') {
        return { data: { pass: 'signed-pass-123' } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    voiceMock.start.mockResolvedValue(true);

    renderPulse();
    expect(await screen.findByText('Steady week')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Brief me/i }));
    expect(api.post).toHaveBeenCalledWith('/pg/owner/briefing/pass');
    expect(voiceMock.start).toHaveBeenCalledWith(
      undefined,
      expect.stringMatching(/^wss?:\/\/.*\/api\/pg\/owner\/briefing\/live\?pass=signed-pass-123$/)
    );
  });

  it('shows a helpful message when live voice briefing is unavailable', async () => {
    api.post.mockImplementation(async (url: string) => {
      if (url === '/pg/owner/pulse/brief') {
        return { data: { brief: { headline: 'Steady week', points: [], suggestion: { text: 'All clear', action: 'NONE' }, ai: true } } };
      }
      if (url === '/pg/owner/briefing/pass') {
        throw { isAxiosError: true, response: { status: 503, data: { message: 'Voice briefing is not available right now. The written brief is above.' } } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    renderPulse();
    await screen.findByText('Steady week');

    await userEvent.click(screen.getByRole('button', { name: /Brief me/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Voice briefing is not available right now.');
  });

  it('renders live response latency, staged/completed voice action cards, and workspace handoff CTA', async () => {
    api.post.mockImplementation(async (url: string) => {
      if (url === '/pg/owner/pulse/brief') {
        return { data: { brief: { headline: 'Steady week', points: [], suggestion: { text: 'All clear', action: 'NONE' }, ai: true } } };
      }
      if (url === '/pg/owner/briefing/pass') {
        return { data: { pass: 'signed-pass-123' } };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    voiceMock.start.mockImplementation(async () => {
      voiceMock.status = 'listening';
      voiceMock.latencyMs = 420;
      voiceMock.actions = [
        { phase: 'proposed', summary: 'Assign the maintenance ticket to Ravi' },
        { phase: 'done', summary: 'Assign the maintenance ticket to Ravi' }
      ];
      voiceMock.handoff = { target: 'rent', reason: 'Mark Room 204 rent received in ledger' };
      return true;
    });

    const onGo = vi.fn();
    const view = renderPulse(onGo);
    await screen.findByText('Steady week');

    await userEvent.click(screen.getByRole('button', { name: /Brief me/i }));
    await vi.waitFor(() => expect(voiceMock.start).toHaveBeenCalled());
    view.refresh();

    expect(await screen.findByTestId('voice-latency')).toHaveTextContent('420 ms');
    expect(screen.getByText('Read-back · waiting for your yes')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getAllByText('Assign the maintenance ticket to Ravi')).toHaveLength(2);
    expect(screen.getByText(/Mark Room 204 rent received in ledger/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Open Rent ledger/i }));
    expect(onGo).toHaveBeenCalledWith('rent');
  });
});
