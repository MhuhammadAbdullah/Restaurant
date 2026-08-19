import { Skeleton } from "./Skeleton";

/** Matches the brand-red/10 balance card used on the Loyalty page. */
export function SkeletonBalanceCard() {
  return (
    <div className="rounded-xl bg-brand-red/10 p-4 text-center">
      <Skeleton className="mx-auto h-3 w-24 rounded-md" />
      <Skeleton className="mx-auto mt-2 h-8 w-32 rounded-md" />
    </div>
  );
}

/** A single loyalty transaction row — title+date left, amount right. */
export function SkeletonTransactionRow() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line p-3">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-24 rounded-md" />
        <Skeleton className="h-3 w-32 rounded-md" />
      </div>
      <Skeleton className="h-4 w-14 rounded-md" />
    </div>
  );
}

/** Loyalty page: balance card + N history rows. */
export function SkeletonBalancePage({ rows = 4 }: { rows?: number }) {
  return (
    <div>
      <SkeletonBalanceCard />
      <Skeleton className="mt-5 h-4 w-16 rounded-md" />
      <div className="mt-2 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTransactionRow key={i} />
        ))}
      </div>
    </div>
  );
}

/** Mirrors OrdersPage's order card — number/status row, subtitle, items line, progress bar, total. */
export function SkeletonOrderCard() {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-3 w-16 rounded-md" />
      </div>
      <Skeleton className="mt-2 h-3 w-40 rounded-md" />
      <Skeleton className="mt-2 h-3 w-full rounded-md" />
      <div className="mt-3 flex items-center gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-1.5 flex-1 rounded-full" />
        ))}
      </div>
      <div className="mt-2 flex justify-between">
        <Skeleton className="h-3 w-10 rounded-md" />
        <Skeleton className="h-4 w-16 rounded-md" />
      </div>
    </div>
  );
}

/** Mirrors AddressesPage's address card — label, address line, city/area. */
export function SkeletonAddressCard() {
  return (
    <div className="rounded-xl border border-line p-3">
      <Skeleton className="h-4 w-20 rounded-md" />
      <Skeleton className="mt-2 h-3 w-4/5 rounded-md" />
      <Skeleton className="mt-1.5 h-3 w-2/5 rounded-md" />
    </div>
  );
}

/** Mirrors FavouritesPage's product card — image, name, price. */
export function SkeletonFavouriteCard() {
  return (
    <div className="rounded-xl border border-line p-3">
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="mt-2 h-4 w-4/5 rounded-md" />
      <Skeleton className="mt-1.5 h-3 w-1/3 rounded-md" />
    </div>
  );
}

/** Mirrors ProfilePage's labeled field row. */
export function SkeletonFieldRow() {
  return (
    <div className="rounded-lg border border-line p-3">
      <Skeleton className="h-3 w-14 rounded-md" />
      <Skeleton className="mt-1.5 h-4 w-40 rounded-md" />
    </div>
  );
}
