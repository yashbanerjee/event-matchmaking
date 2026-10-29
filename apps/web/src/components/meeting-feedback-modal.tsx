'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

const OUTCOMES = [
  { value: 'SUCCESSFUL_DISCUSSION', label: 'Successful discussion' },
  { value: 'INTERESTED_IN_PARTNERSHIP', label: 'Interested in partnership' },
  { value: 'PROPOSAL_REQUESTED', label: 'Proposal requested' },
  { value: 'NEGOTIATION_IN_PROGRESS', label: 'Negotiation in progress' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow-up needed' },
  { value: 'NOT_A_FIT', label: 'Not a fit' },
  { value: 'NO_SHOW', label: 'No-show' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

type FeedbackFormState = {
  attendanceConfirmed: boolean;
  meetingQuality: number;
  relevance: number;
  businessPotential: number;
  communicationQuality: number;
  interestLevel: number;
  outcome: (typeof OUTCOMES)[number]['value'];
  comments: string;
};

const defaultForm = (): FeedbackFormState => ({
  attendanceConfirmed: true,
  meetingQuality: 4,
  relevance: 4,
  businessPotential: 4,
  communicationQuality: 4,
  interestLevel: 4,
  outcome: 'SUCCESSFUL_DISCUSSION',
  comments: '',
});

function RatingSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <select
        className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n} / 5
          </option>
        ))}
      </select>
    </label>
  );
}

export function MeetingFeedbackModal({
  open,
  meetingId,
  organizationId,
  counterpartName,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  meetingId: string | null;
  organizationId: string;
  counterpartName: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [form, setForm] = useState<FeedbackFormState>(defaultForm);

  const submit = useMutation({
    mutationFn: () => {
      if (!meetingId) throw new Error('Missing meeting');
      return apiFetch(`/meetings/${meetingId}/feedback`, {
        method: 'POST',
        token: getAccessToken(),
        body: JSON.stringify({
          organizationId,
          attendanceConfirmed: form.attendanceConfirmed,
          meetingQuality: form.meetingQuality,
          relevance: form.relevance,
          businessPotential: form.businessPotential,
          communicationQuality: form.communicationQuality,
          interestLevel: form.interestLevel,
          followUpRequired: false,
          outcome: form.outcome,
          comments: form.comments.trim() || undefined,
          isConfidential: true,
        }),
      });
    },
    onSuccess: () => {
      setForm(defaultForm());
      onSubmitted();
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Meeting feedback & review"
      description={`Share feedback on the meeting and review ${counterpartName}.`}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !meetingId}
          >
            {submit.isPending ? 'Submitting…' : 'Submit feedback'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.attendanceConfirmed}
            onChange={(e) =>
              setForm({ ...form, attendanceConfirmed: e.target.checked })
            }
          />
          I attended this meeting
        </label>

        <div>
          <h3 className="mb-2 text-sm font-semibold">About the meeting</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <RatingSelect
              label="Meeting quality"
              value={form.meetingQuality}
              onChange={(meetingQuality) =>
                setForm({ ...form, meetingQuality })
              }
            />
            <RatingSelect
              label="Relevance"
              value={form.relevance}
              onChange={(relevance) => setForm({ ...form, relevance })}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Review of {counterpartName}
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <RatingSelect
              label="Communication"
              value={form.communicationQuality}
              onChange={(communicationQuality) =>
                setForm({ ...form, communicationQuality })
              }
            />
            <RatingSelect
              label="Interest level"
              value={form.interestLevel}
              onChange={(interestLevel) =>
                setForm({ ...form, interestLevel })
              }
            />
            <RatingSelect
              label="Business potential"
              value={form.businessPotential}
              onChange={(businessPotential) =>
                setForm({ ...form, businessPotential })
              }
            />
          </div>
        </div>

        <label className="grid gap-1.5 text-sm font-medium">
          Outcome
          <select
            className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
            value={form.outcome}
            onChange={(e) =>
              setForm({
                ...form,
                outcome: e.target.value as FeedbackFormState['outcome'],
              })
            }
          >
            {OUTCOMES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium">
          Comments
          <textarea
            className="min-h-24 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            value={form.comments}
            onChange={(e) => setForm({ ...form, comments: e.target.value })}
            placeholder="What went well? Anything to improve?"
          />
        </label>

        {submit.error ? (
          <p className="text-sm text-rose-700">
            {(submit.error as Error).message}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** Meeting has ended and feedback can be collected. */
export function meetingHasEnded(meeting: {
  endsAt?: string | null;
  startsAt: string;
  status: string;
}) {
  if (['CANCELLED', 'NO_SHOW'].includes(meeting.status)) return false;
  if (meeting.status === 'COMPLETED') return true;
  const end = meeting.endsAt
    ? new Date(meeting.endsAt)
    : new Date(new Date(meeting.startsAt).getTime() + 15 * 60_000);
  return !Number.isNaN(end.getTime()) && end.getTime() <= Date.now();
}
