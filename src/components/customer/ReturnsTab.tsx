import { useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import type { Transfer } from "../../types/crm";
import { useTransferMutations } from "../../hooks/useTransferMutations";
import { ReturnDialog } from "../shared/ReturnDialog";
import { MoneyFormat } from "../shared/MoneyFormat";
import { DateFormat } from "../shared/DateFormat";
import { toast } from "../shared/Toast";
import type { ReturnItem } from "../../services/transferService";

interface Props {
  transfers: Transfer[];
}

export function ReturnsTab({ transfers }: Props) {
  const mutations = useTransferMutations();
  const [showDialog, setShowDialog] = useState(false);

  const returnTransfers = transfers.filter((t) => t.type === "RETURN");
  const deliveredTransfers = transfers.filter((t) => t.status === "DELIVERED");

  async function handleReturn(
    originalTransferId: string,
    returnItems: ReturnItem[],
    reason: string
  ) {
    const result = await mutations.createReturn(originalTransferId, returnItems, reason);
    if (result !== null) {
      toast("Буцаалт бүртгэгдлээ", "success");
      setShowDialog(false);
    } else if (mutations.error) {
      toast(mutations.error, "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">Буцаалтын бүртгэл</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Нийт {returnTransfers.length} буцаалт
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDialog(true)}
          disabled={deliveredTransfers.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Буцаалт бүртгэх
        </button>
      </div>

      {returnTransfers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <RotateCcw className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Буцаалт байхгүй
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Огноо</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Дугаар</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Эх шилжүүлэг</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Бараа</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Шалтгаан</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Дүн</th>
              </tr>
            </thead>
            <tbody>
              {returnTransfers.map((t) => {
                const parent = transfers.find((x) => x.id === t.parentTransferId);
                return (
                  <tr key={t.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 text-gray-600">
                      <DateFormat value={t.createdAt} />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{t.transferNumber}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {parent ? (
                        <span className="bg-gray-100 px-2 py-0.5 rounded">{parent.transferNumber}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {t.items.reduce((s, i) => s + i.quantity, 0)} ш
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{t.notes || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      <MoneyFormat amount={t.totalAmount} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={5} className="px-4 py-3 text-right text-sm text-gray-600 font-medium">
                  Нийт буцаалт:
                </td>
                <td className="px-4 py-3 text-right font-bold text-red-700">
                  <MoneyFormat
                    amount={returnTransfers.reduce((s, t) => s + t.totalAmount, 0)}
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ReturnDialog
        open={showDialog}
        deliveredTransfers={deliveredTransfers}
        onClose={() => setShowDialog(false)}
        loading={mutations.loading}
        onSubmit={handleReturn}
      />
    </div>
  );
}
