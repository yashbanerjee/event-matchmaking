'use client';

import { Button } from './button';
import { Select } from './select';

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 30, 50] as const;

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const sizes = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3 pt-4 pb-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p className="text-center text-sm text-[var(--muted)] sm:text-left">
          Showing{' '}
          <span className="font-semibold text-[var(--foreground)]">{from}</span>
          –<span className="font-semibold text-[var(--foreground)]">{to}</span>{' '}
          of{' '}
          <span className="font-semibold text-[var(--foreground)]">{total}</span>
        </p>
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className="whitespace-nowrap">Rows</span>
            <Select
              className="h-8 w-[4.5rem] px-2 py-1 text-sm"
              value={String(pageSize)}
              aria-label="Rows per page"
              onChange={(e) => {
                const next = Number(e.target.value) || pageSize;
                onPageSizeChange(next);
                onPageChange(1);
              }}
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="min-w-20 text-center text-sm font-medium tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
