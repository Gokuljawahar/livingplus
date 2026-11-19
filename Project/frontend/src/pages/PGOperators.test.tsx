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

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

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

  it('validates and creates an operator with amenities as a list', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValue({ data: {} });
    const { container } = renderWithProviders(<PGOperators />);
    await screen.findByRole('textbox', { name: /search operators/i });
    await user.click(screen.getByRole('button', { name: /add pg operator|new operator|create/i }));

    await user.type(screen.getByPlaceholderText('Owner full name'), 'Ravi Kumar');
    await user.type(screen.getByPlaceholderText('Owner phone'), '123');
    await user.type(screen.getByPlaceholderText('Temporary password'), 'Temp@1234');
    await user.type(screen.getByPlaceholderText('PG / hostel name'), 'Ravi Residency');
    await user.type(screen.getByPlaceholderText('Street address'), '4 Main Road');
    await user.type(screen.getByPlaceholderText('Locality'), 'Adyar');
    await user.type(screen.getByPlaceholderText('Amenities, separated by commas'), 'Wi-Fi, Meals ,');
    const form = container.querySelector('form')!;
    form.noValidate = true;
    await user.click(screen.getByRole('button', { name: /create owner/i }));
    expect(await screen.findByText('Enter a valid owner phone')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    await user.clear(screen.getByPlaceholderText('Owner phone'));
    await user.type(screen.getByPlaceholderText('Owner phone'), '9876543210');
    await user.click(screen.getByRole('button', { name: /create owner/i }));
    expect(api.post).toHaveBeenCalledWith('/pg/admin/operators', expect.objectContaining({
      ownerName: 'Ravi Kumar', phone: '9876543210', propertyName: 'Ravi Residency', city: 'Chennai', amenities: ['Wi-Fi', 'Meals']
    }));
  });
});
