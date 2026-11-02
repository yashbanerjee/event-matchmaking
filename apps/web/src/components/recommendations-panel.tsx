'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PEER_RECOMMENDATIONS_ABSOLUTE_MAX } from '@em/shared';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { MeetingSchedulePicker } from '@/components/meeting-schedule-picker';
import { RecommendationProfileModal } from '@/components/recommendation-profile-modal';

type MatchSource = 'ai' | 'tags' | 'admin';
type EngagementStatus = 'active' | 'engaged' | 'dismissed';

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
  matchSource?: MatchSource;
  engagementStatus?: EngagementStatus;
};

function sourceLabel(item: Recommendation): { text: string; title: string } {
  if (item.matchSource === 'admin') {
    return { text: 'Admin pick', title: 'Pinned by an administrator' };
  }
  if (item.matchSource === 'ai') {
    return { text: 'AI match', title: 'Scored by the AI recommendation model' };
  }
  return { text: 'Tag match', title: 'Scored from shared profile tags' };
}

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
  dismissingOrgId,
  showNotInterested,
  showInterestActions,
  statusBadge,
  onInterest,
  onNotInterested,
  onViewProfile,
  featured,
}: {
  items: Recommendation[];
  fromOrgId?: string;
  pendingOrgId?: string | null;
  dismissingOrgId?: string | null;
  showNotInterested?: boolean;
  showInterestActions?: boolean;
  statusBadge?: { text: string; title: string };
  onInterest: (item: Recommendation) => void;
  onNotInterested?: (item: Recommendation) => void;
  onViewProfile: (item: Recommendation) => void;
  featured?: boolean;
}) {
  const canAct = showInterestActions !== false;
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => (
        <div
          key={item.organizationId}
          className={`animate-rise min-w-0 overflow-hidden rounded-xl border p-3 ${
            featured || item.featured
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
                <Badge
                  variant={
                    item.matchSource === 'ai' || featured || item.featured
                      ? 'accent'
                      : 'secondary'
                  }
                  className="shrink-0"
                  title={sourceLabel(item).title}
                >
                  {sourceLabel(item).text}
                </Badge>
                {statusBadge ? (
                  <Badge
                    variant="secondary"
                    className="shrink-0"
                    title={statusBadge.title}
                  >
                    {statusBadge.text}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
                {item.industry || item.type}
              </p>
            </button>
            {item.score > 0 ? (
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
            {canAct ? (
              <Button
                size="sm"
                disabled={
                  !fromOrgId ||
                  Boolean(pendingOrgId) ||
                  Boolean(dismissingOrgId) ||
                  pendingOrgId === item.organizationId
                }
                loading={pendingOrgId === item.organizationId}
                onClick={() => onInterest(item)}
              >
                I&apos;m interested
              </Button>
            ) : null}
            {canAct && showNotInterested ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  !fromOrgId ||
                  Boolean(pendingOrgId) ||
                  Boolean(dismissingOrgId)
                }
                loading={dismissingOrgId === item.organizationId}
                onClick={() => onNotInterested?.(item)}
              >
                Not interested
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecommendationsPanel({
  fromOrgId,
  title,
}: {
  fromOrgId?: string;
  title: string;
  /** @deprecated Unused — kept so call sites can pass it without breaking. */
  description?: string;
}) {
  const qc = useQueryClient();
  const [profileOrgId, setProfileOrgId] = useState<string | null>(null);
  const [interestOrgId, setInterestOrgId] = useState<string | null>(null);
  const [dismissingOrgId, setDismissingOrgId] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Recommendation | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interestSent, setInterestSent] = useState<string | null>(null);
  const [dismissedNote, setDismissedNote] = useState<string | null>(null);

  const recs = useQuery({
    queryKey: ['recommendations'],
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.computing ? 3000 : false,
    queryFn: () =>
      apiFetch<{
        items: Recommendation[];
        featured: Recommendation[];
        perspective: 'COMPANY' | 'VENDOR' | null;
        computing?: boolean;
        scoreThreshold?: number;
      }>(`/recommendations?limit=${PEER_RECOMMENDATIONS_ABSOLUTE_MAX}`, {
        token: getAccessToken(),
      }),
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
      setDismissedNote(null);
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

  const dismissPeer = useMutation({
    mutationFn: (toOrgId: string) =>
      apiFetch(`/recommendations/${toOrgId}/dismiss`, {
        method: 'POST',
        token: getAccessToken(),
        body: '{}',
      }),
    onSuccess: async (_data, toOrgId) => {
      setDismissingOrgId(null);
      setError(null);
      setInterestSent(null);
      setDismissedNote(toOrgId);
      if (profileOrgId === toOrgId) setProfileOrgId(null);
      await qc.invalidateQueries({ queryKey: ['recommendations'] });
      await qc.invalidateQueries({ queryKey: ['recommendations-browse'] });
    },
    onError: (err) => {
      setDismissingOrgId(null);
      setError((err as Error).message);
    },
  });

  const perspective = recs.data?.perspective ?? null;
  const isInvestor = perspective === 'COMPANY';
  const allowedPeerType =
    perspective === 'COMPANY'
      ? 'VENDOR'
      : perspective === 'VENDOR'
        ? 'COMPANY'
        : null;
  const byPeerType = (item: Recommendation) =>
    !allowedPeerType || item.type === allowedPeerType;
  const featured = (recs.data?.featured ?? []).filter(byPeerType);
  const items = (recs.data?.items ?? []).filter(byPeerType);
  const allItems = [...featured, ...items];
  const statusOf = (item: Recommendation): EngagementStatus =>
    item.engagementStatus ?? 'active';
  const activeItems = allItems.filter((item) => statusOf(item) === 'active');
  const engagedItems = allItems.filter((item) => statusOf(item) === 'engaged');
  const dismissedItems = allItems.filter(
    (item) => statusOf(item) === 'dismissed',
  );
  const computing = Boolean(recs.data?.computing);
  const empty = allItems.length === 0;
  const profileItem = profileOrgId
    ? (allItems.find((r) => r.organizationId === profileOrgId) ?? null)
    : null;

  const sendInterest = (item: Recommendation) => {
    setError(null);
    setScheduleError(null);
    setInterestSent(null);
    if (isInvestor) {
      // Investors propose date/time/place with the interest request.
      setScheduleFor(item);
      return;
    }
    setInterestOrgId(item.organizationId);
    expressInterest.mutate({
      toOrgId: item.organizationId,
      mode: 'INTEREST',
    });
  };

  const openInterestFromProfile = () => {
    if (!profileItem) return;
    setProfileOrgId(null);
    sendInterest(profileItem);
  };

  const markNotInterested = (item: Recommendation) => {
    setError(null);
    setDismissedNote(null);
    setInterestSent(null);
    setDismissingOrgId(item.organizationId);
    dismissPeer.mutate(item.organizationId);
  };

  return (
    <>
      <Card className="min-w-0 overflow-hidden p-4">
        <div className="mb-3 min-w-0">
          <h2 className="h-display text-base font-semibold tracking-tight">
            {title}
          </h2>
        </div>

        {computing && !empty ? (
          <p className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 text-sm text-[var(--muted)]">
            Refreshing AI and tag scores — only matches above the threshold stay
            visible.
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        {interestSent ? (
          <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {isInvestor
              ? 'Meeting request sent with your proposed time. They can accept or decline under Requests.'
              : 'Interest sent. The investor will propose a meeting time under Requests.'}
          </p>
        ) : null}
        {dismissedNote ? (
          <p className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 text-sm text-[var(--muted)]">
            Moved to Not interested. You can still review the match below.
          </p>
        ) : null}

        {recs.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading recommendations…</p>
        ) : computing && empty ? (
          <EmptyState
            title="Finding your matches"
            description="We are running AI and tag scoring against verified partners. This page will update when real matches are ready."
          />
        ) : empty ? (
          <EmptyState
            title="No strong matches yet"
            description="We only show partners that score above the match threshold. Update your topics and capabilities, or ask an admin to pin a partner."
          />
        ) : (
          <div className="space-y-4">
            {activeItems.length > 0 ? (
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Active recommendations
                </h3>
                <SuggestionGrid
                  items={activeItems}
                  fromOrgId={fromOrgId}
                  pendingOrgId={interestOrgId ?? scheduleFor?.organizationId}
                  dismissingOrgId={dismissingOrgId}
                  showNotInterested={isInvestor}
                  onInterest={sendInterest}
                  onNotInterested={markNotInterested}
                  onViewProfile={(item) => setProfileOrgId(item.organizationId)}
                />
              </section>
            ) : null}

            {engagedItems.length > 0 ? (
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Meeting or request in progress
                </h3>
                <SuggestionGrid
                  items={engagedItems}
                  fromOrgId={fromOrgId}
                  pendingOrgId={interestOrgId ?? scheduleFor?.organizationId}
                  dismissingOrgId={dismissingOrgId}
                  showInterestActions={false}
                  statusBadge={{
                    text: 'In progress',
                    title: 'A meeting request or meeting is already open',
                  }}
                  onInterest={sendInterest}
                  onViewProfile={(item) => setProfileOrgId(item.organizationId)}
                />
              </section>
            ) : null}

            {dismissedItems.length > 0 ? (
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Not interested
                </h3>
                <SuggestionGrid
                  items={dismissedItems}
                  fromOrgId={fromOrgId}
                  pendingOrgId={interestOrgId ?? scheduleFor?.organizationId}
                  dismissingOrgId={dismissingOrgId}
                  showInterestActions={false}
                  statusBadge={{
                    text: 'Not interested',
                    title: 'You marked this match as not interested',
                  }}
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
