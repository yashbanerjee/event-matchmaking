'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { FormSchemaDefinition } from '@em/shared';
import { FormRenderer } from '@/components/form-renderer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { setTokens } from '@/lib/auth-store';
import { resolveParticipantHome } from '@/lib/portal-onboarding';

type PublicConfig = {
  enabled: boolean;
  formId?: string | null;
  formVersionId?: string | null;
  formName?: string | null;
  schema?: FormSchemaDefinition | null;
  reason?: string;
};

type Step = 1 | 2 | 3;

function EventRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'CLIENT' | 'GUEST' | ''>('');
  const [organizationName, setOrganizationName] = useState('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [registrationToken, setRegistrationToken] = useState<string | null>(
    null,
  );
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const config = useQuery({
    queryKey: ['registration-event'],
    queryFn: () => apiFetch<PublicConfig>('/registration/event'),
  });

  const schemaWithoutRole = useMemo(() => {
    const schema = config.data?.schema;
    if (!schema) return null;
    return {
      ...schema,
      fields: schema.fields.filter((f) => f.key !== 'participant_role'),
    };
  }, [config.data?.schema]);

  const start = useMutation({
    mutationFn: () =>
      apiFetch<{ registrationId: string }>('/registration/event/start', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          role,
          organizationName: organizationName.trim(),
          responses: values,
        }),
      }),
    onSuccess: (res) => {
      setError('');
      setRegistrationId(res.registrationId);
      setStep(2);
    },
    onError: (caught) => setError((caught as Error).message),
  });

  const verify = useMutation({
    mutationFn: () =>
      apiFetch<{ registrationToken: string }>('/registration/event/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          registrationId,
          otp: otp.trim(),
        }),
      }),
    onSuccess: (res) => {
      setError('');
      setRegistrationToken(res.registrationToken);
      setStep(3);
    },
    onError: (caught) => setError((caught as Error).message),
  });

  const complete = useMutation({
    mutationFn: () =>
      apiFetch<{
        accessToken: string;
        refreshToken: string;
        user?: { roles?: string[] };
      }>('/registration/event/complete', {
        method: 'POST',
        body: JSON.stringify({
          registrationToken,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      }),
    onSuccess: async (res) => {
      setError('');
      setTokens(res.accessToken, res.refreshToken);
      const home = await resolveParticipantHome(res.user?.roles ?? []);
      router.push(home);
    },
    onError: (caught) => setError((caught as Error).message),
  });

  if (config.isLoading) {
    return (
      <Card className="w-full max-w-2xl p-7">
        <p className="text-sm text-[var(--muted)]">Loading registration…</p>
      </Card>
    );
  }

  if (!config.data?.enabled) {
    return (
      <Card className="w-full max-w-lg p-7">
        <h1 className="text-2xl">Registration closed</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Public event registration is not open right now. If you received an
          invitation, use that link instead.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/login">
            <Button>Sign in</Button>
          </Link>
          <Link href="/">
            <Button variant="outline">Back to home</Button>
          </Link>
        </div>
      </Card>
    );
  }

  if (!config.data.schema) {
    return (
      <Card className="w-full max-w-lg p-7">
        <h1 className="text-2xl">Registration unavailable</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          An administrator still needs to select a published registration form
          in Settings.
        </p>
        <Link href="/" className="mt-6 inline-block">
          <Button variant="outline">Back to home</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl border-white/60 bg-white/90 p-7">
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        <span className={step === 1 ? 'text-[var(--accent)]' : ''}>
          1. Details
        </span>
        <span aria-hidden>/</span>
        <span className={step === 2 ? 'text-[var(--accent)]' : ''}>
          2. Verify email
        </span>
        <span aria-hidden>/</span>
        <span className={step === 3 ? 'text-[var(--accent)]' : ''}>
          3. Password
        </span>
      </div>

      <h1 className="text-2xl">Register for event</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {config.data.formName
          ? `Complete “${config.data.formName}”, verify your email, then set a password.`
          : 'Complete the form, verify your email, then set a password.'}
      </p>

      {step === 1 ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organization.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                I am registering as
              </label>
              <select
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'CLIENT' | 'GUEST' | '')
                }
              >
                <option value="">Select…</option>
                <option value="CLIENT">Client</option>
                <option value="GUEST">Guest</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Organization name
            </label>
            <Input
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Your organization"
            />
          </div>

          {schemaWithoutRole ? (
            <FormRenderer
              schema={schemaWithoutRole}
              values={values}
              onChange={(fieldId, value) =>
                setValues((current) => ({ ...current, [fieldId]: value }))
              }
            />
          ) : null}

          <Button
            className="w-full"
            disabled={
              start.isPending ||
              !email.trim() ||
              !role ||
              !organizationName.trim()
            }
            onClick={() => {
              setError('');
              start.mutate();
            }}
          >
            {start.isPending ? 'Sending code…' : 'Continue — send OTP'}
          </Button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-[var(--muted)]">
            Enter the 6-digit code sent to <strong>{email}</strong>.
          </p>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Verification code
            </label>
            <Input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={verify.isPending || otp.length !== 6}
              onClick={() => {
                setError('');
                verify.mutate();
              }}
            >
              {verify.isPending ? 'Verifying…' : 'Verify email'}
            </Button>
            <Button
              variant="outline"
              disabled={start.isPending}
              onClick={() => {
                setError('');
                start.mutate();
              }}
            >
              Resend code
            </Button>
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-6 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                First name
              </label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Last name
              </label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Minimum 4 characters.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Confirm password
            </label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button
            className="w-full"
            disabled={
              complete.isPending ||
              !firstName.trim() ||
              !lastName.trim() ||
              password.length < 4 ||
              password !== confirmPassword
            }
            onClick={() => {
              if (password !== confirmPassword) {
                setError('Passwords do not match');
                return;
              }
              setError('');
              complete.mutate();
            }}
          >
            {complete.isPending
              ? 'Creating account…'
              : 'Create account & open dashboard'}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <p className="mt-5 text-center text-sm text-[var(--muted)]">
        Already registered?{' '}
        <Link href="/login" className="font-semibold text-[var(--accent)]">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

export default function EventRegisterPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,118,110,0.14),transparent_45%),linear-gradient(210deg,rgba(3,105,161,0.12),transparent_40%)]"
      />
      <Suspense
        fallback={
          <Card className="w-full max-w-md p-7">
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          </Card>
        }
      >
        <EventRegisterForm />
      </Suspense>
    </main>
  );
}
