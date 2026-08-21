import { useId } from "react";
import {
  FaArrowLeft,
  FaArrowRight,
  FaArrowUp,
  FaArrowUpRightFromSquare,
  FaCalculator,
  FaCartShopping,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaCreditCard,
  FaDollarSign,
  FaFileLines,
  FaFire,
  FaGift,
  FaHourglassHalf,
  FaLocationDot,
  FaMagnifyingGlass,
  FaMinus,
  FaMoneyBillWave,
  FaPhone,
  FaPlus,
  FaTrashCan,
  FaTruck,
  FaXmark,
} from "react-icons/fa6";

type IconProps = { className?: string; size?: number };

function base(children: React.ReactNode, { className = "", size = 20 }: IconProps = {}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

// ---------- Library-backed icons (react-icons / Font Awesome) ----------
// Thin named wrappers so every existing call site (`<PinIcon size={16} />` etc.) keeps working
// unchanged — only the underlying glyph implementation moved to a real icon library.

export function PinIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaLocationDot className={className} size={size} />;
}

export function PinSolidIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaLocationDot className={className} size={size} />;
}

export function PhoneIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaPhone className={className} size={size} />;
}

/** "Submit a Complaint" icon — a file/document glyph. */
export function ComplaintIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaFileLines className={className} size={size} />;
}

export function CloseIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaXmark className={className} size={size} />;
}

export function SearchIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaMagnifyingGlass className={className} size={size} />;
}

export function ChevronDownIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaChevronDown className={className} size={size} />;
}

export function ChevronLeftIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaChevronLeft className={className} size={size} />;
}

export function ChevronRightIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaChevronRight className={className} size={size} />;
}

export function CartIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaCartShopping className={className} size={size} />;
}

export function CalculatorIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaCalculator className={className} size={size} />;
}

export function DollarIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaDollarSign className={className} size={size} />;
}

export function FireIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaFire className={className} size={size} />;
}

/** "Back to top" scroll FAB icon. */
export function ArrowUpIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaArrowUp className={className} size={size} />;
}

export function ArrowRightIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaArrowRight className={className} size={size} />;
}

export function ArrowLeftIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaArrowLeft className={className} size={size} />;
}

/** Expired/waiting state icon (order-tracking link expiry, etc.). */
export function HourglassIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaHourglassHalf className={className} size={size} />;
}

export function PlusIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaPlus className={className} size={size} />;
}

export function MinusIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaMinus className={className} size={size} />;
}

/** Item-delete / remove icon. */
export function TrashIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaTrashCan className={className} size={size} />;
}

export function ExternalLinkIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaArrowUpRightFromSquare className={className} size={size} />;
}

export function TruckIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaTruck className={className} size={size} />;
}

export function GiftIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaGift className={className} size={size} />;
}

export function CardIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaCreditCard className={className} size={size} />;
}

export function CashIcon({ className = "", size = 20 }: IconProps = {}) {
  return <FaMoneyBillWave className={className} size={size} />;
}

// ---------- Hand-drawn icons kept as-is (out of scope for the icon-library migration) ----------

export function BuildingIcon(props: IconProps) {
  return base(
    <>
      <path d="M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" />
      <path d="M14 21v-9a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v9" />
      <path d="M3 21h18" />
      <path d="M9 7h.01M9 11h.01M9 15h.01M12 7h.01M12 11h.01M12 15h.01" />
    </>,
    props,
  );
}

// Original city-monument glyphs (not copies of any third-party asset) — simple thematic
// silhouettes so a city card never has to fall back to the generic building icon.
export function LahoreIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 3v2" />
      <circle cx="12" cy="6.5" r="1" />
      <path d="M10.5 21V10a1.5 1.5 0 0 1 3 0v11" />
      <path d="M9 21h6" />
      <path d="M6 21h12" />
    </>,
    props,
  );
}

export function IslamabadIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 21 12 7l8 14" />
      <path d="M6 21V13M18 21V13" />
      <path d="M6 13V9M18 13V9" />
      <path d="M4 21h16" />
    </>,
    props,
  );
}

export function MultanIcon(props: IconProps) {
  return base(
    <>
      <path d="M8 21v-6a4 4 0 0 1 8 0v6" />
      <path d="M12 8v3" />
      <circle cx="12" cy="6.5" r="1" />
      <path d="M6 21h12" />
    </>,
    props,
  );
}

export function GujranwalaIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 21V10l4-3 4 3v11" />
      <path d="M12 21V7l4-3 4 3v14" />
      <path d="M8 14h0M16 12h0" />
      <path d="M2 21h20" />
    </>,
    props,
  );
}

export function SialkotIcon(props: IconProps) {
  return base(
    <>
      <path d="M10 21V9h4v12" />
      <path d="M11.2 9V4.5L12 3.5l0.8 1V9" />
      <path d="M7 21h10" />
    </>,
    props,
  );
}

export function FaisalabadIcon(props: IconProps) {
  return base(
    <>
      <path d="M9 21V8h6v13" />
      <path d="M10.5 8V4a1.5 1.5 0 0 1 3 0v4" />
      <circle cx="12" cy="12.5" r="2" />
      <path d="M12 11.5v1l0.7 0.4" />
      <path d="M6 21h12" />
    </>,
    props,
  );
}

export function RahimYarKhanIcon(props: IconProps) {
  return base(
    <>
      <path d="M6 21V9h2v12" />
      <path d="M16 21V9h2v12" />
      <path d="M6 9h12" />
      <path d="M6 21h12" />
    </>,
    props,
  );
}

export function BahawalpurIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 21v-7l2-2 2 2v7" />
      <path d="M16 21v-7l2-2 2 2v7" />
      <path d="M9 21v-6a3 3 0 0 1 6 0v6" />
      <path d="M12 12v-1" />
      <path d="M2 21h20" />
    </>,
    props,
  );
}

export function UserIcon(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>,
    props,
  );
}

// ---------- Footer / social icons — admin manages the links, not the icon shapes; left as-is ----------

export function FacebookIcon(props: IconProps) {
  return base(<path d="M14 9h3V5.5h-3A4 4 0 0 0 10 9.5V12H8v3.5h2V21h3.5v-5.5H16l.5-3.5h-3v-1.8c0-.66.34-1.2 1.5-1.2z" fill="currentColor" stroke="none" />, props);
}

export function InstagramIcon({ className = "", size = 20 }: IconProps = {}) {
  const maskId = useId();
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <mask id={maskId}>
        <rect x="3" y="3" width="18" height="18" rx="5" fill="white" />
        <circle cx="12" cy="12" r="3.6" fill="black" />
        <circle cx="17.3" cy="6.8" r="1.1" fill="black" />
      </mask>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

export function TwitterIcon(props: IconProps) {
  return base(
    <path
      d="M21 5.5c-.7.3-1.5.6-2.3.7a4 4 0 0 0 1.8-2.2 8 8 0 0 1-2.5 1 4 4 0 0 0-6.9 3.6A11.4 11.4 0 0 1 3 4.6a4 4 0 0 0 1.2 5.3 4 4 0 0 1-1.8-.5v.05a4 4 0 0 0 3.2 3.9 4 4 0 0 1-1.8.07 4 4 0 0 0 3.7 2.8A8 8 0 0 1 2 17.9a11.3 11.3 0 0 0 6.1 1.8c7.3 0 11.3-6 11.3-11.3v-.5A8 8 0 0 0 21 5.5z"
      fill="currentColor"
      stroke="none"
    />,
    props,
  );
}

export function YoutubeIcon({ className = "", size = 20 }: IconProps = {}) {
  const maskId = useId();
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <mask id={maskId}>
        <rect x="2" y="5" width="20" height="14" rx="4" fill="white" />
        <path d="M10.3 9.3v5.4l4.9-2.7-4.9-2.7Z" fill="black" />
      </mask>
      <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

export function TiktokIcon(props: IconProps) {
  return base(
    <path
      d="M14 3c.3 1.9 1.6 3.4 3.5 3.8V10a6.8 6.8 0 0 1-3.5-1v6.3A5.3 5.3 0 1 1 9 9.9v3.3a2.1 2.1 0 1 0 2 2.1V3h3Z"
      fill="currentColor"
      stroke="none"
    />,
    props,
  );
}

export function LinkedinIcon({ className = "", size = 20 }: IconProps = {}) {
  const maskId = useId();
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <mask id={maskId}>
        <rect x="3" y="3" width="18" height="18" rx="3" fill="white" />
        <circle cx="7.2" cy="8" r="1.4" fill="black" />
        <path d="M6 11h2.4v7H6z" fill="black" />
        <path
          d="M11 11h2.3v1.1c.5-.8 1.3-1.3 2.4-1.3 2 0 2.8 1.3 2.8 3.4V18h-2.4v-3.3c0-.9-.3-1.5-1.2-1.5-.9 0-1.5.6-1.5 1.6V18H11Z"
          fill="black"
        />
      </mask>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

export function WhatsappIcon(props: IconProps) {
  return base(
    <path
      d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.2 1.2-1.7 1.3-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.7-1.2-4.5-3.9-4.6-4.1-.1-.2-1.1-1.5-1.1-2.8 0-1.3.7-2 .9-2.2.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.8.8 1.9.1.2.1.3 0 .5-.1.2-.2.3-.3.5-.2.2-.3.3-.5.5-.2.2-.3.4-.1.7.2.3.9 1.4 1.9 2.3 1.3 1.2 2.4 1.5 2.7 1.7.3.2.5.1.7-.1.2-.2.8-.9 1-1.2.2-.3.4-.2.7-.1.3.1 1.8.9 2.1 1 .3.2.5.2.6.3.1.2.1.6-.1 1.2Z"
      fill="currentColor"
      stroke="none"
    />,
    props,
  );
}
