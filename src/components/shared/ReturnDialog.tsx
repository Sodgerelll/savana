import { useState } from "react";
import { X } from "lucide-react";
import type { Transfer } from "../../types/crm";
import { formatMoney } from "./MoneyFormat";
import type { ReturnItem } from "../../services/transferService";

interface ReturnDialogProps {
  open: boolean;
  deliveredTransfers: Transfer[];
  onClose: () => void;
  onSubmit: (
    originalTransferId: string,
    returnItems: ReturnItem[],
    reason: string
  ) => Promise<void>;
  loading?: boolean;
}

export function ReturnDialog({
  open,
  deliveredTransfers,
  onClose,
  onSubmit,
  loading,
}: ReturnDialogProps) {
  const [selectedTransferId, setSelectedTransferId] = useState("");
  const [selectedItems, setSelectedItems] = useState<
    Record<string, { checked: boolean; quantity: number }>
  >({});
  const [reason, setReason] = useState("");

  if (!open) return null;

  const selectedTransfer = deliveredTransfers.find((t) => t.id === selectedTransferId);

  function handleTransferChange(id: string) {
    setSelectedTransferId(id);
    const t = deliveredTransfers.find((x) => x.id === id);
    if (t) {
      const initial: Record<string, { checked: boolean; quantity: number }> = {};
      t.items.forEach((item) => {
        initial[item.productId] = { checked: false, quantity: item.quantity };
      });
      setSelectedItems(initial);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTransfer) return;

    const returnItems: ReturnItem[] = selectedTransfer.items
      .filter((item) => selectedItems[item.productId]?.checked)
      .map((item) => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity: selectedItems[item.productId]?.quantity ?? item.quantity,
        unitPrice: item.unitPrice,
      }));

    if (returnItems.length === 0) return;

    await onSubmit(selectedTransferId, returnItems, reason);
    setSelectedTransferId("");
    setSelectedItems({});
    setReason("");
    onClose();
  }

  const returnTotal = selectedTransfer
    ? selectedTransfer.items
        .filter((item) => selectedItems[item.productId]?.checked)
        .reduce(
          (s, item) =>
            s + (selectedItems[item.productId]?.quantity ?? 0) * item.unitPrice,
          0
        )
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Буцаалт бүртгэх</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Шилжүүлэг сонгох
            </label>
            <select
              value={selectedTransferId}
              onChange={(e) => handleTransferChange(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Сонгох...</option>
              {deliveredTransfers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.transferNumber} — {formatMoney(t.totalAmount)}
                </option>
              ))}
            </select>
          </div>

          {selectedTransfer && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Буцаах бараа
              </label>
              <div className="space-y-2 border border-gray-100 rounded-xl overflow-hidden">
                {selectedTransfer.items.map((item) => {
                  const itemState = selectedItems[item.productId];
                  return (
                    <div
                      key={item.productId}
                      className="flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={itemState?.checked ?? false}
                        onChange={(e) =>
                          setSelectedItems((prev) => ({
                            ...prev,
                            [item.productId]: {
                              ...(prev[item.productId] ?? { quantity: item.quantity }),
                              checked: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 text-green-600 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{item.productName}</div>
                        <div className="text-xs text-gray-500">{formatMoney(item.unitPrice)}</div>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={item.quantity}
                        value={itemState?.quantity ?? item.quantity}
                        disabled={!itemState?.checked}
                        onChange={(e) =>
                          setSelectedItems((prev) => ({
                            ...prev,
                            [item.productId]: {
                              ...(prev[item.productId] ?? { checked: false }),
                              quantity: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-center disabled:opacity-40"
                      />
                      <span className="text-xs text-gray-500">/ {item.quantity}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Буцаах шалтгаан</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Буцаах шалтгааныг тайлбарлана уу..."
            />
          </div>

          {returnTotal > 0 && (
            <div className="bg-red-50 rounded-xl p-3 text-sm text-red-800">
              Буцаалтын дүн: <span className="font-semibold">{formatMoney(returnTotal)}</span>
            </div>
          )}
        </form>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Цуцлах
          </button>
          <button
            form="return-form"
            type="submit"
            disabled={loading || !selectedTransferId || returnTotal <= 0 || !reason}
            onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Хадгалж байна..." : "Буцаалт бүртгэх"}
          </button>
        </div>
      </div>
    </div>
  );
}
