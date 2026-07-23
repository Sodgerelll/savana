import { useState } from "react";
import { ChevronUp, Package } from "lucide-react";
import type { Transfer } from "../../types/crm";
import { TransferStatusBadge } from "./TransferStatusBadge";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { StatusTransitionButtons } from "./StatusTransitionButtons";
import { MoneyFormat } from "../shared/MoneyFormat";
import { DateFormat } from "../shared/DateFormat";
import { useTransferMutations } from "../../hooks/useTransferMutations";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { PaymentDialog } from "../shared/PaymentDialog";
import { ReturnDialog } from "../shared/ReturnDialog";
import { toast } from "../shared/Toast";

interface Props {
  transfer: Transfer;
  deliveredTransfers: Transfer[];
  unpaidTransfers: Transfer[];
  onClose: () => void;
}

export function TransferExpandPanel({ transfer, deliveredTransfers, unpaidTransfers, onClose }: Props) {
  const mutations = useTransferMutations();
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string;
    desc: string;
    danger?: boolean;
    fn: () => Promise<void>;
  }>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  async function handleAction(fn: () => Promise<unknown>, successMsg: string) {
    const result = await fn();
    if (result !== null) {
      toast(successMsg, "success");
    } else if (mutations.error) {
      toast(mutations.error, "error");
    }
  }

  return (
    <div className="bg-gray-50 border-t border-gray-100 rounded-b-2xl">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-900">{transfer.transferNumber}</span>
            <TransferStatusBadge status={transfer.status} />
            <PaymentStatusBadge status={transfer.paymentStatus} />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <ChevronUp className="w-5 h-5" />
          </button>
        </div>

        {/* Items Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-500">Бараа</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500">Тоо</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500">Нэгж үнэ</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500">Хөнг.%</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-500">Дүн</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{item.productName}</div>
                    <div className="text-xs text-gray-500">{item.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    <MoneyFormat amount={item.unitPrice} />
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {item.discountPercent > 0 ? `-${item.discountPercent}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    <MoneyFormat amount={item.lineTotal} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Дүн:</span>
              <MoneyFormat amount={transfer.subtotal} />
            </div>
            {transfer.discountAmount > 0 && (
              <div className="flex justify-between text-yellow-600">
                <span>Хөнгөлөлт:</span>
                <MoneyFormat amount={-transfer.discountAmount} />
              </div>
            )}
            {transfer.taxRate > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>НӨАТ ({transfer.taxRate}%):</span>
                <MoneyFormat amount={transfer.taxAmount} />
              </div>
            )}
            <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-100 pt-1.5 mt-1">
              <span>Нийт:</span>
              <MoneyFormat amount={transfer.totalAmount} />
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100 space-y-1.5 text-sm">
            <div className="flex justify-between text-green-600">
              <span>Төлсөн:</span>
              <MoneyFormat amount={transfer.paidAmount} />
            </div>
            <div className="flex justify-between text-red-600">
              <span>Үлдэгдэл:</span>
              <MoneyFormat amount={transfer.remainingAmount} />
            </div>
            <div className="flex justify-between text-gray-600 text-xs border-t border-gray-100 pt-1.5 mt-1">
              <span>Огноо:</span>
              <DateFormat value={transfer.createdAt} showTime />
            </div>
          </div>
        </div>

        {/* Notes */}
        {transfer.notes && (
          <div className="bg-yellow-50 rounded-xl p-3 mb-4 text-sm text-yellow-800">
            <Package className="w-4 h-4 inline mr-1" />
            {transfer.notes}
          </div>
        )}

        {/* Actions */}
        {mutations.error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {mutations.error}
          </div>
        )}

        <StatusTransitionButtons
          status={transfer.status}
          paymentStatus={transfer.paymentStatus}
          loading={mutations.loading}
          onConfirm={() =>
            setConfirmAction({
              title: "Шилжүүлэг батлах уу?",
              desc: "Нөөцөөс бараа хасагдана. Буцааж болохгүй.",
              fn: () =>
                handleAction(
                  () => mutations.confirmTransfer(transfer.id),
                  "Шилжүүлэг батлагдлаа"
                ),
            })
          }
          onShip={() =>
            handleAction(
              () => mutations.shipTransfer(transfer.id),
              "Илгээгдсэн болгов"
            )
          }
          onDeliver={() =>
            handleAction(
              () => mutations.deliverTransfer(transfer.id),
              "Хүргэгдсэн болгов"
            )
          }
          onCancel={() =>
            setConfirmAction({
              title: "Шилжүүлэг цуцлах уу?",
              desc: "Нөөц буцааж нэмэгдэнэ. Баланс өөрчлөгдөнө.",
              danger: true,
              fn: () =>
                handleAction(
                  () => mutations.cancelTransfer(transfer.id),
                  "Цуцлагдлаа"
                ),
            })
          }
          onReturn={() => setShowReturn(true)}
          onPayment={() => setShowPayment(true)}
        />
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title ?? ""}
        description={confirmAction?.desc ?? ""}
        danger={confirmAction?.danger}
        onConfirm={async () => {
          if (confirmAction) await confirmAction.fn();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <PaymentDialog
        open={showPayment}
        customerId={transfer.customerId}
        customerName={transfer.customerName}
        unpaidTransfers={unpaidTransfers}
        onClose={() => setShowPayment(false)}
        loading={mutations.loading}
        onSubmit={async (data) => {
          await handleAction(
            () =>
              mutations.addPayment({
                transferId: data.transferId,
                customerId: transfer.customerId,
                customerName: transfer.customerName,
                amount: data.amount,
                method: data.method,
                referenceNumber: data.referenceNumber,
                notes: data.notes,
              }),
            "Төлбөр бүртгэгдлээ"
          );
          setShowPayment(false);
        }}
      />

      <ReturnDialog
        open={showReturn}
        deliveredTransfers={deliveredTransfers}
        onClose={() => setShowReturn(false)}
        loading={mutations.loading}
        onSubmit={async (origId, items, reason) => {
          await handleAction(
            () => mutations.createReturn(origId, items, reason),
            "Буцаалт бүртгэгдлээ"
          );
          setShowReturn(false);
        }}
      />
    </div>
  );
}
