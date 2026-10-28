'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

export default function NotificationsPage() {
  const { data, isLoading } = useAdminQuery<{
    items: Array<{
      id: string;
      templateCode: string;
      recipientEmail: string;
      createdAt: string;
      deliveries: Array<{ status: string; provider: string | null }>;
    }>;
  }>(['notifications'], '/notifications');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-sm text-[var(--muted)]">
          Delivery attempts via configured email adapter (console / SMTP / SendGrid).
        </p>
      </div>
      <Card>
        {isLoading && <p>Loading…</p>}
        {!isLoading && !data?.items.length && <EmptyState title="No notifications" />}
        <Table>
          <THead>
            <TR>
              <TH>Template</TH>
              <TH>Recipient</TH>
              <TH>Status</TH>
              <TH>Provider</TH>
              <TH>Created</TH>
            </TR>
          </THead>
          <TBody>
            {data?.items.map((n) => {
              const latest = n.deliveries[0];
              return (
                <TR key={n.id}>
                  <TD>{n.templateCode}</TD>
                  <TD>{n.recipientEmail}</TD>
                  <TD>
                    <Badge variant="secondary">{latest?.status ?? 'QUEUED'}</Badge>
                  </TD>
                  <TD>{latest?.provider ?? '—'}</TD>
                  <TD>{new Date(n.createdAt).toLocaleString()}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
