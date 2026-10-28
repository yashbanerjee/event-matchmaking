'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiFetch } from '@/lib/api';
import { setTokens } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

const schema = z.object({
  token: z.string().min(32),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z
    .string()
    .min(12)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/),
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
      }>('/auth/register/invitation', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setTokens(result.accessToken, result.refreshToken);
      router.push('/portal');
    } catch (err) {
      setError((err as Error).message);
    }
  });

  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-semibold mb-1">Accept invitation</h1>
      <p className="text-sm text-[var(--muted)] mb-6">
        Create your account with the secure invitation token.
      </p>
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="text-sm mb-1 block">Invitation token</label>
          <Input {...form.register('token')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm mb-1 block">First name</label>
            <Input {...form.register('firstName')} />
          </div>
          <div>
            <label className="text-sm mb-1 block">Last name</label>
            <Input {...form.register('lastName')} />
          </div>
        </div>
        <div>
          <label className="text-sm mb-1 block">Password</label>
          <Input type="password" {...form.register('password')} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button className="w-full" type="submit">
          Create account
        </Button>
      </form>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Suspense>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
