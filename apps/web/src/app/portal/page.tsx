'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState } from '@/components/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type Meeting = {
  id: string;
  status: string;
  startsAt: string;
  companyOrg: { name: string };
  vendorOrg: { name: string };
};

const PAGE_SIZE = 8;

export default function PortalPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
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

  const meetings = useQuery({
    queryKey: ['portal-meetings'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{ items: Meeting[] }>('/meetings', {
        token: getAccessToken(),
      }),
  });

  const filtered = useMemo(() => {
    const items = meetings.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (m) =>
        m.companyOrg.name.toLowerCase().includes(q) ||
        m.vendorOrg.name.toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q),
    );
  }, [meetings.data?.items, search]);

  const total = filtered.length;
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const confirm = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meetings/${id}/confirm`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal-meetings'] }),
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal-meetings'] }),
  });

  if (!ready) return null;

  const awaiting = (meetings.data?.items ?? []).filter(
    (m) => m.status === 'AWAITING_CONFIRMATION',
  ).length;

  return (
    <PortalShell email={me.data?.email}>
      <PageHeader
        eyebrow="Your workspace"
        title="Meetings"
        description="Confirm upcoming sessions and submit confidential feedback after each meeting."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="bg-[linear-gradient(145deg,#0f766e,#0b4f4a)] text-white">
          <p className="text-sm text-white/75">Total meetings</p>
          <p className="mt-2 text-3xl font-bold">
            {meetings.data?.items.length ?? 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--muted)]">Awaiting confirmation</p>
          <p className="mt-2 text-3xl font-bold">{awaiting}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--muted)]">Signed in as</p>
          <p className="mt-2 truncate text-lg font-semibold">
            {me.data?.email ?? '…'}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Schedule</h2>
          <Input
            className="max-w-xs"
            placeholder="Search company, vendor, status…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {meetings.isLoading && <p className="text-[var(--muted)]">Loading…</p>}
        {meetings.error && (
          <p className="text-rose-700">{(meetings.error as Error).message}</p>
        )}

        {!meetings.isLoading && pageItems.length === 0 ? (
          <EmptyState
            title="No meetings yet"
            description="When schedules are published, your meetings will appear here."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Company</TH>
                  <TH>Vendor</TH>
                  <TH>Starts</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {pageItems.map((m) => (
                  <TR key={m.id} className="hover:bg-slate-50/80">
                    <TD className="font-medium">{m.companyOrg.name}</TD>
                    <TD>{m.vendorOrg.name}</TD>
                    <TD>{new Date(m.startsAt).toLocaleString()}</TD>
                    <TD>
                      <Badge variant={statusTone(m.status)}>{m.status}</Badge>
                    </TD>
                    <TD className="space-x-2 text-right">
                      {m.status === 'AWAITING_CONFIRMATION' && (
                        <Button size="sm" onClick={() => confirm.mutate(m.id)}>
                          Confirm
                        </Button>
                      )}
                      {me.data?.organizationIds[0] && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            feedback.mutate({
                              id: m.id,
                              organizationId: me.data!.organizationIds[0]!,
                            })
                          }
                        >
                          Feedback
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </PortalShell>
  );
}
