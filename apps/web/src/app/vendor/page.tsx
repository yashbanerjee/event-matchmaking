'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { RecommendationsPanel } from '@/components/recommendations-panel';
import { WorkspaceStat } from '@/components/workspace-stat';
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
    <>
      <PageHeader
        eyebrow="Guest workspace"
        title="Overview"
        description="Recommended clients from your preferences, plus forms and meeting status."
      />

      <RecommendationsPanel
        fromOrgId={me.data?.organizationIds?.[0]}
        title="Recommended clients"
        description="Admin suggestions plus clients matched to your categories, capabilities, and regions."
      />

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <WorkspaceStat
          tone="accent"
          label="Forms assigned"
          value={formStats.total}
        />
        <WorkspaceStat label="Forms pending" value={formStats.pending} />
        <WorkspaceStat
          tone="highlight"
          label="Total meetings"
          value={meetingStats.total}
        />
        <WorkspaceStat
          label="Awaiting confirmation"
          value={meetingStats.awaiting}
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <h2 className="h-display truncate text-lg font-semibold">Forms</h2>
            <Link href="/vendor/forms" className="shrink-0">
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
              description="Assigned guest forms will appear here with status and fill date."
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
                      <TD className="max-w-[180px] truncate">
                        <Link
                          href={`/vendor/forms/${item.assignmentId}`}
                          className="font-medium text-[var(--accent-hover)] hover:underline"
                          title={item.formName}
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

        <Card className="min-w-0 overflow-hidden">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
            <h2 className="h-display truncate text-lg font-semibold">
              Meetings
            </h2>
            <Link href="/vendor/meetings" className="shrink-0">
              <Button variant="outline" size="sm">
                View all
              </Button>
            </Link>
          </div>
          <div className="mb-4 grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
            <div className="min-w-0 rounded-xl bg-[var(--card-elevated)] px-2 py-2 sm:px-3">
              <p className="truncate text-xs text-[var(--muted)]">Confirmed</p>
              <p className="text-lg font-semibold">{meetingStats.confirmed}</p>
            </div>
            <div className="min-w-0 rounded-xl bg-[var(--card-elevated)] px-2 py-2 sm:px-3">
              <p className="truncate text-xs text-[var(--muted)]">Completed</p>
              <p className="text-lg font-semibold">{meetingStats.completed}</p>
            </div>
            <div className="min-w-0 rounded-xl bg-[var(--card-elevated)] px-2 py-2 sm:px-3">
              <p className="truncate text-xs text-[var(--muted)]">Awaiting</p>
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
                  <TH>Client</TH>
                  <TH>Starts</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {meetingItems.slice(0, 5).map((item) => (
                  <TR key={item.id}>
                    <TD
                      className="max-w-[160px] truncate font-medium"
                      title={item.companyOrg.name}
                    >
                      {item.companyOrg.name}
                    </TD>
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
    </>
  );
}
