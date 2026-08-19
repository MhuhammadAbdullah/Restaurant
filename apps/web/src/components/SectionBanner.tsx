export function SectionBanner({ heading, image, onClick }: { heading: string; image?: string | null; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      aria-label={heading}
      className={`relative my-[50px] block h-48 w-full overflow-hidden rounded-2xl bg-transparent sm:h-64 ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={heading} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </Tag>
  );
}
