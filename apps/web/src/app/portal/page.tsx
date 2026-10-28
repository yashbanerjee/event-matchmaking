'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { RecommendationsPanel } from '@/components/recommendations-panel';
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
      apiFetch<{ items: Meeting[] }>('/meetings', {
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

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="bg-[linear-gradient(145deg,#0f766e,#0b4f4a)] text-white">
          <p className="text-sm text-white/75">Meetings</p>
          <p className="mt-2 text-3xl font-bold">
            {meetings.data?.items.length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--muted)]">Open requests</p>
          <p className="mt-2 text-3xl font-bold">{openRequests}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--muted)]">Signed in as</p>
          <p className="mt-2 truncate text-lg font-semibold">
            {me.data?.email ?? '…'}
          </p>
        </Card>
      </div>

      <RecommendationsPanel
        fromOrgId={me.data?.organizationIds?.[0]}
        title="Recommended vendors"
        description="Matched from your industry, categories, and capability preferences."
      />
    </PortalShell>
  );
}
