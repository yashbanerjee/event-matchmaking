'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AiFineTunePanel } from '@/components/ai-fine-tune-panel';
import { PageHeader } from '@/components/page-header';
import { TagMappingsPanel } from '@/components/tag-mappings-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EventDateChips } from '@/components/event-date-chips';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import {
  DEFAULT_EVENT_DATES,
  normalizeEventSchedule,
  type EventSchedule,
} from '@/lib/event-schedule';

type MatchRun = {
  id: string;
  status: string;
  scheduleDate: string;
  config: {
    useAi?: boolean;
    startTime?: string;
    endTime?: string;
    meetingDurationMinutes?: number;
    timeZone?: string;
  };
  candidates?: Array<{
    id: string;
    totalScore: number;
    eligible: boolean;
    explanation: string;
    companyOrgId: string;
    vendorOrgId: string;
  }>;
  scheduleVersions?: Array<{
    id: string;
    status: string;
    meetings?: unknown[];
  }>;
};

export default function MatchmakingPage() {
  const qc = useQueryClient();
  const [scheduleDate, setScheduleDate] = useState(DEFAULT_EVENT_DATES[0]!);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [duration, setDuration] = useState(15);
  const [matchmakingEnabled, setMatchmakingEnabled] = useState(true);
  const [aiMatchmakingOn, setAiMatchmakingOn] = useState(true);
  const [manualMatchmakingOn, setManualMatchmakingOn] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const bookingWindow = useQuery({
    queryKey: ['meeting-booking-window'],
    queryFn: () =>
      apiFetch<EventSchedule>('/meeting-requests/booking-window', {
        token: getAccessToken(),
      }),
  });
  const eventSchedule = normalizeEventSchedule(bookingWindow.data);

  useEffect(() => {
    if (!bookingWindow.data) return;
    const next = normalizeEventSchedule(bookingWindow.data);
    setScheduleDate((current) =>
      next.dates.includes(current) ? current : (next.dates[0] ?? ''),
    );
    setStartTime(next.activeStart);
    setEndTime(next.activeEnd);
    setDuration(next.durationMinutes);
  }, [bookingWindow.data]);

  const dateStatus = useQuery({
    queryKey: ['matchmaking-date-status', scheduleDate],
    queryFn: () =>
      apiFetch<{
        scheduleDate: string;
        meetingCount: number;
        canGenerate: boolean;
      }>(`/matchmaking/dates/${scheduleDate}/status`, {
        token: getAccessToken(),
      }),
    enabled: Boolean(scheduleDate),
  });

  const aiHealth = useQuery({
    queryKey: ['integrations-health-ai'],
    queryFn: () =>
      apiFetch<{
        aiEnabled: boolean;
        ai: Array<{ provider: string; healthy: boolean }>;
      }>('/integrations/health', { token: getAccessToken() }),
  });

  const aiSettings = useQuery({
    queryKey: ['settings-ai-matchmaking'],
    queryFn: () =>
      apiFetch<{
        integration: Array<{
          id: string;
          fields: Array<{ key: string; value: unknown; envDefault: unknown }>;
        }>;
      }>('/settings', { token: getAccessToken() }),
  });

  const settingsAiEnabled = useMemo(() => {
    const aiGroup = aiSettings.data?.integration.find((g) => g.id === 'ai');
    const field = aiGroup?.fields.find((f) => f.key === 'ai.enabled');
    const raw =
      field?.value !== undefined &&
      field?.value !== null &&
      field?.value !== ''
        ? field.value
        : (field?.envDefault ?? true);
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
  }, [aiSettings.data]);

  useEffect(() => {
    if (!aiSettings.data) return;
    setAiMatchmakingOn(settingsAiEnabled);
  }, [aiSettings.data, settingsAiEnabled]);

  const run = useQuery({
    queryKey: ['matchmaking-run', lastRunId],
    queryFn: () =>
      apiFetch<MatchRun>(`/matchmaking/runs/${lastRunId}`, {
        token: getAccessToken(),
      }),
    enabled: Boolean(lastRunId),
  });

  const startRun = useMutation({
    mutationFn: async () => {
      setError(null);
      setResetMessage(null);
      return apiFetch<MatchRun>('/matchmaking/runs', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          scheduleDate,
          startTime,
          endTime,
          timeZone: 'Asia/Dubai',
          meetingDurationMinutes: duration,
          bufferMinutes: 5,
          mode: 'IN_PERSON',
          useAi: matchmakingEnabled && aiMatchmakingOn,
        }),
      });
    },
    onSuccess: (data) => {
      setLastRunId(data.id);
      void qc.invalidateQueries({ queryKey: ['matchmaking-date-status'] });
      void qc.invalidateQueries({ queryKey: ['admin-meetings'] });
      void qc.invalidateQueries({ queryKey: ['admin-peer-recommendations'] });
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to start matchmaking run');
    },
  });

  const saveAiMatchmaking = useMutation({
    mutationFn: async (enabled: boolean) => {
      setError(null);
      return apiFetch('/settings/values', {
        method: 'PUT',
        token: getAccessToken(),
        body: JSON.stringify({ key: 'ai.enabled', value: enabled }),
      });
    },
    onSuccess: (_data, enabled) => {
      setAiMatchmakingOn(enabled);
      void qc.invalidateQueries({ queryKey: ['settings-ai-matchmaking'] });
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['integrations-health-ai'] });
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to update AI matchmaking');
      void qc.invalidateQueries({ queryKey: ['settings-ai-matchmaking'] });
    },
  });

  const resetMatchmaking = useMutation({
    mutationFn: async () => {
      setError(null);
      setResetMessage(null);
      return apiFetch<{
        scheduleDate: string;
        cancelledMeetings: number;
        deletedRuns: number;
        clearedPeerRecommendations: number;
      }>('/matchmaking/reset', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({ scheduleDate }),
      });
    },
    onSuccess: (data) => {
      setLastRunId(null);
      setResetMessage(
        `Reset ${data.scheduleDate}: removed ${data.deletedRuns} run(s), cancelled ${data.cancelledMeetings} meeting(s), cleared ${data.clearedPeerRecommendations} recommendation(s).`,
      );
      void qc.invalidateQueries({ queryKey: ['matchmaking-date-status'] });
      void qc.invalidateQueries({ queryKey: ['matchmaking-run'] });
      void qc.invalidateQueries({ queryKey: ['admin-meetings'] });
      void qc.invalidateQueries({ queryKey: ['admin-peer-recommendations'] });
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to reset matchmaking');
    },
  });

  const topCandidates = useMemo(
    () => (run.data?.candidates ?? []).slice(0, 12),
    [run.data?.candidates],
  );
  const meetingCount = dateStatus.data?.meetingCount ?? 0;
  const aiEnabled = aiHealth.data?.aiEnabled ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Matchmaking"
        description="Score investor–innovator pairs for admin review. Participants express interest from Recommendations and schedule meetings themselves."
        actions={
          <Button
            variant="outline"
            loading={resetMatchmaking.isPending}
            disabled={!scheduleDate || resetMatchmaking.isPending}
            onClick={() => {
              if (
                !window.confirm(
                  `Reset matchmaking for ${scheduleDate}? This cancels open meetings and deletes scoring runs for that date.`,
                )
              ) {
                return;
              }
              resetMatchmaking.mutate();
            }}
          >
            {resetMatchmaking.isPending ? 'Resetting…' : 'Reset matchmaking'}
          </Button>
        }
      />

      {resetMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {resetMessage}
        </p>
      ) : null}

      <AiFineTunePanel />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Matchmaking</h2>
              <Badge variant={matchmakingEnabled ? 'success' : 'default'}>
                {matchmakingEnabled ? 'Enabled' : 'Off'}
              </Badge>
              {matchmakingEnabled ? (
                <Badge
                  variant={
                    aiMatchmakingOn && aiEnabled ? 'success' : 'default'
                  }
                >
                  AI{' '}
                  {!aiMatchmakingOn
                    ? 'off'
                    : aiEnabled
                      ? 'on'
                      : 'configured off / unavailable'}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Scores all investor–innovator pairs for the selected event day.
              Turn AI matchmaking off to score with rules only.
            </p>
          </div>
          {meetingCount > 0 && (
            <Badge variant="warning">{meetingCount} meetings on this date</Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--brand)]"
              checked={matchmakingEnabled}
              onChange={(e) => setMatchmakingEnabled(e.target.checked)}
            />
            <span>
              <span className="font-medium">Enable matchmaking</span>
              <span className="mt-0.5 block text-[var(--muted)]">
                Allows scoring runs for the selected event day.
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--brand)]"
              checked={aiMatchmakingOn}
              disabled={
                !matchmakingEnabled || saveAiMatchmaking.isPending
              }
              onChange={(e) => saveAiMatchmaking.mutate(e.target.checked)}
            />
            <span>
              <span className="font-medium">AI matchmaking</span>
              <span className="mt-0.5 block text-[var(--muted)]">
                {aiMatchmakingOn
                  ? 'On — model scores pairs and blends with rules. Also saved in Settings → AI.'
                  : 'Off — rule-based tag matching only (no AI calls).'}
              </span>
            </span>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm sm:col-span-2 lg:col-span-4">
            <span className="text-[var(--muted)]">Event date</span>
            <EventDateChips
              dates={eventSchedule.dates}
              value={scheduleDate}
              onChange={setScheduleDate}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Start</span>
            <Input
              type="time"
              min={eventSchedule.activeStart}
              max={eventSchedule.activeEnd}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={!matchmakingEnabled}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">End</span>
            <Input
              type="time"
              min={eventSchedule.activeStart}
              max={eventSchedule.activeEnd}
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={!matchmakingEnabled}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Meeting length (min)</span>
            <Input
              type="number"
              min={5}
              max={120}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 15)}
              disabled={!matchmakingEnabled}
            />
          </label>
        </div>

        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            loading={startRun.isPending}
            disabled={!matchmakingEnabled || !scheduleDate || startRun.isPending}
            onClick={() => startRun.mutate()}
          >
            Run scoring
          </Button>
        </div>
      </Card>

      {run.data && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Latest run</h2>
            <Badge>{run.data.status}</Badge>
            {run.data.config?.useAi ? (
              <Badge variant="success">AI on</Badge>
            ) : (
              <Badge>Rules only</Badge>
            )}
            <span className="text-sm text-[var(--muted)]">
              {String(run.data.scheduleDate).slice(0, 10)} ·{' '}
              {run.data.candidates?.length ?? 0} scored pairs
            </span>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Score</TH>
                <TH>Eligible</TH>
                <TH>Explanation</TH>
              </TR>
            </THead>
            <TBody>
              {topCandidates.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.totalScore.toFixed(1)}</TD>
                  <TD>
                    <Badge variant={c.eligible ? 'success' : 'default'}>
                      {c.eligible ? 'yes' : 'no'}
                    </Badge>
                  </TD>
                  <TD className="max-w-xl text-xs text-[var(--muted)]">
                    {c.explanation}
                  </TD>
                </TR>
              ))}
              {topCandidates.length === 0 && (
                <TR>
                  <TD colSpan={3} className="text-[var(--muted)]">
                    No candidates yet.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </Card>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Manual matchmaking</h2>
              <Badge variant={manualMatchmakingOn ? 'success' : 'default'}>
                {manualMatchmakingOn ? 'On' : 'Off'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Link related tags by hand when you want custom cross-matches.
              Leave this off unless you need manual tag links.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={manualMatchmakingOn}
              onChange={(e) => setManualMatchmakingOn(e.target.checked)}
            />
            Turn on manual matchmaking
          </label>
        </div>

        {manualMatchmakingOn ? (
          <TagMappingsPanel
            title="Manual tag links"
            description="Link related tags so recommendations cross-match. Previously linked tags stay listed below."
          />
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
            Manual matchmaking is off. Turn it on above to link tags.
          </p>
        )}
      </Card>
    </div>
  );
}
