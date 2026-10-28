'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Card } from '@/components/ui/card';

export default function AdminMeetingsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-meetings'],
    queryFn: () =>
      apiFetch<{
        items: Array<{
          id: string;
          status: string;
          startsAt: string;
          matchScore: number | null;
          companyOrg: { name: string };
          vendorOrg: { name: string };
        }>;
      }>('/meetings', { token: getAccessToken() }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <p className="text-sm text-[var(--muted)]">
          Persisted schedule meetings (not computed on page load).
        </p>
      </div>
      <Card>
        {isLoading && <p>Loading…</p>}
        {error && <p className="text-red-700">{(error as Error).message}</p>}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
              <th className="py-2">Company</th>
              <th>Vendor</th>
              <th>Starts</th>
              <th>Score</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((m) => (
              <tr key={m.id} className="border-b border-[var(--border)]">
                <td className="py-2">{m.companyOrg.name}</td>
                <td>{m.vendorOrg.name}</td>
                <td>{new Date(m.startsAt).toLocaleString()}</td>
                <td>{m.matchScore?.toFixed(1) ?? '—'}</td>
                <td>{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
