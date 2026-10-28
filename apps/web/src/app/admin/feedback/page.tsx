'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

export default function FeedbackPage() {
  const { data, isLoading } = useAdminQuery<{
    items: Array<{
      id: string;
      outcome: string;
      meetingQuality: number | null;
      isConfidential: boolean;
      organization: { name: string };
      meeting: {
        companyOrg: { name: string };
        vendorOrg: { name: string };
      };
    }>;
  }>(['feedback'], '/feedback');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Feedback & reviews</h1>
        <p className="text-sm text-[var(--muted)]">
          Independent submissions. Confidential comments stay admin-only by default.
        </p>
      </div>
      <Card>
        {isLoading && <p>Loading…</p>}
        {!isLoading && !data?.items.length && (
          <EmptyState title="No feedback yet" />
        )}
        <Table>
          <THead>
            <TR>
              <TH>Reviewer org</TH>
              <TH>Meeting</TH>
              <TH>Outcome</TH>
              <TH>Quality</TH>
              <TH>Confidential</TH>
            </TR>
          </THead>
          <TBody>
            {data?.items.map((f) => (
              <TR key={f.id}>
                <TD>{f.organization.name}</TD>
                <TD>
                  {f.meeting.companyOrg.name} ↔ {f.meeting.vendorOrg.name}
                </TD>
                <TD>{f.outcome}</TD>
                <TD>{f.meetingQuality ?? '—'}</TD>
                <TD>
                  <Badge variant={f.isConfidential ? 'warning' : 'secondary'}>
                    {f.isConfidential ? 'Yes' : 'No'}
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
