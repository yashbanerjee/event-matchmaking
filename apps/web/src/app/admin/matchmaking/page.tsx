'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Run = {
  id: string;
  status: string;
  scheduleVersions: Array<{
    id: string;
    status: string;
    meetings: Array<{
      id: string;
      startsAt: string;
      endsAt: string;
      matchScore: number | null;
      companyOrg: { name: string };
      vendorOrg: { name: string };
      match?: { explanation: string; isManual: boolean };
    }>;
  }>;
  candidates: Array<{
    totalScore: number;
    eligible: boolean;
    explanation: string;
    companyOrgId: string;
    vendorOrgId: string;
  }>;
};

export default function MatchmakingPage() {
  const [date, setDate] = useState('2026-11-01');
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () =>
      apiFetch<Run>('/matchmaking/runs', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          scheduleDate: date,
          startTime: '09:00',
          endTime: '17:00',
          timeZone: 'UTC',
          slotCount: 6,
          meetingDurationMinutes: 30,
          bufferMinutes: 10,
          maxMeetingsPerParticipant: 6,
          mode: 'VIRTUAL',
        }),
      }),
    onSuccess: (data) => {
      setRun(data);
      setError(null);
    },
    onError: (err) => setError((err as Error).message),
  });

  const publish = useMutation({
    mutationFn: (scheduleId: string) =>
      apiFetch(`/matchmaking/schedules/${scheduleId}/publish`, {
        method: 'POST',
        token: getAccessToken(),
      }),
    onSuccess: async () => {
      if (!run) return;
      const refreshed = await apiFetch<Run>(`/matchmaking/runs/${run.id}`, {
        token: getAccessToken(),
      });
      setRun(refreshed);
    },
  });

  const schedule = run?.scheduleVersions[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Matchmaking</h1>
        <p className="text-sm text-[var(--muted)]">
          Deterministic scoring with greedy scheduling. Results persist before
          publication; dashboards never re-run matching.
        </p>
      </div>
      <Card className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm block mb-1">Schedule date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? 'Running…' : 'Generate schedule'}
        </Button>
        {schedule && schedule.status !== 'PUBLISHED' && (
          <Button
            variant="outline"
            onClick={() => publish.mutate(schedule.id)}
            disabled={publish.isPending}
          >
            Publish schedule
          </Button>
        )}
      </Card>
      {error && <p className="text-red-700 text-sm">{error}</p>}
      {run && (
        <>
          <Card>
            <div className="text-sm text-[var(--muted)]">Run status</div>
            <div className="text-xl font-semibold">{run.status}</div>
          </Card>
          <Card>
            <h2 className="font-medium mb-3">Proposed meetings</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="py-2">Company</th>
                  <th>Vendor</th>
                  <th>Score</th>
                  <th>Starts</th>
                  <th>Explanation</th>
                </tr>
              </thead>
              <tbody>
                {schedule?.meetings.map((m) => (
                  <tr key={m.id} className="border-b border-[var(--border)] align-top">
                    <td className="py-2">{m.companyOrg.name}</td>
                    <td>{m.vendorOrg.name}</td>
                    <td>{m.matchScore?.toFixed(1) ?? '—'}</td>
                    <td>{new Date(m.startsAt).toISOString()}</td>
                    <td className="max-w-md text-xs text-[var(--muted)]">
                      {m.match?.explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
