'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@atlaskit/button/new';
import DynamicTable from '@atlaskit/dynamic-table';
import EmptyState from '@atlaskit/empty-state';
import Heading from '@atlaskit/heading';
import Lozenge from '@atlaskit/lozenge';
import Textfield from '@atlaskit/textfield';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { lozengeAppearanceForStatus } from '@/lib/vendor-forms';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
  endsAt?: string | null;
  durationMinutes?: number | null;
  mode?: string | null;
  venue?: string | null;
  timeZone?: string | null;
  matchScore?: number | null;
  companyOrg: { name: string };
  vendorOrg: { name: string };
};

export default function VendorMeetingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{
        organizationIds: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  const meetings = useQuery({
    queryKey: ['vendor-meetings'],
    queryFn: () =>
      apiFetch<{ items: Meeting[]; total: number }>('/meetings?pageSize=100', {
        token: getAccessToken(),
      }),
  });

  const confirm = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meetings/${id}/confirm`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vendor-meetings'] }),
  });

  const feedback = useMutation({
    mutationFn: (meeting: { id: string; organizationId: string }) =>
      apiFetch(`/meetings/${meeting.id}/feedback`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          organizationId: meeting.organizationId,
          attendanceConfirmed: true,
          meetingQuality: 4,
          relevance: 4,
          businessPotential: 4,
          communicationQuality: 4,
          interestLevel: 4,
          followUpRequired: true,
          outcome: 'FOLLOW_UP_REQUIRED',
          comments: 'Constructive discussion; schedule follow-up.',
          isConfidential: true,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vendor-meetings'] }),
  });

  const filtered = useMemo(() => {
    const items = meetings.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.companyOrg.name.toLowerCase().includes(q) ||
        item.vendorOrg.name.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q) ||
        (item.mode ?? '').toLowerCase().includes(q) ||
        (item.venue ?? '').toLowerCase().includes(q),
    );
  }, [meetings.data?.items, search]);

  const rows = filtered.map((item) => ({
    key: item.id,
    cells: [
      {
        key: 'company',
        content: <span className="font-medium">{item.companyOrg.name}</span>,
      },
      { key: 'vendor', content: item.vendorOrg.name },
      {
        key: 'starts',
        content: new Date(item.startsAt).toLocaleString(),
      },
      {
        key: 'ends',
        content: item.endsAt ? new Date(item.endsAt).toLocaleString() : '—',
      },
      {
        key: 'duration',
        content: item.durationMinutes ? `${item.durationMinutes} min` : '—',
      },
      {
        key: 'mode',
        content: item.mode?.replaceAll('_', ' ') ?? '—',
      },
      {
        key: 'venue',
        content: item.venue || item.timeZone || '—',
      },
      {
        key: 'score',
        content: item.matchScore != null ? item.matchScore.toFixed(1) : '—',
      },
      {
        key: 'status',
        content: (
          <Lozenge appearance={lozengeAppearanceForStatus(item.status)} isBold>
            {item.status.replaceAll('_', ' ')}
          </Lozenge>
        ),
      },
      {
        key: 'actions',
        content: (
          <div className="flex flex-wrap gap-2">
            {item.status === 'AWAITING_CONFIRMATION' ? (
              <Button
                appearance="primary"
                spacing="compact"
                onClick={() => confirm.mutate(item.id)}
              >
                Confirm
              </Button>
            ) : null}
            {me.data?.organizationIds[0] ? (
              <Button
                appearance="subtle"
                spacing="compact"
                onClick={() =>
                  feedback.mutate({
                    id: item.id,
                    organizationId: me.data!.organizationIds[0]!,
                  })
                }
              >
                Feedback
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            Meetings
          </p>
          <Heading size="large">Your meetings</Heading>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Full meeting details in a table — confirm sessions and submit
            confidential feedback.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Textfield
            placeholder="Search company, vendor, status…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            isCompact
          />
        </div>
      </div>

      <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <DynamicTable
          head={{
            cells: [
              { key: 'company', content: 'Company', isSortable: true },
              { key: 'vendor', content: 'Vendor', isSortable: true },
              { key: 'starts', content: 'Starts', isSortable: true },
              { key: 'ends', content: 'Ends' },
              { key: 'duration', content: 'Duration' },
              { key: 'mode', content: 'Mode' },
              { key: 'venue', content: 'Venue / TZ' },
              { key: 'score', content: 'Score', isSortable: true },
              { key: 'status', content: 'Status' },
              { key: 'actions', content: 'Actions' },
            ],
          }}
          rows={rows}
          rowsPerPage={10}
          defaultPage={1}
          isLoading={meetings.isLoading}
          emptyView={
            <EmptyState
              header="No meetings yet"
              description="When schedules are published, your meetings will appear here with full details."
            />
          }
        />
      </section>
    </div>
  );
}
