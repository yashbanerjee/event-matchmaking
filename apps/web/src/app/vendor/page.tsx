'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { RecommendationsPanel } from '@/components/recommendations-panel';
import {
  OverviewFormCards,
  OverviewMeetingCards,
  OverviewRequestCards,
  OverviewStatStrip,
  OverviewWeekCalendar,
} from '@/components/overview-home';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import { labelForFormItem, statusForFormItem } from '@/lib/vendor-forms';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
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

export default function VendorOverviewPage() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{ email: string; organizationIds: string[] }>('/auth/me', {
        token: getAccessToken(),
      }),
  });

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    queryFn: () => fetchOnboarding(),
  });

  const meetings = useQuery({
    queryKey: ['vendor-meetings'],
    queryFn: () =>
      apiFetch<{ items: Meeting[]; total: number }>('/meetings?pageSize=100', {
        token: getAccessToken(),
      }),
  });

  const requests = useQuery({
    queryKey: ['meeting-requests'],
    queryFn: () =>
      apiFetch<{ items: MeetingRequest[] }>('/meeting-requests', {
        token: getAccessToken(),
      }),
  });

  const orgIds = me.data?.organizationIds ?? [];
  const formItems = onboarding.data?.items ?? [];
  const meetingItems = meetings.data?.items ?? [];

  const openRequestItems = useMemo(
    () =>
      (requests.data?.items ?? []).filter((r) =>
        ['PENDING', 'INTEREST_ACCEPTED', 'AWAITING_CONFIRMATION'].includes(
          r.status,
        ),
      ),
    [requests.data?.items],
  );

  const formStats = useMemo(() => {
    const pending = formItems.filter((item) => item.action !== 'view').length;
    return {
      total: formItems.length,
      pending,
    };
  }, [formItems]);

  const meetingStats = useMemo(() => {
    const confirmed = meetingItems.filter(
      (item) => item.status === 'CONFIRMED',
    ).length;
    return {
      total: meetingItems.length,
      confirmed,
    };
  }, [meetingItems]);

  const upcomingMeetings = useMemo(() => {
    const now = Date.now();
    return meetingItems
      .filter((m) => new Date(m.startsAt).getTime() >= now - 60 * 60 * 1000)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      )
      .map((m) => ({
        id: m.id,
        status: m.status,
        startsAt: m.startsAt,
        endsAt: m.endsAt ?? null,
        counterpartyName: m.companyOrg.name,
        placeName: m.location ?? m.place?.name ?? null,
      }));
  }, [meetingItems]);

  const formCards = useMemo(
    () =>
      formItems.map((item) => {
        const status = statusForFormItem(item);
        return {
          id: item.assignmentId,
          name: item.formName,
          statusLabel: labelForFormItem(item),
          statusToneKey: status,
          filledOn: item.submission?.submittedAt ?? null,
          href: `/vendor/forms/${item.assignmentId}`,
        };
      }),
    [formItems],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Guest"
        title="Home"
        description="Requests, meetings, and recommended clients — at a glance."
      />

      <OverviewStatStrip
        items={[
          {
            label: 'Meetings',
            value: meetingStats.total,
            accent: true,
          },
          { label: 'Open requests', value: openRequestItems.length },
          { label: 'Forms pending', value: formStats.pending },
          { label: 'Confirmed', value: meetingStats.confirmed },
        ]}
      />

      <OverviewWeekCalendar
        meetings={upcomingMeetings}
        requests={openRequestItems}
        meetingsHref="/vendor/meetings"
        myOrgIds={orgIds}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <OverviewRequestCards
          items={openRequestItems}
          requestsHref="/vendor/requests"
          myOrgIds={orgIds}
        />
        <OverviewMeetingCards
          items={upcomingMeetings}
          meetingsHref="/vendor/meetings"
        />
      </div>

      <OverviewFormCards items={formCards} formsHref="/vendor/forms" />

      <RecommendationsPanel
        fromOrgId={me.data?.organizationIds?.[0]}
        title="Recommended clients"
        description="Admin suggestions plus clients matched to your categories and capabilities."
      />
    </div>
  );
}
