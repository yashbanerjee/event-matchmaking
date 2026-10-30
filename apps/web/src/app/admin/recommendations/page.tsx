'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  items: Array<{
    id: string;
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

const PAGE_SIZE = 20;

export default function AdminRecommendationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<'ALL' | 'COMPANY' | 'VENDOR'>('ALL');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);

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
    },
  });

  const items = overview.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Match & meet"
        title="AI recommendations"
        description="Preference-based client ↔ guest matches with JAV AI scores and descriptions. Recomputed when a guest or client becomes eligible or updates their profile."
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
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailOrgId(org.organizationId)}
                    >
                      View all
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
                    No peers scored yet. Click Recompute AI after preferences are
                    filled.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Match</TH>
                          <TH>Total</TH>
                          <TH>AI score</TH>
                          <TH>AI description</TH>
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
        description="Stored preference matches with JAV AI score and description"
        onClose={() => setDetailOrgId(null)}
        wide
      >
        {detail.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : detail.error ? (
          <p className="text-sm text-rose-700">
            {(detail.error as Error).message}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!detailOrgId || recompute.isPending}
                onClick={() =>
                  detailOrgId ? recompute.mutate(detailOrgId) : undefined
                }
              >
                Recompute AI
              </Button>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Peer</TH>
                  <TH>Rule</TH>
                  <TH>AI</TH>
                  <TH>Total</TH>
                  <TH>Description</TH>
                </TR>
              </THead>
              <TBody>
                {(detail.data?.items ?? []).map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <div className="font-medium">{row.toOrg.name}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {row.toOrg.type === 'COMPANY' ? 'Client' : 'Guest'}
                      </div>
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
                  </TR>
                ))}
              </TBody>
            </Table>
            {(detail.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No recommendations stored"
                description="Run Recompute AI after this organization has preferences."
              />
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
