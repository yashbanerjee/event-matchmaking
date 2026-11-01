'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { InnovatorsBrowsePanel } from '@/components/innovators-browse-panel';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { fetchOnboarding } from '@/lib/portal-onboarding';

export default function PortalInnovatorsPage() {
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
      <div className="space-y-4">
        <PageHeader
          eyebrow="Investor"
          title="Innovators"
          description="Browse every verified innovator. Use the dropdowns to filter by category tags."
        />
        <InnovatorsBrowsePanel fromOrgId={me.data?.organizationIds?.[0]} />
      </div>
    </PortalShell>
  );
}
