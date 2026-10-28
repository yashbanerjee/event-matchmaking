export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="py-10 text-center">
      <h3 className="font-medium">{title}</h3>
      {description && (
        <p className="text-sm text-[var(--muted)] mt-1">{description}</p>
      )}
    </div>
  );
}
