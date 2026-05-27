import type { TransferStatus } from "../../types/crm";

const STATUS_CONFIG: Record<TransferStatus, { label: string; className: string }> = {
  DRAFT: { label: "Ноорог", className: "bg-gray-100 text-gray-700" },
  CONFIRMED: { label: "Батлагдсан", className: "bg-blue-100 text-blue-700" },
  SHIPPED: { label: "Илгээгдсэн", className: "bg-yellow-100 text-yellow-700" },
  DELIVERED: { label: "Хүргэгдсэн", className: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Цуцлагдсан", className: "bg-red-100 text-red-700" },
};

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
