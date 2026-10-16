export function ProductSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="ua-skeleton aspect-square w-full" />
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        {/* brand */}
        <div className="ua-skeleton h-2.5 w-12 rounded" />
        {/* name (two lines) */}
        <div className="ua-skeleton h-4 w-3/4 rounded" />
        <div className="ua-skeleton h-4 w-1/2 rounded" />
        {/* rating */}
        <div className="ua-skeleton h-3 w-20 rounded" />
        {/* price */}
        <div className="ua-skeleton mt-0.5 h-4 w-1/3 rounded" />
        {/* colors/sizes */}
        <div className="ua-skeleton h-2.5 w-16 rounded" />
        {/* action row: primary button + icon button */}
        <div className="mt-auto flex items-center gap-2 pt-3">
          <div className="ua-skeleton h-9 flex-1 rounded-full" />
          <div className="ua-skeleton h-9 w-9 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ProductSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  );
}
