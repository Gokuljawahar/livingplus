import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const voiceMock = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'connecting' | 'listening' | 'speaking' | 'ended' | 'failed',
  turns: [] as { role: 'assistant' | 'user'; text: string }[],
  error: '',
  start: vi.fn(),
  sendText: vi.fn(),
  end: vi.fn()
}));

vi.mock('../api/axios', () => ({ default: api }));
vi.mock('../hooks/useVibeLive', () => ({ useVibeLive: () => voiceMock }));

import PgPulse from './PgPulse';

function renderPulse() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PgPulse onGo={() => {}} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  voiceMock.start.mockReset();
  voiceMock.sendText.mockReset();
  voiceMock.end.mockReset();
  voiceMock.status = 'idle';
  voiceMock.turns = [];
  voiceMock.error = '';

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

describe('PgPulse (owner live voice briefing)', () => {
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
});
