'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { QrExchangePanel } from '@/components/qr-exchange-panel';

export default function VendorQrPage() {
  useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{ email: string }>('/auth/me', { token: getAccessToken() }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Guest workspace"
        title="QR meeting exchange"
        description="Save or share your QR, then scan a client to view their public profile and book a meeting."
      />
      <QrExchangePanel
        requestsHref="/vendor/requests"
        meetingsHref="/vendor/meetings"
      />
    </>
  );
}
