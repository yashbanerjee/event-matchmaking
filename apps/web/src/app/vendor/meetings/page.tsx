'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import {
  MeetingFeedbackModal,
  meetingHasEnded,
} from '@/components/meeting-feedback-modal';
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
  location?: string | null;
  timeZone?: string | null;
  hasSubmittedFeedback?: boolean;
  companyOrg: { name: string };
  vendorOrg: { name: string };
  place?: { name: string } | null;
};

export default function VendorMeetingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [feedbackFor, setFeedbackFor] = useState<Meeting | null>(null);

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
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['vendor-meetings'] }),
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
        (item.venue ?? '').toLowerCase().includes(q) ||
        (item.location ?? '').toLowerCase().includes(q),
    );
  }, [meetings.data?.items, search]);

  const orgId = me.data?.organizationIds[0] ?? '';

  return (
    <>
      <PageHeader
        eyebrow="Meetings"
        title="Your meetings"
        description="Confirm sessions. After a meeting ends, submit feedback and review the client."
        actions={
          <Input
            className="max-w-xs"
            placeholder="Search client, guest, status…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
      />

      <Card className="overflow-hidden">
        {meetings.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            description="When meetings are scheduled, they appear here with full details."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Client</TH>
                <TH>Starts</TH>
                <TH>Ends</TH>
                <TH>Duration</TH>
                <TH>Location</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {filtered.map((item) => {
                const ended = meetingHasEnded(item);
                const submitted = Boolean(item.hasSubmittedFeedback);
                return (
                  <TR key={item.id}>
                    <TD className="font-medium">{item.companyOrg.name}</TD>
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
                    <TD>
                      {item.location || item.place?.name || item.venue || '—'}
                    </TD>
                    <TD>
                      <Badge variant={badgeToneForStatus(item.status)}>
                        {item.status.replaceAll('_', ' ')}
                      </Badge>
                    </TD>
                    <TD className="space-x-2 text-right">
                      {item.status === 'AWAITING_CONFIRMATION' ? (
                        <Button
                          size="sm"
                          onClick={() => confirm.mutate(item.id)}
                        >
                          Confirm
                        </Button>
                      ) : null}
                      {ended && orgId && !submitted ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setFeedbackFor(item)}
                        >
                          Feedback & review
                        </Button>
                      ) : null}
                      {ended && submitted ? (
                        <Badge variant="success">Feedback sent</Badge>
                      ) : null}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <MeetingFeedbackModal
        open={Boolean(feedbackFor)}
        meetingId={feedbackFor?.id ?? null}
        organizationId={orgId}
        counterpartName={feedbackFor?.companyOrg.name ?? 'counterpart'}
        onClose={() => setFeedbackFor(null)}
        onSubmitted={() =>
          void qc.invalidateQueries({ queryKey: ['vendor-meetings'] })
        }
      />
    </>
  );
}
