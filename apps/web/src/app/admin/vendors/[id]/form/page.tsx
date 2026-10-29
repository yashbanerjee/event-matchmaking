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

function VendorFormReviewContent() {
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
        eyebrow="Vendors"
        title="Submitted form"
        description="Review answers, verify the vendor, or request improvements."
        actions={
          <Link href="/admin/vendors">
            <Button variant="outline" size="sm">
              Back to vendors
            </Button>
          </Link>
        }
      />

      <SubmissionReviewView
        organizationId={organizationId}
        organizationName={org.data?.name}
        kind="vendor"
        submissionId={submissionId}
        listQueryKey={['vendors']}
      />
    </div>
  );
}

export default function VendorFormReviewPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-[var(--muted)]">Loading form review…</p>
      }
    >
      <VendorFormReviewContent />
    </Suspense>
  );
}
