export function ProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="ua-skeleton aspect-square w-full" />
      <div className="space-y-2 p-3.5">
        <div className="ua-skeleton h-3 w-16 rounded" />
        <div className="ua-skeleton h-4 w-3/4 rounded" />
        <div className="ua-skeleton h-4 w-1/3 rounded" />
        <div className="ua-skeleton h-9 w-full rounded-full" />
      </div>
    </div>
  );
}

export function ProductSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  );
}
