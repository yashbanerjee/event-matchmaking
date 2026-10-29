'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { responsesByFieldKey, valuesByFieldId } from '@em/shared';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import {
  fetchOnboarding,
  type OnboardingItem,
} from '@/lib/portal-onboarding';
import { formatVendorStatus, statusTone } from '@/lib/status';
import { FormRenderer } from '@/components/form-renderer';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function PortalOnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  const me = useQuery({
    queryKey: ['me'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{ email: string }>('/auth/me', { token: getAccessToken() }),
  });

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    enabled: ready,
    queryFn: () => fetchOnboarding(),
  });

  const items = onboarding.data?.items ?? [];
  const selected =
    items.find((item) => item.assignmentId === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setValues({});
      return;
    }
    setSelectedId(selected.assignmentId);
    const responses = selected.submission?.responses ?? {};
    setValues(valuesByFieldId(selected.schema, responses));
    setMessage('');
    setError('');
  }, [
    selected?.assignmentId,
    selected?.submission?.id,
    selected?.openCorrection?.id,
    selected,
  ]);

  const editableFieldIds = useMemo(() => {
    if (!selected) return undefined;
    if (selected.action === 'correct' && selected.openCorrection) {
      return selected.openCorrection.editableFieldIds;
    }
    if (selected.action === 'submit') return undefined;
    return [];
  }, [selected]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('No form selected');
      const responses = responsesByFieldKey(selected.schema, values);

      if (selected.action === 'correct' && selected.openCorrection) {
        return apiFetch(
          `/forms/onboarding/corrections/${selected.openCorrection.id}`,
          {
            method: 'POST',
            token: getAccessToken(),
            body: JSON.stringify({ responses }),
          },
        );
      }

      return apiFetch('/forms/submissions', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          formVersionId: selected.formVersionId,
          organizationId: selected.organizationId,
          responses,
        }),
      });
    },
    onSuccess: async () => {
      setMessage(
        selected?.action === 'correct'
          ? 'Updates submitted. Waiting for admin review.'
          : 'Form submitted. Waiting for admin review.',
      );
      setError('');
      await qc.invalidateQueries({ queryKey: ['portal-onboarding'] });
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught.message : 'Could not submit form.',
      ),
  });

  if (!ready) return null;

  return (
    <PortalShell email={me.data?.email} pendingForms={onboarding.data?.pendingCount}>
      <PageHeader
        eyebrow="Onboarding"
        title="Your forms"
        description="Complete assigned profile forms. After you submit, details stay locked until admin requests specific updates."
        actions={
          <Button variant="outline" onClick={() => router.push('/portal')}>
            Meetings
          </Button>
        }
      />

      {onboarding.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading forms…</p>
      ) : null}

      {onboarding.error ? (
        <p className="text-sm text-[var(--danger)]">
          {(onboarding.error as Error).message}
        </p>
      ) : null}

      {!onboarding.isLoading && items.length === 0 ? (
        <EmptyState
          title="No forms assigned"
          description="When an admin invites you with a form, it will appear here."
        />
      ) : null}

      {items.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="h-fit space-y-2 p-3">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Assigned forms
            </p>
            {items.map((item) => (
              <button
                key={item.assignmentId}
                type="button"
                onClick={() => setSelectedId(item.assignmentId)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  selected?.assignmentId === item.assignmentId
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] hover:bg-[var(--card-elevated)]'
                }`}
              >
                <p className="font-medium">{item.formName}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {item.organizationName}
                </p>
                <div className="mt-2">
                  <Badge variant={statusTone(statusForItem(item))}>
                    {labelForItem(item)}
                  </Badge>
                </div>
              </button>
            ))}
          </Card>

          {selected ? (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{selected.formName}</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {selected.organizationName} ·{' '}
                    {selected.organizationType.toLowerCase()}
                  </p>
                </div>
                <Badge variant={statusTone(statusForItem(selected))}>
                  {labelForItem(selected)}
                </Badge>
              </div>

              {selected.action === 'view' ? (
                <p className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 text-sm text-[var(--muted)]">
                  Submitted details are locked. You can view them here. If admin
                  requests changes, only the marked fields become editable.
                </p>
              ) : null}

              {selected.action === 'correct' ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Admin requested updates. Edit only the highlighted fields, then
                  resubmit.
                </p>
              ) : null}

              {message ? (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {message}
                </p>
              ) : null}
              {error ? (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}

              <FormRenderer
                schema={selected.schema}
                values={values}
                editableFieldIds={
                  selected.action === 'view' ? [] : editableFieldIds
                }
                visibleFieldIds={
                  selected.action === 'correct'
                    ? selected.openCorrection?.editableFieldIds
                    : undefined
                }
                notes={selected.openCorrection?.notes}
                disabled={selected.action === 'view' || submit.isPending}
                onChange={(fieldId, value) =>
                  setValues((current) => ({ ...current, [fieldId]: value }))
                }
                onUpload={async (_field, file) => ({
                  documentId: crypto.randomUUID(),
                  filename: file.name,
                })}
              />

              {selected.action !== 'view' ? (
                <div className="flex justify-end">
                  <Button
                    loading={submit.isPending}
                    onClick={() => submit.mutate()}
                  >
                    {submit.isPending
                      ? 'Submitting…'
                      : selected.action === 'correct'
                        ? 'Resubmit updates'
                        : 'Submit form'}
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}
    </PortalShell>
  );
}

function statusForItem(item: OnboardingItem) {
  if (item.action === 'correct') return 'RESEND_FOR_IMPROVEMENTS';
  if (item.submission?.status) return item.submission.status;
  return item.workflowStatus;
}

function labelForItem(item: OnboardingItem) {
  if (item.action === 'submit') return 'Pending submission';
  if (item.action === 'correct') return 'Updates requested';
  if (item.submission?.status === 'APPROVED') return 'Verified';
  return formatVendorStatus(
    item.submission?.status ?? item.workflowStatus,
  );
}
