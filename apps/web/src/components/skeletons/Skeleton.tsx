import type { CSSProperties } from "react";

/**
 * Base shimmer block. Every other skeleton in this folder is built from this —
 * a `bg-surface-alt` box with a light gradient sweeping across it via `animate-shimmer`.
 * Keep it a plain div (no accessible content) since it's purely decorative loading state.
 */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div className={`relative overflow-hidden bg-surface-alt ${className}`} style={style} aria-hidden="true">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10" />
    </div>
  );
}

/** One or more text-line placeholders. `lastLineWidth` shortens the final line like a paragraph would. */
export function SkeletonText({
  lines = 1,
  className = "",
  lastLineWidth = "70%",
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 rounded-md" style={i === lines - 1 && lines > 1 ? { width: lastLineWidth } : undefined} />
      ))}
    </div>
  );
}

/** Matches the size/shape of a real `<button>` so it doesn't jump when the real one mounts. */
export function SkeletonButton({ className = "" }: { className?: string }) {
  return <Skeleton className={`h-9 w-24 rounded-lg ${className}`} />;
}

export function SkeletonCircle({ size = 40, className = "" }: { size?: number; className?: string }) {
  return <Skeleton className={`rounded-full ${className}`} style={{ width: size, height: size }} />;
}
