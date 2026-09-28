import { CheckCircle, Truck, PackageCheck, XCircle, RotateCcw, Banknote } from "lucide-react";
import type { TransferStatus, TransferType } from "../../types/crm";

interface Props {
  status: TransferStatus;
  paymentStatus: string;
  /** A return record takes neither payments nor returns — only a refund payout. */
  transferType?: TransferType;
  /** What a return still owes the customer back. */
  refundDue?: number;
  onRefund?: () => void;
  onConfirm: () => void;
  onShip: () => void;
  onDeliver: () => void;
  onCancel: () => void;
  onReturn: () => void;
  onPayment: () => void;
  loading?: boolean;
}

export function StatusTransitionButtons({
  status,
  paymentStatus,
  transferType,
  refundDue = 0,
  onRefund,
  onConfirm,
  onShip,
  onDeliver,
  onCancel,
  onReturn,
  onPayment,
  loading,
}: Props) {
  const btn = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    variant: "green" | "blue" | "yellow" | "red" | "gray" | "purple"
  ) => {
    const colors = {
      green: "bg-green-600 hover:bg-green-700 text-white",
      blue: "bg-blue-600 hover:bg-blue-700 text-white",
      yellow: "bg-yellow-500 hover:bg-yellow-600 text-white",
      red: "bg-red-600 hover:bg-red-700 text-white",
      gray: "bg-gray-100 hover:bg-gray-200 text-gray-700",
      purple: "bg-purple-600 hover:bg-purple-700 text-white",
    };
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${colors[variant]}`}
      >
        {icon}
        {label}
      </button>
    );
  };

  if (transferType === "RETURN") {
    return (
      <div className="flex flex-wrap gap-2">
        {refundDue > 0 && onRefund &&
          btn(<Banknote className="w-4 h-4" />, "Мөнгө буцаан олгох", onRefund, "purple")}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" && (
        <>
          {btn(<CheckCircle className="w-4 h-4" />, "Батлах", onConfirm, "green")}
          {btn(<XCircle className="w-4 h-4" />, "Устгах", onCancel, "red")}
        </>
      )}
      {status === "CONFIRMED" && (
        <>
          {btn(<Truck className="w-4 h-4" />, "Илгээсэн", onShip, "blue")}
          {paymentStatus !== "PAID" &&
            btn(<CheckCircle className="w-4 h-4" />, "Төлбөр", onPayment, "green")}
          {btn(<XCircle className="w-4 h-4" />, "Цуцлах", onCancel, "red")}
        </>
      )}
      {status === "SHIPPED" && (
        <>
          {btn(<PackageCheck className="w-4 h-4" />, "Хүргэгдсэн", onDeliver, "green")}
          {paymentStatus !== "PAID" &&
            btn(<CheckCircle className="w-4 h-4" />, "Төлбөр", onPayment, "purple")}
          {btn(<XCircle className="w-4 h-4" />, "Цуцлах", onCancel, "red")}
        </>
      )}
      {status === "DELIVERED" && (
        <>
          {paymentStatus !== "PAID" &&
            btn(<CheckCircle className="w-4 h-4" />, "Төлбөр", onPayment, "green")}
          {btn(<RotateCcw className="w-4 h-4" />, "Буцаалт", onReturn, "gray")}
        </>
      )}
    </div>
  );
}
