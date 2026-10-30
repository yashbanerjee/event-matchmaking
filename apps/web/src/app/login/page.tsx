'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiFetch } from '@/lib/api';
import { setTokens } from '@/lib/auth-store';
import { resolveParticipantHome } from '@/lib/portal-onboarding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { BRAND, brandLabel } from '@/lib/brand';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await apiFetch<{
        accessToken: string;
        refreshToken: string;
        user: { roles: string[] };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setTokens(result.accessToken, result.refreshToken);
      const next = search.get('next');
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        router.push(next);
        return;
      }
      const home = await resolveParticipantHome(result.user.roles ?? []);
      router.push(home);
    } catch (err) {
      setError((err as Error).message);
    }
  });

  return (
    <main className="auth-pad relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_0%_0%,rgba(15,118,110,0.18),transparent_55%)]"
      />
      <div className="relative mx-auto flex min-h-[85vh] max-w-6xl flex-col justify-center gap-10 lg:grid lg:grid-cols-2 lg:items-center">
        <div className="animate-rise space-y-4">
          <Link
            href="/"
            className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--highlight)]"
          >
            {BRAND.name}
          </Link>
          <h1 className="max-w-md text-4xl leading-tight md:text-5xl">
            Welcome back to {brandLabel}.
          </h1>
          <p className="max-w-md text-[var(--muted)]">
            {BRAND.tagline}. Admins manage matching and schedules. Guests and
            clients use the portal for confirmations and feedback.
          </p>
        </div>

        <Card className="animate-rise mx-auto w-full max-w-md border-white/60 bg-white/90 p-7">
          <h2 className="text-2xl">Sign in</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use your account email and password.
          </p>
          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <Input type="email" placeholder="you@company.com" {...form.register('email')} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Password</label>
              <Input type="password" placeholder="••••••••••••" {...form.register('password')} />
            </div>
            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button
              className="w-full"
              type="submit"
              loading={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-[var(--muted)]">
            New here?{' '}
            <Link
              href="/register/event"
              className="font-semibold text-[var(--accent)]"
            >
              Register for event
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-[var(--muted)]">Loading sign-in…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
