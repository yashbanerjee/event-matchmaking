'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { MeetingRequestsPanel } from '@/components/meeting-requests-panel';
import { fetchOnboarding } from '@/lib/portal-onboarding';

export default function PortalRequestsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  const me = useQuery({
    queryKey: ['me'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{
        email: string;
        organizationIds: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    enabled: ready,
    queryFn: () => fetchOnboarding(),
  });

  if (!ready) return null;

  return (
    <PortalShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      <PageHeader
        eyebrow="Client / Delegate"
        title="Meeting requests"
        description="Accept interest, pick a duration slot and free place, then wait for confirmation."
      />
      <MeetingRequestsPanel myOrgIds={me.data?.organizationIds ?? []} />
    </PortalShell>
  );
}
