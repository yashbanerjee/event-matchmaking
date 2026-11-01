'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  responsesByFieldKey,
  type FormSchemaDefinition,
} from '@em/shared';
import { FormRenderer } from '@/components/form-renderer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { setTokens } from '@/lib/auth-store';
import { BRAND } from '@/lib/brand';
import { resolveParticipantHome } from '@/lib/portal-onboarding';
import { cn } from '@/lib/utils';

type EventDateOption = { value: string; label: string };

type PublicConfig = {
  enabled: boolean;
  formId?: string | null;
  formVersionId?: string | null;
  formName?: string | null;
  schema?: FormSchemaDefinition | null;
  reason?: string;
  needsRole?: boolean;
  investorFormConfigured?: boolean;
  innovatorFormConfigured?: boolean;
  eventDates?: EventDateOption[];
  eventActiveStart?: string;
  eventActiveEnd?: string;
  eventTimeZone?: string;
};

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1 as const, label: 'Profile', hint: 'Details & form' },
  { id: 2 as const, label: 'Availability', hint: 'Days & times' },
  { id: 3 as const, label: 'Verify', hint: 'Email code' },
  { id: 4 as const, label: 'Password', hint: 'Secure access' },
];

function hmToMinutes(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHm(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Fixed event-hour slot options (15-minute steps). */
function buildTimeOptions(activeStart: string, activeEnd: string) {
  const start = hmToMinutes(activeStart);
  const end = hmToMinutes(activeEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return [];
  }
  const options: string[] = [];
  for (let t = start; t <= end; t += 15) {
    options.push(minutesToHm(t));
  }
  return options;
}

function StepRail({ step }: { step: Step }) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
                    active && 'bg-[var(--accent)] text-[var(--accent-foreground)]',
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
            title: 'Investor',
            body: 'Share your mandate and meet the innovators that fit your check.',
          },
          {
            id: 'GUEST' as const,
            title: 'Innovator',
            body: 'Pitch your solution and meet investors who can fund or partner.',
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

function AvailabilityStep({
  eventDates,
  activeStart,
  activeEnd,
  timeZone,
  selectedDates,
  windows,
  onToggleDate,
  onChangeWindow,
}: {
  eventDates: EventDateOption[];
  activeStart: string;
  activeEnd: string;
  timeZone: string;
  selectedDates: string[];
  windows: Record<string, { start: string; end: string }>;
  onToggleDate: (date: string) => void;
  onChangeWindow: (date: string, next: { start: string; end: string }) => void;
}) {
  const timeOptions = useMemo(
    () => buildTimeOptions(activeStart, activeEnd),
    [activeStart, activeEnd],
  );

  if (!eventDates.length) {
    return (
      <p className="text-sm text-[var(--danger)]">
        Event dates are not configured yet. Ask an admin to set them in
        Settings.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--highlight)]/20 bg-[var(--highlight-soft)]/50 px-4 py-3 text-sm leading-relaxed">
        Event hours are fixed at{' '}
        <span className="font-semibold">
          {activeStart}–{activeEnd}
        </span>{' '}
        ({timeZone}). Pick the days you can meet, then choose your window
        inside those hours for each day.
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">
          Event days you can take meetings{' '}
          <span className="text-[var(--danger)]">*</span>
        </p>
        <div className="space-y-2">
          {eventDates.map((day) => {
            const checked = selectedDates.includes(day.value);
            return (
              <label
                key={day.value}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors',
                  checked
                    ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]/50'
                    : 'border-[var(--border)] bg-white hover:border-[var(--accent)]/30',
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={checked}
                  onChange={() => onToggleDate(day.value)}
                />
                <span className="font-medium">{day.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {selectedDates.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Your time on each day</p>
          {selectedDates.map((date) => {
            const meta = eventDates.find((d) => d.value === date);
            const window = windows[date] ?? {
              start: activeStart,
              end: activeEnd,
            };
            const endOptions = timeOptions.filter((t) => t > window.start);
            return (
              <div
                key={date}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card-elevated)]/70 p-3 sm:p-4"
              >
                <p className="mb-3 text-sm font-medium">
                  {meta?.label ?? date}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1.5 block font-medium">
                      Available from
                    </span>
                    <Select
                      value={window.start}
                      onChange={(e) => {
                        const start = e.target.value;
                        const end =
                          window.end > start ? window.end : endOptions[0] ?? activeEnd;
                        onChangeWindow(date, { start, end });
                      }}
                    >
                      {timeOptions
                        .filter((t) => t < activeEnd)
                        .map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1.5 block font-medium">
                      Available until
                    </span>
                    <Select
                      value={window.end}
                      onChange={(e) =>
                        onChangeWindow(date, {
                          start: window.start,
                          end: e.target.value,
                        })
                      }
                    >
                      {endOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </label>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Must stay between {activeStart} and {activeEnd}.
                </p>
              </div>
            );
          })}
        </div>
      ) : null}
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
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [availabilityWindows, setAvailabilityWindows] = useState<
    Record<string, { start: string; end: string }>
  >({});
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

  const status = useQuery({
    queryKey: ['registration-event-status'],
    queryFn: () => apiFetch<PublicConfig>('/registration/event'),
  });

  const config = useQuery({
    queryKey: ['registration-event', role],
    queryFn: () =>
      apiFetch<PublicConfig>(`/registration/event?role=${role}`),
    enabled: Boolean(role),
  });

  const schema = useMemo(() => {
    const next = config.data?.schema;
    if (!next) return null;
    return {
      ...next,
      fields: next.fields.filter(
        (f) =>
          f.key !== 'participant_role' &&
          !f.key.startsWith('availability_'),
      ),
    };
  }, [config.data?.schema]);

  const schedule = config.data ?? status.data;
  const eventDates = schedule?.eventDates ?? [];
  const activeStart = schedule?.eventActiveStart ?? '09:00';
  const activeEnd = schedule?.eventActiveEnd ?? '17:00';
  const timeZone = schedule?.eventTimeZone ?? 'Asia/Dubai';

  const start = useMutation({
    mutationFn: () => {
      if (!schema || !role) {
        throw new Error('Select a role and complete the form first');
      }
      const formResponses = responsesByFieldKey(schema, values);
      const windows: Record<string, { start: string; end: string }> = {};
      for (const date of selectedDates) {
        windows[date] = availabilityWindows[date] ?? {
          start: activeStart,
          end: activeEnd,
        };
      }
      const firstWindow = selectedDates[0]
        ? windows[selectedDates[0]]
        : undefined;
      return apiFetch<{ registrationId: string }>('/registration/event/start', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          role,
          organizationName: organizationName.trim(),
          responses: {
            ...formResponses,
            availability_dates: selectedDates,
            availability_windows: windows,
            availability_start_time: firstWindow?.start ?? activeStart,
            availability_end_time: firstWindow?.end ?? activeEnd,
          },
        }),
      });
    },
    onSuccess: (res) => {
      setError('');
      setRegistrationId(res.registrationId);
      setStep(3);
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
      // Prefill account name from personal details when possible.
      if (!firstName.trim() || !lastName.trim()) {
        const contact =
          typeof values[
            schema?.fields.find((f) => f.key === 'contact_name')?.id ?? ''
          ] === 'string'
            ? String(
                values[
                  schema?.fields.find((f) => f.key === 'contact_name')?.id ?? ''
                ],
              ).trim()
            : '';
        if (contact) {
          const parts = contact.split(/\s+/);
          if (!firstName.trim() && parts[0]) setFirstName(parts[0]);
          if (!lastName.trim() && parts.length > 1) {
            setLastName(parts.slice(1).join(' '));
          }
        }
      }
      setStep(4);
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

  const availabilityReady =
    selectedDates.length > 0 &&
    selectedDates.every((date) => {
      const window = availabilityWindows[date] ?? {
        start: activeStart,
        end: activeEnd,
      };
      return (
        window.start >= activeStart &&
        window.end <= activeEnd &&
        window.start < window.end
      );
    });

  if (status.isLoading) {
    return (
      <Card className="animate-rise w-full max-w-xl border-white/70 bg-white/90 p-8">
        <p className="text-sm text-[var(--muted)]">Loading registration…</p>
      </Card>
    );
  }

  if (!status.data?.enabled) {
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

  if (
    !status.data.investorFormConfigured &&
    !status.data.innovatorFormConfigured
  ) {
    return (
      <Card className="animate-rise w-full max-w-lg border-white/70 bg-white/90 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--highlight)]">
          {BRAND.name}
        </p>
        <h1 className="mt-3 h-display text-3xl">Almost ready</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          An administrator still needs to select investor and innovator forms
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
          Complete your profile, pick meeting days inside fixed event hours,
          verify your email, then open your dashboard.
        </p>
        <ul className="relative mt-8 space-y-3 text-sm">
          {[
            'Personal details + match profile',
            'Choose days and times within event hours',
            'Verify email and open your dashboard',
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
              {step === 1
                ? config.data?.formName
                  ? `Complete “${config.data.formName}”, then set your meeting availability.`
                  : 'Choose a role to load your form, then set availability.'
                : step === 2
                  ? 'Select event days and your available hours within the fixed schedule.'
                  : step === 3
                    ? 'Enter the code we emailed you.'
                    : 'Set a password to open your dashboard.'}
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
                  onChange={(next) => {
                    setRole(next);
                    setValues({});
                    setError('');
                  }}
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

              {role && config.isLoading ? (
                <p className="text-sm text-[var(--muted)]">Loading form…</p>
              ) : null}

              {role && config.data && !config.data.schema ? (
                <p className="text-sm text-[var(--danger)]">
                  The {role === 'CLIENT' ? 'investor' : 'innovator'} form is not
                  configured yet. Ask an admin to select it in Settings.
                </p>
              ) : null}

              {schema ? (
                <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--card-elevated)]/80 p-3 sm:p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    {role === 'CLIENT' ? 'Investor' : 'Innovator'} form
                  </p>
                  <FormRenderer
                    schema={schema}
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
                  !email.trim() ||
                  !role ||
                  !organizationName.trim() ||
                  !schema
                }
                onClick={() => {
                  setError('');
                  setStep(2);
                }}
              >
                Continue to availability
              </Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div
              className="space-y-5"
              style={{ animation: 'rise-in 0.45s ease-out both' }}
            >
              <AvailabilityStep
                eventDates={eventDates}
                activeStart={activeStart}
                activeEnd={activeEnd}
                timeZone={timeZone}
                selectedDates={selectedDates}
                windows={availabilityWindows}
                onToggleDate={(date) => {
                  setSelectedDates((current) => {
                    if (current.includes(date)) {
                      setAvailabilityWindows((windows) => {
                        const next = { ...windows };
                        delete next[date];
                        return next;
                      });
                      return current.filter((d) => d !== date);
                    }
                    setAvailabilityWindows((windows) => ({
                      ...windows,
                      [date]: windows[date] ?? {
                        start: activeStart,
                        end: activeEnd,
                      },
                    }));
                    return [...current, date].sort();
                  });
                }}
                onChangeWindow={(date, next) => {
                  setAvailabilityWindows((windows) => ({
                    ...windows,
                    [date]: next,
                  }));
                }}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="lg"
                  loading={start.isPending}
                  disabled={!availabilityReady || start.isPending}
                  onClick={() => {
                    setError('');
                    start.mutate();
                  }}
                >
                  {start.isPending ? 'Sending code…' : 'Continue to email verify'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
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
                  loading={verify.isPending}
                  disabled={otp.length !== 6}
                  onClick={() => {
                    setError('');
                    verify.mutate();
                  }}
                >
                  {verify.isPending ? 'Verifying…' : 'Verify email'}
                </Button>
                <Button
                  variant="outline"
                  loading={start.isPending}
                  onClick={() => {
                    setError('');
                    start.mutate();
                  }}
                >
                  Resend code
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Back
                </Button>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
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
                loading={complete.isPending}
                disabled={
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
