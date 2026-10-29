'use client';

import { useMemo } from 'react';
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
        roles: string[];
        organizationIds: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  const isAdmin = useMemo(
    () =>
      (me.data?.roles ?? []).some((role) =>
        ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role),
      ),
    [me.data?.roles],
  );

  return (
    <>
      <PageHeader
        eyebrow="Guest workspace"
        title="Meeting requests"
        description="Accept or decline requests sent to you. Confirming locks the meeting place and time."
      />
      <MeetingRequestsPanel
        myOrgIds={me.data?.organizationIds ?? []}
        isAdmin={isAdmin}
      />
    </>
  );
}
