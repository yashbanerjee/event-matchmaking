'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  wide,
  size,
  layer = 'default',
}: {
  open: boolean;
  title: string;
  /** @deprecated Unused — kept so call sites can pass it without breaking. */
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  wide?: boolean;
  size?: 'md' | 'lg' | 'xl' | 'full';
  /** Stack nested modals above the calendar / details popup. */
  layer?: 'default' | 'overlay';
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
  const isFull = resolvedSize === 'full';
  const panelClass = isFull
    ? 'h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none'
    : resolvedSize === 'xl'
      ? 'mt-auto max-h-[min(94dvh,960px)] w-full max-w-none rounded-t-[1.25rem] sm:my-4 sm:max-w-6xl sm:rounded-[var(--radius)]'
      : resolvedSize === 'lg'
        ? 'mt-auto max-h-[min(92dvh,840px)] w-full max-w-none rounded-t-[1.25rem] sm:my-8 sm:max-w-2xl sm:rounded-[var(--radius)]'
        : 'mt-auto max-h-[min(90dvh,720px)] w-full max-w-none rounded-t-[1.25rem] sm:my-8 sm:max-w-lg sm:rounded-[var(--radius)]';

  const zClass = layer === 'overlay' ? 'z-[120]' : 'z-[100]';

  return createPortal(
    <div
      className={`fixed inset-0 ${zClass} flex items-end justify-center overflow-y-auto bg-slate-950/55 p-0 backdrop-blur-[3px] sm:items-center sm:p-4`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`flex w-full flex-col border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)] animate-rise ${panelClass} ${
          isFull ? '' : 'border-b-0 sm:border-b'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {!isFull ? (
          <div
            className="flex shrink-0 justify-center pb-1 pt-2.5 sm:hidden"
            aria-hidden
          >
            <span className="h-1 w-10 rounded-full bg-[#D0D0CC]" />
          </div>
        ) : null}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
              {title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>
        {footer ? (
          <div className="modal-footer-pad flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border)] px-4 py-3 sm:flex-row sm:justify-end sm:px-5 sm:py-4 [&>button]:w-full sm:[&>button]:w-auto">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
