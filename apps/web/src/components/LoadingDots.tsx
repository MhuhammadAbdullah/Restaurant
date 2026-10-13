/** A loading label ("Saving...") whose three dots pulse one after the other, so a busy button looks alive. */
export function LoadingDots({ children }: { children: React.ReactNode }) {
  return (
    <span>
      {children}
      <span className="dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}
