import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { EntityStatus } from "../../data/products";

export function StatusBadge({
  status,
  activeLabel,
  inactiveLabel,
  iconOnly = false,
}: {
  status: EntityStatus;
  activeLabel: string;
  inactiveLabel: string;
  iconOnly?: boolean;
}) {
  const label = status === "active" ? activeLabel : inactiveLabel;
  return (
    <span
      className={`admin-status-badge ${status === "active" ? "active" : "inactive"}`}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
    >
      {status === "active" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {!iconOnly && label}
    </span>
  );
}
