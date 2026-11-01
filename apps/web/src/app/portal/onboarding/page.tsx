'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { OnboardingFormWorkspace } from '@/components/onboarding-form-workspace';
import { PortalShell } from '@/components/portal-shell';
import { EmptyState } from '@/components/empty-state';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { fetchOnboarding } from '@/lib/portal-onboarding';

export default function PortalOnboardingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!items.length) return;
    if (selectedId && items.some((item) => item.assignmentId === selectedId)) {
      return;
    }
    const pending =
      items.find((item) => item.action === 'submit' || item.action === 'correct') ??
      items[0];
    if (pending) setSelectedId(pending.assignmentId);
  }, [items, selectedId]);

  if (!ready) return null;

  return (
    <PortalShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
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
          roleLabel="investor"
          dashboardHref="/portal"
          onVerified={() => router.replace('/portal')}
        />
      ) : null}
    </PortalShell>
  );
}
