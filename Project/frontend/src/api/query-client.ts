// Shared TanStack Query client: caching, de-duplication and stale-response
// protection for API reads. A query can set meta.errorMessage to show a
// toast when it fails (no per-component try/catch needed).
import { QueryCache, QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '../utils/api-error';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { errorMessage?: string };
  }
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.errorMessage) toast.error(apiErrorMessage(error, query.meta.errorMessage));
      }
    }),
    defaultOptions: {
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false }
    }
  });
}

export const queryClient = createQueryClient();
