import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import PGOperators from './PGOperators';
import { renderWithProviders } from '../test/render';

const operator = (id: string, name: string, locality: string) => ({
  id, name, locality, city: 'Chennai', genderPolicy: 'ANY', status: 'ACTIVE', rooms: [], owner: { name: `${name} Owner`, phone: '9000000000' }
});

beforeEach(() => api.get.mockReset());

describe('PGOperators', () => {
  it('lists operators and filters them by search', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [operator('1', 'Sunrise PG', 'OMR'), operator('2', 'Lotus Nest', 'Velachery')] });
    renderWithProviders(<PGOperators />);
    expect(await screen.findByText('Sunrise PG')).toBeInTheDocument();
    expect(screen.getByText('Lotus Nest')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /search/i }), 'velachery');
    expect(screen.queryByText('Sunrise PG')).not.toBeInTheDocument();
    expect(screen.getByText('Lotus Nest')).toBeInTheDocument();
  });
});
