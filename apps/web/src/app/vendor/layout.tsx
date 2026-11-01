'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { VendorShell } from '@/components/vendor-shell';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import { ensurePushSubscription } from '@/lib/push-subscribe';

export default function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void ensurePushSubscription();
  }, [router]);

  const me = useQuery({
    queryKey: ['me'],
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
    queryFn: () => fetchOnboarding(),
  });

  useEffect(() => {
    if (!onboarding.data) return;
    if (onboarding.data.pendingCount <= 0) return;
    const onForms =
      pathname === '/vendor/forms' || pathname.startsWith('/vendor/forms/');
    if (!onForms) {
      router.replace('/vendor/forms');
    }
  }, [onboarding.data, pathname, router]);

  return (
    <VendorShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      {children}
    </VendorShell>
  );
}
