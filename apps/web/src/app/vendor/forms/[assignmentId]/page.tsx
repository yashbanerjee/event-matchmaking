'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/** Deep links resolve to the shared forms workspace. */
export default function VendorFormDetailPage() {
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();

  useEffect(() => {
    const id = params.assignmentId;
    router.replace(id ? `/vendor/forms?focus=${id}` : '/vendor/forms');
  }, [params.assignmentId, router]);

  return <p className="text-sm text-[var(--muted)]">Opening your form…</p>;
}
