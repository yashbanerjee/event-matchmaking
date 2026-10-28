'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RecommendationsPanel } from '@/components/recommendations-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import {
  badgeToneForStatus,
  formatFilledDate,
  labelForFormItem,
  statusForFormItem,
} from '@/lib/vendor-forms';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
  companyOrg: { name: string };
  vendorOrg: { name: string };
};

export default function VendorOverviewPage() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{ organizationIds: string[] }>('/auth/me', {
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

  const formItems = onboarding.data?.items ?? [];
  const meetingItems = meetings.data?.items ?? [];

  const formStats = useMemo(() => {
    const pending = formItems.filter((item) => item.action !== 'view').length;
    return {
      total: formItems.length,
      pending,
    };
  }, [formItems]);

  const meetingStats = useMemo(() => {
    const awaiting = meetingItems.filter(
      (item) => item.status === 'AWAITING_CONFIRMATION',
    ).length;
    const confirmed = meetingItems.filter(
      (item) => item.status === 'CONFIRMED',
    ).length;
    const completed = meetingItems.filter(
      (item) => item.status === 'COMPLETED',
    ).length;
    return {
      total: meetingItems.length,
      awaiting,
      confirmed,
      completed,
    };
  }, [meetingItems]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor workspace"
        title="Overview"
        description="Recommended companies from your preferences, plus forms and meeting status."
      />

      <RecommendationsPanel
        fromOrgId={me.data?.organizationIds?.[0]}
        title="Recommended companies"
        description="Matched from your categories, capabilities, and operating regions."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-transparent bg-[linear-gradient(145deg,#0f766e,#0b4f4a)] text-white">
          <p className="text-sm text-white/75">Forms assigned</p>
          <p className="mt-2 text-3xl font-bold">{formStats.total}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--muted)]">Forms pending</p>
          <p className="mt-2 text-3xl font-bold">{formStats.pending}</p>
        </Card>
        <Card className="border-transparent bg-[linear-gradient(145deg,#0369a1,#0c4a6e)] text-white">
          <p className="text-sm text-white/75">Total meetings</p>
          <p className="mt-2 text-3xl font-bold">{meetingStats.total}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--muted)]">Awaiting confirmation</p>
          <p className="mt-2 text-3xl font-bold">{meetingStats.awaiting}</p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Forms</h2>
            <Link href="/vendor/forms">
              <Button variant="outline" size="sm">
                View all
              </Button>
            </Link>
          </div>
          {onboarding.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : formItems.length === 0 ? (
            <EmptyState
              title="No forms yet"
              description="Assigned vendor forms will appear here with status and fill date."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Form</TH>
                  <TH>Status</TH>
                  <TH>Filled on</TH>
                </TR>
              </THead>
              <TBody>
                {formItems.slice(0, 5).map((item) => {
                  const status = statusForFormItem(item);
                  return (
                    <TR key={item.assignmentId}>
                      <TD>
                        <Link
                          href={`/vendor/forms/${item.assignmentId}`}
                          className="font-medium text-[var(--accent-hover)] hover:underline"
                        >
                          {item.formName}
                        </Link>
                      </TD>
                      <TD>
                        <Badge variant={badgeToneForStatus(status)}>
                          {labelForFormItem(item)}
                        </Badge>
                      </TD>
                      <TD>{formatFilledDate(item.submission?.submittedAt)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Meetings</h2>
            <Link href="/vendor/meetings">
              <Button variant="outline" size="sm">
                View all
              </Button>
            </Link>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-[var(--card-elevated)] px-3 py-2">
              <p className="text-xs text-[var(--muted)]">Confirmed</p>
              <p className="text-lg font-semibold">{meetingStats.confirmed}</p>
            </div>
            <div className="rounded-xl bg-[var(--card-elevated)] px-3 py-2">
              <p className="text-xs text-[var(--muted)]">Completed</p>
              <p className="text-lg font-semibold">{meetingStats.completed}</p>
            </div>
            <div className="rounded-xl bg-[var(--card-elevated)] px-3 py-2">
              <p className="text-xs text-[var(--muted)]">Awaiting</p>
              <p className="text-lg font-semibold">{meetingStats.awaiting}</p>
            </div>
          </div>
          {meetings.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : meetingItems.length === 0 ? (
            <EmptyState
              title="No meetings yet"
              description="Published meetings will show here with live status."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Company</TH>
                  <TH>Vendor</TH>
                  <TH>Starts</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {meetingItems.slice(0, 5).map((item) => (
                  <TR key={item.id}>
                    <TD className="font-medium">{item.companyOrg.name}</TD>
                    <TD>{item.vendorOrg.name}</TD>
                    <TD>{new Date(item.startsAt).toLocaleString()}</TD>
                    <TD>
                      <Badge variant={badgeToneForStatus(item.status)}>
                        {item.status.replaceAll('_', ' ')}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
