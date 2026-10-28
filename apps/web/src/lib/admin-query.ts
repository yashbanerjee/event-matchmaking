'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';
import { getAccessToken } from './auth-store';

export function useAdminQuery<T>(key: string[], path: string) {
  return useQuery({
    queryKey: key,
    queryFn: () => apiFetch<T>(path, { token: getAccessToken() }),
  });
}
