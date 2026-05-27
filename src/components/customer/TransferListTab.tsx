import { useState } from "react";
import { ChevronDown, ChevronRight, Calendar, TrendingUp } from "lucide-react";
import type { Transfer } from "../../types/crm";
import { TransferStatusBadge } from "../transfer/TransferStatusBadge";
import { PaymentStatusBadge } from "../transfer/PaymentStatusBadge";
import { TransferExpandPanel } from "../transfer/TransferExpandPanel";
import { MoneyFormat } from "../shared/MoneyFormat";
import { DateFormat } from "../shared/DateFormat";
import { useCustomerProductStats } from "../../hooks/useCustomerProductStats";
import { formatDate } from "../shared/DateFormat";

interface Props {
  customerId: string;
  transfers: Transfer[];
  loading: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const STATUS_OPTIONS = [
  { value: "", label: "Бүгд" },
  { value: "DRAFT", label: "Ноорог" },
  { value: "CONFIRMED", label: "Батлагдсан" },
  { value: "SHIPPED", label: "Илгээгдсэн" },
  { value: "DELIVERED", label: "Хүргэгдсэн" },
  { value: "CANCELLED", label: "Цуцлагдсан" },
];

export function TransferListTab({ customerId, transfers, loading, hasMore, onLoadMore }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const { stats: productStats } = useCustomerProductStats(customerId);

  const filtered = transfers.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  const deliveredTransfers = transfers.filter((t) => t.status === "DELIVERED");
  const unpaidTransfers = transfers.filter((t) =>
    ["UNPAID", "PARTIAL", "CREDIT"].includes(t.paymentStatus)
  );

  const overdueStats = productStats.filter((s) => s.isOverdue);

  return (
    <div className="space-y-6">
      {/* Overdue predictions */}
      {overdueStats.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-3">
            <TrendingUp className="w-4 h-4" />
            Дахин захиалгын анхааруулга ({overdueStats.length} бараа)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {overdueStats.map((s) => (
              <div key={s.productId} className="bg-white rounded-xl p-3 text-xs">
                <div className="font-medium text-gray-900 truncate">{s.productName}</div>
                <div className="text-red-600 mt-0.5">
                  Таамаглал: {s.nextPredictedDate ? formatDate(s.nextPredictedDate) : "—"}
                </div>
                <div className="text-gray-500">Дундаж: {s.averageIntervalDays} хоног</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              statusFilter === opt.value
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-500">{filtered.length} шилжүүлэг</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Шилжүүлэг олдсонгүй
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          {filtered.map((transfer) => (
            <div key={transfer.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === transfer.id ? null : transfer.id)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 text-sm">
                      {transfer.transferNumber}
                    </span>
                    <TransferStatusBadge status={transfer.status} />
                    <PaymentStatusBadge status={transfer.paymentStatus} />
                    {transfer.type !== "SALE" && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {transfer.type === "RETURN" ? "Буцаалт" : transfer.type === "SAMPLE" ? "Дээж" : "Комисс"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <DateFormat value={transfer.createdAt} />
                    <span>·</span>
                    <span>{transfer.items.length} бараа</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <MoneyFormat
                    amount={transfer.totalAmount}
                    className="font-semibold text-gray-900 text-sm"
                  />
                  {transfer.remainingAmount > 0 && (
                    <div className="text-xs text-red-500 mt-0.5">
                      Үлдэгдэл: <MoneyFormat amount={transfer.remainingAmount} />
                    </div>
                  )}
                </div>
                <div className="text-gray-400 shrink-0">
                  {expandedId === transfer.id ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
              </button>
              {expandedId === transfer.id && (
                <TransferExpandPanel
                  transfer={transfer}
                  deliveredTransfers={deliveredTransfers}
                  unpaidTransfers={unpaidTransfers}
                  onClose={() => setExpandedId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reorder prediction table */}
      {productStats.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Дахин захиалгын таамаглал
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500">Бараа</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500">Авсан удаа</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500">Дундаж тоо</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500">Дундаж хугацаа</th>
                  <th className="text-center px-4 py-2.5 font-medium text-gray-500">Дараагийн таамаглал</th>
                </tr>
              </thead>
              <tbody>
                {productStats.map((s) => (
                  <tr
                    key={s.productId}
                    className={`border-b border-gray-50 last:border-0 ${s.isOverdue ? "bg-red-50" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{s.productName}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{s.orderCount}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{s.averageQuantity}</td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {s.averageIntervalDays > 0 ? `${s.averageIntervalDays} хоног` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.nextPredictedDate ? (
                        <span className={s.isOverdue ? "text-red-600 font-medium" : "text-gray-700"}>
                          {formatDate(s.nextPredictedDate)}
                          {s.isOverdue && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <button
                onClick={onLoadMore}
                className="px-5 py-2 text-sm font-medium text-green-700 border border-green-200 rounded-xl hover:bg-green-50 transition-colors"
              >
                Дэлгэрэнгүй үзэх
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
