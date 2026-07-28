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
  const hideLabel = iconOnly || status === "active";
  return (
    <span
      className={`admin-status-badge ${status === "active" ? "active" : "inactive"}`}
      title={hideLabel ? label : undefined}
      aria-label={hideLabel ? label : undefined}
    >
      {status === "active" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {!hideLabel && label}
    </span>
  );
}
