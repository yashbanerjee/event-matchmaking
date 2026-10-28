'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAccessToken } from '@/lib/auth-store';
import { getApiBase } from '@/lib/utils';
import { useAdminQuery } from '@/lib/admin-query';

export default function ReportsPage() {
  const { data, isLoading, error, refetch } = useAdminQuery<Record<string, number | string>>(
    ['reports-summary'],
    '/reports/summary',
  );

  const download = async (kind: 'summary' | 'meetings' | 'feedback') => {
    const res = await fetch(`${getApiBase()}/reports/export/${kind}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-[var(--muted)]">
            Server-side aggregations with CSV export. Generated timestamp shown on export.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void download('summary')}>
            Export summary CSV
          </Button>
          <Button variant="outline" onClick={() => void download('meetings')}>
            Export meetings CSV
          </Button>
          <Button variant="outline" onClick={() => void download('feedback')}>
            Export feedback CSV
          </Button>
          <Button onClick={() => void refetch()}>Refresh</Button>
        </div>
      </div>
      {isLoading && <p>Loading…</p>}
      {error && <p className="text-red-700">{(error as Error).message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data &&
          Object.entries(data).map(([key, value]) => (
            <Card key={key}>
              <div className="text-sm text-[var(--muted)]">{key}</div>
              <div className="text-xl font-semibold mt-2">
                {typeof value === 'number' && key.toLowerCase().includes('rate')
                  ? `${(value * 100).toFixed(1)}%`
                  : String(value)}
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
}
