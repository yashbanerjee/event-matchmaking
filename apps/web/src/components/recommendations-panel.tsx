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
};

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
      apiFetch<{ items: Recommendation[] }>('/recommendations?limit=8', {
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

  const items = recs.data?.items ?? [];

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
      </div>

      {recs.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading recommendations…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          description="Complete your profile preferences (category, industry, capabilities) to see matches."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.organizationId}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {item.industry || item.type}
                  </p>
                </div>
                <Badge variant="accent">{Math.round(item.score)}%</Badge>
              </div>
              {(item.categories.length > 0 || item.capabilities.length > 0) && (
                <p className="mt-2 line-clamp-2 text-xs text-[var(--muted)]">
                  {[...item.categories, ...item.capabilities]
                    .slice(0, 6)
                    .join(' · ')}
                </p>
              )}
              <Button
                className="mt-3"
                size="sm"
                disabled={!fromOrgId || request.isPending}
                onClick={() => request.mutate(item.organizationId)}
              >
                Request meeting
              </Button>
            </div>
          ))}
        </div>
      )}
      {request.error ? (
        <p className="mt-3 text-sm text-rose-700">
          {(request.error as Error).message}
        </p>
      ) : null}
    </Card>
  );
}
