// Dynamic platform catalog hook powered by `@tanstack/react-query` against `/api/pg/catalog`.
// Every dropdown, amenity group, landmark, room type, price band, VibeCheck question,
// KYC document option, expense/maintenance category, slot, and assistant prompt
// flows from PostgreSQL (`PlatformCatalog`) through this single query.
import { useContext } from 'react';
import { QueryClientContext, useQuery } from '@tanstack/react-query';
import {
  INITIAL_PLATFORM_CATALOG_SEEDS,
  type CatalogOptionItem,
  type PlatformCatalogData
} from '@livingplus/shared';
import api from '../api/axios';
import { queryClient as fallbackQueryClient } from '../api/query-client';
import { queryKeys } from '../api/query-keys';

export async function fetchPlatformCatalog(): Promise<PlatformCatalogData> {
  const response = await api.get('/pg/catalog');
  if (!response?.data || typeof response.data !== 'object') {
    return INITIAL_PLATFORM_CATALOG_SEEDS;
  }
  return { ...INITIAL_PLATFORM_CATALOG_SEEDS, ...(response.data as Partial<PlatformCatalogData>) };
}

export function usePlatformCatalog(): { catalog: PlatformCatalogData; isLoading: boolean } {
  const contextClient = useContext(QueryClientContext);
  const { data, isPending } = useQuery(
    {
      queryKey: queryKeys.catalog(),
      queryFn: fetchPlatformCatalog,
      staleTime: 5 * 60_000,
      retry: 1
    },
    contextClient ?? fallbackQueryClient
  );
  return { catalog: data ?? INITIAL_PLATFORM_CATALOG_SEEDS, isLoading: isPending };
}

export function labelFromCatalog(
  items: readonly CatalogOptionItem[],
  value: string | undefined | null,
  useShort = false
): string {
  if (!value) return '';
  const found = items.find((item) => item.value === value);
  if (!found) return value;
  return (useShort && found.shortLabel) ? found.shortLabel : found.label;
}
