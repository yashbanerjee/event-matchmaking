'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { MeetingRequestsPanel } from '@/components/meeting-requests-panel';

export default function VendorRequestsPage() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{
        email: string;
        organizationIds: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Vendor workspace"
        title="Meeting requests"
        description="Accept interest from companies, propose a time and place, or confirm proposals sent to you."
      />
      <MeetingRequestsPanel myOrgIds={me.data?.organizationIds ?? []} />
    </>
  );
}
