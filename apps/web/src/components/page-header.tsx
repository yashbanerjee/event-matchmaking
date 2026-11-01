export function PageHeader({
  title,
  actions,
}: {
  /** @deprecated Unused — kept so call sites can pass it without breaking. */
  eyebrow?: string;
  title: string;
  /** @deprecated Unused — kept so call sites can pass it without breaking. */
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-xl tracking-tight text-[var(--foreground)] sm:text-3xl">
          {title}
        </h1>
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-wrap gap-2 [&>button]:flex-1 [&>button]:sm:flex-none [&>a]:flex-1 [&>a]:sm:flex-none sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
