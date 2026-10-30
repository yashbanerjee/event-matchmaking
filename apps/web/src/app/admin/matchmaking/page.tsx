'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { TagMappingsPanel } from '@/components/tag-mappings-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

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

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function MatchmakingPage() {
  const qc = useQueryClient();
  const [scheduleDate, setScheduleDate] = useState(todayIsoDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [duration, setDuration] = useState(15);
  const [useAi, setUseAi] = useState(true);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          useAi,
          forceRegenerate,
        }),
      });
    },
    onSuccess: (data) => {
      setLastRunId(data.id);
      setForceRegenerate(false);
      void qc.invalidateQueries({ queryKey: ['matchmaking-date-status'] });
      void qc.invalidateQueries({ queryKey: ['admin-meetings'] });
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to start matchmaking run');
    },
  });

  const publish = useMutation({
    mutationFn: (scheduleVersionId: string) =>
      apiFetch(`/matchmaking/schedules/${scheduleVersionId}/publish`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['matchmaking-run', lastRunId] });
      void qc.invalidateQueries({ queryKey: ['admin-meetings'] });
    },
  });

  const topCandidates = useMemo(
    () => (run.data?.candidates ?? []).slice(0, 12),
    [run.data?.candidates],
  );
  const scheduleVersion = run.data?.scheduleVersions?.[0];
  const meetingCount = dateStatus.data?.meetingCount ?? 0;
  const aiEnabled = aiHealth.data?.aiEnabled ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Matchmaking"
        description="Score clients against guests on Ethara categories, venues, services, and commercial tags — optionally boost with AI."
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Generate schedule</h2>
            <p className="text-sm text-[var(--muted)]">
              Matches preferred categories ↔ event categories, capabilities /
              Ethara services, venues, and commercial focus.
            </p>
          </div>
          {meetingCount > 0 && (
            <Badge variant="warning">{meetingCount} meetings on this date</Badge>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Schedule date</span>
            <Input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">Start</span>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted)]">End</span>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
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
            />
          </label>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--brand)]"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
            />
            <span>
              <span className="font-medium">
                Use AI to boost matching (JAV / configured provider)
              </span>
              <span className="mt-0.5 block text-[var(--muted)]">
                Blends tag scores with semantic similarity on about / focus
                events / services
                {aiEnabled
                  ? ' (configured AI provider).'
                  : ' (local text similarity if AI is off).'}
              </span>
            </span>
          </label>
          <Badge variant={aiEnabled ? 'success' : 'default'}>
            AI {aiEnabled ? 'enabled' : 'fallback'}
          </Badge>
        </div>

        {meetingCount > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={forceRegenerate}
              onChange={(e) => setForceRegenerate(e.target.checked)}
            />
            Replace existing meetings for this date
          </label>
        )}

        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            loading={startRun.isPending}
            disabled={meetingCount > 0 && !forceRegenerate}
            onClick={() => startRun.mutate()}
          >
            Run matchmaking
          </Button>
          {scheduleVersion && scheduleVersion.status !== 'PUBLISHED' && (
            <Button
              variant="outline"
              loading={publish.isPending}
              onClick={() => publish.mutate(scheduleVersion.id)}
            >
              Publish schedule
            </Button>
          )}
        </div>
      </Card>

      {run.data && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Latest run</h2>
            <Badge>{run.data.status}</Badge>
            {run.data.config?.useAi && <Badge variant="success">AI</Badge>}
            <span className="text-sm text-[var(--muted)]">
              {String(run.data.scheduleDate).slice(0, 10)} ·{' '}
              {run.data.candidates?.length ?? 0} candidates ·{' '}
              {scheduleVersion?.meetings?.length ?? 0} meetings
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

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Tag equivalences</h2>
        <p className="text-sm text-[var(--muted)]">
          Link related Ethara tags (e.g. Sports ↔ Motorsport) so recommendations
          cross-match.
        </p>
        <TagMappingsPanel />
      </div>
    </div>
  );
}
