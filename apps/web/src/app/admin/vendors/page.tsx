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
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

type OrgList = {
  items: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    vendor?: { approvalStatus: string; matchingEligible: boolean };
  }>;
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 10;

export default function VendorsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    code: '',
    name: '',
    industry: 'Manufacturing',
    capabilities: 'CNC,ISO9001',
    categories: 'manufacturing',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors', page],
    queryFn: () =>
      apiFetch<OrgList>(
        `/organizations?type=VENDOR&page=${page}&pageSize=${PAGE_SIZE}`,
        { token: getAccessToken() },
      ),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data?.items) return data?.items ?? [];
    return data.items.filter(
      (org) =>
        org.name.toLowerCase().includes(q) ||
        org.code.toLowerCase().includes(q),
    );
  }, [data?.items, search]);

  const create = useMutation({
    mutationFn: () =>
      apiFetch('/organizations/vendors', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          industry: form.industry,
          capabilities: form.capabilities.split(',').map((s) => s.trim()),
          categories: form.categories.split(',').map((s) => s.trim()),
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendors'] });
      setPage(1);
    },
  });

  const approve = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/organizations/vendors/${id}/approve`, {
        method: 'POST',
        token: getAccessToken(),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vendors'] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organizations"
        title="Vendors"
        description="Onboard vendors, approve eligibility, and track matching readiness."
      />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Create vendor</h2>
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
            placeholder="Capabilities (comma-separated)"
            value={form.capabilities}
            onChange={(e) => setForm({ ...form, capabilities: e.target.value })}
          />
        </div>
        <Button
          className="mt-4"
          onClick={() => create.mutate()}
          disabled={create.isPending || !form.code || !form.name}
        >
          {create.isPending ? 'Creating…' : 'Create vendor'}
        </Button>
      </Card>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Directory</h2>
          <Input
            className="max-w-xs"
            placeholder="Search vendors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading && <p className="text-[var(--muted)]">Loading…</p>}
        {error && <p className="text-rose-700">{(error as Error).message}</p>}

        {!isLoading && filtered.length === 0 ? (
          <EmptyState
            title="No vendors yet"
            description="Create a vendor organization, then approve them for matching."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Approval</TH>
                  <TH>Eligible</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {filtered.map((org) => (
                  <TR key={org.id} className="hover:bg-slate-50/80">
                    <TD className="font-mono text-xs">{org.code}</TD>
                    <TD className="font-medium">{org.name}</TD>
                    <TD>
                      <Badge
                        variant={statusTone(
                          org.vendor?.approvalStatus ?? org.status,
                        )}
                      >
                        {org.vendor?.approvalStatus ?? org.status}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge
                        variant={
                          org.vendor?.matchingEligible ? 'success' : 'secondary'
                        }
                      >
                        {org.vendor?.matchingEligible ? 'Yes' : 'No'}
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      {org.vendor?.approvalStatus !== 'APPROVED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approve.mutate(org.id)}
                        >
                          Approve
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={data?.page ?? page}
              pageSize={data?.pageSize ?? PAGE_SIZE}
              total={data?.total ?? filtered.length}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
