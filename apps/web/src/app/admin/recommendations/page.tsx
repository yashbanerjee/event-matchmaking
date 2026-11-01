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
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/empty-state';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { cn } from '@/lib/utils';
import {
  DEFAULT_INNOVATOR_RECOMMENDATION_LIMIT,
  DEFAULT_INVESTOR_RECOMMENDATION_LIMIT,
} from '@em/shared';
import { MatchReasonDisplay } from '@/components/match-reason-display';

type OverviewItem = {
  organizationId: string;
  name: string;
  type: 'COMPANY' | 'VENDOR';
  industry: string | null;
  featured: boolean;
  recommendationCount: number;
  recommendationLimit?: number;
  topRecommendations: Array<{
    toOrg: { id: string; name: string; type: string };
    source?: 'COMPUTED' | 'MANUAL';
    totalScore: number;
    aiDescription: string | null;
    reasons?: string[];
  }>;
};

type OverviewResponse = {
  items: OverviewItem[];
  page: number;
  pageSize: number;
  total: number;
  investorRecommendationLimit?: number;
  innovatorRecommendationLimit?: number;
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
    reasons?: string[];
  }>;
};

type CandidatesResponse = {
  counterpartLabel: 'investors' | 'innovators';
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
  const [roleTab, setRoleTab] = useState<'COMPANY' | 'VENDOR'>('COMPANY');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);
  const [candidateQ, setCandidateQ] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  useEffect(() => {
    const orgId = searchParams.get('orgId');
    if (orgId) setDetailOrgId(orgId);
  }, [searchParams]);

  const overview = useQuery({
    queryKey: ['admin-peer-recommendations', page, roleTab, search],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        type: roleTab,
      });
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
        `/peer-recommendations/org/${detailOrgId}`,
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

  const recomputeAll = useMutation({
    mutationFn: () =>
      apiFetch<{ queued: number }>('/peer-recommendations/recompute-all', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: async (data) => {
      setBulkMessage(
        `Queued refresh for ${data.queued} organizations. Investor lists show innovators; innovator lists show investors. Refresh this page in a minute.`,
      );
      await qc.invalidateQueries({ queryKey: ['admin-peer-recommendations'] });
    },
    onError: (err) => setActionError((err as Error).message),
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
    (viewerType === 'COMPANY' ? 'innovators' : 'investors');
  const counterpartSingular =
    counterpartWord === 'innovators' ? 'innovator' : 'investor';

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
        description="Investors only get innovator matches, and innovators only get investor matches. Up to 5 picks per org."
        actions={
          <Button
            variant="outline"
            loading={recomputeAll.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  'Queue a refresh for every verified investor and innovator? This can take a few minutes.',
                )
              ) {
                return;
              }
              recomputeAll.mutate();
            }}
          >
            {recomputeAll.isPending ? 'Queuing…' : 'Refresh all matches'}
          </Button>
        }
      />

      {bulkMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {bulkMessage}
        </p>
      ) : null}

      <Card className="space-y-4 p-4">
        <div className="inline-flex rounded-xl border border-[var(--border)] bg-white p-1">
          {(
            [
              ['COMPANY', 'Investors'],
              ['VENDOR', 'Innovators'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setRoleTab(value);
                setPage(1);
              }}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                roleTab === value
                  ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                  : 'text-[var(--muted)] hover:text-[var(--foreground)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Input
              value={q}
              placeholder={
                roleTab === 'COMPANY'
                  ? 'Search investors'
                  : 'Search innovators'
              }
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  setSearch(q);
                }
              }}
            />
          </div>
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
            description="Approve an investor or innovator, then recompute or add manually."
          />
        ) : (
          <ul className="divide-y divide-[#DFE1E6] rounded-lg border border-[#DFE1E6] bg-white">
            {items.map((org) => {
              const roleLimit =
                org.recommendationLimit ??
                (org.type === 'COMPANY'
                  ? (overview.data?.investorRecommendationLimit ??
                    DEFAULT_INVESTOR_RECOMMENDATION_LIMIT)
                  : (overview.data?.innovatorRecommendationLimit ??
                    DEFAULT_INNOVATOR_RECOMMENDATION_LIMIT));
              const matchCount = Math.min(org.recommendationCount, roleLimit);
              const top = org.topRecommendations.slice(0, roleLimit);
              const isRecomputing =
                recompute.isPending &&
                recompute.variables === org.organizationId;

              return (
                <li
                  key={org.organizationId}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <h3 className="min-w-0 text-sm font-semibold text-[#172B4D]">
                        {org.name}
                      </h3>
                      <Badge variant="secondary" className="normal-case">
                        {org.type === 'COMPANY' ? 'Investor' : 'Innovator'}
                      </Badge>
                      <span className="text-xs tabular-nums text-[var(--muted)]">
                        {matchCount}/{roleLimit} match
                        {roleLimit === 1 ? '' : 'es'}
                      </span>
                      {org.recommendationCount > roleLimit ? (
                        <span className="text-[10px] font-medium text-amber-700">
                          Recompute to trim extras
                        </span>
                      ) : null}
                    </div>
                    {org.industry ? (
                      <p className="truncate text-xs text-[var(--muted)]">
                        {org.industry}
                      </p>
                    ) : null}

                    {top.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">
                        No matches yet — recompute or add in Manage.
                      </p>
                    ) : (
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {top.map((rec) => (
                          <span
                            key={rec.toOrg.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)]/40 px-2 py-1 text-xs"
                            title={rec.toOrg.name}
                          >
                            <span className="truncate">{rec.toOrg.name}</span>
                            <span className="shrink-0 font-semibold tabular-nums text-[var(--foreground)]">
                              {Math.round(rec.totalScore)}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-[var(--muted)]">
                      Open Manage for full match reasons and AI rationale.
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col sm:items-stretch">
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
                      {isRecomputing ? 'Scoring…' : 'Recompute'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
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
            ? 'Recommended innovators for this investor'
            : viewerType === 'VENDOR'
              ? 'Recommended investors for this innovator'
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
              <Select
                className="min-w-[12rem] flex-1"
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
              </Select>
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
                loading={recompute.isPending}
                onClick={() =>
                  detailOrgId ? recompute.mutate(detailOrgId) : undefined
                }
              >
                Recompute top 5
              </Button>
            </div>

            {actionError ? (
              <p className="text-sm text-rose-700">{actionError}</p>
            ) : null}

            <p className="text-xs text-[var(--muted)]">
              Maximum{' '}
              {detail.data?.organization.type === 'VENDOR'
                ? (overview.data?.innovatorRecommendationLimit ??
                  DEFAULT_INNOVATOR_RECOMMENDATION_LIMIT)
                : (overview.data?.investorRecommendationLimit ??
                  DEFAULT_INVESTOR_RECOMMENDATION_LIMIT)}{' '}
              recommendations per
              organization (admin pins kept first, then top AI scores).
            </p>

            {(detail.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No recommendations"
                description={`Add a ${counterpartSingular} or run Recompute.`}
              />
            ) : (
              <ul className="max-h-[min(70vh,32rem)] divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)]">
                {(detail.data?.items ?? []).map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <div className="min-w-0 shrink-0 sm:w-44">
                      <p className="font-medium leading-snug">{row.toOrg.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {row.source === 'MANUAL' ? (
                          <Badge variant="warning">Admin</Badge>
                        ) : (
                          <Badge variant="secondary">AI</Badge>
                        )}
                        <span className="text-sm font-semibold tabular-nums">
                          {Math.round(row.totalScore)}
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <MatchReasonDisplay
                        aiDescription={row.aiDescription}
                        reasons={row.reasons}
                        maxBullets={8}
                        lineClamp={0}
                      />
                    </div>
                    <div className="shrink-0 sm:pt-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={
                          removeRec.isPending &&
                          removeRec.variables === row.toOrg.id
                        }
                        onClick={() => {
                          if (!window.confirm(`Remove ${row.toOrg.name}?`)) {
                            return;
                          }
                          removeRec.mutate(row.toOrg.id);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
