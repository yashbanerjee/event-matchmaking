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
import { BRAND } from '@/lib/brand';
import { resolveParticipantHome } from '@/lib/portal-onboarding';
import { cn } from '@/lib/utils';

type PublicConfig = {
  enabled: boolean;
  formId?: string | null;
  formVersionId?: string | null;
  formName?: string | null;
  schema?: FormSchemaDefinition | null;
  reason?: string;
};

type Step = 1 | 2 | 3;

const STEPS = [
  { id: 1 as const, label: 'Details', hint: 'Profile & role' },
  { id: 2 as const, label: 'Verify', hint: 'Email code' },
  { id: 3 as const, label: 'Password', hint: 'Secure access' },
];

function StepRail({ step }: { step: Step }) {
  return (
    <ol className="grid grid-cols-3 gap-2">
      {STEPS.map((item, index) => {
        const active = step === item.id;
        const done = step > item.id;
        return (
          <li key={item.id} className="min-w-0">
            <div
              className={cn(
                'rounded-2xl border px-3 py-2.5 transition-colors',
                active &&
                  'border-[var(--accent)]/40 bg-[var(--accent-soft)]/70 shadow-sm',
                done && 'border-emerald-200 bg-emerald-50/80',
                !active &&
                  !done &&
                  'border-[var(--border)] bg-white/70 text-[var(--muted)]',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    active && 'bg-[var(--accent)] text-white',
                    done && 'bg-emerald-600 text-white',
                    !active &&
                      !done &&
                      'bg-[var(--card-elevated)] text-[var(--muted)]',
                  )}
                >
                  {done ? '✓' : index + 1}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'truncate text-xs font-semibold tracking-wide',
                      active && 'text-[var(--accent-hover)]',
                      done && 'text-emerald-800',
                    )}
                  >
                    {item.label}
                  </p>
                  <p className="truncate text-[10px] text-[var(--muted)]">
                    {item.hint}
                  </p>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function RolePicker({
  value,
  onChange,
}: {
  value: 'CLIENT' | 'GUEST' | '';
  onChange: (next: 'CLIENT' | 'GUEST') => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(
        [
          {
            id: 'CLIENT' as const,
            title: 'Client',
            body: 'Meet and match with guests at the event.',
          },
          {
            id: 'GUEST' as const,
            title: 'Guest',
            body: 'Showcase capabilities and connect with clients.',
          },
        ] as const
      ).map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              'rounded-2xl border px-4 py-3.5 text-left transition-all',
              selected
                ? 'border-[var(--highlight)] bg-[linear-gradient(180deg,#fbf7e8_0%,#ffffff_75%)] shadow-[0_10px_28px_rgba(10,10,10,0.1)] ring-1 ring-[var(--highlight)]/30'
                : 'border-[var(--border)] bg-white/80 hover:border-[var(--highlight)]/40 hover:bg-white',
            )}
          >
            <p className="font-semibold tracking-tight">{option.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              {option.body}
            </p>
          </button>
        );
      })}
    </div>
  );
}

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
      apiFetch<{ registrationToken: string }>(
        '/registration/event/verify-otp',
        {
          method: 'POST',
          body: JSON.stringify({
            registrationId,
            otp: otp.trim(),
          }),
        },
      ),
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
      <Card className="animate-rise w-full max-w-xl border-white/70 bg-white/90 p-8">
        <p className="text-sm text-[var(--muted)]">Loading registration…</p>
      </Card>
    );
  }

  if (!config.data?.enabled) {
    return (
      <Card className="animate-rise w-full max-w-lg border-white/70 bg-white/90 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--highlight)]">
          {BRAND.name}
        </p>
        <h1 className="mt-3 h-display text-3xl">Registration closed</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Public event registration is not open right now. Sign in if you
          already have an account.
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
      <Card className="animate-rise w-full max-w-lg border-white/70 bg-white/90 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--highlight)]">
          {BRAND.name}
        </p>
        <h1 className="mt-3 h-display text-3xl">Almost ready</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
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
    <div className="animate-rise grid w-full max-w-6xl gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
      <aside className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(165deg,#0a0a0a_0%,#1a1a1a_55%,#3d3418_140%)] p-7 text-[var(--sidebar-fg)] shadow-[var(--shadow)] sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(201,162,39,0.28),transparent_68%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 left-8 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_70%)]"
        />
        <Link
          href="/"
          className="relative text-xs font-semibold uppercase tracking-[0.24em] text-[var(--highlight)]"
        >
          {BRAND.name}
        </Link>
        <h1 className="relative mt-5 h-display max-w-sm text-3xl leading-tight text-white sm:text-4xl">
          {BRAND.tagline}.
        </h1>
        <p className="relative mt-4 max-w-sm text-sm leading-relaxed text-[var(--sidebar-muted)]">
          Tell us who you are, verify your email, and set a password. Your
          profile goes to the Ethara event team for review while you explore
          your dashboard.
        </p>
        <ul className="relative mt-8 space-y-3 text-sm">
          {[
            'Choose Client or Guest',
            'Verify with a one-time email code',
            'Open your panel right after setup',
          ].map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--highlight)]/25 text-[11px] font-bold text-[var(--highlight)]">
                ✓
              </span>
              <span className="text-[var(--sidebar-fg)]/90">{item}</span>
            </li>
          ))}
        </ul>
      </aside>

      <Card className="min-w-0 overflow-hidden border-white/70 bg-white/95 p-0 shadow-[var(--shadow)]">
        <div className="border-b border-[var(--border)] bg-[linear-gradient(180deg,#f7fbfd_0%,#ffffff_100%)] px-5 py-5 sm:px-7">
          <StepRail step={step} />
          <div className="mt-5">
            <h2 className="h-display text-2xl tracking-tight sm:text-3xl">
              Register for event
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
              {config.data.formName
                ? `Complete “${config.data.formName}”, then verify your email and set a password.`
                : 'Complete the form, verify your email, then set a password.'}
            </p>
          </div>
        </div>

        <div className="px-5 py-6 sm:px-7">
          {step === 1 ? (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-semibold">I am registering as</p>
                <RolePicker
                  value={role}
                  onChange={(next) => setRole(next)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Work email
                  </label>
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
                    Organization name
                  </label>
                  <Input
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    placeholder="Your organization"
                  />
                </div>
              </div>

              {schemaWithoutRole ? (
                <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--card-elevated)]/80 p-3 sm:p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Profile form
                  </p>
                  <FormRenderer
                    schema={schemaWithoutRole}
                    values={values}
                    onChange={(fieldId, value) =>
                      setValues((current) => ({
                        ...current,
                        [fieldId]: value,
                      }))
                    }
                  />
                </div>
              ) : null}

              <Button
                className="w-full sm:w-auto sm:min-w-52"
                size="lg"
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
                {start.isPending ? 'Sending code…' : 'Continue to email verify'}
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div
              className="mx-auto max-w-md space-y-5"
              style={{ animation: 'rise-in 0.45s ease-out both' }}
            >
              <div className="rounded-2xl border border-[var(--highlight)]/20 bg-[var(--highlight-soft)]/50 px-4 py-3 text-sm leading-relaxed text-[var(--foreground)]">
                We sent a 6-digit code to{' '}
                <span className="font-semibold">{email}</span>. Enter it below
                to continue.
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Verification code
                </label>
                <Input
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="••••••"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="h-14 text-center font-mono text-2xl tracking-[0.35em]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="lg"
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
            <div
              className="mx-auto max-w-md space-y-4"
              style={{ animation: 'rise-in 0.45s ease-out both' }}
            >
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
                <label className="mb-1.5 block text-sm font-medium">
                  Password
                </label>
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
                size="lg"
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
            <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Already registered?{' '}
            <Link
              href="/login"
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}

export default function EventRegisterPage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(201,162,39,0.14),transparent_42%),linear-gradient(210deg,rgba(10,10,10,0.08),transparent_40%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-10 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(201,162,39,0.2),transparent_68%)] blur-2xl animate-fade"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 bottom-0 h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(10,10,10,0.1),transparent_70%)] blur-2xl"
      />
      <div className="relative mx-auto flex min-h-[80vh] w-full max-w-6xl items-center justify-center">
        <Suspense
          fallback={
            <Card className="w-full max-w-md border-white/70 bg-white/90 p-7">
              <p className="text-sm text-[var(--muted)]">Loading…</p>
            </Card>
          }
        >
          <EventRegisterForm />
        </Suspense>
      </div>
    </main>
  );
}
