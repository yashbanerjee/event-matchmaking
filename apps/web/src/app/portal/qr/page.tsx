'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { QrExchangePanel } from '@/components/qr-exchange-panel';
import { fetchOnboarding } from '@/lib/portal-onboarding';

export default function PortalQrPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login?next=/portal/qr');
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

  if (!ready) return null;

  return (
    <PortalShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      <PageHeader
        eyebrow="Client workspace"
        title="QR meeting exchange"
        description="Save or share your QR, then scan a partner to view their public profile and book a meeting."
      />
      <QrExchangePanel
        requestsHref="/portal/requests"
        meetingsHref="/portal/meetings"
      />
    </PortalShell>
  );
}
