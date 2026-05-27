import type { PaymentStatus } from "../../types/crm";

const CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  UNPAID: { label: "Төлөгдөөгүй", className: "bg-red-100 text-red-700" },
  PARTIAL: { label: "Хэсэгчлэн", className: "bg-yellow-100 text-yellow-700" },
  PAID: { label: "Төлөгдсөн", className: "bg-green-100 text-green-700" },
  CREDIT: { label: "Зээл", className: "bg-purple-100 text-purple-700" },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const config = CONFIG[status] ?? CONFIG.UNPAID;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
