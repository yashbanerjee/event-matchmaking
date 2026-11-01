'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

type FeedbackRow = {
  id: string;
  outcome: string;
  meetingQuality: number | null;
  relevance: number | null;
  businessPotential: number | null;
  communicationQuality: number | null;
  interestLevel: number | null;
  comments: string | null;
  isConfidential: boolean;
  attendanceConfirmed: boolean;
  createdAt: string;
  organization: { name: string; type?: string };
  reviewer: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  meeting: {
    startsAt: string;
    companyOrg: { name: string };
    vendorOrg: { name: string };
  };
};

function reviewerName(row: FeedbackRow) {
  const name = [row.reviewer.firstName, row.reviewer.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || row.reviewer.email;
}

function counterpart(row: FeedbackRow) {
  const orgName = row.organization.name;
  if (orgName === row.meeting.companyOrg.name) {
    return row.meeting.vendorOrg.name;
  }
  if (orgName === row.meeting.vendorOrg.name) {
    return row.meeting.companyOrg.name;
  }
  return `${row.meeting.companyOrg.name} / ${row.meeting.vendorOrg.name}`;
}

function roleLabel(type?: string) {
  if (type === 'COMPANY') return 'Investor';
  if (type === 'VENDOR') return 'Innovator';
  return null;
}

export default function FeedbackPage() {
  const [role, setRole] = useState<'ALL' | 'COMPANY' | 'VENDOR'>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['feedback', role, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (role !== 'ALL') params.set('role', role);
      if (debouncedSearch) params.set('q', debouncedSearch);
      return apiFetch<{ items: FeedbackRow[]; total: number }>(
        `/feedback?${params}`,
        { token: getAccessToken() },
      );
    },
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Feedback & reviews"
        description="Post-meeting feedback and peer reviews from investors and innovators."
      />

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">
            Reviews
            {typeof data?.total === 'number' ? (
              <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                {data.total}
              </span>
            ) : null}
          </h2>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select
              className="w-full sm:w-44"
              value={role}
              onChange={(e) =>
                setRole(
                  e.target.value === 'COMPANY' || e.target.value === 'VENDOR'
                    ? e.target.value
                    : 'ALL',
                )
              }
              aria-label="Filter by role"
            >
              <option value="ALL">All roles</option>
              <option value="COMPANY">Investor</option>
              <option value="VENDOR">Innovator</option>
            </Select>
            <Input
              className="w-full sm:max-w-xs"
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : error ? (
          <p className="text-sm text-rose-700">{(error as Error).message}</p>
        ) : items.length === 0 ? (
          <EmptyState
            title={
              role !== 'ALL' || debouncedSearch
                ? 'No matching feedback'
                : 'No feedback yet'
            }
            description={
              role !== 'ALL' || debouncedSearch
                ? 'Try another role or name.'
                : 'When a meeting ends, participants can submit feedback and review each other from their portal.'
            }
          />
        ) : (
          <>
            <div
              className={`grid gap-3 sm:hidden ${
                isFetching ? 'opacity-70 transition-opacity' : ''
              }`}
            >
              {items.map((f) => (
                <div
                  key={f.id}
                  className="min-w-0 rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#172B4D]">
                        {reviewerName(f)}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {f.organization.name}
                        {roleLabel(f.organization.type)
                          ? ` · ${roleLabel(f.organization.type)}`
                          : ''}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {f.outcome.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm">
                    Reviewed <span className="font-medium">{counterpart(f)}</span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {f.meeting.companyOrg.name} ↔ {f.meeting.vendorOrg.name}
                    <br />
                    {new Date(f.meeting.startsAt).toLocaleString()}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-white/80 px-2.5 py-2">
                      <p className="font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Meeting
                      </p>
                      <p className="mt-1">
                        Q {f.meetingQuality ?? '—'} · Rel {f.relevance ?? '—'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/80 px-2.5 py-2">
                      <p className="font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Peer
                      </p>
                      <p className="mt-1">
                        Comm {f.communicationQuality ?? '—'} · Int{' '}
                        {f.interestLevel ?? '—'} · Biz{' '}
                        {f.businessPotential ?? '—'}
                      </p>
                    </div>
                  </div>
                  {f.comments ? (
                    <p className="mt-3 line-clamp-3 text-sm text-[#172B4D]">
                      {f.comments}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                    <span>{new Date(f.createdAt).toLocaleString()}</span>
                    {f.isConfidential ? (
                      <Badge variant="warning">Confidential</Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div
              className={`hidden sm:block ${
                isFetching
                  ? 'overflow-x-auto opacity-70 transition-opacity'
                  : 'overflow-x-auto'
              }`}
            >
              <Table>
                <THead>
                  <TR>
                    <TH>Reviewer</TH>
                    <TH>Reviewed</TH>
                    <TH>Meeting</TH>
                    <TH>Outcome</TH>
                    <TH>Meeting</TH>
                    <TH>Peer review</TH>
                    <TH>Comments</TH>
                    <TH>Submitted</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((f) => (
                    <TR key={f.id}>
                      <TD>
                        <div className="font-medium">{reviewerName(f)}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {f.organization.name}
                          {roleLabel(f.organization.type) ? (
                            <> · {roleLabel(f.organization.type)}</>
                          ) : null}
                        </div>
                      </TD>
                      <TD>{counterpart(f)}</TD>
                      <TD className="text-sm">
                        {f.meeting.companyOrg.name} ↔ {f.meeting.vendorOrg.name}
                        <div className="text-xs text-[var(--muted)]">
                          {new Date(f.meeting.startsAt).toLocaleString()}
                        </div>
                      </TD>
                      <TD>
                        <Badge variant="secondary">
                          {f.outcome.replaceAll('_', ' ')}
                        </Badge>
                      </TD>
                      <TD className="text-sm">
                        Q {f.meetingQuality ?? '—'} · Rel {f.relevance ?? '—'}
                      </TD>
                      <TD className="text-sm">
                        Comm {f.communicationQuality ?? '—'} · Int{' '}
                        {f.interestLevel ?? '—'} · Biz{' '}
                        {f.businessPotential ?? '—'}
                      </TD>
                      <TD className="max-w-[220px] truncate text-sm">
                        {f.comments || '—'}
                        {f.isConfidential ? (
                          <Badge variant="warning" className="ml-2">
                            Confidential
                          </Badge>
                        ) : null}
                      </TD>
                      <TD className="text-sm text-[var(--muted)]">
                        {new Date(f.createdAt).toLocaleString()}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
