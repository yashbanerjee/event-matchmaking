'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { badgeToneForStatus } from '@/lib/vendor-forms';

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Meetings"
        title="Your meetings"
        description="Full meeting details in a table — confirm sessions and submit confidential feedback."
        actions={
          <Input
            className="max-w-xs"
            placeholder="Search company, vendor, status…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
      />

      <Card>
        {meetings.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            description="When schedules are published, your meetings will appear here with full details."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Company</TH>
                <TH>Vendor</TH>
                <TH>Starts</TH>
                <TH>Ends</TH>
                <TH>Duration</TH>
                <TH>Mode</TH>
                <TH>Venue / TZ</TH>
                <TH>Score</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {filtered.map((item) => (
                <TR key={item.id}>
                  <TD className="font-medium">{item.companyOrg.name}</TD>
                  <TD>{item.vendorOrg.name}</TD>
                  <TD>{new Date(item.startsAt).toLocaleString()}</TD>
                  <TD>
                    {item.endsAt
                      ? new Date(item.endsAt).toLocaleString()
                      : '—'}
                  </TD>
                  <TD>
                    {item.durationMinutes
                      ? `${item.durationMinutes} min`
                      : '—'}
                  </TD>
                  <TD>{item.mode?.replaceAll('_', ' ') ?? '—'}</TD>
                  <TD>{item.venue || item.timeZone || '—'}</TD>
                  <TD>
                    {item.matchScore != null
                      ? item.matchScore.toFixed(1)
                      : '—'}
                  </TD>
                  <TD>
                    <Badge variant={badgeToneForStatus(item.status)}>
                      {item.status.replaceAll('_', ' ')}
                    </Badge>
                  </TD>
                  <TD className="space-x-2 text-right">
                    {item.status === 'AWAITING_CONFIRMATION' ? (
                      <Button size="sm" onClick={() => confirm.mutate(item.id)}>
                        Confirm
                      </Button>
                    ) : null}
                    {me.data?.organizationIds[0] ? (
                      <Button
                        size="sm"
                        variant="outline"
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
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
