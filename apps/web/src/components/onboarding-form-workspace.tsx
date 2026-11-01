'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { responsesByFieldKey, valuesByFieldId } from '@em/shared';
import {
  AvailabilityStep,
  type DayWindow,
  type EventDateOption,
} from '@/components/availability-step';
import { FormRenderer } from '@/components/form-renderer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError, apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import {
  EVENT_TIME_ZONE,
  formatEventDate,
  normalizeEventSchedule,
  type EventSchedule,
} from '@/lib/event-schedule';
import type { OnboardingItem } from '@/lib/portal-onboarding';
import {
  applyIdentityResponses,
  fullNameFromIdentity,
  withoutIdentityFields,
  withoutKnownIdentityFields,
} from '@/lib/registration-identity';
import { formatVendorStatus, statusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

type Step = 1 | 2;

const STEPS = [
  { id: 1 as const, label: 'Profile', hint: 'Your details' },
  { id: 2 as const, label: 'Availability', hint: 'Meeting days' },
];

function statusForItem(item: OnboardingItem) {
  if (item.action === 'correct') return 'RESEND_FOR_IMPROVEMENTS';
  if (item.submission?.status) return item.submission.status;
  return item.workflowStatus;
}

function labelForItem(item: OnboardingItem) {
  if (item.action === 'submit') return 'Pending submission';
  if (item.action === 'correct') return 'Updates requested';
  if (item.submission?.status === 'APPROVED') return 'Verified';
  return formatVendorStatus(item.submission?.status ?? item.workflowStatus);
}

function StepRail({ step }: { step: Step }) {
  return (
    <ol className="grid grid-cols-2 gap-2">
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
                    active &&
                      'bg-[var(--accent)] text-[var(--accent-foreground)]',
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

export function OnboardingFormWorkspace({
  items,
  selectedId,
  onSelect,
  roleLabel,
  dashboardHref,
  onVerified,
}: {
  items: OnboardingItem[];
  selectedId: string | null;
  onSelect: (assignmentId: string) => void;
  roleLabel: 'investor' | 'innovator';
  dashboardHref: string;
  onVerified?: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [windows, setWindows] = useState<Record<string, DayWindow>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selected =
    items.find((item) => item.assignmentId === selectedId) ?? items[0] ?? null;

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      apiFetch<{
        email: string;
        firstName?: string | null;
        lastName?: string | null;
      }>('/auth/me', { token: getAccessToken() }),
  });

  const bookingWindow = useQuery({
    queryKey: ['meeting-booking-window'],
    queryFn: () =>
      apiFetch<EventSchedule>('/meeting-requests/booking-window', {
        token: getAccessToken(),
      }),
  });
  const schedule = normalizeEventSchedule(bookingWindow.data);
  const eventDates: EventDateOption[] = useMemo(
    () =>
      schedule.dates.map((date) => ({
        value: date,
        label: formatEventDate(date, 'long'),
      })),
    [schedule.dates],
  );

  useEffect(() => {
    if (!selected) {
      setValues({});
      setSelectedDates([]);
      setWindows({});
      setStep(1);
      return;
    }
    const responses = selected.submission?.responses ?? {};
    setValues(valuesByFieldId(selected.schema, responses));

    const existingDates = Array.isArray(responses.availability_dates)
      ? responses.availability_dates.map(String).filter(Boolean)
      : [];
    const existingWindows =
      responses.availability_windows &&
      typeof responses.availability_windows === 'object' &&
      !Array.isArray(responses.availability_windows)
        ? (responses.availability_windows as Record<string, DayWindow>)
        : {};
    setSelectedDates(existingDates);
    setWindows(existingWindows);
    setStep(1);
    setMessage('');
    setError('');
  }, [
    selected?.assignmentId,
    selected?.submission?.id,
    selected?.openCorrection?.id,
    selected,
  ]);

  const identity = useMemo(
    () => ({
      firstName: me.data?.firstName ?? '',
      lastName: me.data?.lastName ?? '',
      email: me.data?.email ?? '',
      organizationName: selected?.organizationName ?? '',
    }),
    [
      me.data?.email,
      me.data?.firstName,
      me.data?.lastName,
      selected?.organizationName,
    ],
  );

  const profileSchema = useMemo(() => {
    if (!selected) return null;
    if (selected.action === 'submit') {
      return me.isSuccess
        ? withoutKnownIdentityFields(selected.schema, identity)
        : withoutIdentityFields(selected.schema);
    }
    return {
      ...selected.schema,
      fields: selected.schema.fields.filter(
        (field) =>
          field.key !== 'participant_role' &&
          !field.key.startsWith('availability_'),
      ),
    };
  }, [identity, me.isSuccess, selected]);

  const editableFieldIds = useMemo(() => {
    if (!selected) return undefined;
    if (selected.action === 'correct' && selected.openCorrection) {
      return selected.openCorrection.editableFieldIds;
    }
    if (selected.action === 'submit') return undefined;
    return [];
  }, [selected]);

  const availabilityReady =
    selectedDates.length > 0 &&
    selectedDates.every((date) => {
      const window = windows[date] ?? {
        start: schedule.activeStart,
        end: schedule.activeEnd,
      };
      return Boolean(window.start && window.end && window.start < window.end);
    });

  const readOnly = selected?.action === 'view';
  const canEdit = selected?.action === 'submit' || selected?.action === 'correct';

  const submit = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('No form selected');
      if (!availabilityReady && selected.action === 'submit') {
        throw new Error('Pick at least one event day and a valid time window.');
      }

      const base = applyIdentityResponses(
        selected.schema,
        responsesByFieldKey(selected.schema, values),
        identity,
      );
      const payloadWindows: Record<string, DayWindow> = {};
      for (const date of selectedDates) {
        payloadWindows[date] = windows[date] ?? {
          start: schedule.activeStart,
          end: schedule.activeEnd,
        };
      }
      const firstWindow = selectedDates[0]
        ? payloadWindows[selectedDates[0]]
        : null;

      const responses = {
        ...base,
        availability_dates: selectedDates,
        availability_windows: payloadWindows,
        availability_start_time: firstWindow?.start ?? schedule.activeStart,
        availability_end_time: firstWindow?.end ?? schedule.activeEnd,
      };

      if (selected.action === 'correct' && selected.openCorrection) {
        return apiFetch(
          `/forms/onboarding/corrections/${selected.openCorrection.id}`,
          {
            method: 'POST',
            token: getAccessToken(),
            body: JSON.stringify({ responses }),
          },
        );
      }

      return apiFetch('/forms/submissions', {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          formVersionId: selected.formVersionId,
          organizationId: selected.organizationId,
          responses,
        }),
      });
    },
    onSuccess: async () => {
      setMessage(
        selected?.action === 'correct'
          ? 'Updates submitted. Your profile is verified.'
          : 'Form submitted. You are verified — opening your dashboard…',
      );
      setError('');
      await qc.invalidateQueries({ queryKey: ['portal-onboarding'] });
      if (selected?.action !== 'correct') {
        window.setTimeout(() => onVerified?.(), 700);
      }
    },
    onError: (caught) =>
      setError(
        caught instanceof ApiError ? caught.message : 'Could not submit form.',
      ),
  });

  if (!selected || !profileSchema) {
    return (
      <div className="rounded-[1.5rem] border border-[var(--border)] bg-white p-6">
        <p className="text-sm text-[var(--muted)]">
          No onboarding form is assigned yet. Ask an admin to invite you with a
          form.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[1.75rem] border border-[var(--border)] bg-[linear-gradient(145deg,#ffffff_0%,#f4f7f3_52%,#eef3ea_100%)] shadow-[0_18px_40px_rgba(15,23,15,0.06)]">
        <div className="border-b border-[var(--border)]/70 px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
                {roleLabel} onboarding
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
                Complete your profile
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                Answer the form, then pick the same event-day availability used
                at registration. Your {roleLabel} dashboard unlocks after
                submit — you are verified automatically.
              </p>
            </div>
            <Badge variant={statusTone(statusForItem(selected))}>
              {labelForItem(selected)}
            </Badge>
          </div>
          {canEdit ? (
            <div className="mt-5">
              <StepRail step={step} />
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="h-fit space-y-2 rounded-[1.5rem] border border-[var(--border)] bg-white p-3 shadow-sm">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Assigned forms
          </p>
          {items.map((item) => (
            <button
              key={item.assignmentId}
              type="button"
              onClick={() => onSelect(item.assignmentId)}
              className={cn(
                'w-full rounded-xl border px-3 py-2.5 text-left transition-colors',
                selected.assignmentId === item.assignmentId
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm'
                  : 'border-[var(--border)] hover:bg-[var(--card-elevated)]',
              )}
            >
              <p className="font-medium leading-snug">{item.formName}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {item.organizationName}
              </p>
              <div className="mt-2">
                <Badge variant={statusTone(statusForItem(item))}>
                  {labelForItem(item)}
                </Badge>
              </div>
            </button>
          ))}
          {readOnly ? (
            <a
              href={dashboardHref}
              className="mt-2 block rounded-xl border border-[var(--border)] px-3 py-2 text-center text-sm font-medium text-[var(--accent-hover)] hover:bg-[var(--card-elevated)]"
            >
              Open dashboard
            </a>
          ) : null}
        </aside>

        <section className="space-y-4 rounded-[1.5rem] border border-[var(--border)] bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {selected.formName}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {step === 1 || readOnly
                  ? 'Profile details used for matchmaking'
                  : 'Choose event days and hours — same flow as event registration'}
              </p>
              {selected.action === 'submit' &&
              (fullNameFromIdentity(identity) || identity.email) ? (
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Using{' '}
                  <span className="font-medium text-[var(--foreground)]">
                    {[
                      fullNameFromIdentity(identity),
                      identity.email,
                      identity.organizationName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  . Name, email, and organization are already on your account.
                </p>
              ) : null}
            </div>
            {canEdit ? (
              <p className="rounded-full bg-[var(--card-elevated)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                Step {step} of 2
              </p>
            ) : null}
          </div>

          {selected.action === 'view' ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card-elevated)] px-3 py-2 text-sm text-[var(--muted)]">
              Submitted details are locked. You can review them here. If admin
              requests changes, only the marked fields become editable.
            </p>
          ) : null}

          {selected.action === 'correct' ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Admin requested updates. Edit the highlighted fields, confirm
              availability, then resubmit.
            </p>
          ) : null}

          {message ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          {(step === 1 || readOnly) && profileSchema ? (
            <div style={{ animation: 'rise-in 0.35s ease-out both' }}>
              <FormRenderer
                schema={profileSchema}
                values={values}
                editableFieldIds={readOnly ? [] : editableFieldIds}
                visibleFieldIds={
                  selected.action === 'correct'
                    ? selected.openCorrection?.editableFieldIds
                    : undefined
                }
                notes={selected.openCorrection?.notes}
                disabled={readOnly || submit.isPending}
                onChange={(fieldId, value) =>
                  setValues((current) => ({ ...current, [fieldId]: value }))
                }
                onUpload={async (_field, file) => ({
                  documentId: crypto.randomUUID(),
                  filename: file.name,
                })}
              />
            </div>
          ) : null}

          {step === 2 && canEdit ? (
            <div
              className="space-y-1"
              style={{ animation: 'rise-in 0.35s ease-out both' }}
            >
              <AvailabilityStep
                eventDates={eventDates}
                activeStart={schedule.activeStart}
                activeEnd={schedule.activeEnd}
                timeZone={EVENT_TIME_ZONE}
                selectedDates={selectedDates}
                windows={windows}
                disabled={submit.isPending}
                onToggleDate={(date) => {
                  setSelectedDates((current) => {
                    if (current.includes(date)) {
                      setWindows((prev) => {
                        const next = { ...prev };
                        delete next[date];
                        return next;
                      });
                      return current.filter((item) => item !== date);
                    }
                    setWindows((prev) => ({
                      ...prev,
                      [date]: prev[date] ?? {
                        start: schedule.activeStart,
                        end: schedule.activeEnd,
                      },
                    }));
                    return [...current, date].sort();
                  });
                }}
                onChangeWindow={(date, next) =>
                  setWindows((prev) => ({ ...prev, [date]: next }))
                }
              />
            </div>
          ) : null}

          {canEdit ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-4">
              {step === 2 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={submit.isPending}
                  onClick={() => setStep(1)}
                >
                  Back to profile
                </Button>
              ) : (
                <span className="text-xs text-[var(--muted)]">
                  Next: set meeting availability for event days
                </span>
              )}
              {step === 1 ? (
                <Button type="button" size="lg" onClick={() => setStep(2)}>
                  Continue to availability
                </Button>
              ) : (
                <Button
                  size="lg"
                  loading={submit.isPending}
                  disabled={!availabilityReady || submit.isPending}
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending
                    ? 'Submitting…'
                    : selected.action === 'correct'
                      ? 'Resubmit & verify'
                      : 'Submit & open dashboard'}
                </Button>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
