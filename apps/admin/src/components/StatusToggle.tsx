"use client";

import { Switch } from "./ui/switch";

export function StatusToggle({
  active,
  onClick,
  disabled,
  onLabel = "Active: click to deactivate",
  offLabel = "Inactive: click to activate",
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** Override for reuse on non-active/inactive toggles (e.g. "Recommendable: click to remove"). */
  onLabel?: string;
  offLabel?: string;
}) {
  return <Switch checked={active} onCheckedChange={() => onClick()} disabled={disabled} aria-label={active ? onLabel : offLabel} />;
}
