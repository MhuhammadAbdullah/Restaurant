import {
  FaArrowTrendUp,
  FaBell,
  FaBox,
  FaCheckDouble,
  FaChartColumn,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaCircleCheck,
  FaCircleExclamation,
  FaCircleInfo,
  FaCircleXmark,
  FaClock,
  FaCrown,
  FaFilter,
  FaGlobe,
  FaLocationDot,
  FaMagnifyingGlass,
  FaMinus,
  FaMoneyBillWave,
  FaPenToSquare,
  FaPlus,
  FaStar,
  FaStore,
  FaTrashCan,
  FaTruck,
  FaUsers,
  FaXmark,
} from "react-icons/fa6";
import { GiChefToque } from "react-icons/gi";

type IconProps = { size?: number; className?: string };

// Thin named wrappers over react-icons (Font Awesome / Game Icons) so every existing call site
// (`<EditIcon size={16} />` etc.) keeps working unchanged.

export function EditIcon({ size = 16, className = "" }: IconProps) {
  return <FaPenToSquare size={size} className={className} />;
}

export function SearchIcon({ size = 16, className = "" }: IconProps) {
  return <FaMagnifyingGlass size={size} className={className} />;
}

export function FilterIcon({ size = 16, className = "" }: IconProps) {
  return <FaFilter size={size} className={className} />;
}

export function ChevronDownIcon({ size = 16, className = "" }: IconProps) {
  return <FaChevronDown size={size} className={className} />;
}

export function ChevronLeftIcon({ size = 16, className = "" }: IconProps) {
  return <FaChevronLeft size={size} className={className} />;
}

export function ChevronRightIcon({ size = 16, className = "" }: IconProps) {
  return <FaChevronRight size={size} className={className} />;
}

export function CloseIcon({ size = 16, className = "" }: IconProps) {
  return <FaXmark size={size} className={className} />;
}

export function StoreIcon({ size = 16, className = "" }: IconProps) {
  return <FaStore size={size} className={className} />;
}

export function BanknoteIcon({ size = 16, className = "" }: IconProps) {
  return <FaMoneyBillWave size={size} className={className} />;
}

export function TrendingUpIcon({ size = 16, className = "" }: IconProps) {
  return <FaArrowTrendUp size={size} className={className} />;
}

export function BarChartIcon({ size = 16, className = "" }: IconProps) {
  return <FaChartColumn size={size} className={className} />;
}

export function UsersIcon({ size = 16, className = "" }: IconProps) {
  return <FaUsers size={size} className={className} />;
}

export function PackageIcon({ size = 16, className = "" }: IconProps) {
  return <FaBox size={size} className={className} />;
}

export function AlertCircleIcon({ size = 16, className = "" }: IconProps) {
  return <FaCircleExclamation size={size} className={className} />;
}

export function InfoCircleIcon({ size = 16, className = "" }: IconProps) {
  return <FaCircleInfo size={size} className={className} />;
}

export function StarIcon({ size = 16, className = "" }: IconProps) {
  return <FaStar size={size} className={className} />;
}

export function ClockIcon({ size = 16, className = "" }: IconProps) {
  return <FaClock size={size} className={className} />;
}

export function CheckCircleIcon({ size = 16, className = "" }: IconProps) {
  return <FaCircleCheck size={size} className={className} />;
}

export function ChefHatIcon({ size = 16, className = "" }: IconProps) {
  return <GiChefToque size={size} className={className} />;
}

export function BellIcon({ size = 16, className = "" }: IconProps) {
  return <FaBell size={size} className={className} />;
}

export function TruckIcon({ size = 16, className = "" }: IconProps) {
  return <FaTruck size={size} className={className} />;
}

export function CheckCheckIcon({ size = 16, className = "" }: IconProps) {
  return <FaCheckDouble size={size} className={className} />;
}

export function XCircleIcon({ size = 16, className = "" }: IconProps) {
  return <FaCircleXmark size={size} className={className} />;
}

export function GlobeIcon({ size = 16, className = "" }: IconProps) {
  return <FaGlobe size={size} className={className} />;
}

export function CrownIcon({ size = 16, className = "" }: IconProps) {
  return <FaCrown size={size} className={className} />;
}

export function PinIcon({ size = 16, className = "" }: IconProps) {
  return <FaLocationDot size={size} className={className} />;
}

export function TrashIcon({ size = 16, className = "" }: IconProps) {
  return <FaTrashCan size={size} className={className} />;
}

export function PlusIcon({ size = 16, className = "" }: IconProps) {
  return <FaPlus size={size} className={className} />;
}

export function MinusIcon({ size = 16, className = "" }: IconProps) {
  return <FaMinus size={size} className={className} />;
}
