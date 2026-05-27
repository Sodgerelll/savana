import { useState } from "react";
import { Plus, AlertTriangle, CreditCard } from "lucide-react";
import type { Customer, Transfer } from "../../types/crm";
import { useCustomerPayments } from "../../hooks/useCustomerPayments";
import { useTransferMutations } from "../../hooks/useTransferMutations";
import { PaymentDialog } from "../shared/PaymentDialog";
import { MoneyFormat } from "../shared/MoneyFormat";
import { DateFormat } from "../shared/DateFormat";
import { toast } from "../shared/Toast";

interface Props {
  customer: Customer;
  transfers: Transfer[];
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "Бэлэн",
  BANK_TRANSFER: "Банк",
  QPAY: "QPay",
  SOCIALPAY: "SocialPay",
};

export function PaymentTab({ customer, transfers }: Props) {
  const { payments, loading, hasMore, loadMore } = useCustomerPayments(customer.id);
  const mutations = useTransferMutations();
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const unpaidTransfers = transfers.filter((t) =>
    ["UNPAID", "PARTIAL", "CREDIT"].includes(t.paymentStatus)
  );

  const creditUsage =
    customer.creditLimit > 0
      ? Math.min(100, Math.round((customer.balance / customer.creditLimit) * 100))
      : 0;

  const isWarning = customer.creditLimit > 0 && customer.balance > customer.creditLimit * 0.8;
  const isDanger = customer.creditLimit > 0 && customer.balance > customer.creditLimit;

  return (
    <div className="space-y-6">
      {/* Balance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          className={`rounded-2xl p-5 ${
            isDanger ? "bg-red-50 border border-red-200" : "bg-white border border-gray-200"
          }`}
        >
          <div className="text-sm text-gray-500 mb-1">Өрийн үлдэгдэл</div>
          <MoneyFormat
            amount={customer.balance}
            className={`text-3xl font-bold ${
              customer.balance > 0
                ? isDanger
                  ? "text-red-600"
                  : "text-gray-900"
                : "text-green-600"
            }`}
          />
        </div>

        <div className="rounded-2xl p-5 bg-white border border-gray-200">
          <div className="text-sm text-gray-500 mb-1">Зээлийн лимит</div>
          <MoneyFormat amount={customer.creditLimit} className="text-2xl font-bold text-gray-900" />
          {customer.creditLimit > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Ашиглалт</span>
                <span>{creditUsage}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    isDanger ? "bg-red-500" : isWarning ? "bg-yellow-500" : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(100, creditUsage)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl p-5 bg-white border border-gray-200">
          <div className="text-sm text-gray-500 mb-1">Нийт борлуулалт</div>
          <MoneyFormat
            amount={customer.totalRevenue}
            className="text-2xl font-bold text-gray-900"
          />
          <div className="text-sm text-gray-500 mt-1">
            {customer.totalOrders} захиалга
          </div>
        </div>
      </div>

      {/* Alerts */}
      {isDanger && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Зээлийн лимит хэтэрлээ! Зээл олгохоос татгалзна уу.
        </div>
      )}
      {isWarning && !isDanger && (
        <div className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Зээлийн лимитийн 80%-д хүрлээ. Анхааралтай байна уу.
        </div>
      )}

      {/* Add Payment Button */}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Төлбөрийн түүх</h3>
        <button
          type="button"
          onClick={() => setShowPaymentDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Төлбөр бүртгэх
        </button>
      </div>

      {/* Payment History */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
          Төлбөрийн бүртгэл байхгүй
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Огноо</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Шилжүүлэг</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Хэлбэр</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Лавлах</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Дүн</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    <DateFormat value={p.paidAt} showTime />
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {p.transferId ? (
                      <span className="bg-gray-100 px-2 py-0.5 rounded">
                        {transfers.find((t) => t.id === p.transferId)?.transferNumber ?? "—"}
                      </span>
                    ) : (
                      <span className="text-gray-400">Ерөнхий</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {METHOD_LABELS[p.method] ?? p.method}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.referenceNumber || "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">
                    <MoneyFormat amount={p.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex justify-center py-3 border-t border-gray-100">
              <button
                onClick={loadMore}
                className="px-5 py-2 text-sm font-medium text-green-700 hover:bg-green-50 rounded-xl transition-colors"
              >
                Дэлгэрэнгүй үзэх
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unpaid Transfers */}
      {unpaidTransfers.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Төлөгдөөгүй шилжүүлгүүд</h3>
          <div className="space-y-2">
            {unpaidTransfers.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-4 py-3 bg-red-50 border border-red-100 rounded-xl"
              >
                <div>
                  <div className="text-sm font-medium text-gray-900">{t.transferNumber}</div>
                  <div className="text-xs text-gray-500">
                    Нийт: <MoneyFormat amount={t.totalAmount} /> · Үлдэгдэл:{" "}
                    <MoneyFormat amount={t.remainingAmount} className="text-red-600 font-medium" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentDialog(true)}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  Төлбөр
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <PaymentDialog
        open={showPaymentDialog}
        customerId={customer.id}
        customerName={customer.name}
        unpaidTransfers={unpaidTransfers}
        onClose={() => setShowPaymentDialog(false)}
        loading={mutations.loading}
        onSubmit={async (data) => {
          const result = await mutations.addPayment({
            transferId: data.transferId,
            customerId: customer.id,
            customerName: customer.name,
            amount: data.amount,
            method: data.method,
            referenceNumber: data.referenceNumber,
            notes: data.notes,
          });
          if (result !== null) {
            toast("Төлбөр бүртгэгдлээ", "success");
            setShowPaymentDialog(false);
          } else if (mutations.error) {
            toast(mutations.error, "error");
          }
        }}
      />
    </div>
  );
}
