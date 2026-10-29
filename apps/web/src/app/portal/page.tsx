'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { RecommendationsPanel } from '@/components/recommendations-panel';
import {
  OverviewFormCards,
  OverviewMeetingCards,
  OverviewRequestCards,
  OverviewStatStrip,
} from '@/components/overview-home';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import { ensurePushSubscription } from '@/lib/push-subscribe';
import { labelForFormItem, statusForFormItem } from '@/lib/vendor-forms';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
  companyOrg: { name: string };
  vendorOrg: { name: string };
  place?: { name: string } | null;
  location?: string | null;
};

type MeetingRequest = {
  id: string;
  status: string;
  message?: string | null;
  proposedStartsAt?: string | null;
  fromOrg: { id: string; name: string };
  toOrg: { id: string; name: string };
  place?: { name: string; location?: string | null } | null;
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

  const orgIds = me.data?.organizationIds ?? [];

  const openRequestItems = useMemo(
    () =>
      (requests.data?.items ?? []).filter((r) =>
        ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'].includes(
          r.status,
        ),
      ),
    [requests.data?.items],
  );

  const upcomingMeetings = useMemo(() => {
    const now = Date.now();
    return (meetings.data?.items ?? [])
      .filter((m) => new Date(m.startsAt).getTime() >= now - 60 * 60 * 1000)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      )
      .map((m) => ({
        id: m.id,
        status: m.status,
        startsAt: m.startsAt,
        counterpartyName: m.vendorOrg.name,
        placeName: m.place?.name ?? m.location ?? null,
      }));
  }, [meetings.data?.items]);

  const formCards = useMemo(
    () =>
      (onboarding.data?.items ?? []).map((item) => {
        const status = statusForFormItem(item);
        return {
          id: item.assignmentId,
          name: item.formName,
          statusLabel: labelForFormItem(item),
          statusToneKey: status,
          filledOn: item.submission?.submittedAt ?? null,
          href: `/portal/onboarding`,
        };
      }),
    [onboarding.data?.items],
  );

  const confirmed = (meetings.data?.items ?? []).filter(
    (m) => m.status === 'CONFIRMED',
  ).length;

  if (!ready) return null;

  return (
    <PortalShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      <PageHeader
        eyebrow="Client / Delegate"
        title="Home"
        description="Your requests, meetings, forms, and recommended guests in one place."
      />

      <OverviewStatStrip
        items={[
          {
            label: 'Meetings',
            value: meetings.data?.items.length ?? 0,
            accent: true,
          },
          { label: 'Open requests', value: openRequestItems.length },
          { label: 'Confirmed', value: confirmed },
          {
            label: 'Forms',
            value: onboarding.data?.items.length ?? 0,
          },
        ]}
      />

      <OverviewRequestCards
        items={openRequestItems}
        requestsHref="/portal/requests"
        myOrgIds={orgIds}
      />

      <OverviewMeetingCards
        items={upcomingMeetings}
        meetingsHref="/portal/meetings"
      />

      <OverviewFormCards items={formCards} formsHref="/portal/onboarding" />

      <RecommendationsPanel
        fromOrgId={me.data?.organizationIds?.[0]}
        title="Recommended guests"
        description="Admin suggestions plus guests matched to your industry, categories, and capabilities."
      />
    </PortalShell>
  );
}
