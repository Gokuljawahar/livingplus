import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { VibeAnswers } from '@livingplus/shared';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));
import VibeProfileBuilder from './VibeProfileBuilder';

function Harness() {
  const [answers, setAnswers] = useState<VibeAnswers>({});
  const [summary, setSummary] = useState('');
  return <VibeProfileBuilder answers={answers} summary={summary} onChange={(a, s) => { setAnswers(a); setSummary(s); }} />;
}

beforeEach(() => {
  api.post.mockReset();
});

describe('VibeProfileBuilder (voice VibeCheck)', () => {
  it('holds a conversation: the answer goes to Gemini, the next question comes back and habits appear', async () => {
    api.post.mockResolvedValue({ data: {
      heard: 'Naan 1 mani varaikkum padippen',
      answers: { sleep: 2, schedule: 2 },
      summary: 'Night owl who studies late.',
      reply: 'Nice! How tidy do you keep your room?',
      done: false
    } });
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Type instead/ }));
    expect(screen.getByText(/When do you usually go to sleep\?/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Your answer'), 'Naan 1 mani varaikkum padippen');
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(api.post).toHaveBeenCalledWith('/pg/vibecheck/interview', {
      history: [{ role: 'assistant', text: "Hi! Let's find roommates who fit you. When do you usually go to sleep?" }],
      answers: {},
      text: 'Naan 1 mani varaikkum padippen'
    });
    expect(await screen.findByText('Nice! How tidy do you keep your room?')).toBeInTheDocument();
    expect(screen.getByText('Night owl who studies late.')).toBeInTheDocument();
    expect(screen.getByText('What I’ve learned')).toBeInTheDocument();
  });

  it('keeps the conversation going after an error and offers the quick questions', async () => {
    api.post.mockRejectedValue({ isAxiosError: true, response: { status: 503, data: { message: 'Voice VibeCheck is not available right now. Answer the quick questions instead.' } } });
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: /Type instead/ }));
    await userEvent.type(screen.getByLabelText('Your answer'), 'I sleep early');
    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Answer the quick questions instead.');
    await userEvent.click(screen.getByRole('button', { name: 'Answer quick questions instead' }));
    expect(screen.getByLabelText('Before 11 pm')).toBeInTheDocument();
  });

  it('falls back to tap-to-talk when live voice cannot start', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Start voice VibeCheck' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('tap the mic for each answer instead');
    expect(screen.getByText(/When do you usually go to sleep\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tap to answer' })).toBeInTheDocument();
  });
});
