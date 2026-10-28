'use client';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

export default function UsersPage() {
  const { data, isLoading, error } = useAdminQuery<{
    items: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      status: string;
      roles: Array<{ role: { code: string } }>;
      memberships: Array<{ organization: { name: string } }>;
    }>;
  }>(['users'], '/users');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-[var(--muted)]">Accounts separated from organization profiles.</p>
      </div>
      <Card>
        {isLoading && <p>Loading…</p>}
        {error && <p className="text-red-700">{(error as Error).message}</p>}
        {!isLoading && !data?.items.length && (
          <EmptyState title="No users" description="Invite users to get started." />
        )}
        <Table>
          <THead>
            <TR>
              <TH>Email</TH>
              <TH>Name</TH>
              <TH>Roles</TH>
              <TH>Organizations</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {data?.items.map((u) => (
              <TR key={u.id}>
                <TD>{u.email}</TD>
                <TD>
                  {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                </TD>
                <TD className="space-x-1">
                  {u.roles.map((r) => (
                    <Badge key={r.role.code} variant="secondary">
                      {r.role.code}
                    </Badge>
                  ))}
                </TD>
                <TD>
                  {u.memberships.map((m) => m.organization.name).join(', ') || '—'}
                </TD>
                <TD>
                  <Badge variant={u.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {u.status}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
