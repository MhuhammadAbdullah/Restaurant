/** Three (or more) blinking dots — used by the global loading screen only (see GlobalLoadingScreen). */
export function Dots({ className = "", dots = 3 }: { className?: string; dots?: number }) {
  return (
    <span role="status" className={`inline-flex items-center justify-center gap-[12%] ${className}`}>
      {Array.from({ length: dots }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          style={{ animationDelay: `${index * 0.2}s` }}
          className="aspect-square grow animate-dots-blink rounded-full bg-current"
        />
      ))}
      <span className="sr-only">Loading</span>
    </span>
  );
}
