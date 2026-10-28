'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiFetch } from '@/lib/api';
import { setTokens } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'admin@example.com', password: 'ChangeMeAdmin1!' },
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
      const isAdmin = result.user.roles.some((r) =>
        ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'].includes(r),
      );
      router.push(isAdmin ? '/admin' : '/portal');
    } catch (err) {
      setError((err as Error).message);
    }
  });

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-[var(--muted)] mb-6">
          Use your invited account credentials.
        </p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm mb-1 block">Email</label>
            <Input type="email" {...form.register('email')} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Password</label>
            <Input type="password" {...form.register('password')} />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button className="w-full" type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
