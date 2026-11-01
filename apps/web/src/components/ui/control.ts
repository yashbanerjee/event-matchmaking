/** Shared field chrome so inputs, selects, and textareas align visually. */
export const controlClassName =
  'flex h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm leading-normal shadow-sm transition-colors placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50';

/** Native <select> needs extra right padding for the custom chevron. */
export const selectClassName = `${controlClassName} ui-select appearance-none pr-10`;

export const textareaClassName = `${controlClassName} h-auto min-h-24 py-2.5`;

/** Consistent label → control spacing for forms and filters. */
export const fieldLabelClassName = 'grid gap-1.5 text-sm font-medium';

export const fieldHintClassName = 'text-sm text-[var(--muted)]';
