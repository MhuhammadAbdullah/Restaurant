type IconProps = { size?: number; className?: string };

export function CashIcon({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="1.5" y="5.5" width="21" height="13" rx="1.5" fill="#7ED957" stroke="#111" strokeWidth="1.2" />
      <line x1="1.5" y1="8" x2="22.5" y2="8" stroke="#111" strokeWidth="1" />
      <circle cx="12" cy="12" r="3.1" fill="#F2F2F2" stroke="#111" strokeWidth="1.2" />
      <circle cx="5.3" cy="12" r="1.3" fill="#F2F2F2" stroke="#111" strokeWidth="1" />
      <circle cx="18.7" cy="12" r="1.3" fill="#F2F2F2" stroke="#111" strokeWidth="1" />
    </svg>
  );
}

export function CardIcon({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="1.5" y="4.5" width="21" height="15" rx="2" fill="#fff" stroke="#111" strokeWidth="1.2" />
      <rect x="1.5" y="7.8" width="21" height="2.6" fill="#111" />
      <rect x="4" y="13.5" width="5" height="3.4" rx="0.7" fill="#FBBF24" stroke="#111" strokeWidth="0.8" />
      <line x1="14" y1="15.2" x2="19.5" y2="15.2" stroke="#111" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function QrIcon({ size = 24, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="1.5" y="1.5" width="8" height="8" rx="1" fill="none" stroke="#111" strokeWidth="1.3" />
      <rect x="4" y="4" width="3" height="3" fill="#111" />
      <rect x="14.5" y="1.5" width="8" height="8" rx="1" fill="none" stroke="#111" strokeWidth="1.3" />
      <rect x="17" y="4" width="3" height="3" fill="#111" />
      <rect x="1.5" y="14.5" width="8" height="8" rx="1" fill="none" stroke="#111" strokeWidth="1.3" />
      <rect x="4" y="17" width="3" height="3" fill="#111" />
      <rect x="14.5" y="14.5" width="3.2" height="3.2" fill="#111" />
      <rect x="19.3" y="14.5" width="3.2" height="3.2" fill="#111" />
      <rect x="14.5" y="19.3" width="3.2" height="3.2" fill="#111" />
      <rect x="19.3" y="19.3" width="3.2" height="3.2" fill="#111" />
    </svg>
  );
}
