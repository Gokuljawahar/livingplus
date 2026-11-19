import { describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

import { createQueryClient } from './query-client';

describe('query client', () => {
  it('toasts the API message for queries that declare meta.errorMessage', async () => {
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { retry: false } });
    await client.fetchQuery({
      queryKey: ['x'],
      queryFn: () => Promise.reject({ response: { data: { message: 'Server says no' } } }),
      meta: { errorMessage: 'Fallback' }
    }).catch(() => undefined);
    expect(toast.error).toHaveBeenCalledWith('Server says no');
  });

  it('stays quiet for queries without an error message', async () => {
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { retry: false } });
    await client.fetchQuery({ queryKey: ['y'], queryFn: () => Promise.reject(new Error('x')) }).catch(() => undefined);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
