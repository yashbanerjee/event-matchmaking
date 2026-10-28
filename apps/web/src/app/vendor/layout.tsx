'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { VendorShell } from '@/components/vendor-shell';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { fetchOnboarding } from '@/lib/portal-onboarding';

export default function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

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
      apiFetch<{
        email: string;
        roles: string[];
      }>('/auth/me', { token: getAccessToken() }),
  });

  useEffect(() => {
    if (!me.data) return;
    const roles = me.data.roles ?? [];
    const isVendor = roles.includes('VENDOR_USER');
    const isAdmin = roles.some((role) =>
      ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role),
    );
    if (!isVendor && !isAdmin) {
      router.replace('/portal');
    }
  }, [me.data, router]);

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    enabled: ready,
    queryFn: () => fetchOnboarding(),
  });

  if (!ready || me.isLoading) {
    return <div className="p-8 text-sm text-[var(--muted)]">Loading…</div>;
  }

  return (
    <VendorShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      {children}
    </VendorShell>
  );
}
