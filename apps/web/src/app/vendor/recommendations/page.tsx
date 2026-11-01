'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { PageHeader } from '@/components/page-header';
import { RecommendationsPanel } from '@/components/recommendations-panel';

export default function VendorRecommendationsPage() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{ organizationIds: string[] }>('/auth/me', {
        token: getAccessToken(),
      }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Innovator"
        title="Recommendations"
        description="Browse every suggested investor — admin picks and matches based on your preferences."
      />
      <RecommendationsPanel
        fromOrgId={me.data?.organizationIds?.[0]}
        title="All recommendations"
        description="Admin suggestions plus investors matched to your categories and capabilities."
      />
    </div>
  );
}
