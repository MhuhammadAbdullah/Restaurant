import { Skeleton, SkeletonCircle } from "./Skeleton";

/** Shown while the persisted session is still hydrating (before we know if the user is logged in). */
export function SkeletonAccountLayout() {
  return (
    <div className="min-h-screen bg-page">
      <div className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Skeleton className="mx-auto h-14 w-14 rounded-xl" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-10 sm:px-8 lg:grid-cols-[260px_1fr]">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <SkeletonCircle size={44} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-28 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full rounded-md" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
