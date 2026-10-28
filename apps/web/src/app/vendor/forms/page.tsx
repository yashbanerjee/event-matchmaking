'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Button from '@atlaskit/button/new';
import DynamicTable from '@atlaskit/dynamic-table';
import EmptyState from '@atlaskit/empty-state';
import Heading from '@atlaskit/heading';
import Lozenge from '@atlaskit/lozenge';
import Textfield from '@atlaskit/textfield';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import {
  formatFilledDate,
  labelForFormItem,
  lozengeAppearanceForStatus,
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

  const rows = filtered.map((item) => {
    const status = statusForFormItem(item);
    return {
      key: item.assignmentId,
      cells: [
        {
          key: 'form',
          content: (
            <div>
              <p className="font-medium">{item.formName}</p>
              <p className="text-xs text-[var(--muted)]">
                {item.organizationName}
              </p>
            </div>
          ),
        },
        {
          key: 'status',
          content: (
            <Lozenge appearance={lozengeAppearanceForStatus(status)} isBold>
              {labelForFormItem(item)}
            </Lozenge>
          ),
        },
        {
          key: 'workflow',
          content: item.workflowStatus.replaceAll('_', ' '),
        },
        {
          key: 'filled',
          content: formatFilledDate(item.submission?.submittedAt),
        },
        {
          key: 'action',
          content: (
            <Button
              appearance="primary"
              spacing="compact"
              onClick={() => router.push(`/vendor/forms/${item.assignmentId}`)}
            >
              {item.action === 'view'
                ? 'View'
                : item.action === 'correct'
                  ? 'Update'
                  : 'Fill'}
            </Button>
          ),
        },
      ],
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            Forms
          </p>
          <Heading size="large">Assigned forms</Heading>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            Review each form row with status and the date it was filled, then open
            it to submit or update.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <Textfield
            placeholder="Search form, org, status…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            isCompact
          />
        </div>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <DynamicTable
          head={{
            cells: [
              { key: 'form', content: 'Form', isSortable: true, width: 32 },
              { key: 'status', content: 'Status', width: 18 },
              { key: 'workflow', content: 'Workflow', width: 16 },
              { key: 'filled', content: 'Filled on', isSortable: true, width: 18 },
              { key: 'action', content: 'Action', width: 12 },
            ],
          }}
          rows={rows}
          rowsPerPage={10}
          defaultPage={1}
          isLoading={onboarding.isLoading}
          emptyView={
            <EmptyState
              header="No forms assigned"
              description="When an admin assigns a vendor form, it will show here as a row with status."
              primaryAction={
                <Link href="/vendor">
                  <Button appearance="subtle">Back to overview</Button>
                </Link>
              }
            />
          }
        />
      </section>
    </div>
  );
}
