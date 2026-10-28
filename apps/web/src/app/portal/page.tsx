'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { clearTokens, getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function PortalPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  const me = useQuery({
    queryKey: ['me'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{
        id: string;
        email: string;
        organizationIds: string[];
        roles: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  const meetings = useQuery({
    queryKey: ['portal-meetings'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{
        items: Array<{
          id: string;
          status: string;
          startsAt: string;
          companyOrg: { name: string };
          vendorOrg: { name: string };
        }>;
      }>('/meetings', { token: getAccessToken() }),
  });

  const confirm = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/meetings/${id}/confirm`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({}),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal-meetings'] }),
  });

  const feedback = useMutation({
    mutationFn: (meeting: {
      id: string;
      organizationId: string;
    }) =>
      apiFetch(`/meetings/${meeting.id}/feedback`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          organizationId: meeting.organizationId,
          attendanceConfirmed: true,
          meetingQuality: 4,
          relevance: 4,
          businessPotential: 4,
          communicationQuality: 4,
          interestLevel: 4,
          followUpRequired: true,
          outcome: 'FOLLOW_UP_REQUIRED',
          comments: 'Constructive discussion; schedule follow-up.',
          isConfidential: true,
        }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['portal-meetings'] }),
  });

  if (!ready) return null;

  return (
    <main className="min-h-screen p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Participant portal</h1>
          <p className="text-sm text-[var(--muted)]">
            Signed in as {me.data?.email}. Meetings are loaded from the published
            schedule store.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            clearTokens();
            router.push('/login');
          }}
        >
          Sign out
        </Button>
      </div>

      <Card>
        <h2 className="font-medium mb-3">Your meetings</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Company</th>
              <th>Vendor</th>
              <th>Starts</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {meetings.data?.items.map((m) => (
              <tr key={m.id} className="border-b border-[var(--border)]">
                <td className="py-2">{m.companyOrg.name}</td>
                <td>{m.vendorOrg.name}</td>
                <td>{new Date(m.startsAt).toLocaleString()}</td>
                <td>{m.status}</td>
                <td className="space-x-2">
                  {m.status === 'AWAITING_CONFIRMATION' && (
                    <Button size="sm" onClick={() => confirm.mutate(m.id)}>
                      Confirm
                    </Button>
                  )}
                  {me.data?.organizationIds[0] && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        feedback.mutate({
                          id: m.id,
                          organizationId: me.data!.organizationIds[0]!,
                        })
                      }
                    >
                      Feedback
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
