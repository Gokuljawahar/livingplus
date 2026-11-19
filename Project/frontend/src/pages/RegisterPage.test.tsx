import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../components/LogoLoader', () => ({ default: () => null }));

import RegisterPage from './RegisterPage';
import { renderWithProviders } from '../test/render';

beforeEach(() => api.post.mockReset());

async function toStepTwo() {
  const user = userEvent.setup();
  renderWithProviders(<RegisterPage />);
  await user.type(screen.getByPlaceholderText('Phone number'), '9876543210');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByLabelText('Owner name');
  return user;
}

describe('RegisterPage', () => {
  it('shows every missing field and a weak password without calling the API', async () => {
    const user = await toStepTwo();
    await user.type(screen.getByLabelText('Set password'), 'weak');
    await user.click(screen.getByRole('button', { name: /create pg owner account/i }));
    for (const message of ['Owner name is required', 'PG name is required', 'Property address is required', 'Locality is required']) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
    expect(screen.getByText(/Must contain 8\+ chars/)).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('registers with the formatted phone', async () => {
    api.post.mockResolvedValue({ data: { pgSlug: 'cedar-house' } });
    const user = await toStepTwo();
    await user.type(screen.getByLabelText('Owner name'), 'Asha Rao');
    await user.type(screen.getByLabelText('PG / Hostel name'), 'Cedar House');
    await user.type(screen.getByPlaceholderText('Building and street'), '12 OMR Road');
    await user.type(screen.getByPlaceholderText('Neighbourhood'), 'Sholinganallur');
    await user.type(screen.getByLabelText('Set password'), 'Strong@123');
    await user.type(screen.getByLabelText('Confirm password'), 'Strong@123');
    await user.click(screen.getByRole('button', { name: /create pg owner account/i }));
    expect(api.post).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
      name: 'Asha Rao', propertyName: 'Cedar House', phone: '919876543210', locality: 'Sholinganallur', city: 'Chennai', genderPolicy: 'ANY', password: 'Strong@123'
    }));
  });
});
