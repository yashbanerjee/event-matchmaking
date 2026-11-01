'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { RecommendationProfileModal } from '@/components/recommendation-profile-modal';
import { cn } from '@/lib/utils';

type BrowseItem = {
  organizationId: string;
  name: string;
  type: 'COMPANY' | 'VENDOR';
  industry: string | null;
  region: string | null;
  categories: string[];
  capabilities: string[];
  regions: string[];
  commercialTags: string[];
  featured: boolean;
  logoUrl: string | null;
};

type FilterDimension = {
  id: string;
  name: string;
  code: string;
  profileKey: string;
  isActive: boolean;
  tags: Array<{
    id: string;
    value: string;
    label: string;
    isActive: boolean;
  }>;
};

const PAGE_SIZE = 12;

export function InnovatorsBrowsePanel({
  fromOrgId,
}: {
  fromOrgId?: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [profileOrgId, setProfileOrgId] = useState<string | null>(null);
  const [interestOrgId, setInterestOrgId] = useState<string | null>(null);
  const [interestSent, setInterestSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedTags]);

  const dimensions = useQuery({
    queryKey: ['filter-dimensions', 'active'],
    queryFn: () =>
      apiFetch<FilterDimension[]>('/filters/dimensions?activeOnly=true', {
        token: getAccessToken(),
      }),
  });

  const tagsParam = selectedTags.join(',');
  const directory = useQuery({
    queryKey: ['recommendations-browse', page, debouncedSearch, tagsParam],
    placeholderData: keepPreviousData,
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (tagsParam) params.set('tags', tagsParam);
      return apiFetch<{
        items: BrowseItem[];
        total: number;
        page: number;
        pageSize: number;
        counterpartLabel: string;
      }>(`/recommendations/browse?${params.toString()}`, {
        token: getAccessToken(),
      });
    },
  });

  const expressInterest = useMutation({
    mutationFn: (toOrgId: string) => {
      if (!fromOrgId) throw new Error('Missing organization');
      return apiFetch('/meeting-requests', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          fromOrgId,
          toOrgId,
          mode: 'INTEREST',
        }),
      });
    },
    onSuccess: async (_data, toOrgId) => {
      setInterestOrgId(null);
      setError(null);
      setInterestSent(toOrgId);
      await qc.invalidateQueries({ queryKey: ['meeting-requests'] });
    },
    onError: (err) => {
      setInterestOrgId(null);
      setError((err as Error).message);
    },
  });

  const activeDimensions = useMemo(
    () =>
      (dimensions.data ?? [])
        .filter((dim) => dim.isActive)
        .map((dim) => ({
          ...dim,
          tags: dim.tags.filter((tag) => tag.isActive),
        }))
        .filter((dim) => dim.tags.length > 0),
    [dimensions.data],
  );

  const items = directory.data?.items ?? [];
  const total = directory.data?.total ?? 0;
  const counterpartLabel = directory.data?.counterpartLabel ?? 'innovators';
  const profileItem = profileOrgId
    ? (items.find((item) => item.organizationId === profileOrgId) ?? null)
    : null;

  const toggleTag = (value: string) => {
    setSelectedTags((prev) =>
      prev.includes(value)
        ? prev.filter((tag) => tag !== value)
        : [...prev, value],
    );
  };

  const sendInterest = (organizationId: string) => {
    setError(null);
    setInterestSent(null);
    setInterestOrgId(organizationId);
    expressInterest.mutate(organizationId);
  };

  return (
    <>
      <Card className="min-w-0 space-y-4 overflow-hidden p-4">
        <div className="space-y-1">
          <h2 className="h-display text-base font-semibold tracking-tight">
            All {counterpartLabel}
          </h2>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            Browse every verified partner and narrow the list with any tag.
            Tap <strong>I&apos;m interested</strong> to start a request.
          </p>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${counterpartLabel} by name or industry…`}
          aria-label={`Search ${counterpartLabel}`}
        />

        {dimensions.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading filters…</p>
        ) : activeDimensions.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Filter by tags
              </p>
              {selectedTags.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setSelectedTags([])}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
            {activeDimensions.map((dim) => (
              <div key={dim.id} className="space-y-1.5">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {dim.name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dim.tags.map((tag) => {
                    const active = selectedTags.includes(tag.value);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.value)}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hover)]'
                            : 'border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--foreground)]',
                        )}
                        aria-pressed={active}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        {interestSent ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Interest sent. Open <strong>Requests</strong> after they accept to
            schedule.
          </p>
        ) : null}

        {directory.isLoading ? (
          <p className="text-sm text-[var(--muted)]">
            Loading {counterpartLabel}…
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            title={`No ${counterpartLabel} match`}
            description={
              selectedTags.length || debouncedSearch
                ? 'Try clearing filters or searching a different name.'
                : 'Verified partners will appear here once they finish onboarding.'
            }
          />
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--muted)]">
              Showing {items.length} of {total}
            </p>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item, index) => (
                <div
                  key={item.organizationId}
                  className={cn(
                    'animate-rise min-w-0 overflow-hidden rounded-xl border p-3',
                    item.featured
                      ? 'border-[var(--accent)]/35 bg-[linear-gradient(180deg,#e7fcf8_0%,#ffffff_70%)]'
                      : 'border-[var(--border)] bg-white',
                  )}
                  style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => setProfileOrgId(item.organizationId)}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p
                          className="truncate font-semibold hover:underline"
                          title={item.name}
                        >
                          {item.name}
                        </p>
                        {item.featured ? (
                          <Badge variant="accent" className="shrink-0">
                            Featured
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                        {item.industry || item.region || 'Innovator'}
                      </p>
                    </button>
                  </div>

                  {[
                    ...item.categories,
                    ...item.capabilities,
                    ...item.regions,
                    ...item.commercialTags,
                  ].length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[
                        ...item.categories,
                        ...item.capabilities,
                        ...item.regions,
                        ...item.commercialTags,
                      ]
                        .slice(0, 6)
                        .map((tag) => (
                          <Badge
                            key={`${item.organizationId}-${tag}`}
                            variant="secondary"
                            className="max-w-full truncate"
                          >
                            {tag}
                          </Badge>
                        ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => setProfileOrgId(item.organizationId)}
                    >
                      View profile
                    </Button>
                    {fromOrgId ? (
                      <Button
                        type="button"
                        className="h-8 px-2.5 text-xs"
                        disabled={
                          interestOrgId === item.organizationId &&
                          expressInterest.isPending
                        }
                        onClick={() => sendInterest(item.organizationId)}
                      >
                        {interestOrgId === item.organizationId &&
                        expressInterest.isPending
                          ? 'Sending…'
                          : "I'm interested"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>

      <RecommendationProfileModal
        organizationId={profileOrgId}
        open={Boolean(profileOrgId)}
        onClose={() => setProfileOrgId(null)}
        onRequestMeeting={
          fromOrgId && profileItem
            ? () => {
                setProfileOrgId(null);
                sendInterest(profileItem.organizationId);
              }
            : undefined
        }
        requestMeetingLabel="I'm interested"
      />
    </>
  );
}
