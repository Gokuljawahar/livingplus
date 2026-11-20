import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));

import DepositCompare from './DepositCompare';

beforeEach(() => {
  api.post.mockReset();
});

describe('DepositCompare', () => {
  it('calls onApply via callback instead of mutating parent DOM inputs', async () => {
    api.post.mockResolvedValue({
      data: {
        summary: 'One missing desk lamp and minor scuff marks.',
        suggestedTotal: 600,
        photos: { moveIn: 1, moveOut: 1 },
        changes: [
          { item: 'Desk lamp', change: 'Missing at move-out', kind: 'MISSING', suggested: 600 },
          { item: 'Wall paint', change: 'Light scuff near desk', kind: 'WEAR', suggested: 0 }
        ]
      }
    });
    const onApply = vi.fn();

    render(<DepositCompare tenantId="tenant-1" onApply={onApply} />);
    await userEvent.click(screen.getByRole('button', { name: /Compare move-in and move-out photos/i }));
    expect(await screen.findByText('One missing desk lamp and minor scuff marks.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Use selected/i }));
    expect(onApply).toHaveBeenCalledWith({
      depositDeductions: '600',
      checkoutNote: 'Desk lamp: Missing at move-out (₹600)'
    });
  });
});
