'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PEER_RECOMMENDATIONS_MAX_PER_ORG } from '@em/shared';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { RecommendationProfileModal } from '@/components/recommendation-profile-modal';

type Recommendation = {
  organizationId: string;
  name: string;
  type: 'COMPANY' | 'VENDOR';
  industry: string | null;
  categories: string[];
  capabilities: string[];
  score: number;
  reasons?: string[];
  explanation: string;
  aiDescription?: string | null;
  featured?: boolean;
};

function matchReasons(item: Recommendation): string[] {
  if (item.aiDescription?.trim()) {
    return [item.aiDescription.trim()];
  }
  if (item.reasons?.length) return item.reasons;
  const cleaned = item.explanation?.replace(/\s*\(Score[\s\S]*$/, '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean);
}

function SuggestionGrid({
  items,
  fromOrgId,
  pendingOrgId,
  onInterest,
  onViewProfile,
  featured,
}: {
  items: Recommendation[];
  fromOrgId?: string;
  pendingOrgId?: string | null;
  onInterest: (item: Recommendation) => void;
  onViewProfile: (item: Recommendation) => void;
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
            <button
              type="button"
              className="min-w-0 text-left"
              onClick={() => onViewProfile(item)}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p
                  className="truncate font-semibold hover:underline"
                  title={item.name}
                >
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
            </button>
            {!featured ? (
              <Badge variant="secondary" className="shrink-0">
                {Math.round(item.score)}%
              </Badge>
            ) : null}
          </div>
          {(() => {
            const reasons = matchReasons(item);
            if (!reasons.length) {
              if (item.categories.length > 0 || item.capabilities.length > 0) {
                return (
                  <p
                    className="mt-2 line-clamp-2 break-words text-xs leading-relaxed text-[var(--muted)]"
                    title={[...item.categories, ...item.capabilities].join(
                      ' · ',
                    )}
                  >
                    {[...item.categories, ...item.capabilities]
                      .slice(0, 6)
                      .join(' · ')}
                  </p>
                );
              }
              return null;
            }
            return (
              <div className="mt-2 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  Why we matched you
                </p>
                <ul className="mt-1 space-y-0.5">
                  {reasons.slice(0, 3).map((reason) => (
                    <li
                      key={reason}
                      className="line-clamp-2 text-xs leading-relaxed text-[var(--muted)]"
                      title={reason}
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onViewProfile(item)}
            >
              View profile
            </Button>
            <Button
              size="sm"
              disabled={
                !fromOrgId ||
                Boolean(pendingOrgId) ||
                pendingOrgId === item.organizationId
              }
              loading={pendingOrgId === item.organizationId}
              onClick={() => onInterest(item)}
            >
              I&apos;m interested
            </Button>
          </div>
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
  const [profileOrgId, setProfileOrgId] = useState<string | null>(null);
  const [interestOrgId, setInterestOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interestSent, setInterestSent] = useState<string | null>(null);

  const recs = useQuery({
    queryKey: ['recommendations'],
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () =>
      apiFetch<{
        items: Recommendation[];
        featured: Recommendation[];
        perspective: 'COMPANY' | 'VENDOR' | null;
      }>(`/recommendations?limit=${PEER_RECOMMENDATIONS_MAX_PER_ORG}`, {
        token: getAccessToken(),
      }),
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
      await qc.invalidateQueries({ queryKey: ['recommendations'] });
    },
    onError: (err) => {
      setInterestOrgId(null);
      setError((err as Error).message);
    },
  });

  const perspective = recs.data?.perspective ?? null;
  const allowedPeerType =
    perspective === 'COMPANY'
      ? 'VENDOR'
      : perspective === 'VENDOR'
        ? 'COMPANY'
        : null;
  const featured = (recs.data?.featured ?? []).filter(
    (item) => !allowedPeerType || item.type === allowedPeerType,
  );
  const items = (recs.data?.items ?? []).filter(
    (item) => !allowedPeerType || item.type === allowedPeerType,
  );
  const empty = featured.length === 0 && items.length === 0;
  const profileItem = profileOrgId
    ? (featured.find((r) => r.organizationId === profileOrgId) ??
      items.find((r) => r.organizationId === profileOrgId) ??
      null)
    : null;

  const sendInterest = (item: Recommendation) => {
    setError(null);
    setInterestSent(null);
    setInterestOrgId(item.organizationId);
    expressInterest.mutate(item.organizationId);
  };

  const openInterestFromProfile = () => {
    if (!profileItem) return;
    setProfileOrgId(null);
    sendInterest(profileItem);
  };

  return (
    <>
      <Card className="min-w-0 overflow-hidden p-4">
        <div className="mb-3 min-w-0">
          <h2 className="h-display text-base font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
            {description} Tap <strong>I&apos;m interested</strong> to connect —
            if they accept, pick a time and place under{' '}
            <strong>Requests</strong>.
          </p>
        </div>

        {error ? (
          <p className="mb-3 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        {interestSent ? (
          <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Interest sent. When they accept, open <strong>Requests</strong> to
            schedule your meeting.
          </p>
        ) : null}

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
                  pendingOrgId={interestOrgId}
                  onInterest={sendInterest}
                  onViewProfile={(item) => setProfileOrgId(item.organizationId)}
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
                  pendingOrgId={interestOrgId}
                  onInterest={sendInterest}
                  onViewProfile={(item) => setProfileOrgId(item.organizationId)}
                />
              </section>
            ) : null}
          </div>
        )}
      </Card>

      <RecommendationProfileModal
        organizationId={profileOrgId}
        open={Boolean(profileOrgId)}
        onClose={() => setProfileOrgId(null)}
        onRequestMeeting={fromOrgId ? openInterestFromProfile : undefined}
        requestMeetingLabel="I'm interested"
        reasons={profileItem ? matchReasons(profileItem) : undefined}
      />
    </>
  );
}
