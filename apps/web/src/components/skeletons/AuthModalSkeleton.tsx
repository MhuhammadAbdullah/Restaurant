import { Skeleton } from "./Skeleton";

/** Shown in place of the active view's fields while a request/verify call is in flight. */
export function AuthModalSkeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-1.5 h-3 w-24 rounded-md" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
