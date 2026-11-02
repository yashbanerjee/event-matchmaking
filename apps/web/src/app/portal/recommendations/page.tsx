'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { RecommendationsPanel } from '@/components/recommendations-panel';
import { fetchOnboarding } from '@/lib/portal-onboarding';

export default function PortalRecommendationsPage() {
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
          title="Recommendations"
          description="Admin picks and innovators that meet the match score threshold."
        />
        <RecommendationsPanel
          fromOrgId={me.data?.organizationIds?.[0]}
          title="All recommendations"
          description="Admin picks and innovators at or above the match score threshold."
        />
      </div>
    </PortalShell>
  );
}
