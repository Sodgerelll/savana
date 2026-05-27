/* eslint-disable @typescript-eslint/no-explicit-any */
import { Trash2 } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";

export default function CrmCustomerTransactionsPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    customers,
    customerTransactions,
    customerTransactionsError,
    transactionTypeFilter,
    setTransactionTypeFilter,
    transactionCustomerFilter,
    setTransactionCustomerFilter,
    formatAdminDateTime,
    formatStorePrice,
    openConfirmModal,
    deleteCustomerTransaction,
  } = ctx;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.customersKicker}</p>
          <h1>{copy.transactionsTitle}</h1>
          <p>{copy.transactionsText}</p>
        </div>
      </div>

      {customerTransactionsError && (
        <div className="admin-alert admin-alert-danger">{customerTransactionsError}</div>
      )}

      <div className="admin-summary-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-summary-card">
          <span>{copy.txTodaySales}</span>
          <strong>
            {formatStorePrice(
              customerTransactions
                .filter((tx: any) => {
                  if (!tx.createdAt) return false;
                  const d = new Date(tx.createdAt);
                  const now = new Date();
                  return (
                    d.getFullYear() === now.getFullYear() &&
                    d.getMonth() === now.getMonth() &&
                    d.getDate() === now.getDate() &&
                    tx.type !== "return"
                  );
                })
                .reduce((s: number, tx: any) => s + tx.totals.grandTotal, 0),
            )}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.txMonthSales}</span>
          <strong>
            {formatStorePrice(
              customerTransactions
                .filter((tx: any) => {
                  if (!tx.createdAt) return false;
                  const d = new Date(tx.createdAt);
                  const now = new Date();
                  return (
                    d.getFullYear() === now.getFullYear() &&
                    d.getMonth() === now.getMonth() &&
                    tx.type !== "return"
                  );
                })
                .reduce((s: number, tx: any) => s + tx.totals.grandTotal, 0),
            )}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.txOutstanding}</span>
          <strong>
            {formatStorePrice(customers.reduce((sum: number, c: any) => sum + c.outstandingBalance, 0))}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</span>
          <strong>
            {customerTransactions.reduce((s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + it.quantity, 0), 0)} ш
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Зарсан" : "Sold"}</span>
          <strong>
            {customerTransactions.reduce((s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + it.soldQuantity, 0), 0)} ш
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Үлдэгдэл бараа" : "Remaining"}</span>
          <strong style={{ color: customerTransactions.reduce((s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + (it.quantity - it.soldQuantity), 0), 0) > 0 ? "var(--color-danger, #b14141)" : undefined }}>
            {customerTransactions.reduce((s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + (it.quantity - it.soldQuantity), 0), 0)} ш
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Шинэчлэгдсэн" : "Last updated"}</span>
          <strong>
            {formatAdminDateTime(
              customerTransactions
                .map((tx: any) => tx.updatedAt ?? tx.createdAt)
                .filter(Boolean)
                .sort((a: any, b: any) => (b > a ? 1 : -1))[0] ?? null,
              language,
            )}
          </strong>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <select
              className="admin-search-input"
              value={transactionTypeFilter}
              onChange={(event) => setTransactionTypeFilter(event.target.value as any)}
            >
              <option value="all">{copy.txAllTypes}</option>
              <option value="delivery">{copy.txTypeDelivery}</option>
              <option value="sale">{copy.txTypeSale}</option>
              <option value="return">{copy.txTypeReturn}</option>
            </select>
            <select
              className="admin-search-input"
              value={transactionCustomerFilter}
              onChange={(event) => setTransactionCustomerFilter(event.target.value)}
            >
              <option value="all">{copy.txAllCustomers}</option>
              {customers.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{copy.txDate}</th>
                <th>{copy.txCustomer}</th>
                <th className="admin-th-right">{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</th>
                <th className="admin-th-right">{language === "MN" ? "Зарсан" : "Sold"}</th>
                <th className="admin-th-right">{language === "MN" ? "Үлдэгдэл" : "Remaining"}</th>
                <th className="admin-th-right">{copy.txGrandTotal}</th>
                <th>{copy.txPaymentStatus}</th>
                <th className="admin-th-right">{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const filtered = customerTransactions.filter((tx: any) => {
                  if (transactionTypeFilter !== "all" && tx.type !== transactionTypeFilter) {
                    return false;
                  }
                  if (
                    transactionCustomerFilter !== "all" &&
                    tx.customerId !== transactionCustomerFilter
                  ) {
                    return false;
                  }
                  return true;
                });
                if (filtered.length === 0) {
                  return (
                    <tr>
                      <td colSpan={8} className="admin-table-empty">
                        {copy.txEmpty}
                      </td>
                    </tr>
                  );
                }
                return filtered.map((tx: any) => {
                  const txTransferred = tx.items.reduce((s: number, i: any) => s + i.quantity, 0);
                  const txSold = tx.items.reduce((s: number, i: any) => s + i.soldQuantity, 0);
                  const txRemaining = txTransferred - txSold;
                  return (
                    <tr key={tx.id}>
                      <td>{formatAdminDateTime(tx.transactionDate ?? tx.createdAt, language)}</td>
                      <td>
                        <strong>{tx.customerSnapshot.name}</strong>
                      </td>
                      <td className="admin-td-right">{txTransferred}</td>
                      <td className="admin-td-right">{txSold}</td>
                      <td className="admin-td-right">
                        <strong style={{ color: txRemaining > 0 ? "#b14141" : "#2f7a4a" }}>
                          {txRemaining}
                        </strong>
                      </td>
                      <td className="admin-td-right">{formatStorePrice(tx.totals.grandTotal)}</td>
                      <td>
                        {tx.payment.status === "paid"
                          ? copy.txPaymentPaid
                          : tx.payment.status === "partial"
                            ? copy.txPaymentPartial
                            : copy.txPaymentUnpaid}
                      </td>
                      <td>
                        <div className="admin-table-actions">
                          <button
                            type="button"
                            className="admin-icon-btn"
                            onClick={() =>
                              openConfirmModal({
                                title: copy.confirmDeleteTitle,
                                description: copy.deleteTransactionDescription,
                                confirmLabel: copy.delete,
                                destructive: true,
                                onConfirm: async () => {
                                  await deleteCustomerTransaction(tx);
                                },
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
