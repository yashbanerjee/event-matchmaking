'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Schedules and Meetings are the same — keep one place. */
export default function AdminSchedulesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/meetings');
  }, [router]);

  return <p className="text-sm text-[var(--muted)]">Opening meetings…</p>;
}
