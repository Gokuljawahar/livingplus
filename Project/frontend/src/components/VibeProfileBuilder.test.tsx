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

describe('VibeProfileBuilder', () => {
  it('reads a routine written in any language and pre-fills the quiz for review', async () => {
    api.post.mockResolvedValue({ data: { answers: { sleep: 2, noise: 0 }, summary: 'Night owl who likes a quiet room.', followUp: 'Do you keep your desk tidy most days?' } });
    render(<Harness />);
    await userEvent.type(screen.getByLabelText(/Describe your usual day/), 'Naan 2 mani varaikkum padippen, quiet room venum');
    await userEvent.click(screen.getByRole('button', { name: /Read my routine/ }));
    expect(api.post).toHaveBeenCalledWith('/pg/vibecheck/profile', { text: 'Naan 2 mani varaikkum padippen, quiet room venum', answers: {} });
    expect(await screen.findByText('Night owl who likes a quiet room.')).toBeInTheDocument();
    expect(screen.getByText('Do you keep your desk tidy most days?')).toBeInTheDocument();
    expect(screen.getByLabelText('After 1 am')).toBeChecked();
  });

  it('falls back to the quick questions when the AI is unavailable', async () => {
    api.post.mockRejectedValue({ isAxiosError: true, response: { status: 503, data: { message: 'Answer the quick questions instead.' } } });
    render(<Harness />);
    await userEvent.type(screen.getByLabelText(/Describe your usual day/), 'I sleep early and keep things tidy.');
    await userEvent.click(screen.getByRole('button', { name: /Read my routine/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Answer the quick questions instead.');
    expect(screen.getByLabelText('Before 11 pm')).toBeInTheDocument();
  });
});
