'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
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

type TopRec = {
  toOrg: {
    id: string;
    name: string;
    type: string;
    industry: string | null;
  };
  source?: 'COMPUTED' | 'MANUAL';
  totalScore: number;
  aiScore: number | null;
  aiDescription: string | null;
  reasons: string[];
  computedAt: string;
};

type OverviewItem = {
  organizationId: string;
  name: string;
  type: 'COMPANY' | 'VENDOR';
  industry: string | null;
  featured: boolean;
  recommendationCount: number;
  topRecommendations: TopRec[];
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
    toOrg: {
      id: string;
      name: string;
      type: string;
      industry: string | null;
      region: string | null;
    };
    ruleScore: number;
    aiScore: number | null;
    totalScore: number;
    reasons: string[];
    aiDescription: string | null;
    computedAt: string;
  }>;
};

type CandidateOrg = {
  id: string;
  name: string;
  type: string;
  industry: string | null;
  region: string | null;
};

type CandidatesResponse = {
  organization: { id: string; name: string; type: string };
  counterpartType: 'COMPANY' | 'VENDOR';
  counterpartLabel: 'clients' | 'guests';
  items: CandidateOrg[];
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
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [adminNote, setAdminNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Deep-link: /admin/recommendations?orgId=...
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

  const recompute = useMutation({
    mutationFn: (organizationId: string) =>
      apiFetch(`/peer-recommendations/org/${organizationId}/recompute`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: async (_data, organizationId) => {
      await qc.invalidateQueries({ queryKey: ['admin-peer-recommendations'] });
      await qc.invalidateQueries({
        queryKey: ['admin-peer-recommendations-org', organizationId],
      });
      await qc.invalidateQueries({
        queryKey: ['admin-peer-recommendation-candidates', organizationId],
      });
    },
  });

  const addManual = useMutation({
    mutationFn: () => {
      if (!detailOrgId || !selectedCandidateId) {
        throw new Error('Pick a counterpart to add');
      }
      return apiFetch(`/peer-recommendations/org/${detailOrgId}`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          toOrgId: selectedCandidateId,
          note: adminNote.trim() || undefined,
        }),
      });
    },
    onSuccess: async () => {
      setActionError(null);
      setSelectedCandidateId('');
      setAdminNote('');
      await qc.invalidateQueries({ queryKey: ['admin-peer-recommendations'] });
      await qc.invalidateQueries({
        queryKey: ['admin-peer-recommendations-org', detailOrgId],
      });
      await qc.invalidateQueries({
        queryKey: ['admin-peer-recommendation-candidates', detailOrgId],
      });
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
      await qc.invalidateQueries({ queryKey: ['admin-peer-recommendations'] });
      await qc.invalidateQueries({
        queryKey: ['admin-peer-recommendations-org', detailOrgId],
      });
      await qc.invalidateQueries({
        queryKey: ['admin-peer-recommendation-candidates', detailOrgId],
      });
    },
    onError: (err) => setActionError((err as Error).message),
  });

  const items = overview.data?.items ?? [];
  const viewerType = detail.data?.organization.type;
  const counterpartWord =
    detail.data?.counterpartLabel ||
    (viewerType === 'COMPANY' ? 'guests' : 'clients');
  const counterpartSingular =
    counterpartWord === 'guests' ? 'guest' : 'client';

  const selectedCandidate = useMemo(
    () =>
      (candidates.data?.items ?? []).find((c) => c.id === selectedCandidateId) ??
      null,
    [candidates.data?.items, selectedCandidateId],
  );

  function closeDetail() {
    setDetailOrgId(null);
    setCandidateQ('');
    setCandidateSearch('');
    setSelectedCandidateId('');
    setAdminNote('');
    setActionError(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Match & meet"
        title="AI recommendations"
        description="Open a client to manage guest recommendations, or a guest to manage client recommendations — same direction as the live matching engine. Admin pins survive AI recompute."
      />

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Search
            </label>
            <Input
              value={q}
              placeholder="Organization name"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setSearch(q);
                }
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Type
            </label>
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
          </div>
          <Button
            onClick={() => {
              setPage(1);
              setSearch(q);
            }}
          >
            Apply
          </Button>
        </div>

        {overview.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading recommendations…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No stored recommendations yet"
            description="Approve a client or guest (or recompute) so preferences can be scored with JAV AI."
          />
        ) : (
          <div className="space-y-4">
            {items.map((org) => (
              <div
                key={org.organizationId}
                className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold">
                        {org.name}
                      </h3>
                      <Badge variant="secondary">
                        {org.type === 'COMPANY' ? 'Client' : 'Guest'}
                      </Badge>
                      {org.featured ? (
                        <Badge variant="accent">Featured</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {org.industry || 'No industry'} ·{' '}
                      {org.recommendationCount} stored match
                      {org.recommendationCount === 1 ? '' : 'es'}
                      {org.type === 'COMPANY'
                        ? ' · recommends guests'
                        : ' · recommends clients'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailOrgId(org.organizationId)}
                    >
                      Manage
                    </Button>
                    <Button
                      size="sm"
                      disabled={recompute.isPending}
                      onClick={() => recompute.mutate(org.organizationId)}
                    >
                      Recompute AI
                    </Button>
                  </div>
                </div>

                {org.topRecommendations.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    No peers scored yet. Open Manage to add admin recommendations
                    or recompute AI.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Match</TH>
                          <TH>Source</TH>
                          <TH>Total</TH>
                          <TH>AI score</TH>
                          <TH>Description</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {org.topRecommendations.map((rec) => (
                          <TR key={`${org.organizationId}-${rec.toOrg.id}`}>
                            <TD>
                              <div className="font-medium">{rec.toOrg.name}</div>
                              <div className="text-xs text-[var(--muted)]">
                                {rec.toOrg.type === 'COMPANY'
                                  ? 'Client'
                                  : 'Guest'}
                                {rec.toOrg.industry
                                  ? ` · ${rec.toOrg.industry}`
                                  : ''}
                              </div>
                            </TD>
                            <TD>
                              <Badge
                                variant={
                                  rec.source === 'MANUAL'
                                    ? 'warning'
                                    : 'secondary'
                                }
                              >
                                {rec.source === 'MANUAL' ? 'Admin' : 'AI'}
                              </Badge>
                            </TD>
                            <TD>
                              <Badge variant="info">
                                {Math.round(rec.totalScore)}
                              </Badge>
                            </TD>
                            <TD>
                              {rec.aiScore != null ? (
                                <Badge variant="accent">
                                  {Math.round(rec.aiScore)}
                                </Badge>
                              ) : (
                                <span className="text-xs text-[var(--muted)]">
                                  —
                                </span>
                              )}
                            </TD>
                            <TD className="max-w-md text-sm text-[var(--muted)]">
                              {rec.aiDescription ||
                                rec.reasons.slice(0, 2).join(' · ') ||
                                '—'}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                )}
              </div>
            ))}
          </div>
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
            ? 'Client view — add or remove recommended guests (same as the matching engine).'
            : viewerType === 'VENDOR'
              ? 'Guest view — add or remove recommended clients (same as the matching engine).'
              : 'Manage stored recommendations for this organization'
        }
        onClose={closeDetail}
        size="xl"
      >
        {detail.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : detail.error ? (
          <p className="text-sm text-rose-700">
            {(detail.error as Error).message}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {viewerType === 'COMPANY' ? 'Client' : 'Guest'}
                </Badge>
                <span className="text-sm text-[var(--muted)]">
                  Showing {counterpartWord} only
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!detailOrgId || recompute.isPending}
                onClick={() =>
                  detailOrgId ? recompute.mutate(detailOrgId) : undefined
                }
              >
                Recompute AI
              </Button>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)] p-4">
              <h4 className="text-sm font-semibold">
                Add admin recommendation
              </h4>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Pin a {counterpartSingular} so this{' '}
                {viewerType === 'COMPANY' ? 'client' : 'guest'} sees them in
                their feed. Admin pins are not overwritten by AI recompute.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Input
                  className="min-w-[180px] flex-1"
                  value={candidateQ}
                  placeholder={`Search ${counterpartWord}…`}
                  onChange={(e) => setCandidateQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setCandidateSearch(candidateQ);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCandidateSearch(candidateQ)}
                >
                  Search
                </Button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <select
                  className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm"
                  value={selectedCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                >
                  <option value="">
                    {candidates.isLoading
                      ? 'Loading…'
                      : `Select a ${counterpartSingular}…`}
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
              </div>
              <Input
                className="mt-3"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Optional note shown as description"
              />
              {selectedCandidate ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Will recommend{' '}
                  <span className="font-semibold text-[var(--foreground)]">
                    {selectedCandidate.name}
                  </span>{' '}
                  to {detail.data?.organization.name}.
                </p>
              ) : null}
              {(candidates.data?.items.length ?? 0) === 0 &&
              !candidates.isLoading ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  No eligible {counterpartWord} left to add
                  {candidateSearch ? ' for this search' : ''}.
                </p>
              ) : null}
            </div>

            {actionError ? (
              <p className="text-sm text-rose-700">{actionError}</p>
            ) : null}

            <Table>
              <THead>
                <TR>
                  <TH>Peer</TH>
                  <TH>Source</TH>
                  <TH>Rule</TH>
                  <TH>AI</TH>
                  <TH>Total</TH>
                  <TH>Description</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {(detail.data?.items ?? []).map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <div className="font-medium">{row.toOrg.name}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {row.toOrg.type === 'COMPANY' ? 'Client' : 'Guest'}
                        {row.toOrg.industry
                          ? ` · ${row.toOrg.industry}`
                          : ''}
                      </div>
                    </TD>
                    <TD>
                      <Badge
                        variant={
                          row.source === 'MANUAL' ? 'warning' : 'secondary'
                        }
                      >
                        {row.source === 'MANUAL' ? 'Admin' : 'AI'}
                      </Badge>
                    </TD>
                    <TD>{Math.round(row.ruleScore)}</TD>
                    <TD>
                      {row.aiScore != null ? Math.round(row.aiScore) : '—'}
                    </TD>
                    <TD>
                      <Badge variant="info">{Math.round(row.totalScore)}</Badge>
                    </TD>
                    <TD className="max-w-lg text-sm">
                      <p className="text-[var(--foreground)]">
                        {row.aiDescription || '—'}
                      </p>
                      {row.reasons.length > 0 ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {row.reasons.join(' · ')}
                        </p>
                      ) : null}
                    </TD>
                    <TD className="text-right">
                      <Button
                        size="sm"
                        variant="danger"
                        loading={
                          removeRec.isPending &&
                          removeRec.variables === row.toOrg.id
                        }
                        onClick={() => {
                          const ok = window.confirm(
                            `Remove ${row.toOrg.name} from recommendations for ${detail.data?.organization.name}?`,
                          );
                          if (!ok) return;
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
            {(detail.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No recommendations stored"
                description={`Add a ${counterpartSingular} above, or run Recompute AI after preferences are filled.`}
              />
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
