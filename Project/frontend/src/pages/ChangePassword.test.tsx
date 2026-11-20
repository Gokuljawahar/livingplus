import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../api/axios', () => ({ default: api }));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

import ChangePassword from './ChangePassword';
import { AuthProvider } from '../context/AuthContext';
import { renderWithProviders } from '../test/render';

beforeEach(() => {
  api.post.mockReset();
});

const fill = async (current: string, next: string, confirm: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Current password'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
  await user.click(screen.getByRole('button', { name: /update password/i }));
};

describe('ChangePassword', () => {
  it('shows a mismatch next to the field and sends nothing', async () => {
    renderWithProviders(<AuthProvider><ChangePassword /></AuthProvider>);
    await fill('old-pass', 'new-pass-1', 'new-pass-2');
    expect(await screen.findByText('New passwords do not match')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('submits only the current and new password', async () => {
    api.post.mockResolvedValue({ data: {} });
    renderWithProviders(<AuthProvider><ChangePassword /></AuthProvider>);
    await fill('old-pass', 'new-pass-1', 'new-pass-1');
    expect(api.post).toHaveBeenCalledWith('/auth/change-password', { currentPassword: 'old-pass', newPassword: 'new-pass-1' });
  });
});
