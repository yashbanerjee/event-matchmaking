'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import {
  badgeToneForStatus,
  formatFilledDate,
  labelForFormItem,
  statusForFormItem,
} from '@/lib/vendor-forms';

export default function VendorFormsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    queryFn: () => fetchOnboarding(),
  });

  const items = onboarding.data?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const label = labelForFormItem(item).toLowerCase();
      const status = statusForFormItem(item).toLowerCase();
      return (
        item.formName.toLowerCase().includes(q) ||
        item.organizationName.toLowerCase().includes(q) ||
        label.includes(q) ||
        status.includes(q)
      );
    });
  }, [items, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Forms"
        title="Assigned forms"
        description="Review each form row with status and the date it was filled, then open it to submit or update."
        actions={
          <Input
            className="max-w-xs"
            placeholder="Search form, org, status…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
      />

      <Card>
        {onboarding.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No forms assigned"
            description="When an admin assigns a vendor form, it will show here as a row with status."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Form</TH>
                <TH>Status</TH>
                <TH>Workflow</TH>
                <TH>Filled on</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {filtered.map((item) => {
                const status = statusForFormItem(item);
                return (
                  <TR key={item.assignmentId}>
                    <TD>
                      <p className="font-medium">{item.formName}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {item.organizationName}
                      </p>
                    </TD>
                    <TD>
                      <Badge variant={badgeToneForStatus(status)}>
                        {labelForFormItem(item)}
                      </Badge>
                    </TD>
                    <TD>{item.workflowStatus.replaceAll('_', ' ')}</TD>
                    <TD>{formatFilledDate(item.submission?.submittedAt)}</TD>
                    <TD className="text-right">
                      <Button
                        size="sm"
                        onClick={() =>
                          router.push(`/vendor/forms/${item.assignmentId}`)
                        }
                      >
                        {item.action === 'view'
                          ? 'View'
                          : item.action === 'correct'
                            ? 'Update'
                            : 'Fill'}
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
