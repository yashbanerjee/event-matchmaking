'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';

export type InvitationLinkMeta = {
  show?: boolean;
  canCopy: boolean;
  reason?: string;
  email?: string;
  status?: string;
  expiresAt?: string;
};

function helperText(meta: InvitationLinkMeta | null | undefined): string | null {
  if (!meta) return null;
  switch (meta.reason) {
    case 'registered':
      return 'This profile already has an account. Invitation links apply to pending sign-ups only.';
    case 'revoked':
      return 'The invitation was revoked. Send a new invite from the directory.';
    case 'no_email':
      return 'No invite email on file. Add someone via Invite from the investors/innovators list.';
    case 'create_on_issue':
      return meta.email
        ? `Ready for ${meta.email}. Click to generate and copy the link.`
        : 'Click to generate and copy the registration link.';
    default:
      return null;
  }
}

export function CopyInvitationLinkButton({
  organizationId,
  invitationLink,
  variant = 'outline',
  size = 'default',
}: {
  organizationId: string;
  invitationLink: InvitationLinkMeta | null | undefined;
  variant?: 'outline' | 'default' | 'secondary';
  size?: 'default' | 'sm';
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta: InvitationLinkMeta = invitationLink ?? {
    show: true,
    canCopy: true,
    reason: 'ready',
  };

  if (meta.show === false) {
    return null;
  }

  const canCopy = meta.canCopy !== false;
  const hint = helperText(meta);

  const issue = useMutation({
    mutationFn: () =>
      apiFetch<{ inviteUrl: string }>(
        `/organizations/${organizationId}/invitation-link`,
        { method: 'POST', token: getAccessToken() },
      ),
    onSuccess: async (res) => {
      setError(null);
      try {
        await navigator.clipboard.writeText(res.inviteUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        setError('Could not copy — select the link manually.');
      }
    },
    onError: (err) => {
      setCopied(false);
      setError((err as Error).message);
    },
  });

  return (
    <div className="flex max-w-sm flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={!canCopy || issue.isPending}
        title={!canCopy ? hint ?? undefined : undefined}
        onClick={() => issue.mutate()}
      >
        <Link2 className="mr-2 h-4 w-4" />
        {issue.isPending
          ? 'Generating…'
          : copied
            ? 'Link copied'
            : 'Copy invitation link'}
      </Button>
      {canCopy && meta.email ? (
        <p className="text-[11px] text-[var(--muted)]">
          For {meta.email}
          {meta.expiresAt
            ? ` · expires ${new Date(meta.expiresAt).toLocaleDateString()}`
            : ''}
        </p>
      ) : hint ? (
        <p className="text-right text-[11px] leading-snug text-[var(--muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="max-w-xs text-right text-[11px] text-rose-700">{error}</p>
      ) : null}
      {copied ? (
        <p className="max-w-xs text-right text-[11px] text-emerald-700">
          A fresh link was copied. Older links for this invite no longer work.
        </p>
      ) : null}
    </div>
  );
}
