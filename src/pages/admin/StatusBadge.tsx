import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { EntityStatus } from "../../data/products";

export function StatusBadge({
  status,
  activeLabel,
  inactiveLabel,
}: {
  status: EntityStatus;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span className={`admin-status-badge ${status === "active" ? "active" : "inactive"}`}>
      {status === "active" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
      {status === "active" ? activeLabel : inactiveLabel}
    </span>
  );
}
