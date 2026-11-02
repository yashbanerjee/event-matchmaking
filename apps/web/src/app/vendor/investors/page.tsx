'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PEER_RECOMMENDATIONS_ABSOLUTE_MAX } from '@em/shared';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { InnovatorsBrowsePanel } from '@/components/innovators-browse-panel';
import { PageHeader } from '@/components/page-header';

export default function VendorInvestorsPage() {
  const router = useRouter();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{
        organizationIds: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  const directoryAccess = useQuery({
    queryKey: ['recommendations'],
    staleTime: 30_000,
    queryFn: () =>
      apiFetch<{
        counterpartDirectoryEnabled?: boolean;
      }>(`/recommendations?limit=${PEER_RECOMMENDATIONS_ABSOLUTE_MAX}`, {
        token: getAccessToken(),
      }),
  });

  const enabled = directoryAccess.data?.counterpartDirectoryEnabled === true;

  useEffect(() => {
    if (directoryAccess.isLoading) return;
    if (!enabled) router.replace('/vendor');
  }, [directoryAccess.isLoading, enabled, router]);

  if (directoryAccess.isLoading || !enabled) {
    return (
      <p className="text-sm text-[var(--muted)]">
        {directoryAccess.isLoading
          ? 'Loading…'
          : 'Investor directory is not enabled for innovators.'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Innovator"
        title="Investors"
        description="Browse every verified investor. Use the dropdowns to filter by category tags."
      />
      <InnovatorsBrowsePanel fromOrgId={me.data?.organizationIds?.[0]} />
    </div>
  );
}
