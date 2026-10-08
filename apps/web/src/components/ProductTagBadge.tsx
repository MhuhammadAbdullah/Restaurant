import type { Product } from "../lib/types";

type ProductTag = NonNullable<Product["tag"]>;

const BURST_LABELS: Record<Exclude<ProductTag, "HOUSE_FAVORITE">, [string, string]> = {
  NEW_ARRIVAL: ["NEW", "ARRIVAL"],
  BEST_SELLER: ["BEST", "SELLER"],
};

/** Points of a serrated "seal" burst centred in a 100x100 box. */
const BURST_POINTS = (() => {
  const spikes = 14;
  const outer = 48;
  const inner = 41;
  const pts: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
})();

/**
 * Promotional badge the admin can pin on a product card (see Product.tag).
 * Positioned absolutely — render it inside the `relative` card root (the burst overhangs the card corner).
 */
export function ProductTagBadge({ tag, className = "" }: { tag?: Product["tag"]; className?: string }) {
  if (!tag) return null;

  if (tag === "HOUSE_FAVORITE") {
    return (
      <span
        className={`pointer-events-none absolute left-4 top-4 z-10 rounded-lg border-2 border-[#E0201B] bg-[#FFC400] px-2.5 py-1 font-poppins text-[10px] font-extrabold uppercase leading-none tracking-wide text-black shadow-md sm:text-xs ${className}`}
      >
        House Favorite
      </span>
    );
  }

  const [line1, line2] = BURST_LABELS[tag];
  return (
    <span
      className={`pointer-events-none absolute -left-4 -top-4 z-10 -rotate-[20deg] drop-shadow-md ${className}`}
      aria-label={`${line1} ${line2}`}
    >
      <svg viewBox="0 0 100 100" className="h-12 w-12 sm:h-16 sm:w-16" role="img" aria-hidden="true">
        <polygon points={BURST_POINTS} fill="#FFC20E" stroke="#D98A00" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="50" cy="50" r="35" fill="none" stroke="#D98A00" strokeWidth="1.2" strokeDasharray="2 3" />
        {[
          { text: line1, y: 46, size: line1.length > 3 ? 19 : 24 },
          { text: line2, y: 66, size: line2.length > 6 ? 17 : 20 },
        ].map((l) => (
          <text
            key={l.text}
            x="50"
            y={l.y}
            textAnchor="middle"
            fontFamily="Poppins, sans-serif"
            fontWeight="900"
            fontSize={l.size}
            fill="#7F1D12"
          >
            {l.text}
          </text>
        ))}
      </svg>
    </span>
  );
}
