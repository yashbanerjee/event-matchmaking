'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { OnboardingFormWorkspace } from '@/components/onboarding-form-workspace';
import { EmptyState } from '@/components/empty-state';
import { fetchOnboarding } from '@/lib/portal-onboarding';

function VendorFormsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');
  const [selectedId, setSelectedId] = useState<string | null>(focusId);

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    queryFn: () => fetchOnboarding(),
  });

  const items = onboarding.data?.items ?? [];

  useEffect(() => {
    if (!items.length) return;
    if (focusId && items.some((item) => item.assignmentId === focusId)) {
      setSelectedId(focusId);
      return;
    }
    if (selectedId && items.some((item) => item.assignmentId === selectedId)) {
      return;
    }
    const pending =
      items.find((item) => item.action === 'submit' || item.action === 'correct') ??
      items[0];
    if (pending) setSelectedId(pending.assignmentId);
  }, [items, selectedId, focusId]);

  return (
    <>
      {onboarding.isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading your form…</p>
      ) : null}

      {onboarding.error ? (
        <p className="text-sm text-[var(--danger)]">
          {(onboarding.error as Error).message}
        </p>
      ) : null}

      {!onboarding.isLoading && items.length === 0 ? (
        <EmptyState
          title="No forms assigned"
          description="When an admin invites you with a form, it will appear here with the sidebar so you can finish onboarding."
        />
      ) : null}

      {items.length > 0 ? (
        <OnboardingFormWorkspace
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
          roleLabel="innovator"
          dashboardHref="/vendor"
          onVerified={() => router.replace('/vendor')}
        />
      ) : null}
    </>
  );
}

export default function VendorFormsPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-[var(--muted)]">Loading your form…</p>}
    >
      <VendorFormsContent />
    </Suspense>
  );
}
