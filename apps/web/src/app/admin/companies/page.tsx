'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { statusTone } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { OrgRowActions } from '@/components/org-actions';
import { SubmissionReviewModal } from '@/components/submission-review-modal';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type OrgList = {
  items: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    contactEmail?: string | null;
    industry: string | null;
    country?: string | null;
    region?: string | null;
    website?: string | null;
    address?: string | null;
    latestSubmission?: {
      id: string;
      status: string;
      submittedAt?: string | null;
    } | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 10;

export default function CompaniesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    code: '',
    name: '',
    industry: 'Manufacturing',
    country: 'DE',
    region: 'EU',
  });
  const [formReview, setFormReview] = useState<{
    id: string;
    name: string;
    submissionId?: string | null;
  } | null>(null);

  const queryKey = ['companies', page] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<OrgList>(
        `/organizations?type=COMPANY&page=${page}&pageSize=${PAGE_SIZE}`,
        { token: getAccessToken() },
      ),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data?.items) return data?.items ?? [];
    return data.items.filter(
      (org) =>
        org.name.toLowerCase().includes(q) ||
        org.code.toLowerCase().includes(q) ||
        (org.contactEmail ?? '').toLowerCase().includes(q) ||
        (org.industry ?? '').toLowerCase().includes(q),
    );
  }, [data?.items, search]);

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/organizations/companies', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      setForm({
        code: '',
        name: '',
        industry: 'Manufacturing',
        country: 'DE',
        region: 'EU',
      });
      setPage(1);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organizations"
        title="Companies"
        description="Create, view, edit, and archive company organizations."
      />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Create company</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            placeholder="Industry"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
          />
        </div>
        <Button
          className="mt-4"
          onClick={() => create.mutate()}
          disabled={create.isPending || !form.code || !form.name}
        >
          {create.isPending ? 'Creating…' : 'Create company'}
        </Button>
        {create.error && (
          <p className="mt-2 text-sm text-rose-700">
            {(create.error as Error).message}
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Directory</h2>
          <Input
            className="max-w-xs"
            placeholder="Search code, name, industry…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading && <p className="text-[var(--muted)]">Loading…</p>}
        {error && <p className="text-rose-700">{(error as Error).message}</p>}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            title="No companies yet"
            description="Create your first company to start invitations and matching."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Industry</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((org) => (
                  <TR key={org.id} className="hover:bg-slate-50/80">
                    <TD className="font-mono text-xs">{org.code}</TD>
                    <TD className="font-medium">{org.name}</TD>
                    <TD className="text-[var(--muted)]">
                      {org.contactEmail ?? '—'}
                    </TD>
                    <TD>{org.industry ?? '—'}</TD>
                    <TD>
                      <Badge variant={statusTone(org.status)}>{org.status}</Badge>
                    </TD>
                    <TD>
                      <div className="flex flex-col items-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setFormReview({
                              id: org.id,
                              name: org.name,
                              submissionId: org.latestSubmission?.id ?? null,
                            })
                          }
                        >
                          {org.latestSubmission ? 'View form' : 'Form status'}
                        </Button>
                        <OrgRowActions
                          org={org}
                          kind="company"
                          queryKey={[...queryKey]}
                        />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={data?.page ?? page}
              pageSize={data?.pageSize ?? PAGE_SIZE}
              total={data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <SubmissionReviewModal
        open={Boolean(formReview)}
        onClose={() => setFormReview(null)}
        organizationId={formReview?.id ?? ''}
        organizationName={formReview?.name ?? ''}
        kind="company"
        submissionId={formReview?.submissionId}
        listQueryKey={[...queryKey]}
      />
    </div>
  );
}
