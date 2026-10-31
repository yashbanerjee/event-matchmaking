'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

type OverviewItem = {
  organizationId: string;
  name: string;
  type: 'COMPANY' | 'VENDOR';
  industry: string | null;
  featured: boolean;
  recommendationCount: number;
  topRecommendations: Array<{
    toOrg: { id: string; name: string; type: string };
    source?: 'COMPUTED' | 'MANUAL';
    totalScore: number;
    aiDescription: string | null;
  }>;
};

type OverviewResponse = {
  items: OverviewItem[];
  page: number;
  pageSize: number;
  total: number;
};

type OrgDetailResponse = {
  organization: { id: string; name: string; type: string };
  counterpartLabel?: string;
  items: Array<{
    id: string;
    source: 'COMPUTED' | 'MANUAL';
    toOrg: { id: string; name: string; type: string; industry: string | null };
    totalScore: number;
    aiScore: number | null;
    aiDescription: string | null;
  }>;
};

type CandidatesResponse = {
  counterpartLabel: 'clients' | 'guests';
  items: Array<{ id: string; name: string; industry: string | null }>;
};

const PAGE_SIZE = 20;

export default function AdminRecommendationsPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[var(--muted)]">Loading recommendations…</p>
      }
    >
      <AdminRecommendationsPageInner />
    </Suspense>
  );
}

function AdminRecommendationsPageInner() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<'ALL' | 'COMPANY' | 'VENDOR'>('ALL');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);
  const [candidateQ, setCandidateQ] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const orgId = searchParams.get('orgId');
    if (orgId) setDetailOrgId(orgId);
  }, [searchParams]);

  const overview = useQuery({
    queryKey: ['admin-peer-recommendations', page, type, search],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (type !== 'ALL') params.set('type', type);
      if (search.trim()) params.set('q', search.trim());
      return apiFetch<OverviewResponse>(
        `/peer-recommendations?${params.toString()}`,
        { token: getAccessToken() },
      );
    },
  });

  const detail = useQuery({
    queryKey: ['admin-peer-recommendations-org', detailOrgId],
    enabled: Boolean(detailOrgId),
    queryFn: () =>
      apiFetch<OrgDetailResponse>(
        `/peer-recommendations/org/${detailOrgId}?limit=50`,
        { token: getAccessToken() },
      ),
  });

  const candidates = useQuery({
    queryKey: [
      'admin-peer-recommendation-candidates',
      detailOrgId,
      candidateSearch,
    ],
    enabled: Boolean(detailOrgId),
    queryFn: () => {
      const params = new URLSearchParams({ limit: '40' });
      if (candidateSearch.trim()) params.set('q', candidateSearch.trim());
      return apiFetch<CandidatesResponse>(
        `/peer-recommendations/org/${detailOrgId}/candidates?${params.toString()}`,
        { token: getAccessToken() },
      );
    },
  });

  const invalidateOrg = async (organizationId: string | null) => {
    await qc.invalidateQueries({ queryKey: ['admin-peer-recommendations'] });
    if (!organizationId) return;
    await qc.invalidateQueries({
      queryKey: ['admin-peer-recommendations-org', organizationId],
    });
    await qc.invalidateQueries({
      queryKey: ['admin-peer-recommendation-candidates', organizationId],
    });
  };

  const recompute = useMutation({
    mutationFn: (organizationId: string) =>
      apiFetch(`/peer-recommendations/org/${organizationId}/recompute`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: async (_data, organizationId) => invalidateOrg(organizationId),
  });

  const addManual = useMutation({
    mutationFn: () => {
      if (!detailOrgId || !selectedCandidateId) {
        throw new Error('Pick a counterpart to add');
      }
      return apiFetch(`/peer-recommendations/org/${detailOrgId}`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ toOrgId: selectedCandidateId }),
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setSelectedCandidateId('');
      await invalidateOrg(detailOrgId);
    },
    onError: (err) => setActionError((err as Error).message),
  });

  const removeRec = useMutation({
    mutationFn: (toOrgId: string) => {
      if (!detailOrgId) throw new Error('No organization selected');
      return apiFetch(`/peer-recommendations/org/${detailOrgId}/${toOrgId}`, {
        method: 'DELETE',
        token: getAccessToken(),
      });
    },
    onSuccess: async () => {
      setActionError(null);
      await invalidateOrg(detailOrgId);
    },
    onError: (err) => setActionError((err as Error).message),
  });

  const items = overview.data?.items ?? [];
  const viewerType = detail.data?.organization.type;
  const counterpartWord =
    detail.data?.counterpartLabel ||
    candidates.data?.counterpartLabel ||
    (viewerType === 'COMPANY' ? 'guests' : 'clients');
  const counterpartSingular =
    counterpartWord === 'guests' ? 'guest' : 'client';

  function closeDetail() {
    setDetailOrgId(null);
    setCandidateQ('');
    setCandidateSearch('');
    setSelectedCandidateId('');
    setActionError(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Match & meet"
        title="Recommendations"
        description="Clients see guests; guests see clients. Manage opens that org’s list."
      />

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              value={q}
              placeholder="Search organization"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setSearch(q);
                }
              }}
            />
          </div>
          <select
            className="h-10 rounded-md border border-[var(--border)] bg-[var(--card)] px-3 text-sm"
            value={type}
            onChange={(e) => {
              setPage(1);
              setType(e.target.value as 'ALL' | 'COMPANY' | 'VENDOR');
            }}
          >
            <option value="ALL">All</option>
            <option value="COMPANY">Clients</option>
            <option value="VENDOR">Guests</option>
          </select>
          <Button
            onClick={() => {
              setPage(1);
              setSearch(q);
            }}
          >
            Search
          </Button>
        </div>

        {overview.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No recommendations yet"
            description="Approve a client or guest, then recompute or add manually."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Organization</TH>
                <TH>Type</TH>
                <TH>Matches</TH>
                <TH>Top matches</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((org) => (
                <TR key={org.organizationId}>
                  <TD>
                    <div className="font-medium">{org.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {org.industry || '—'}
                    </div>
                  </TD>
                  <TD>{org.type === 'COMPANY' ? 'Client' : 'Guest'}</TD>
                  <TD>{org.recommendationCount}</TD>
                  <TD className="max-w-sm text-sm text-[var(--muted)]">
                    {org.topRecommendations.length === 0
                      ? '—'
                      : org.topRecommendations
                          .slice(0, 3)
                          .map(
                            (rec) =>
                              `${rec.toOrg.name} (${Math.round(rec.totalScore)})`,
                          )
                          .join(', ')}
                  </TD>
                  <TD className="space-x-2 whitespace-nowrap text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailOrgId(org.organizationId)}
                    >
                      Manage
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={recompute.isPending}
                      onClick={() => recompute.mutate(org.organizationId)}
                    >
                      Recompute
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={overview.data?.total ?? 0}
          onPageChange={setPage}
        />
      </Card>

      <Modal
        open={Boolean(detailOrgId)}
        title={detail.data?.organization.name ?? 'Recommendations'}
        description={
          viewerType === 'COMPANY'
            ? 'Recommended guests for this client'
            : viewerType === 'VENDOR'
              ? 'Recommended clients for this guest'
              : undefined
        }
        onClose={closeDetail}
        wide
      >
        {detail.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : detail.error ? (
          <p className="text-sm text-rose-700">
            {(detail.error as Error).message}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-[160px] flex-1"
                value={candidateQ}
                placeholder={`Search ${counterpartWord}…`}
                onChange={(e) => setCandidateQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setCandidateSearch(candidateQ);
                }}
              />
              <select
                className="h-10 min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
              >
                <option value="">
                  {candidates.isLoading
                    ? 'Loading…'
                    : `Add ${counterpartSingular}…`}
                </option>
                {(candidates.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.industry ? ` · ${c.industry}` : ''}
                  </option>
                ))}
              </select>
              <Button
                disabled={!selectedCandidateId || addManual.isPending}
                loading={addManual.isPending}
                onClick={() => addManual.mutate()}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!detailOrgId || recompute.isPending}
                onClick={() =>
                  detailOrgId ? recompute.mutate(detailOrgId) : undefined
                }
              >
                Recompute
              </Button>
            </div>

            {actionError ? (
              <p className="text-sm text-rose-700">{actionError}</p>
            ) : null}

            {(detail.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No recommendations"
                description={`Add a ${counterpartSingular} or run Recompute.`}
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Peer</TH>
                    <TH>Source</TH>
                    <TH>Score</TH>
                    <TH>Note</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {(detail.data?.items ?? []).map((row) => (
                    <TR key={row.id}>
                      <TD className="font-medium">{row.toOrg.name}</TD>
                      <TD>
                        {row.source === 'MANUAL' ? (
                          <Badge variant="warning">Admin</Badge>
                        ) : (
                          <span className="text-sm text-[var(--muted)]">AI</span>
                        )}
                      </TD>
                      <TD>{Math.round(row.totalScore)}</TD>
                      <TD className="max-w-xs truncate text-sm text-[var(--muted)]">
                        {row.aiDescription || '—'}
                      </TD>
                      <TD className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={
                            removeRec.isPending &&
                            removeRec.variables === row.toOrg.id
                          }
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Remove ${row.toOrg.name}?`,
                              )
                            ) {
                              return;
                            }
                            removeRec.mutate(row.toOrg.id);
                          }}
                        >
                          Remove
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
