'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiFetch } from '@/lib/api';
import { setTokens } from '@/lib/auth-store';
import { resolveParticipantHome } from '@/lib/portal-onboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const schema = z.object({
  token: z.string().min(32),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(4, 'Password must be at least 4 characters').max(128),
});

type FormValues = z.infer<typeof schema>;

function RegisterForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      token: params.get('token') ?? '',
      firstName: '',
      lastName: '',
      password: '',
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await apiFetch<{
        accessToken: string;
        refreshToken: string;
        user?: { roles?: string[] };
      }>('/auth/register/invitation', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setTokens(result.accessToken, result.refreshToken);
      const home = await resolveParticipantHome(result.user?.roles ?? []);
      router.push(home);
    } catch (err) {
      setError((err as Error).message);
    }
  });

  return (
    <Card className="w-full max-w-md border-white/60 bg-white/90 p-7">
      <h1 className="text-2xl">Accept invitation</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Create your account with the secure invitation token.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Invitation token</label>
          <Input {...form.register('token')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">First name</label>
            <Input {...form.register('firstName')} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Last name</label>
            <Input {...form.register('lastName')} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Password</label>
          <Input type="password" {...form.register('password')} />
          <p className="mt-1 text-xs text-[var(--muted)]">
            Minimum 4 characters.
          </p>
        </div>
        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button className="w-full" type="submit">
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-[var(--muted)]">
        Already registered?{' '}
        <Link href="/login" className="font-semibold text-[var(--accent)]">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <main className="auth-pad relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_100%_0%,rgba(201,162,39,0.14),transparent_55%)]"
      />
      <div className="relative mx-auto flex min-h-[85vh] max-w-6xl flex-col items-center justify-center">
        <Link
          href="/"
          className="mb-6 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--highlight)]"
        >
          Ethara
        </Link>
        <Suspense>
          <RegisterForm />
        </Suspense>
      </div>
    </main>
  );
}
