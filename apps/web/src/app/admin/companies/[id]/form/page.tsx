'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/page-header';
import { SubmissionReviewView } from '@/components/submission-review-view';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';

function CompanyFormReviewContent() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const organizationId = params.id;
  const submissionId = search.get('submissionId');

  const org = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () =>
      apiFetch<{ id: string; name: string }>(
        `/organizations/${organizationId}`,
        { token: getAccessToken() },
      ),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Client"
        title="Submitted form"
        description="Review answers, verify the client, or request improvements."
        actions={
          <Link href="/admin/companies">
            <Button variant="outline" size="sm">
              Back to clients
            </Button>
          </Link>
        }
      />

      <SubmissionReviewView
        organizationId={organizationId}
        organizationName={org.data?.name}
        kind="company"
        submissionId={submissionId}
        listQueryKey={['companies']}
      />
    </div>
  );
}

export default function CompanyFormReviewPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[var(--muted)]">Loading form review…</p>
      }
    >
      <CompanyFormReviewContent />
    </Suspense>
  );
}
