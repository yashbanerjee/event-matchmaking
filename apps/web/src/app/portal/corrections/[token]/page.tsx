'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormSchemaDefinition } from '@em/shared';
import { FormRenderer } from '@/components/form-renderer';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api';

type CorrectionPayload = {
  correctionId: string;
  submissionId: string;
  organizationName: string;
  formName: string;
  schema: FormSchemaDefinition;
  responses: Record<string, unknown>;
  editableFieldIds: string[];
  notes: Array<{ fieldId: string; note: string }>;
};

export default function CorrectionResubmitPage() {
  const params = useParams<{ token: string }>();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const query = useQuery({
    queryKey: ['correction', params.token],
    queryFn: () =>
      apiFetch<CorrectionPayload>(
        `/public/form-corrections/${params.token}`,
      ),
    retry: false,
  });

  useEffect(() => {
    if (query.data) setValues(query.data.responses ?? {});
  }, [query.data]);

  const submit = useMutation({
    mutationFn: () =>
      apiFetch(`/public/form-corrections/${params.token}`, {
        method: 'POST',
        body: JSON.stringify({ responses: values }),
      }),
    onSuccess: () => {
      setMessage('Updates submitted. An admin will review them shortly.');
      setError('');
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not submit your updates.',
      ),
  });

  if (query.isLoading) {
    return (
      <main className="min-h-screen p-6 lg:p-8">
        <p className="text-sm text-[var(--muted)]">Loading form…</p>
      </main>
    );
  }

  if (query.isError || !query.data) {
    return (
      <main className="min-h-screen p-6 lg:p-8">
        <PageHeader
          title="Link unavailable"
          description="This correction link is invalid or has already been used."
        />
      </main>
    );
  }

  const data = query.data;

  return (
    <main className="min-h-screen p-6 lg:p-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          eyebrow={data.organizationName}
          title={data.formName}
          description="Only the fields below need updates. Comments from the review team are shown under each field."
          actions={
            <Button
              disabled={submit.isPending || Boolean(message)}
              onClick={() => submit.mutate()}
            >
              Submit updates
            </Button>
          }
        />
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {message ? (
          <p className="text-sm text-[var(--success)]">{message}</p>
        ) : null}
        {!message ? (
          <FormRenderer
            schema={data.schema}
            values={values}
            editableFieldIds={data.editableFieldIds}
            visibleFieldIds={data.editableFieldIds}
            notes={data.notes}
            onChange={(fieldId, value) =>
              setValues((current) => ({ ...current, [fieldId]: value }))
            }
            onUpload={async (_field, file) => ({
              documentId: crypto.randomUUID(),
              filename: file.name,
            })}
          />
        ) : null}
      </div>
    </main>
  );
}
