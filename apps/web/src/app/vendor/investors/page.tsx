'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { InnovatorsBrowsePanel } from '@/components/innovators-browse-panel';
import { PageHeader } from '@/components/page-header';

export default function VendorInvestorsPage() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{
        organizationIds: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

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
