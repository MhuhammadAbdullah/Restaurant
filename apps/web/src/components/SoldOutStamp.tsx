/** "SOLD OUT" rubber-stamp laid over a faded item photo. */
export function SoldOutStamp({ small }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 -rotate-12 select-none whitespace-nowrap rounded-lg border-2 border-brand-red bg-white/90 font-poppins font-extrabold uppercase tracking-widest text-brand-red shadow-md ${
        small ? "px-2 py-0.5 text-[9px]" : "px-3.5 py-1 text-xs sm:text-sm"
      }`}
    >
      Sold out
    </span>
  );
}
