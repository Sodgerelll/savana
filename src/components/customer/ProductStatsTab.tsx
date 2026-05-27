import { useState } from "react";
import { ChevronRight, ChevronDown, Package, ArrowLeftRight } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Transfer } from "../../types/crm";
import { useCustomerProductStats } from "../../hooks/useCustomerProductStats";
import { MoneyFormat } from "../shared/MoneyFormat";
import { DateFormat } from "../shared/DateFormat";
import { TransferStatusBadge } from "../transfer/TransferStatusBadge";
import { PaymentStatusBadge } from "../transfer/PaymentStatusBadge";

interface Props {
  customerId: string;
  transfers: Transfer[];
}

type SubTab = "products" | "history";

const TYPE_LABELS: Record<string, string> = {
  SALE: "Борлуулалт",
  RETURN: "Буцаалт",
  SAMPLE: "Дээж",
  CONSIGNMENT: "Комисс",
};

export function ProductStatsTab({ customerId, transfers }: Props) {
  const { stats, loading } = useCustomerProductStats(customerId);
  const [activeTab, setActiveTab] = useState<SubTab>("products");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  function getMonthlyData(productId: string) {
    const months: Record<string, number> = {};
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    transfers
      .filter((t) => t.status !== "CANCELLED" && t.type !== "RETURN")
      .forEach((t) => {
        if (!t.createdAt) return;
        const d = t.createdAt.toDate?.() ?? new Date();
        if (d < sixMonthsAgo) return;
        const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
        const item = t.items.find((i) => i.productId === productId);
        if (item) months[key] = (months[key] ?? 0) + item.quantity;
      });

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, qty]) => ({ month, qty }));
  }

  const activeTransfers = transfers.filter((t) => t.status !== "CANCELLED");

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("products")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "products"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Package className="w-4 h-4" />
          Бүтээгдэхүүний нийт шилжүүлэг
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "history"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Гүйлгээний түүх
          {activeTransfers.length > 0 && (
            <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
              {activeTransfers.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Product stats */}
      {activeTab === "products" && (
        <>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : stats.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              Авсан бараа байхгүй
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Бараа</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Нийт авсан</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Буцаасан</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Цэвэр</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Сүүлд авсан</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Нийт дүн</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <>
                      <tr
                        key={s.productId}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() =>
                          setExpandedProductId(
                            expandedProductId === s.productId ? null : s.productId
                          )
                        }
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{s.productName}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{s.totalQuantity}</td>
                        <td className="px-4 py-3 text-right text-red-600">
                          {s.returnedQuantity > 0 ? `-${s.returnedQuantity}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {s.netQuantity}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          <DateFormat value={s.lastOrderDate} />
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          <MoneyFormat amount={s.totalSpent} />
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {expandedProductId === s.productId ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>
                      </tr>
                      {expandedProductId === s.productId && (
                        <tr key={`${s.productId}-expand`}>
                          <td
                            colSpan={7}
                            className="px-4 py-4 bg-gray-50 border-b border-gray-100"
                          >
                            <div className="space-y-3">
                              <div className="text-xs font-medium text-gray-500">
                                Сүүлийн 6 сарын хандлага
                              </div>
                              <div className="h-40">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={getMonthlyData(s.productId)}>
                                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar
                                      dataKey="qty"
                                      fill="#22c55e"
                                      radius={[4, 4, 0, 0]}
                                      name="Тоо"
                                    />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                              <div>
                                <div className="text-xs font-medium text-gray-500 mb-2">
                                  Шилжүүлгийн түүх
                                </div>
                                <div className="space-y-1 max-h-48 overflow-y-auto">
                                  {transfers
                                    .filter(
                                      (t) =>
                                        t.status !== "CANCELLED" &&
                                        t.items.some((i) => i.productId === s.productId)
                                    )
                                    .map((t) => {
                                      const item = t.items.find(
                                        (i) => i.productId === s.productId
                                      )!;
                                      return (
                                        <div
                                          key={t.id}
                                          className="flex items-center justify-between px-3 py-2 bg-white rounded-lg text-sm"
                                        >
                                          <span className="text-gray-500">
                                            {t.transferNumber}
                                          </span>
                                          <DateFormat value={t.createdAt} className="text-gray-400" />
                                          <span className="font-medium text-gray-900">
                                            {item.quantity}
                                            {t.type === "RETURN" ? " (буцаалт)" : ""}
                                          </span>
                                          <MoneyFormat
                                            amount={item.lineTotal}
                                            className="text-gray-600"
                                          />
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Tab 2: Transaction history */}
      {activeTab === "history" && (
        <>
          {activeTransfers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-30" />
              Гүйлгээ байхгүй
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Дугаар</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Огноо</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Төрөл</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Статус</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">Төлбөр</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Бараа</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Нийт дүн</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">Үлдэгдэл</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTransfers.map((t) => (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{t.transferNumber}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <DateFormat value={t.createdAt} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {TYPE_LABELS[t.type] ?? t.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <TransferStatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={t.paymentStatus} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {t.items.reduce((s, i) => s + i.quantity, 0)} ш
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        <MoneyFormat amount={t.totalAmount} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.remainingAmount > 0 ? (
                          <MoneyFormat
                            amount={t.remainingAmount}
                            className="text-red-500 font-medium"
                          />
                        ) : (
                          <span className="text-green-600 text-xs font-medium">Төлөгдсөн</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t border-gray-200">
                    <td colSpan={6} className="px-4 py-3 text-sm text-gray-600 font-medium text-right">
                      Нийт:
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">
                      <MoneyFormat
                        amount={activeTransfers.reduce((s, t) => s + t.totalAmount, 0)}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      <MoneyFormat
                        amount={activeTransfers.reduce((s, t) => s + t.remainingAmount, 0)}
                      />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
