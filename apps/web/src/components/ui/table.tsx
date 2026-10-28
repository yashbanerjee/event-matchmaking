import { cn } from '@/lib/utils';

/** Compact Atlassian-style data table primitives. */
export function Table({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-[#DFE1E6] bg-white">
      <table
        className={cn('w-full border-collapse text-sm text-[#172B4D]', className)}
        {...props}
      />
    </div>
  );
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className="border-b border-[#DFE1E6] bg-[#F7F8F9] text-left text-[11px] font-semibold uppercase tracking-wide text-[#626F86]"
      {...props}
    />
  );
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-[#DFE1E6] last:border-b-0 hover:bg-[#F7F8F9]',
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('whitespace-nowrap px-3 py-2 font-semibold', className)}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('whitespace-nowrap px-3 py-2 align-middle', className)}
      {...props}
    />
  );
}
