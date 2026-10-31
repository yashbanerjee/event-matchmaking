export default function VendorLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-black/6" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-black/5" />
      <div className="h-72 animate-pulse rounded-2xl bg-black/5" />
    </div>
  );
}
