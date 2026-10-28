'use client';

import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

export default function AuditPage() {
  const { data, isLoading, error } = useAdminQuery<{
    items: Array<{
      id: string;
      action: string;
      entityType: string;
      entityId: string | null;
      outcome: string;
      createdAt: string;
      actor: { email: string } | null;
    }>;
  }>(['audit'], '/audit-logs');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit logs</h1>
        <p className="text-sm text-[var(--muted)]">Append-oriented operational history.</p>
      </div>
      <Card>
        {isLoading && <p>Loading…</p>}
        {error && <p className="text-red-700">{(error as Error).message}</p>}
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Outcome</TH>
            </TR>
          </THead>
          <TBody>
            {data?.items.map((a) => (
              <TR key={a.id}>
                <TD>{new Date(a.createdAt).toLocaleString()}</TD>
                <TD>{a.actor?.email ?? 'system'}</TD>
                <TD>{a.action}</TD>
                <TD>
                  {a.entityType}
                  {a.entityId ? `:${a.entityId.slice(0, 8)}` : ''}
                </TD>
                <TD>{a.outcome}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
