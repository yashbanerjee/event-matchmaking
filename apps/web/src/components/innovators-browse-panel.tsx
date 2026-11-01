'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MeetingSchedulePicker } from '@/components/meeting-schedule-picker';
import { RecommendationProfileModal } from '@/components/recommendation-profile-modal';
import { cn } from '@/lib/utils';

type BrowseItem = {
  organizationId: string;
  name: string;
  type: 'COMPANY' | 'VENDOR';
  industry: string | null;
  industryLabel?: string | null;
  region: string | null;
  categories: string[];
  categoryLabels?: string[];
  capabilities: string[];
  capabilityLabels?: string[];
  regions: string[];
  regionLabels?: string[];
  commercialTags: string[];
  commercialTagLabels?: string[];
  featured: boolean;
  logoUrl: string | null;
};

function displayTags(item: BrowseItem) {
  return [
    ...(item.categoryLabels?.length ? item.categoryLabels : item.categories),
    ...(item.capabilityLabels?.length
      ? item.capabilityLabels
      : item.capabilities),
    ...(item.regionLabels?.length ? item.regionLabels : item.regions),
    ...(item.commercialTagLabels?.length
      ? item.commercialTagLabels
      : item.commercialTags),
  ];
}

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

/** Directory browse for counterpart orgs (innovators for investors, investors for innovators). */
export function InnovatorsBrowsePanel({
  fromOrgId,
}: {
  fromOrgId?: string;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [profileOrgId, setProfileOrgId] = useState<string | null>(null);
  const [interestOrgId, setInterestOrgId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<BrowseItem | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [interestSent, setInterestSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  const dimensions = useQuery({
    queryKey: ['filter-dimensions', 'active'],
    queryFn: () =>
      apiFetch<FilterDimension[]>('/filters/dimensions?activeOnly=true', {
        token: getAccessToken(),
      }),
  });

  const tagsParam = selectedTags.join(',');
  const catalog = useQuery({
    queryKey: ['recommendations-browse-catalog'],
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<{
        items: BrowseItem[];
        total: number;
        counterpartLabel: string;
      }>('/recommendations/browse', {
        token: getAccessToken(),
      }),
  });

  const directory = useQuery({
    queryKey: ['recommendations-browse', debouncedSearch, tagsParam],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (tagsParam) params.set('tags', tagsParam);
      const qs = params.toString();
      return apiFetch<{
        items: BrowseItem[];
        total: number;
        counterpartLabel: string;
      }>(`/recommendations/browse${qs ? `?${qs}` : ''}`, {
        token: getAccessToken(),
      });
    },
  });

  const expressInterest = useMutation({
    mutationFn: (input: {
      toOrgId: string;
      mode: 'INTEREST' | 'SCHEDULED';
      startsAt?: string;
      placeId?: string;
    }) => {
      if (!fromOrgId) throw new Error('Missing organization');
      return apiFetch('/meeting-requests', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          fromOrgId,
          toOrgId: input.toOrgId,
          mode: input.mode,
          startsAt: input.startsAt,
          placeId: input.placeId,
          message:
            input.mode === 'SCHEDULED'
              ? 'Would like to meet at the proposed time and place.'
              : undefined,
        }),
      });
    },
    onSuccess: async (_data, variables) => {
      setInterestOrgId(null);
      setScheduleFor(null);
      setScheduleError(null);
      setError(null);
      setInterestSent(variables.toOrgId);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['meeting-requests'] }),
        qc.invalidateQueries({ queryKey: ['recommendations'] }),
        qc.invalidateQueries({ queryKey: ['recommendations-browse'] }),
        qc.invalidateQueries({ queryKey: ['recommendations-browse-catalog'] }),
      ]);
    },
    onError: (err) => {
      setInterestOrgId(null);
      const message = (err as Error).message;
      if (scheduleFor) {
        setScheduleError(message);
      } else {
        setError(message);
      }
    },
  });

  const catalogTagValues = useMemo(() => {
    const values = new Set<string>();
    for (const item of catalog.data?.items ?? []) {
      for (const raw of [
        item.industry,
        ...item.categories,
        ...item.capabilities,
        ...item.regions,
        ...item.commercialTags,
      ]) {
        if (!raw) continue;
        values.add(raw.trim().toLowerCase());
      }
    }
    return values;
  }, [catalog.data?.items]);

  const activeDimensions = useMemo(() => {
    const hasCatalog = catalogTagValues.size > 0;
    return (dimensions.data ?? [])
      .filter((dim) => dim.isActive)
      .map((dim) => ({
        ...dim,
        tags: dim.tags.filter((tag) => {
          if (!tag.isActive) return false;
          if (!hasCatalog) return true;
          const value = tag.value.trim().toLowerCase();
          const label = tag.label.trim().toLowerCase();
          return catalogTagValues.has(value) || catalogTagValues.has(label);
        }),
      }))
      .filter((dim) => dim.tags.length > 0);
  }, [dimensions.data, catalogTagValues]);

  const tagLabelByValue = useMemo(() => {
    const map = new Map<string, string>();
    for (const dim of activeDimensions) {
      for (const tag of dim.tags) {
        map.set(tag.value, tag.label);
      }
    }
    return map;
  }, [activeDimensions]);

  useEffect(() => {
    if (!activeDimensions.length || !selectedTags.length) return;
    const allowed = new Set(
      activeDimensions.flatMap((dim) => dim.tags.map((tag) => tag.value)),
    );
    setSelectedTags((prev) => {
      const next = prev.filter((tag) => allowed.has(tag));
      return next.length === prev.length ? prev : next;
    });
  }, [activeDimensions, selectedTags.length]);

  const items = directory.data?.items ?? [];
  const total = directory.data?.total ?? 0;
  const counterpartLabel =
    directory.data?.counterpartLabel ??
    catalog.data?.counterpartLabel ??
    'partners';
  /** Investors browsing innovators propose time/place (same as Recommendations). */
  const isInvestorBrowse = counterpartLabel === 'innovators';
  const singularLabel =
    counterpartLabel === 'innovators'
      ? 'Innovator'
      : counterpartLabel === 'investors'
        ? 'Investor'
        : 'Partner';
  const profileItem = profileOrgId
    ? (items.find((item) => item.organizationId === profileOrgId) ?? null)
    : null;

  const selectedInDimension = (dim: FilterDimension) =>
    selectedTags.find((value) => dim.tags.some((tag) => tag.value === value)) ??
    '';

  const setDimensionTag = (dim: FilterDimension, nextValue: string) => {
    setSelectedTags((prev) => {
      const withoutDim = prev.filter(
        (value) => !dim.tags.some((tag) => tag.value === value),
      );
      if (!nextValue) return withoutDim;
      return [...withoutDim, nextValue];
    });
  };

  const removeTag = (value: string) => {
    setSelectedTags((prev) => prev.filter((tag) => tag !== value));
  };

  const sendInterest = (item: BrowseItem) => {
    setError(null);
    setScheduleError(null);
    setInterestSent(null);
    if (isInvestorBrowse) {
      setScheduleFor(item);
      return;
    }
    setInterestOrgId(item.organizationId);
    expressInterest.mutate({
      toOrgId: item.organizationId,
      mode: 'INTEREST',
    });
  };

  return (
    <>
      <Card className="min-w-0 space-y-4 overflow-hidden p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="h-display text-base font-semibold tracking-tight">
              All {counterpartLabel}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {directory.isLoading
                ? `Loading ${counterpartLabel}…`
                : `${total} ${counterpartLabel}`}
            </p>
          </div>
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${counterpartLabel} by name or industry…`}
            aria-label={`Search ${counterpartLabel}`}
          />
          {dimensions.isLoading ? (
            <p className="text-sm text-[var(--muted)] sm:col-span-2">
              Loading filters…
            </p>
          ) : (
            activeDimensions.map((dim) => (
              <label key={dim.id} className="grid gap-1 text-xs font-medium">
                <span className="text-[var(--muted)]">{dim.name}</span>
                <Select
                  value={selectedInDimension(dim)}
                  onChange={(e) => setDimensionTag(dim, e.target.value)}
                  aria-label={`Filter by ${dim.name}`}
                >
                  <option value="">All</option>
                  {dim.tags.map((tag) => (
                    <option key={tag.id} value={tag.value}>
                      {tag.label}
                    </option>
                  ))}
                </Select>
              </label>
            ))
          )}
        </div>

        {selectedTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedTags.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => removeTag(value)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent-hover)]"
                title="Remove filter"
              >
                <span className="truncate">
                  {tagLabelByValue.get(value) ?? value}
                </span>
                <span aria-hidden>×</span>
              </button>
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
            {isInvestorBrowse
              ? 'Meeting request sent with your proposed time. They can accept or decline under Requests.'
              : 'Interest sent. The investor will propose a meeting time under Requests.'}
          </p>
        ) : null}

        {directory.isLoading ? (
          <p className="text-sm text-[var(--muted)]">
            Loading {counterpartLabel}…
          </p>
        ) : directory.isError ? (
          <EmptyState
            title={`Could not load ${counterpartLabel}`}
            description={
              (directory.error as Error)?.message ||
              'Refresh the page and try again.'
            }
          />
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
                      {item.industryLabel ||
                        item.industry ||
                        item.region ||
                        singularLabel}
                    </p>
                  </button>
                </div>

                {displayTags(item).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {displayTags(item)
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
                        (interestOrgId === item.organizationId ||
                          scheduleFor?.organizationId ===
                            item.organizationId) &&
                        expressInterest.isPending
                      }
                      onClick={() => sendInterest(item)}
                    >
                      {(interestOrgId === item.organizationId ||
                        scheduleFor?.organizationId ===
                          item.organizationId) &&
                      expressInterest.isPending
                        ? 'Sending…'
                        : "I'm interested"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
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
                sendInterest(profileItem);
              }
            : undefined
        }
        requestMeetingLabel="I'm interested"
      />

      <MeetingSchedulePicker
        open={Boolean(scheduleFor)}
        title="Propose meeting time"
        description="Choose a free day and time, then pick a free table. The innovator can only accept or decline."
        counterpartName={scheduleFor?.name}
        fromOrgId={fromOrgId}
        toOrgId={scheduleFor?.organizationId}
        submitting={expressInterest.isPending}
        error={scheduleError}
        onClose={() => {
          if (expressInterest.isPending) return;
          setScheduleFor(null);
          setScheduleError(null);
        }}
        onConfirm={({ startsAt, placeId }) => {
          if (!scheduleFor) return;
          setInterestOrgId(scheduleFor.organizationId);
          expressInterest.mutate({
            toOrgId: scheduleFor.organizationId,
            mode: 'SCHEDULED',
            startsAt,
            placeId,
          });
        }}
      />
    </>
  );
}
