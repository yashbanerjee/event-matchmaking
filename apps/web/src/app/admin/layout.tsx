'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import { getAccessToken } from '@/lib/auth-store';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  return <AdminShell>{children}</AdminShell>;
}
