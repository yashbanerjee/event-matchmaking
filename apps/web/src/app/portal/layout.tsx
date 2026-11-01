'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { fetchOnboarding } from '@/lib/portal-onboarding';
import { ensurePushSubscription } from '@/lib/push-subscribe';

export default function PortalLayout({
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
    const isInvestor = roles.includes('COMPANY_USER');
    const isAdmin = roles.some((role) =>
      ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(role),
    );
    if (!isInvestor && !isAdmin) {
      router.replace('/vendor');
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
      pathname === '/portal/onboarding' ||
      pathname.startsWith('/portal/onboarding/') ||
      pathname.startsWith('/portal/corrections/');
    if (!onForms) {
      router.replace('/portal/onboarding');
    }
  }, [onboarding.data, pathname, router]);

  return <>{children}</>;
}
