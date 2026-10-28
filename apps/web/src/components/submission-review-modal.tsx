'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { FormSchemaDefinition } from '@em/shared';
import { FormRenderer, formControlClass } from '@/components/form-renderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { formatVendorStatus, statusTone } from '@/lib/status';

type SubmissionListItem = {
  id: string;
  status: string;
  submittedAt?: string | null;
  formVersion: { form: { name: string }; version: number };
};

type SubmissionDetail = {
  id: string;
  status: string;
  submittedAt?: string | null;
  updatedAt?: string;
  reviewNotes?: string | null;
  responses: Record<string, unknown>;
  schema: FormSchemaDefinition;
  organization: {
    id: string;
    name: string;
    vendor?: { approvalStatus: string } | null;
  };
  formVersion: { form: { name: string }; version: number };
  openCorrection?: {
    id: string;
    fields: Array<{ fieldId: string; note: string }>;
  } | null;
  corrections?: Array<{
    id: string;
    status: string;
    createdAt: string;
    resolvedAt?: string | null;
    fields: Array<{ fieldId: string; note: string }>;
  }>;
};

function formatSubmissionStatus(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Waiting for review',
    UNDER_REVIEW: 'In review',
    APPROVED: 'Verified',
    REJECTED: 'Rejected',
    NEEDS_INFO: 'Resend for improvements',
  };
  return map[status] ?? status.replaceAll('_', ' ');
}

export function SubmissionReviewModal({
  open,
  onClose,
  organizationId,
  organizationName,
  kind,
  submissionId: initialSubmissionId,
  listQueryKey,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
  kind: 'company' | 'vendor';
  submissionId?: string | null;
  listQueryKey: unknown[];
}) {
  const qc = useQueryClient();
  const [submissionId, setSubmissionId] = useState<string | null>(
    initialSubmissionId ?? null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [correctionUrl, setCorrectionUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSubmissionId(initialSubmissionId ?? null);
      setMarks({});
      setMessage('');
      setError('');
      setCorrectionUrl(null);
      setSelected(null);
    }
  }, [open, initialSubmissionId]);

  const list = useQuery({
    queryKey: ['org-submissions', organizationId],
    enabled: open,
    queryFn: () =>
      apiFetch<SubmissionListItem[]>(
        `/forms/submissions?organizationId=${organizationId}`,
        { token: getAccessToken() },
      ),
  });

  useEffect(() => {
    if (!open || submissionId || !list.data?.length) return;
    setSubmissionId(list.data[0]!.id);
  }, [open, submissionId, list.data]);

  const detail = useQuery({
    queryKey: ['submission', submissionId],
    enabled: open && Boolean(submissionId),
    queryFn: () =>
      apiFetch<SubmissionDetail>(`/forms/submissions/${submissionId}`, {
        token: getAccessToken(),
      }),
  });

  useEffect(() => {
    if (!detail.data || !submissionId) return;
    if (detail.data.status === 'UNDER_REVIEW') return;
    if (!['SUBMITTED', 'NEEDS_INFO'].includes(detail.data.status)) return;
    void apiFetch(`/forms/submissions/${submissionId}/start-review`, {
      method: 'POST',
      token: getAccessToken(),
    }).then(() => {
      void qc.invalidateQueries({ queryKey: ['submission', submissionId] });
      void qc.invalidateQueries({ queryKey: listQueryKey });
    });
  }, [detail.data, submissionId, qc, listQueryKey]);

  const fields = useMemo(() => {
    const schema = detail.data?.schema;
    if (!schema) return [];
    return [...schema.fields]
      .filter((f) => f.type !== 'heading' && f.type !== 'info')
      .sort((a, b) => a.order - b.order);
  }, [detail.data?.schema]);

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
      setMessage('Correction email queued.');
      setError('');
      setCorrectionUrl(res.correctionUrl);
      setMarks({});
      await qc.invalidateQueries({ queryKey: ['submission', submissionId] });
      await qc.invalidateQueries({ queryKey: ['org-submissions', organizationId] });
      await qc.invalidateQueries({ queryKey: listQueryKey });
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
      setMessage(
        kind === 'vendor'
          ? 'Vendor marked verified.'
          : 'Submission approved.',
      );
      setError('');
      await qc.invalidateQueries({ queryKey: ['submission', submissionId] });
      await qc.invalidateQueries({ queryKey: ['org-submissions', organizationId] });
      await qc.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught.message : 'Approve failed.',
      ),
  });

  const data = detail.data;
  const workflowStatus =
    data?.organization.vendor?.approvalStatus ?? data?.status ?? '';
  const markedCount = Object.values(marks).filter((n) => n.trim()).length;
  const openNotes = data?.openCorrection?.fields ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`${organizationName} — submitted form`}
      description="View answers, current status, and request field-level improvements without leaving this page."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {data && data.status !== 'APPROVED' ? (
            <>
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
            </>
          ) : null}
        </>
      }
    >
      {list.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading submissions…</p>
      ) : null}

      {!list.isLoading && (list.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No form has been submitted for this {kind} yet.
        </p>
      ) : null}

      {(list.data?.length ?? 0) > 0 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {list.data!.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSubmissionId(item.id);
                setMarks({});
                setMessage('');
                setError('');
                setCorrectionUrl(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-left text-sm ${
                submissionId === item.id
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)] hover:bg-[var(--card-elevated)]'
              }`}
            >
              <span className="font-medium">{item.formVersion.form.name}</span>
              <span className="ml-2 text-[var(--muted)]">
                v{item.formVersion.version} ·{' '}
                {formatSubmissionStatus(item.status)}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {detail.isLoading && submissionId ? (
        <p className="text-sm text-[var(--muted)]">Loading answers…</p>
      ) : null}

      {detail.error ? (
        <p className="text-sm text-[var(--danger)]">
          {(detail.error as Error).message}
        </p>
      ) : null}

      {data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusTone(workflowStatus)}>
              {formatVendorStatus(workflowStatus)}
            </Badge>
            <Badge variant={statusTone(data.status)}>
              Form: {formatSubmissionStatus(data.status)}
            </Badge>
            {data.submittedAt ? (
              <span className="text-xs text-[var(--muted)]">
                Submitted {new Date(data.submittedAt).toLocaleString()}
              </span>
            ) : null}
            {data.updatedAt ? (
              <span className="text-xs text-[var(--muted)]">
                Updated {new Date(data.updatedAt).toLocaleString()}
              </span>
            ) : null}
          </div>

          {openNotes.length > 0 ? (
            <div className="rounded-xl border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,white)] p-3 text-sm">
              <p className="font-semibold text-[var(--warning)]">
                Open improvement requests
              </p>
              <ul className="mt-2 space-y-1">
                {openNotes.map((note) => {
                  const field = fields.find((f) => f.id === note.fieldId);
                  return (
                    <li key={note.fieldId}>
                      <span className="font-medium">
                        {field?.label ?? note.fieldId}:
                      </span>{' '}
                      {note.note}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          ) : null}
          {message ? (
            <p className="text-sm text-[var(--success)]">{message}</p>
          ) : null}
          {correctionUrl ? (
            <p className="break-all rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] p-3 text-sm">
              Correction link: {correctionUrl}
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)]">
            <FormRenderer
              schema={data.schema}
              values={data.responses ?? {}}
              selectedFieldId={selected}
              onSelectField={setSelected}
              notes={openNotes}
              disabled
            />
            {data.status !== 'APPROVED' ? (
              <aside className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)] p-3">
                <h3 className="text-xs font-semibold uppercase text-[var(--muted)]">
                  Mark for resubmit
                </h3>
                <p className="mt-1 mb-3 text-xs text-[var(--muted)]">
                  Select fields and add comments. The recipient only sees those
                  fields via the email link.
                </p>
                <div className="grid max-h-[50vh] gap-2 overflow-y-auto">
                  {fields.map((field) => {
                    const checked = marks[field.id] !== undefined;
                    return (
                      <div
                        key={field.id}
                        className={`rounded-xl border p-2.5 ${
                          checked
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)]/40'
                            : 'border-[var(--border)] bg-white'
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
                            className={`${formControlClass} mt-2 min-h-16 py-2`}
                            placeholder="Comment…"
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
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
