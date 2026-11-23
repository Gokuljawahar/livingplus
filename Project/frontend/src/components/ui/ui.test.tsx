import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, Card, EmptyState, Field, Select, Sheet } from './index';

describe('shared token-only UI primitives', () => {
  it('renders Button, Card, Field, Select, and EmptyState with accessible semantics', () => {
    render(
      <Card>
        <Field label="Room number" placeholder="101" error="Required" />
        <Select label="Sharing">
          <option value="SHARED">Shared</option>
        </Select>
        <Button variant="primary">Save</Button>
        <EmptyState title="Nothing here yet" description="Add your first room." />
      </Card>
    );

    expect(screen.getByLabelText('Room number')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.getByLabelText('Sharing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('btn-primary');
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('closes Sheet on Escape and Close button', async () => {
    const onClose = vi.fn();
    render(
      <Sheet open={true} onClose={onClose} title="Bed details">
        <p>Room 101</p>
      </Sheet>
    );

    expect(screen.getByRole('dialog', { name: 'Bed details' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
