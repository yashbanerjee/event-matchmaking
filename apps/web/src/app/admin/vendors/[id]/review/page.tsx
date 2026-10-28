'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { FormSchemaDefinition } from '@em/shared';
import { FormRenderer, formControlClass } from '@/components/form-renderer';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { formatVendorStatus, statusTone } from '@/lib/status';

type SubmissionDetail = {
  id: string;
  status: string;
  responses: Record<string, unknown>;
  schema: FormSchemaDefinition;
  organization: {
    id: string;
    name: string;
    vendor?: { approvalStatus: string } | null;
  };
  formVersion: { form: { name: string } };
  openCorrection?: {
    id: string;
    fields: Array<{ fieldId: string; note: string }>;
  } | null;
};

export default function VendorFormReviewPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const submissionId = search.get('submissionId');
  const [selected, setSelected] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [correctionUrl, setCorrectionUrl] = useState<string | null>(null);

  const submission = useQuery({
    queryKey: ['submission', submissionId],
    enabled: Boolean(submissionId),
    queryFn: () =>
      apiFetch<SubmissionDetail>(`/forms/submissions/${submissionId}`, {
        token: getAccessToken(),
      }),
  });

  useEffect(() => {
    if (!submission.data || submission.data.status === 'UNDER_REVIEW') return;
    if (['SUBMITTED', 'NEEDS_INFO'].includes(submission.data.status)) {
      void apiFetch(`/forms/submissions/${submissionId}/start-review`, {
        method: 'POST',
        token: getAccessToken(),
      }).then(() =>
        qc.invalidateQueries({ queryKey: ['submission', submissionId] }),
      );
    }
  }, [submission.data, submissionId, qc]);

  const fields = useMemo(() => {
    const schema = submission.data?.schema;
    if (!schema) return [];
    return [...schema.fields]
      .filter((f) => f.type !== 'heading' && f.type !== 'info')
      .sort((a, b) => a.order - b.order);
  }, [submission.data?.schema]);

  const requestCorrection = useMutation({
    mutationFn: () => {
      const payload = Object.entries(marks)
        .filter(([, note]) => note.trim())
        .map(([fieldId, note]) => ({ fieldId, note: note.trim() }));
      return apiFetch<{ correctionUrl: string }>(
        `/forms/submissions/${submissionId}/corrections`,
        {
          method: 'POST',
          token: getAccessToken(),
          body: JSON.stringify({ fields: payload }),
        },
      );
    },
    onSuccess: async (res) => {
      setMessage('Correction email queued for the vendor.');
      setError('');
      setCorrectionUrl(res.correctionUrl);
      setMarks({});
      await qc.invalidateQueries({ queryKey: ['submission', submissionId] });
      await qc.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not send correction request.',
      ),
  });

  const approve = useMutation({
    mutationFn: () =>
      apiFetch(`/forms/submissions/${submissionId}/approve`, {
        method: 'POST',
        token: getAccessToken(),
      }),
    onSuccess: async () => {
      setMessage('Vendor marked verified.');
      setError('');
      await qc.invalidateQueries({ queryKey: ['submission', submissionId] });
      await qc.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught.message : 'Approve failed.',
      ),
  });

  if (!submissionId) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Missing submission. Open review from the vendors list.
      </p>
    );
  }

  if (submission.isLoading || !submission.data) {
    return <p className="text-sm text-[var(--muted)]">Loading submission…</p>;
  }

  const data = submission.data;
  const vendorStatus =
    data.organization.vendor?.approvalStatus ?? data.status;
  const markedCount = Object.values(marks).filter((n) => n.trim()).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor review"
        title={data.organization.name}
        description={`${data.formVersion.form.name} — mark fields that need reupload/resubmit and add a comment for each. The vendor only sees those fields via the email link.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push('/admin/vendors')}>
              Back to vendors
            </Button>
            <Button
              variant="outline"
              disabled={markedCount === 0 || requestCorrection.isPending}
              onClick={() => requestCorrection.mutate()}
            >
              Resend for improvements
            </Button>
            <Button
              disabled={approve.isPending}
              onClick={() => approve.mutate()}
            >
              Mark verified
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusTone(vendorStatus)}>
          {formatVendorStatus(vendorStatus)}
        </Badge>
        <Badge variant={statusTone(data.status)}>{data.status}</Badge>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--success)]">{message}</p> : null}
      {correctionUrl ? (
        <p className="break-all rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm">
          Correction link: {correctionUrl}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <FormRenderer
          schema={data.schema}
          values={data.responses ?? {}}
          selectedFieldId={selected}
          onSelectField={setSelected}
          disabled
        />
        <aside className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-xs font-semibold uppercase text-[var(--muted)]">
            Mark for resubmit
          </h2>
          <p className="mt-1 mb-3 text-xs text-[var(--muted)]">
            Check a field, add a comment, then send. Comments appear on the
            vendor form and in the email.
          </p>
          <div className="grid max-h-[70vh] gap-3 overflow-y-auto">
            {fields.map((field) => {
              const checked = marks[field.id] !== undefined;
              return (
                <div
                  key={field.id}
                  className={`rounded-xl border p-3 ${
                    checked
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40'
                      : 'border-[var(--border)]'
                  }`}
                >
                  <label className="flex items-start gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(event) => {
                        setSelected(field.id);
                        setMarks((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[field.id] = '';
                          else delete next[field.id];
                          return next;
                        });
                      }}
                    />
                    <span>{field.label}</span>
                  </label>
                  {checked ? (
                    <textarea
                      className={`${formControlClass} mt-2 min-h-20 py-2`}
                      placeholder="Comment for the vendor…"
                      value={marks[field.id] ?? ''}
                      onChange={(event) =>
                        setMarks((current) => ({
                          ...current,
                          [field.id]: event.target.value,
                        }))
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
