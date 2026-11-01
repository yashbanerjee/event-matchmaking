export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1 sm:space-y-1.5">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)] sm:text-xs">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="break-words text-xl tracking-tight text-[var(--foreground)] sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="hidden max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:block">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap gap-2 [&>button]:flex-1 [&>button]:sm:flex-none [&>a]:flex-1 [&>a]:sm:flex-none sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
