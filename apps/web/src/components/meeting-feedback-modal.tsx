'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
      <Select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n} / 5
          </option>
        ))}
      </Select>
    </label>
  );
}

/** Pick the meeting-party org the signed-in user belongs to. */
export function resolveFeedbackOrganizationId(
  meeting: {
    companyOrgId?: string | null;
    vendorOrgId?: string | null;
    companyOrg?: { id?: string | null } | null;
    vendorOrg?: { id?: string | null } | null;
  },
  organizationIds: string[] | undefined | null,
): string {
  const company = meeting.companyOrgId || meeting.companyOrg?.id || '';
  const vendor = meeting.vendorOrgId || meeting.vendorOrg?.id || '';
  const ids = organizationIds ?? [];
  const match = ids.find((id) => id && (id === company || id === vendor));
  if (match) return match;
  if (ids[0]) return ids[0];
  return company || vendor || '';
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
  onSubmitted: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<FeedbackFormState>(defaultForm);

  useEffect(() => {
    if (!open) return;
    setForm(defaultForm());
  }, [open, meetingId]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!meetingId) throw new Error('Missing meeting');
      if (!organizationId) {
        throw new Error('Missing organization. Reload the page and try again.');
      }
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
          isConfidential: false,
        }),
      });
    },
    onSuccess: () => {
      setForm(defaultForm());
      // Close immediately so mobile users don't stay stuck on a stacked modal.
      onClose();
      void Promise.resolve(onSubmitted()).catch(() => undefined);
    },
  });

  return (
    <Modal
      open={open}
      layer="overlay"
      onClose={() => {
        if (submit.isPending) return;
        onClose();
      }}
      title="Meeting feedback & review"
      description={`Share feedback on the meeting and review ${counterpartName}.`}
      size="lg"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={submit.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => submit.mutate()}
            loading={submit.isPending}
            disabled={!meetingId || !organizationId || submit.isPending}
          >
            {submit.isPending ? 'Submitting…' : 'Submit feedback'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {!organizationId ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            Your organization could not be loaded. Refresh the page, then try
            again.
          </p>
        ) : null}

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
          <Select
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
          </Select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium">
          Comments
          <Textarea
            value={form.comments}
            onChange={(e) => setForm({ ...form, comments: e.target.value })}
            placeholder="What went well? Anything to improve?"
          />
        </label>

        {submit.error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
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
  if (['CANCELLED', 'NO_SHOW', 'IN_PROGRESS'].includes(meeting.status)) {
    return false;
  }
  if (meeting.status === 'COMPLETED') return true;
  const end = meeting.endsAt
    ? new Date(meeting.endsAt)
    : new Date(new Date(meeting.startsAt).getTime() + 15 * 60_000);
  return !Number.isNaN(end.getTime()) && end.getTime() <= Date.now();
}
