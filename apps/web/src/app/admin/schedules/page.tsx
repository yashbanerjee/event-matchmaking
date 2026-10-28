'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

export default function SchedulesPage() {
  const { data, isLoading } = useAdminQuery<{
    items: Array<{
      id: string;
      status: string;
      startsAt: string;
      companyOrg: { name: string };
      vendorOrg: { name: string };
      matchScore: number | null;
    }>;
  }>(['schedules-meetings'], '/meetings?pageSize=50');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Schedule management</h1>
          <p className="text-sm text-[var(--muted)]">
            Persisted schedule rows. Generate and publish from Matchmaking.
          </p>
        </div>
        <Link href="/admin/matchmaking">
          <Button>Open matchmaking</Button>
        </Link>
      </div>
      <Card>
        {isLoading && <p>Loading…</p>}
        <Table>
          <THead>
            <TR>
              <TH>Company</TH>
              <TH>Vendor</TH>
              <TH>Starts</TH>
              <TH>Score</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {data?.items.map((m) => (
              <TR key={m.id}>
                <TD>{m.companyOrg.name}</TD>
                <TD>{m.vendorOrg.name}</TD>
                <TD>{new Date(m.startsAt).toLocaleString()}</TD>
                <TD>{m.matchScore?.toFixed(1) ?? '—'}</TD>
                <TD>{m.status}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
