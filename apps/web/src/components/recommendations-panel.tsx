'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';

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
  pending,
  onRequest,
  featured,
}: {
  items: Recommendation[];
  fromOrgId?: string;
  pending: boolean;
  onRequest: (organizationId: string) => void;
  featured?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {items.map((item, index) => (
        <div
          key={item.organizationId}
          className={`animate-rise min-w-0 overflow-hidden rounded-2xl border p-4 ${
            featured
              ? 'border-[var(--accent)]/25 bg-[linear-gradient(180deg,#f0fdfa_0%,#ffffff_70%)]'
              : 'border-[var(--border)] bg-[linear-gradient(180deg,#ffffff_0%,#f7fbfd_100%)]'
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
            disabled={!fromOrgId || pending}
            onClick={() => onRequest(item.organizationId)}
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

  const recs = useQuery({
    queryKey: ['recommendations'],
    queryFn: () =>
      apiFetch<{
        items: Recommendation[];
        featured: Recommendation[];
        perspective: 'COMPANY' | 'VENDOR' | null;
      }>('/recommendations?limit=8', {
        token: getAccessToken(),
      }),
  });

  const request = useMutation({
    mutationFn: (toOrgId: string) => {
      if (!fromOrgId) throw new Error('Missing organization');
      return apiFetch('/meeting-requests', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ fromOrgId, toOrgId }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['meeting-requests'] });
      void qc.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });

  const featured = recs.data?.featured ?? [];
  const items = recs.data?.items ?? [];
  const empty = featured.length === 0 && items.length === 0;

  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="mb-4 min-w-0">
        <h2 className="h-display text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          {description}
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
        <div className="space-y-6">
          {featured.length > 0 ? (
            <section className="min-w-0 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Admin suggestions</h3>
                <p className="text-xs text-[var(--muted)]">
                  Featured partners selected by the event team for you to
                  consider.
                </p>
              </div>
              <SuggestionGrid
                items={featured}
                fromOrgId={fromOrgId}
                pending={request.isPending}
                onRequest={(id) => request.mutate(id)}
                featured
              />
            </section>
          ) : null}

          {items.length > 0 ? (
            <section className="min-w-0 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">
                  Matched to your preferences
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  Ranked from category, industry, and capability fit.
                </p>
              </div>
              <SuggestionGrid
                items={items}
                fromOrgId={fromOrgId}
                pending={request.isPending}
                onRequest={(id) => request.mutate(id)}
              />
            </section>
          ) : null}
        </div>
      )}
      {request.error ? (
        <p className="mt-3 break-words text-sm text-rose-700">
          {(request.error as Error).message}
        </p>
      ) : null}
    </Card>
  );
}
