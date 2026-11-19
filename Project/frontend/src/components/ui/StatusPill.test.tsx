import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusPill from './StatusPill';
import { statusLabel } from '../../utils/status';
import { rupees } from '../../utils/money';

describe('StatusPill', () => {
  it('uses one plain word per state and the matching tone', () => {
    render(<StatusPill status="OVERDUE" />);
    expect(screen.getByText('Overdue').className).toContain('text-negative');
    expect(statusLabel('PARTIAL')).toBe('Partly paid');
    expect(statusLabel('SOMETHING_NEW')).toBe('Something new');
  });

  it('formats rupees the Indian way', () => {
    expect(rupees(125000)).toBe('₹1,25,000');
    expect(rupees(null)).toBe('₹0');
  });
});
