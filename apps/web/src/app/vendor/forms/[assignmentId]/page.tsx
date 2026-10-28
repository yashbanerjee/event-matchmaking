'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@atlaskit/button/new';
import Heading from '@atlaskit/heading';
import Lozenge from '@atlaskit/lozenge';
import { responsesByFieldKey, valuesByFieldId } from '@em/shared';
import { FormRenderer } from '@/components/form-renderer';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import {
  formatFilledDate,
  labelForFormItem,
  lozengeAppearanceForStatus,
  statusForFormItem,
} from '@/lib/vendor-forms';

export default function VendorFormDetailPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    queryFn: () => fetchOnboarding(),
  });

  const selected =
    onboarding.data?.items.find(
      (item) => item.assignmentId === params.assignmentId,
    ) ?? null;

  useEffect(() => {
    if (!selected) {
      setValues({});
      return;
    }
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

  if (onboarding.isLoading) {
    return <p className="text-sm text-[var(--muted)]">Loading form…</p>;
  }

  if (!selected) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--danger)]">Form assignment not found.</p>
        <Button appearance="subtle" onClick={() => router.push('/vendor/forms')}>
          Back to forms
        </Button>
      </div>
    );
  }

  const status = statusForFormItem(selected);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link
            href="/vendor/forms"
            className="text-sm font-medium text-[var(--accent-hover)] hover:underline"
          >
            ← Forms
          </Link>
          <Heading size="large">{selected.formName}</Heading>
          <p className="text-sm text-[var(--muted)]">
            {selected.organizationName} · filled{' '}
            {formatFilledDate(selected.submission?.submittedAt)}
          </p>
        </div>
        <Lozenge appearance={lozengeAppearanceForStatus(status)} isBold>
          {labelForFormItem(selected)}
        </Lozenge>
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
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
          editableFieldIds={selected.action === 'view' ? [] : editableFieldIds}
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
              appearance="primary"
              isDisabled={submit.isPending}
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
      </section>
    </div>
  );
}
