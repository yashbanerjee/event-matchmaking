'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { resolveParticipantHome } from '@/lib/portal-onboarding';
import { PageHeader } from '@/components/page-header';
import { PortalShell } from '@/components/portal-shell';
import { VendorShell } from '@/components/vendor-shell';
import { QrExchangePanel } from '@/components/qr-exchange-panel';
import { fetchOnboarding } from '@/lib/portal-onboarding';

export default function QrDeepLinkPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code ?? '');
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [home, setHome] = useState<'portal' | 'vendor' | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(`/login?next=${encodeURIComponent(`/qr/${code}`)}`);
      return;
    }
    void (async () => {
      const me = await apiFetch<{ roles: string[] }>('/auth/me', {
        token: getAccessToken(),
      });
      const path = await resolveParticipantHome(me.roles ?? []);
      setHome(path.startsWith('/vendor') ? 'vendor' : 'portal');
      setReady(true);
    })().catch(() => {
      router.replace(`/login?next=${encodeURIComponent(`/qr/${code}`)}`);
    });
  }, [code, router]);

  const me = useQuery({
    queryKey: ['me'],
    enabled: ready,
    queryFn: () =>
      apiFetch<{ email: string; roles: string[] }>('/auth/me', {
        token: getAccessToken(),
      }),
  });

  const onboarding = useQuery({
    queryKey: ['portal-onboarding'],
    enabled: ready,
    queryFn: () => fetchOnboarding(),
  });

  if (!ready || !home) {
    return (
      <div className="p-8 text-sm text-[var(--muted)]">Opening QR…</div>
    );
  }

  const panel = (
    <>
      <PageHeader
        eyebrow="QR scan"
        title="Partner from QR"
        description="Confirm the public profile, then book only if you do not already have a meeting."
      />
      <QrExchangePanel
        initialCode={code}
        requestsHref={home === 'vendor' ? '/vendor/requests' : '/portal/requests'}
        meetingsHref={home === 'vendor' ? '/vendor/meetings' : '/portal/meetings'}
      />
    </>
  );

  if (home === 'vendor') {
    return (
      <VendorShell email={me.data?.email} pendingForms={onboarding.data?.pendingCount}>
        {panel}
      </VendorShell>
    );
  }

  return (
    <PortalShell
      email={me.data?.email}
      pendingForms={onboarding.data?.pendingCount}
    >
      {panel}
    </PortalShell>
  );
}
