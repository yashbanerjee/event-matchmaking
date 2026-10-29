'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { RecommendationsPanel } from '@/components/recommendations-panel';
import { WorkspaceStat } from '@/components/workspace-stat';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import { ensurePushSubscription } from '@/lib/push-subscribe';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
};

type MeetingRequest = {
  id: string;
  status: string;
};

export default function PortalPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    void ensurePushSubscription();
  }, [router]);

  const me = useQuery({
    queryKey: ['me'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{
        id: string;
        email: string;
        organizationIds: string[];
        roles: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    enabled: ready,
    queryFn: () => fetchOnboarding(),
  });

  useEffect(() => {
    if (!onboarding.data) return;
    if (onboarding.data.pendingCount > 0) {
      router.replace('/portal/onboarding');
    }
  }, [onboarding.data, router]);

  const meetings = useQuery({
    queryKey: ['portal-meetings'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{ items: Meeting[] }>('/meetings?pageSize=100', {
        token: getAccessToken(),
      }),
  });

  const requests = useQuery({
    queryKey: ['meeting-requests'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{ items: MeetingRequest[] }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  if (!ready) return null;

  const openRequests = (requests.data?.items ?? []).filter((r) =>
    ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'].includes(
      r.status,
    ),
  ).length;

  return (
    <PortalShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      <PageHeader
        eyebrow="Company / Delegate"
        title="Home"
        description="Recommended vendors based on your preferences. Request a meeting to start scheduling."
        actions={
          <Link href="/portal/requests">
            <Button variant="outline">Requests ({openRequests})</Button>
          </Link>
        }
      />

      <div className="grid min-w-0 gap-4 sm:grid-cols-3">
        <WorkspaceStat
          tone="accent"
          label="Meetings"
          value={meetings.data?.items.length ?? 0}
        />
        <WorkspaceStat label="Open requests" value={openRequests} />
        <WorkspaceStat
          label="Signed in as"
          value={
            <span className="block truncate text-lg" title={me.data?.email}>
              {me.data?.email ?? '…'}
            </span>
          }
        />
      </div>

      <RecommendationsPanel
        fromOrgId={me.data?.organizationIds?.[0]}
        title="Recommended vendors"
        description="Admin suggestions plus vendors matched to your industry, categories, and capabilities."
      />
    </PortalShell>
  );
}
