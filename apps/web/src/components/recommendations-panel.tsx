'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { MeetingSchedulePicker } from '@/components/meeting-schedule-picker';

type Recommendation = {
  organizationId: string;
  name: string;
  type: 'COMPANY' | 'VENDOR';
  industry: string | null;
  categories: string[];
  capabilities: string[];
  score: number;
  explanation: string;
  featured?: boolean;
};

function SuggestionGrid({
  items,
  fromOrgId,
  pendingOrgId,
  onRequest,
  featured,
}: {
  items: Recommendation[];
  fromOrgId?: string;
  pendingOrgId?: string | null;
  onRequest: (item: Recommendation) => void;
  featured?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.organizationId}
          className={`animate-rise min-w-0 overflow-hidden rounded-xl border p-3 ${
            featured
              ? 'border-[var(--accent)]/35 bg-[linear-gradient(180deg,#e7fcf8_0%,#ffffff_70%)]'
              : 'border-[var(--border)] bg-white'
          }`}
          style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate font-semibold" title={item.name}>
                  {item.name}
                </p>
                {featured ? (
                  <Badge variant="accent" className="shrink-0">
                    Admin pick
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                {item.industry || item.type}
              </p>
            </div>
            {!featured ? (
              <Badge variant="secondary" className="shrink-0">
                {Math.round(item.score)}%
              </Badge>
            ) : null}
          </div>
          {(item.categories.length > 0 || item.capabilities.length > 0) && (
            <p
              className="mt-2 line-clamp-2 break-words text-xs leading-relaxed text-[var(--muted)]"
              title={[...item.categories, ...item.capabilities].join(' · ')}
            >
              {[...item.categories, ...item.capabilities]
                .slice(0, 6)
                .join(' · ')}
            </p>
          )}
          <Button
            className="mt-3 w-full sm:w-auto"
            size="sm"
            disabled={!fromOrgId || Boolean(pendingOrgId)}
            onClick={() => onRequest(item)}
          >
            Request meeting
          </Button>
        </div>
      ))}
    </div>
  );
}

export function RecommendationsPanel({
  fromOrgId,
  title,
  description,
}: {
  fromOrgId?: string;
  title: string;
  description: string;
}) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recs = useQuery({
    queryKey: ['recommendations'],
    queryFn: () =>
      apiFetch<{
        items: Recommendation[];
        featured: Recommendation[];
        perspective: 'COMPANY' | 'VENDOR' | null;
      }>('/recommendations?limit=10', {
        token: getAccessToken(),
      }),
  });

  const request = useMutation({
    mutationFn: (input: {
      toOrgId: string;
      startsAt: string;
      placeId: string;
    }) => {
      if (!fromOrgId) throw new Error('Missing organization');
      return apiFetch('/meeting-requests', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          fromOrgId,
          toOrgId: input.toOrgId,
          startsAt: input.startsAt,
          placeId: input.placeId,
        }),
      });
    },
    onSuccess: async () => {
      setTarget(null);
      setError(null);
      await qc.invalidateQueries({ queryKey: ['meeting-requests'] });
      await qc.invalidateQueries({ queryKey: ['recommendations'] });
      await qc.invalidateQueries({ queryKey: ['portal-meetings'] });
      await qc.invalidateQueries({ queryKey: ['vendor-meetings'] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const featured = recs.data?.featured ?? [];
  const items = recs.data?.items ?? [];
  const empty = featured.length === 0 && items.length === 0;

  return (
    <>
      <Card className="min-w-0 overflow-hidden p-4">
        <div className="mb-3 min-w-0">
          <h2 className="h-display text-base font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            {description} Pick a free time and meeting place when you request.
          </p>
        </div>

        {recs.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading recommendations…</p>
        ) : empty ? (
          <EmptyState
            title="No recommendations yet"
            description="Complete your profile preferences, or ask an admin to feature matching partners."
          />
        ) : (
          <div className="space-y-4">
            {featured.length > 0 ? (
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Admin suggestions
                </h3>
                <SuggestionGrid
                  items={featured}
                  fromOrgId={fromOrgId}
                  pendingOrgId={target?.organizationId}
                  onRequest={(item) => {
                    setError(null);
                    setTarget(item);
                  }}
                  featured
                />
              </section>
            ) : null}

            {items.length > 0 ? (
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Matched to your preferences
                </h3>
                <SuggestionGrid
                  items={items}
                  fromOrgId={fromOrgId}
                  pendingOrgId={target?.organizationId}
                  onRequest={(item) => {
                    setError(null);
                    setTarget(item);
                  }}
                />
              </section>
            ) : null}
          </div>
        )}
      </Card>

      <MeetingSchedulePicker
        open={Boolean(target)}
        title={`Request meeting${target ? ` · ${target.name}` : ''}`}
        counterpartName={target?.name}
        fromOrgId={fromOrgId}
        toOrgId={target?.organizationId}
        submitting={request.isPending}
        error={error}
        onClose={() => {
          if (request.isPending) return;
          setTarget(null);
          setError(null);
        }}
        onConfirm={({ startsAt, placeId }) => {
          if (!target) return;
          request.mutate({
            toOrgId: target.organizationId,
            startsAt,
            placeId,
          });
        }}
      />
    </>
  );
}
