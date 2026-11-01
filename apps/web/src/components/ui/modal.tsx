'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  footer,
  wide,
  size,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  wide?: boolean;
  size?: 'md' | 'lg' | 'xl' | 'full';
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const resolvedSize = size ?? (wide ? 'lg' : 'md');
  const panelClass =
    resolvedSize === 'full'
      ? 'h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none'
      : resolvedSize === 'xl'
        ? 'my-0 max-h-[min(96dvh,960px)] w-full max-w-6xl sm:my-4'
        : resolvedSize === 'lg'
          ? 'my-4 max-h-[min(92dvh,840px)] w-full max-w-2xl sm:my-8'
          : 'my-4 max-h-[min(90dvh,720px)] w-full max-w-lg sm:my-8';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center overflow-y-auto bg-slate-950/55 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`flex w-full flex-col border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] ${panelClass} ${
          resolvedSize === 'full' ? '' : 'rounded-[var(--radius)]'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="modal-footer-pad flex shrink-0 justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
