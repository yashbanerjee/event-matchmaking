'use client';

import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useAdminQuery } from '@/lib/admin-query';

type FeedbackRow = {
  id: string;
  outcome: string;
  meetingQuality: number | null;
  relevance: number | null;
  businessPotential: number | null;
  communicationQuality: number | null;
  interestLevel: number | null;
  comments: string | null;
  isConfidential: boolean;
  attendanceConfirmed: boolean;
  createdAt: string;
  organization: { name: string; type?: string };
  reviewer: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  meeting: {
    startsAt: string;
    companyOrg: { name: string };
    vendorOrg: { name: string };
  };
};

function reviewerName(row: FeedbackRow) {
  const name = [row.reviewer.firstName, row.reviewer.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || row.reviewer.email;
}

function counterpart(row: FeedbackRow) {
  const orgName = row.organization.name;
  if (orgName === row.meeting.companyOrg.name) {
    return row.meeting.vendorOrg.name;
  }
  if (orgName === row.meeting.vendorOrg.name) {
    return row.meeting.companyOrg.name;
  }
  return `${row.meeting.companyOrg.name} / ${row.meeting.vendorOrg.name}`;
}

export default function FeedbackPage() {
  const { data, isLoading } = useAdminQuery<{
    items: FeedbackRow[];
    total: number;
  }>(['feedback'], '/feedback?pageSize=100');

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Match & meet"
        title="Feedback & reviews"
        description="Post-meeting feedback and peer reviews from companies and vendors."
      />

      <Card>
        {isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No feedback yet"
            description="When a meeting ends, participants can submit feedback and review each other from their portal."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Reviewer</TH>
                  <TH>Reviewed</TH>
                  <TH>Meeting</TH>
                  <TH>Outcome</TH>
                  <TH>Meeting</TH>
                  <TH>Peer review</TH>
                  <TH>Comments</TH>
                  <TH>Submitted</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((f) => (
                  <TR key={f.id}>
                    <TD>
                      <div className="font-medium">{reviewerName(f)}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {f.organization.name}
                      </div>
                    </TD>
                    <TD>{counterpart(f)}</TD>
                    <TD className="text-sm">
                      {f.meeting.companyOrg.name} ↔ {f.meeting.vendorOrg.name}
                      <div className="text-xs text-[var(--muted)]">
                        {new Date(f.meeting.startsAt).toLocaleString()}
                      </div>
                    </TD>
                    <TD>
                      <Badge variant="secondary">
                        {f.outcome.replaceAll('_', ' ')}
                      </Badge>
                    </TD>
                    <TD className="text-sm">
                      Q {f.meetingQuality ?? '—'} · Rel {f.relevance ?? '—'}
                    </TD>
                    <TD className="text-sm">
                      Comm {f.communicationQuality ?? '—'} · Int{' '}
                      {f.interestLevel ?? '—'} · Biz{' '}
                      {f.businessPotential ?? '—'}
                    </TD>
                    <TD className="max-w-[220px] truncate text-sm">
                      {f.comments || '—'}
                      {f.isConfidential ? (
                        <Badge variant="warning" className="ml-2">
                          Confidential
                        </Badge>
                      ) : null}
                    </TD>
                    <TD className="text-sm text-[var(--muted)]">
                      {new Date(f.createdAt).toLocaleString()}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
