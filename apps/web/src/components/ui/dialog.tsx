'use client';

import { createPortal } from 'react-dom';
import { Button } from './button';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-lg">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={loading} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
