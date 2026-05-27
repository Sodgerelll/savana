import { useState } from "react";
import { X } from "lucide-react";
import type { Transfer } from "../../types/crm";
import { MoneyFormat, formatMoney } from "./MoneyFormat";

interface PaymentDialogProps {
  open: boolean;
  customerId: string;
  customerName: string;
  unpaidTransfers: Transfer[];
  onClose: () => void;
  onSubmit: (data: {
    transferId: string | null;
    amount: number;
    method: "CASH" | "BANK_TRANSFER" | "QPAY" | "SOCIALPAY";
    referenceNumber: string;
    notes: string;
  }) => Promise<void>;
  loading?: boolean;
}

const METHODS = [
  { value: "CASH", label: "Бэлэн" },
  { value: "BANK_TRANSFER", label: "Банк шилжүүлэг" },
  { value: "QPAY", label: "QPay" },
  { value: "SOCIALPAY", label: "SocialPay" },
] as const;

export function PaymentDialog({
  open,
  customerName,
  unpaidTransfers,
  onClose,
  onSubmit,
  loading,
}: PaymentDialogProps) {
  const [transferId, setTransferId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "QPAY" | "SOCIALPAY">("CASH");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  const selectedTransfer = unpaidTransfers.find((t) => t.id === transferId);
  const maxAmount = selectedTransfer?.remainingAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    await onSubmit({ transferId, amount: amt, method, referenceNumber, notes });
    setAmount("");
    setReferenceNumber("");
    setNotes("");
    setTransferId(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Төлбөр бүртгэх</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Харилцагч</label>
            <div className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2">{customerName}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Шилжүүлэг</label>
            <select
              value={transferId ?? ""}
              onChange={(e) => {
                setTransferId(e.target.value || null);
                if (e.target.value) {
                  const t = unpaidTransfers.find((x) => x.id === e.target.value);
                  if (t) setAmount(String(t.remainingAmount));
                }
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Ерөнхий төлбөр (balance-аас хасах)</option>
              {unpaidTransfers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.transferNumber} — үлдэгдэл: {formatMoney(t.remainingAmount)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Дүн₮{maxAmount ? ` (max: ${formatMoney(maxAmount)})` : ""}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min={1}
              max={maxAmount}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Төлбөрийн хэлбэр</label>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`py-2 px-3 text-sm rounded-lg border transition-colors ${
                    method === m.value
                      ? "border-green-500 bg-green-50 text-green-700 font-medium"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Лавлах дугаар</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Гүйлгээний дугаар..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Тэмдэглэл</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="..."
            />
          </div>

          {amount && Number(amount) > 0 && (
            <div className="bg-green-50 rounded-xl p-3 text-sm text-green-800">
              Нийт: <MoneyFormat amount={Number(amount)} className="font-semibold" />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Цуцлах
            </button>
            <button
              type="submit"
              disabled={loading || !amount || Number(amount) <= 0}
              className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Хадгалж байна..." : "Бүртгэх"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
