'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Button from '@atlaskit/button/new';
import DynamicTable from '@atlaskit/dynamic-table';
import EmptyState from '@atlaskit/empty-state';
import Heading from '@atlaskit/heading';
import Lozenge from '@atlaskit/lozenge';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import {
  formatFilledDate,
  labelForFormItem,
  lozengeAppearanceForStatus,
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
    const submitted = formItems.filter((item) => item.submission).length;
    return {
      total: formItems.length,
      pending,
      submitted,
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

  const formRows = formItems.map((item) => {
    const status = statusForFormItem(item);
    return {
      key: item.assignmentId,
      cells: [
        {
          key: 'form',
          content: (
            <Link
              href={`/vendor/forms/${item.assignmentId}`}
              className="font-medium text-[var(--accent-hover)] hover:underline"
            >
              {item.formName}
            </Link>
          ),
        },
        {
          key: 'status',
          content: (
            <Lozenge appearance={lozengeAppearanceForStatus(status)} isBold>
              {labelForFormItem(item)}
            </Lozenge>
          ),
        },
        {
          key: 'filled',
          content: formatFilledDate(item.submission?.submittedAt),
        },
      ],
    };
  });

  const meetingRows = meetingItems.slice(0, 8).map((item) => ({
    key: item.id,
    cells: [
      { key: 'company', content: item.companyOrg.name },
      { key: 'vendor', content: item.vendorOrg.name },
      {
        key: 'starts',
        content: new Date(item.startsAt).toLocaleString(),
      },
      {
        key: 'status',
        content: (
          <Lozenge appearance={lozengeAppearanceForStatus(item.status)} isBold>
            {item.status.replaceAll('_', ' ')}
          </Lozenge>
        ),
      },
    ],
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
          Vendor workspace
        </p>
        <Heading size="large">Overview</Heading>
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Track form progress, submission dates, and meeting statuses in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Forms assigned"
          value={formStats.total}
          tone="teal"
        />
        <StatCard label="Forms pending" value={formStats.pending} />
        <StatCard label="Total meetings" value={meetingStats.total} tone="sky" />
        <StatCard
          label="Awaiting confirmation"
          value={meetingStats.awaiting}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Heading size="medium">Forms</Heading>
            <Link href="/vendor/forms">
              <Button appearance="subtle">View all</Button>
            </Link>
          </div>
          <DynamicTable
            head={{
              cells: [
                { key: 'form', content: 'Form', isSortable: true },
                { key: 'status', content: 'Status' },
                { key: 'filled', content: 'Filled on', isSortable: true },
              ],
            }}
            rows={formRows}
            rowsPerPage={5}
            defaultPage={1}
            isLoading={onboarding.isLoading}
            emptyView={
              <EmptyState
                header="No forms yet"
                description="Assigned vendor forms will appear here with status and fill date."
              />
            }
          />
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Heading size="medium">Meetings</Heading>
            <Link href="/vendor/meetings">
              <Button appearance="subtle">View all</Button>
            </Link>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <MiniStat label="Confirmed" value={meetingStats.confirmed} />
            <MiniStat label="Completed" value={meetingStats.completed} />
            <MiniStat label="Awaiting" value={meetingStats.awaiting} />
          </div>
          <DynamicTable
            head={{
              cells: [
                { key: 'company', content: 'Company', isSortable: true },
                { key: 'vendor', content: 'Vendor' },
                { key: 'starts', content: 'Starts', isSortable: true },
                { key: 'status', content: 'Status' },
              ],
            }}
            rows={meetingRows}
            rowsPerPage={5}
            defaultPage={1}
            isLoading={meetings.isLoading}
            emptyView={
              <EmptyState
                header="No meetings yet"
                description="Published meetings will show here with live status."
              />
            }
          />
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'teal' | 'sky';
}) {
  const isHero = Boolean(tone);
  return (
    <div
      className={
        isHero
          ? 'rounded-2xl border border-transparent p-4 text-white shadow-sm'
          : 'rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4'
      }
      style={
        isHero
          ? {
              background:
                tone === 'sky'
                  ? 'linear-gradient(145deg,#0369a1,#0c4a6e)'
                  : 'linear-gradient(145deg,#0f766e,#0b4f4a)',
            }
          : undefined
      }
    >
      <p className={isHero ? 'text-sm text-white/75' : 'text-sm text-[var(--muted)]'}>
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[var(--card-elevated)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
