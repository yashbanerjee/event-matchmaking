'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Follow-ups removed from admin — redirect to Feedback. */
export default function FollowUpsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/feedback');
  }, [router]);
  return (
    <p className="text-sm text-[var(--muted)]">Redirecting to Feedback…</p>
  );
}
