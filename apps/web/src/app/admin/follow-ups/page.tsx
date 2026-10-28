'use client';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

export default function FollowUpsPage() {
  const { data, isLoading } = useAdminQuery<{
    items: Array<{
      id: string;
      title: string;
      dueAt: string | null;
      completedAt: string | null;
      organization: { name: string };
      assignee: { email: string } | null;
    }>;
  }>(['follow-ups'], '/follow-ups');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Follow-ups</h1>
        <p className="text-sm text-[var(--muted)]">Actions created from meeting feedback.</p>
      </div>
      <Card>
        {isLoading && <p>Loading…</p>}
        {!isLoading && !data?.items.length && <EmptyState title="No follow-ups" />}
        <Table>
          <THead>
            <TR>
              <TH>Title</TH>
              <TH>Organization</TH>
              <TH>Assignee</TH>
              <TH>Due</TH>
              <TH>Completed</TH>
            </TR>
          </THead>
          <TBody>
            {data?.items.map((f) => (
              <TR key={f.id}>
                <TD>{f.title}</TD>
                <TD>{f.organization.name}</TD>
                <TD>{f.assignee?.email ?? '—'}</TD>
                <TD>{f.dueAt ? new Date(f.dueAt).toLocaleDateString() : '—'}</TD>
                <TD>
                  {f.completedAt
                    ? new Date(f.completedAt).toLocaleDateString()
                    : 'Open'}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
