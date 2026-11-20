import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VIBE_QUESTIONS } from '@livingplus/shared';
import VibeQuiz from './VibeQuiz';

describe('VibeQuiz', () => {
  it('asks only lifestyle questions and reports each answer', async () => {
    const onChange = vi.fn();
    render(<VibeQuiz value={{}} onChange={onChange} />);
    expect(screen.getAllByRole('group')).toHaveLength(VIBE_QUESTIONS.length);
    expect(screen.queryByText(/religion|caste|veg/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Before 11 pm'));
    expect(onChange).toHaveBeenCalledWith({ sleep: 0 });
    expect(screen.getByText(`0 of ${VIBE_QUESTIONS.length} answered`)).toBeInTheDocument();
  });
});
