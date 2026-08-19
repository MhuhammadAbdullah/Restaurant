import { Skeleton } from "./Skeleton";

/** Shown while the address form's map (and current-location lookup) is initializing. */
export function AddressFormSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="mb-1.5 h-3 w-48 rounded-md" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
      <div>
        <Skeleton className="mb-1.5 h-3 w-16 rounded-md" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
