export function SectionBanner({ heading, image, onClick }: { heading: string; image?: string | null; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      aria-label={heading}
      className={`relative my-[50px] flex w-full justify-center overflow-hidden rounded-2xl bg-transparent ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {image && (
        // Never cropped: height is capped and the width follows the banner's own aspect ratio.
        // Background stays transparent so transparent PNG banners blend into the page.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={heading} className="block h-auto max-h-[340px] w-auto max-w-full" />
      )}
    </Tag>
  );
}
