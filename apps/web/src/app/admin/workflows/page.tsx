'use client';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

export default function WorkflowsPage() {
  const { data, isLoading } = useAdminQuery<
    Array<{
      id: string;
      code: string;
      name: string;
      targetType: string;
      isActive: boolean;
      versions: Array<{ version: number; status: string }>;
    }>
  >(['workflows'], '/workflows');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Onboarding workflows</h1>
        <p className="text-sm text-[var(--muted)]">
          Assign different workflows per organization type without code changes.
        </p>
      </div>
      <Card>
        {isLoading && <p>Loading…</p>}
        {!isLoading && !data?.length && (
          <EmptyState
            title="No workflows yet"
            description="Create forms and link them to onboarding workflows."
          />
        )}
        <Table>
          <THead>
            <TR>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Target</TH>
              <TH>Latest</TH>
              <TH>Active</TH>
            </TR>
          </THead>
          <TBody>
            {data?.map((w) => (
              <TR key={w.id}>
                <TD className="font-mono text-xs">{w.code}</TD>
                <TD>{w.name}</TD>
                <TD>{w.targetType}</TD>
                <TD>
                  {w.versions[0]
                    ? `v${w.versions[0].version} (${w.versions[0].status})`
                    : '—'}
                </TD>
                <TD>
                  <Badge variant={w.isActive ? 'success' : 'secondary'}>
                    {w.isActive ? 'Yes' : 'No'}
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
