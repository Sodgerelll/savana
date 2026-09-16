/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeftRight, Banknote, ChevronDown, ChevronUp, Download, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import React from "react";
import { StatusBadge } from "./StatusBadge";
import type { AdminCtx } from "./adminShellTypes";
import { getProductCode, getProductLabel } from "./adminHelpers";
import { downloadSellerProductReport } from "../../lib/customerProductReport";

export default function CrmCustomersPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    customers,
    customersError,
    customerSearch,
    setCustomerSearch,
    customerTypeFilter,
    setCustomerTypeFilter,
    customerViewMode,
    setCustomerViewMode,
    customerTransactions,
    expandedCustomerId,
    setExpandedCustomerId,
    expandedCustomerTab,
    setExpandedCustomerTab,
    expandedTxGrids,
    setExpandedTxGrids,
    user,
    formatAdminDateTime,
    formatStorePrice,
    setTransactionError,
    setTransactionModal,
    setTxPaymentError,
    setTxPaymentModal,
    deleteCustomerTransactionPaymentEntry,
    setCustomerError,
    setCustomerModal,
    openConfirmModal,
    deleteCustomer,
    deleteCustomerTransaction,
    getNextCustomerCode,
    createEmptyCustomerDraft,
    createEmptyTransactionDraft,
    openSellerSaleModal,
    openSellerTxEditModal,
    clearTransactionSoldQuantities,
  } = ctx;

  // Units moved by the two kinds of record: a delivery hands goods to the seller; a sale
  // (wholesale allowance) records some of them as sold. `soldQuantity` on a delivery is the
  // legacy manual tracker; a sale record's `quantity` is fully-sold by construction.
  const sumItems = (txs: any[], pick: (it: any) => number) =>
    txs.reduce((s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + pick(it), 0), 0);
  // Every item grid (a transaction's own line items) lists products by code (#001, #002, ...)
  // — the same order the Бүтээгдэхүүнээр table and the seller sale/return popup use.
  const sortItemsByCode = (items: any[]) =>
    items.slice().sort((a, b) => getProductCode(a.productId).localeCompare(getProductCode(b.productId)));
  const deliveryTxs = customerTransactions.filter((tx: any) => tx.type === "delivery");
  const saleTxs = customerTransactions.filter((tx: any) => tx.type === "sale");
  const transferredUnitsAll = sumItems(deliveryTxs, (it) => it.quantity);
  const soldUnitsAll = sumItems(deliveryTxs, (it) => it.soldQuantity) + sumItems(saleTxs, (it) => it.quantity);
  const remainingUnitsAll = transferredUnitsAll - soldUnitsAll;

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{copy.customersKicker}</p>
          <h1>{copy.customersTitle}</h1>
          <p>{copy.customersText}</p>
        </div>
        <div className="admin-topbar-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setTransactionError(null);
              setTransactionModal({ mode: "create", draft: createEmptyTransactionDraft() });
            }}
          >
            <Plus size={16} /> {copy.newTransaction}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const draft = createEmptyCustomerDraft();
              try {
                draft.code = await getNextCustomerCode();
              } catch {
                draft.code = "CUS-0001";
              }
              setCustomerError(null);
              setCustomerModal({ mode: "create", draft });
            }}
          >
            <Plus size={16} /> {copy.newCustomer}
          </button>
        </div>
      </div>

      {customersError && <div className="admin-alert admin-alert-danger">{customersError}</div>}

      <div className="admin-summary-grid admin-summary-grid-sm admin-summary-grid-3" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-summary-card">
          <span>{copy.customerTotalSales}</span>
          <strong>
            {formatStorePrice(customers.reduce((sum: number, c: any) => sum + c.totalSales, 0))}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.customerTotalPaid}</span>
          <strong>
            {formatStorePrice(customers.reduce((sum: number, c: any) => sum + c.totalPaid, 0))}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.totalOutstanding}</span>
          <strong style={{ color: customers.reduce((sum: number, c: any) => sum + c.outstandingBalance, 0) > 0 ? "var(--color-danger, #b14141)" : undefined }}>
            {formatStorePrice(customers.reduce((sum: number, c: any) => sum + c.outstandingBalance, 0))}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</span>
          <strong>{transferredUnitsAll} ш</strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Зарсан" : "Sold"}</span>
          <strong>{soldUnitsAll} ш</strong>
        </div>
        <div className="admin-summary-card">
          <span>{language === "MN" ? "Үлдэгдэл бараа" : "Remaining"}</span>
          <strong style={{ color: remainingUnitsAll > 0 ? "var(--color-danger, #b14141)" : undefined }}>
            {remainingUnitsAll} ш
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.totalTransfers}</span>
          <strong>{deliveryTxs.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{copy.totalCustomers}</span>
          <strong>{customers.length}</strong>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.35rem", fontSize: "0.78rem", color: "var(--color-text-secondary, #6b7280)" }}>
            <span>{copy.customerTypeOrg}: <b style={{ color: "var(--color-text, inherit)" }}>{customers.filter((c: any) => c.type === "organization").length}</b></span>
            <span>{copy.customerTypeInd}: <b style={{ color: "var(--color-text, inherit)" }}>{customers.filter((c: any) => c.type === "individual").length}</b></span>
          </div>
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
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            {/* View mode toggle */}
            <div style={{ display: "flex", background: "#f3f4f6", borderRadius: "0.6rem", padding: "3px", gap: "2px" }}>
              <button
                type="button"
                onClick={() => setCustomerViewMode("customers")}
                style={{
                  padding: "0.3rem 0.85rem",
                  borderRadius: "0.45rem",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  background: customerViewMode === "customers" ? "#fff" : "transparent",
                  color: customerViewMode === "customers" ? "#3a3630" : "#6b7280",
                  boxShadow: customerViewMode === "customers" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {language === "MN" ? "Борлуулагчаар" : "By seller"}
              </button>
              <button
                type="button"
                onClick={() => setCustomerViewMode("transfers")}
                style={{
                  padding: "0.3rem 0.85rem",
                  borderRadius: "0.45rem",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  border: "none",
                  cursor: "pointer",
                  background: customerViewMode === "transfers" ? "#fff" : "transparent",
                  color: customerViewMode === "transfers" ? "#3a3630" : "#6b7280",
                  boxShadow: customerViewMode === "transfers" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {language === "MN" ? "Шилжүүлгээр" : "By transfer"}
              </button>
            </div>
            {customerViewMode === "customers" && (
              <>
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder={copy.searchByName}
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                />
                <select
                  className="admin-search-input"
                  value={customerTypeFilter}
                  onChange={(event) => setCustomerTypeFilter(event.target.value as any)}
                >
                  <option value="all">{copy.customerTypeAll}</option>
                  <option value="organization">{copy.customerTypeOrg}</option>
                  <option value="individual">{copy.customerTypeInd}</option>
                </select>
              </>
            )}
            {customerViewMode === "transfers" && (
              <input
                type="text"
                className="admin-search-input"
                placeholder={language === "MN" ? "Хайх..." : "Search..."}
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
              />
            )}
          </div>
        </div>

        {customerViewMode === "transfers" ? (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table" style={{ textAlign: "center" }}>
              <thead>
                <tr>
                  <th style={{ width: "2.5rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>#</th>
                  <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>{language === "MN" ? "Огноо" : "Date"}</th>
                  <th style={{ textAlign: "center" }}>{copy.txCustomer}</th>
                  <th style={{ textAlign: "center" }}>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</th>
                  <th style={{ textAlign: "center" }}>{language === "MN" ? "Зарсан" : "Sold"}</th>
                  <th style={{ textAlign: "center" }}>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</th>
                  <th style={{ textAlign: "center" }}>{copy.txGrandTotal}</th>
                  <th style={{ textAlign: "center" }}>{copy.txPaymentStatus}</th>
                  <th style={{ textAlign: "center", width: "2.5rem" }}>{copy.actions}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const q = customerSearch.trim().toLowerCase();
                  const filtered = customerTransactions.filter((tx: any) => {
                    // Sale (allowance) records are not transfers — they belong on the
                    // Бүтээгдэхүүнээр tab, not in this by-transfer list.
                    if (tx.type === "sale") return false;
                    if (!q) return true;
                    return (
                      tx.customerSnapshot.name.toLowerCase().includes(q) ||
                      (tx.txNumber ?? "").toLowerCase().includes(q)
                    );
                  });
                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={9} className="admin-table-empty">
                          {copy.txEmpty}
                        </td>
                      </tr>
                    );
                  }
                  return filtered.map((tx: any, idx: number) => {
                    const transferred = tx.items.reduce((s: number, i: any) => s + i.quantity, 0);
                    const sold = tx.items.reduce((s: number, i: any) => s + i.soldQuantity, 0);
                    const remaining = transferred - sold;
                    return (
                      <tr key={tx.id}>
                        <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>{idx + 1}</td>
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{formatAdminDateTime(tx.transactionDate ?? tx.createdAt, language)}</td>
                        <td style={{ textAlign: "center" }}><strong>{tx.customerSnapshot.name}</strong></td>
                        <td style={{ textAlign: "center" }}>{transferred}</td>
                        <td style={{ textAlign: "center" }}>{sold}</td>
                        <td style={{ textAlign: "center" }}>
                          <strong style={{ color: remaining > 0 ? "#b14141" : "#2f7a4a" }}>{remaining}</strong>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <strong>{formatStorePrice(tx.totals.grandTotal)}</strong>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={`admin-status-badge ${tx.payment.status === "paid" ? "admin-status-active" : tx.payment.status === "partial" ? "admin-status-warning" : "admin-status-inactive"}`}>
                            {tx.payment.status === "paid"
                              ? (language === "MN" ? "Төлөгдсөн" : "Paid")
                              : tx.payment.status === "partial"
                                ? (language === "MN" ? "Хэсэгчлэн" : "Partial")
                                : (language === "MN" ? "Төлөгдөөгүй" : "Unpaid")}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <div className="admin-table-actions" style={{ justifyContent: "center" }}>
                            {tx.type !== "return" && tx.totals.grandTotal - tx.payment.paidAmount > 0 && (
                              <button
                                type="button"
                                className="admin-icon-btn admin-icon-btn-neutral"
                                title={language === "MN" ? "Төлбөр бүртгэх" : "Record payment"}
                                onClick={() => {
                                  setTxPaymentError(null);
                                  setTxPaymentModal({
                                    customerId: tx.customerId,
                                    txId: tx.id,
                                    draft: {
                                      date: new Date().toISOString().slice(0, 10),
                                      amount: tx.totals.grandTotal - tx.payment.paidAmount,
                                      note: "",
                                    },
                                  });
                                }}
                              >
                                <Banknote size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-neutral"
                              title={copy.editTransaction}
                              onClick={() => {
                                setTransactionError(null);
                                setTransactionModal({
                                  mode: "edit",
                                  draft: { ...tx, items: tx.items.map((i: any) => ({ ...i })) },
                                  previous: { ...tx, items: tx.items.map((i: any) => ({ ...i })) },
                                });
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              title={language === "MN" ? "Устгах" : "Delete"}
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
                              <Trash2 size={14} />
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
        ) : (
          <div className="admin-data-table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th style={{ width: "2.5rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>#</th>
                  <th style={{ textAlign: "left" }}>{copy.customerNameLabel}</th>
                  <th style={{ textAlign: "center" }}>{copy.customerPhone}</th>
                  <th style={{ textAlign: "center" }}>{language === "MN" ? "Үлдэгдэл" : "Balance"}</th>
                  <th style={{ textAlign: "center" }}>{copy.active}</th>
                  <th style={{ textAlign: "center" }}>{copy.actions}</th>
                  <th style={{ textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filtered = customers.filter((customer: any) => {
                    if (customerTypeFilter !== "all" && customer.type !== customerTypeFilter) {
                      return false;
                    }
                    if (customerSearch.trim()) {
                      const q = customerSearch.trim().toLowerCase();
                      return (
                        customer.name.toLowerCase().includes(q) ||
                        customer.phoneNumber.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  });
                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="admin-table-empty">
                          {copy.customerEmpty}
                        </td>
                      </tr>
                    );
                  }
                  return filtered.map((customer: any, customerIdx: number) => {
                    const addressText = customer.address
                      ? [
                          customer.address.region,
                          customer.address.districtOrSoum,
                          customer.address.khorooOrBag,
                          customer.address.streetAddress,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "";
                    const isCustomerExpanded = expandedCustomerId === customer.id;
                    return (
                      <React.Fragment key={customer.id}>
                        <tr
                          className={`admin-product-row-clickable ${isCustomerExpanded ? "admin-product-row-expanded" : ""}`}
                          onClick={() => {
                            setExpandedCustomerId(isCustomerExpanded ? null : customer.id);
                            if (!isCustomerExpanded) setExpandedCustomerTab("products");
                          }}
                        >
                          <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>{customerIdx + 1}</td>
                          <td style={{ textAlign: "left" }}>
                            <div className="admin-table-primary">
                              <strong>{customer.name}</strong>
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>{customer.phoneNumber || "-"}</td>
                          <td style={{ textAlign: "center" }}>
                            <strong
                              style={{
                                color:
                                  customer.outstandingBalance > 0
                                    ? "#b14141"
                                    : customer.outstandingBalance < 0
                                      ? "#2f7a4a"
                                      : "#3a3630",
                              }}
                            >
                              {formatStorePrice(customer.outstandingBalance)}
                            </strong>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <StatusBadge
                              status={customer.status}
                              activeLabel={copy.active}
                              inactiveLabel={copy.inactive}
                            />
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <div className="admin-table-actions">
                              <button
                                type="button"
                                className="admin-icon-btn admin-icon-btn-neutral"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCustomerError(null);
                                  setCustomerModal({ mode: "edit", draft: { ...customer } });
                                }}
                              >
                                <Pencil size={15} />
                              </button>
                              {customerTransactions.some((tx: any) => tx.customerId === customer.id) ? (
                                <button
                                  type="button"
                                  className="admin-icon-btn admin-icon-btn-neutral"
                                  title={language === "MN" ? "Шинэ шилжүүлэг" : "New transfer"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTransactionError(null);
                                    setTransactionModal({
                                      mode: "create",
                                      draft: {
                                        ...createEmptyTransactionDraft(),
                                        customerId: customer.id,
                                        customerSnapshot: {
                                          code: customer.code,
                                          name: customer.name,
                                          phoneNumber: customer.phoneNumber,
                                        },
                                      },
                                    });
                                  }}
                                >
                                  <ArrowLeftRight size={15} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="admin-icon-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openConfirmModal({
                                      title: copy.confirmDeleteTitle,
                                      description: copy.deleteCustomerDescription,
                                      confirmLabel: copy.delete,
                                      destructive: true,
                                      onConfirm: async () => {
                                        await deleteCustomer(customer.id);
                                      },
                                    });
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {isCustomerExpanded ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </td>
                        </tr>
                        {isCustomerExpanded && (() => {
                          const toMs = (tx: any) => {
                            const raw = tx.transactionDate ?? tx.createdAt;
                            if (!raw) return 0;
                            if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                              const [y, m, d] = raw.split("-").map(Number);
                              return new Date(y, m - 1, d, 12).getTime();
                            }
                            return new Date(raw).getTime();
                          };
                          const customerTxs = customerTransactions
                            .filter((tx: any) => tx.customerId === customer.id)
                            .slice()
                            .sort((a: any, b: any) => toMs(b) - toMs(a));
                          const customerDeliveryTxs = customerTxs.filter((tx: any) => tx.type === "delivery");
                          const customerSaleTxs = customerTxs.filter((tx: any) => tx.type === "sale");
                          const customerReturnTxs = customerTxs.filter((tx: any) => tx.type === "return");
                          const productAgg = new Map<string, {
                            productId: number;
                            productName: string;
                            variant: string | null;
                            transferred: number;
                            sold: number;
                            returned: number;
                            /** Unit price exactly as it was typed on the transfer that moved these
                             * goods. It is part of the row's identity (see `aggKey`), so every unit
                             * on the row was charged this one price — shown as "Нэгж үнэ" and used
                             * to price a new sale/return. */
                            transferUnitPrice: number;
                            /** Gross value of what was transferred — the transfer price, unaffected by
                             * any payment. Used to price a new sale/return, never shown as a total. */
                            totalAmount: number;
                            /** `totalAmount` less whatever has already been paid on the delivery(ies)
                             * it came from — matches the money "Үлдэгдэл" a single delivery shows on
                             * the Шилжүүлгээр tab, just spread across its line items. */
                            outstandingAmount: number;
                            /** `outstandingAmount` before any sale/return credit is subtracted — the
                             * delivery-payment baseline alone. Kept apart so that baseline can be
                             * re-divided back onto the individual deliveries (see `deliveryMoney`
                             * below) without double-subtracting the credit already folded into
                             * `outstandingAmount`. */
                            deliveryOutstanding: number;
                            /** The slice of the sale/return credit that came specifically from
                             * returns (not sales) — kept apart so a delivery's card can show its
                             * own "Буцаасан дүн" instead of a blend of both. */
                            returnCredit: number;
                          }>();
                          // A row is one product, one variant, one price. The same product
                          // transferred twice at different prices is two separate stocks to sell
                          // down, and merging them would price the row at an average the seller was
                          // never charged — so the price belongs to the row's identity.
                          const aggKey = (it: any) =>
                            `${it.productId}::${it.variant ?? ""}::${Math.round(Number(it.unitPrice) || 0)}`;
                          // A sale or return normally carries one of those prices exactly, because
                          // the popup that records it is seeded from these very rows. When it does
                          // not — a record made before the rows were split by price, or a transfer
                          // whose price was edited since — it settles against whichever row of the
                          // same product and variant has the most left, rather than opening a row
                          // that shows goods sold with no transfer behind them.
                          const settleKey = (it: any) => {
                            const exact = aggKey(it);
                            if (productAgg.has(exact)) return exact;
                            const prefix = `${it.productId}::${it.variant ?? ""}::`;
                            let bestKey: string | null = null;
                            let bestRemaining = -Infinity;
                            productAgg.forEach((agg, key) => {
                              if (!key.startsWith(prefix)) return;
                              const remaining = agg.transferred - agg.sold - agg.returned;
                              if (remaining > bestRemaining) {
                                bestRemaining = remaining;
                                bestKey = key;
                              }
                            });
                            return bestKey ?? exact;
                          };
                          // Transferred quantity and value come from deliveries only. A delivery's
                          // own payment is prorated across its lines by value, so a partially paid
                          // delivery doesn't leave every one of its products looking fully unpaid.
                          customerDeliveryTxs.forEach((tx: any) => {
                            const outstandingRatio =
                              tx.totals.subtotal > 0
                                ? Math.max(0, (tx.totals.grandTotal - tx.payment.paidAmount) / tx.totals.subtotal)
                                : 0;
                            tx.items.forEach((it: any) => {
                              const key = aggKey(it);
                              const outstandingAmount = it.lineTotal * outstandingRatio;
                              const existing = productAgg.get(key);
                              if (existing) {
                                existing.transferred += it.quantity;
                                existing.sold += it.soldQuantity;
                                existing.totalAmount += it.lineTotal;
                                existing.outstandingAmount += outstandingAmount;
                                existing.deliveryOutstanding += outstandingAmount;
                              } else {
                                productAgg.set(key, {
                                  productId: it.productId,
                                  productName: it.productName,
                                  variant: it.variant,
                                  transferred: it.quantity,
                                  sold: it.soldQuantity,
                                  returned: 0,
                                  transferUnitPrice: Math.round(Number(it.unitPrice) || 0),
                                  totalAmount: it.lineTotal,
                                  outstandingAmount,
                                  deliveryOutstanding: outstandingAmount,
                                  returnCredit: 0,
                                });
                              }
                            });
                          });
                          // Each sale (allowance) record adds its quantity to what has been sold,
                          // and clears its share of the receivable — the discount plus whatever
                          // was paid — off the products it covers, prorated the same way a
                          // delivery's own payment is. This is what makes registering a sale move
                          // the Products tab's "Нийт дүн" instead of only the delivery it came from.
                          customerSaleTxs.forEach((tx: any) => {
                            const settleRatio =
                              tx.totals.subtotal > 0
                                ? (tx.totals.discount + tx.payment.paidAmount) / tx.totals.subtotal
                                : 0;
                            tx.items.forEach((it: any) => {
                              const key = settleKey(it);
                              const settledAmount = it.lineTotal * settleRatio;
                              const existing = productAgg.get(key);
                              if (existing) {
                                existing.sold += it.quantity;
                                existing.outstandingAmount -= settledAmount;
                              } else {
                                productAgg.set(key, {
                                  productId: it.productId,
                                  productName: it.productName,
                                  variant: it.variant,
                                  transferred: 0,
                                  sold: it.quantity,
                                  returned: 0,
                                  // No delivery carries this product any more (the transfer was
                                  // edited away or predates this rollup) — the price it was
                                  // settled at is the closest thing left to a transfer price.
                                  transferUnitPrice: Math.round(Number(it.unitPrice) || 0),
                                  totalAmount: 0,
                                  outstandingAmount: -settledAmount,
                                  deliveryOutstanding: 0,
                                  returnCredit: 0,
                                });
                              }
                            });
                          });
                          // Each return adds its quantity to what has been returned — tracked
                          // apart from "transferred" so the by-product report can show it as
                          // its own column instead of quietly shrinking the delivered total —
                          // and credits its full value (a return carries no discount) straight
                          // off the receivable for the products it covers.
                          customerReturnTxs.forEach((tx: any) => {
                            tx.items.forEach((it: any) => {
                              const key = settleKey(it);
                              const existing = productAgg.get(key);
                              if (existing) {
                                existing.returned += it.quantity;
                                existing.outstandingAmount -= it.lineTotal;
                                existing.returnCredit += it.lineTotal;
                              } else {
                                productAgg.set(key, {
                                  productId: it.productId,
                                  productName: it.productName,
                                  variant: it.variant,
                                  transferred: 0,
                                  sold: 0,
                                  returned: it.quantity,
                                  transferUnitPrice: Math.round(Number(it.unitPrice) || 0),
                                  totalAmount: 0,
                                  outstandingAmount: -it.lineTotal,
                                  deliveryOutstanding: 0,
                                  returnCredit: it.lineTotal,
                                });
                              }
                            });
                          });
                          // A sale or return doesn't belong to any one delivery — it settles a
                          // product a customer may have received across several. Its credit is
                          // spread back onto those deliveries by value share (the same product's
                          // line, weighted by how much of that product's total value this
                          // particular delivery accounts for), so registering a sale/return moves
                          // the "Төлсөн"/"Үлдэгдэл" a delivery card shows on the Шилжүүлгээр tab,
                          // not just the Бүтээгдэхүүнээр aggregate.
                          const deliveryMoney = new Map<string, { paid: number; returned: number; outstanding: number }>();
                          customerDeliveryTxs.forEach((tx: any) => {
                            const outstandingRatio =
                              tx.totals.subtotal > 0
                                ? Math.max(0, (tx.totals.grandTotal - tx.payment.paidAmount) / tx.totals.subtotal)
                                : 0;
                            let baselineTotal = 0;
                            let creditTotal = 0;
                            let returnedTotal = 0;
                            tx.items.forEach((it: any) => {
                              const agg = productAgg.get(aggKey(it));
                              const baselineOutstanding = it.lineTotal * outstandingRatio;
                              baselineTotal += baselineOutstanding;
                              if (!agg || agg.totalAmount <= 0) return;
                              const itemShare = it.lineTotal / agg.totalAmount;
                              creditTotal += (agg.deliveryOutstanding - agg.outstandingAmount) * itemShare;
                              returnedTotal += agg.returnCredit * itemShare;
                            });
                            const outstanding = Math.max(0, baselineTotal - creditTotal);
                            const returned = Math.max(0, returnedTotal);
                            deliveryMoney.set(tx.id, {
                              outstanding,
                              returned,
                              paid: Math.max(0, tx.totals.grandTotal - outstanding - returned),
                            });
                          });
                          // Sorted by product code (#001, #002, ...) — shared by the
                          // Бүтээгдэхүүнээр table, the Шилжүүлгээр item grids and the
                          // Борлуулалт / Буцаалт бүртгэх popup, so the same product lands on
                          // the same row everywhere. One product's own rows then run by variant
                          // and by price, cheapest first, so its prices read as a list.
                          const productAggList = Array.from(productAgg.values()).sort((a, b) => {
                            const byCode = getProductCode(a.productId).localeCompare(getProductCode(b.productId));
                            if (byCode !== 0) return byCode;
                            const byVariant = (a.variant ?? "").localeCompare(b.variant ?? "");
                            if (byVariant !== 0) return byVariant;
                            return a.transferUnitPrice - b.transferUnitPrice;
                          });
                          const customerSoldUnits =
                            sumItems(customerDeliveryTxs, (it) => it.soldQuantity) +
                            sumItems(customerSaleTxs, (it) => it.quantity);
                          const customerReturnedUnits = sumItems(customerReturnTxs, (it) => it.quantity);
                          const customerTransferredUnits = sumItems(customerDeliveryTxs, (it) => it.quantity);
                          const customerTransferredAmount = customerDeliveryTxs.reduce(
                            (s: number, tx: any) => s + tx.totals.grandTotal,
                            0,
                          );
                          const customerSoldAmount = customerSaleTxs.reduce(
                            (s: number, tx: any) => s + tx.totals.grandTotal,
                            0,
                          );
                          const customerReturnedAmount = customerReturnTxs.reduce(
                            (s: number, tx: any) => s + tx.totals.grandTotal,
                            0,
                          );
                          // Every dashboard card is styled and sized exactly like the Төрөл card
                          // — same background/border, same fixed width — so the row reads as one
                          // even grid instead of ragged boxes sized to their own text.
                          const DASHBOARD_CARD_WIDTH = "170px";
                          const dashboardCard = (small: string, value: React.ReactNode, sub?: React.ReactNode) => (
                            <div className="admin-expand-stat" style={{ width: DASHBOARD_CARD_WIDTH }}>
                              <small>{small}</small>
                              <strong>{value}</strong>
                              {sub && (
                                <span style={{ fontSize: "var(--fs-xs, 0.7rem)", color: "#8a8477" }}>{sub}</span>
                              )}
                            </div>
                          );
                          return (
                            <tr className="admin-product-expand-row">
                              <td colSpan={7}>
                                <div className="admin-product-expand">
                                  <div className="admin-product-expand-stats">
                                    <div className="admin-expand-stat" style={{ width: DASHBOARD_CARD_WIDTH }}>
                                      <small>{copy.txType}</small>
                                      <strong>
                                        {customer.type === "organization"
                                          ? copy.customerTypeOrg
                                          : copy.customerTypeInd}
                                      </strong>
                                    </div>
                                    <div className="admin-expand-stat" style={{ width: DASHBOARD_CARD_WIDTH }}>
                                      <small>{copy.customerAddress}</small>
                                      <strong style={{ fontSize: "var(--fs-sm, 0.78rem)" }}>
                                        {addressText || "-"}
                                      </strong>
                                    </div>
                                    <div className="admin-expand-stat" style={{ width: DASHBOARD_CARD_WIDTH }}>
                                      <small>
                                        {language === "MN" ? "Шинэчлэгдсэн" : "Last updated"}
                                      </small>
                                      <strong style={{ fontSize: "var(--fs-sm, 0.78rem)" }}>
                                        {formatAdminDateTime(customer.updatedAt, language)}
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="admin-product-expand-stats">
                                    {dashboardCard(
                                      language === "MN" ? "Нийт шилжүүлсэн дүн" : "Total transferred amount",
                                      formatStorePrice(customerTransferredAmount),
                                    )}
                                    {dashboardCard(
                                      language === "MN" ? "Буцаасан дүн" : "Returned amount",
                                      formatStorePrice(customerReturnedAmount),
                                    )}
                                    {dashboardCard(
                                      language === "MN" ? "Төлсөн дүн" : "Paid amount",
                                      formatStorePrice(customerSoldAmount),
                                    )}
                                    {dashboardCard(
                                      language === "MN" ? "Нийт авлага" : "Total receivable",
                                      formatStorePrice(customer.outstandingBalance),
                                    )}
                                  </div>

                                  <div className="admin-product-expand-stats" style={{ marginTop: "0.75rem" }}>
                                    {dashboardCard(
                                      language === "MN" ? "Шилжүүлсэн тоо/ш" : "Transferred qty",
                                      `${customerTransferredUnits} ш`,
                                      `${customerDeliveryTxs.length} ${language === "MN" ? "шилжүүлэг" : "transfers"}`,
                                    )}
                                    {dashboardCard(
                                      language === "MN" ? "Буцаасан тоо/ш" : "Returned qty",
                                      `${customerReturnedUnits} ш`,
                                    )}
                                    {dashboardCard(
                                      language === "MN" ? "Зарсан тоо/ш" : "Sold qty",
                                      `${customerSoldUnits} ш`,
                                    )}
                                    {dashboardCard(
                                      language === "MN" ? "Үлдэгдэл тоо/ш" : "Remaining qty",
                                      `${customerTransferredUnits - customerSoldUnits - customerReturnedUnits} ш`,
                                    )}
                                  </div>

                                  {/* Tab navigation */}
                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "1.25rem" }}>
                                    {([
                                      { key: "products", label: language === "MN" ? "Бүтээгдэхүүнээр" : "Products", color: "#2563eb", tint: "#dbeafe", text: "#1e3a8a", count: productAggList.length },
                                      { key: "history",  label: language === "MN" ? "Шилжүүлгээр" : "Transaction history", color: "#ca8a04", tint: "#fef9c3", text: "#854d0e", count: customerDeliveryTxs.length },
                                      { key: "sales",    label: language === "MN" ? "Борлуулалт" : "Sales", color: "#16a34a", tint: "#dcfce7", text: "#166534", count: customerSaleTxs.length },
                                      { key: "returns",  label: language === "MN" ? "Буцаалт" : "Returns", color: "#ea580c", tint: "#ffedd5", text: "#9a3412", count: customerReturnTxs.length },
                                    ] as const).map((tab) => {
                                      const active = expandedCustomerTab === tab.key;
                                      return (
                                        <button
                                          key={tab.key}
                                          type="button"
                                          onClick={() => setExpandedCustomerTab(tab.key)}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "0.4rem",
                                            padding: "10px 22px",
                                            fontSize: "1rem",
                                            fontWeight: 700,
                                            background: active ? tab.color : tab.tint,
                                            color: active ? "#fff" : tab.text,
                                            border: "none",
                                            borderRadius: "10px",
                                            cursor: "pointer",
                                            boxShadow: active ? `0 3px 8px ${tab.color}66` : "none",
                                            transition: "all 0.15s",
                                          }}
                                        >
                                          {tab.label}
                                          <span
                                            style={{
                                              display: "inline-flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              minWidth: "1.4rem",
                                              padding: "1px 6px",
                                              borderRadius: "999px",
                                              fontSize: "0.8rem",
                                              fontWeight: 700,
                                              background: active ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.08)",
                                              color: active ? "#fff" : tab.text,
                                            }}
                                          >
                                            {tab.count}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {/* Tab 2: Гүйлгээний түүх — зөвхөн шилжүүлгүүд, борлуулалт/буцаалт тус тусдаа таб дээрээ */}
                                  {expandedCustomerTab === "history" && (() => {
                                    const historyTxs = customerTxs.filter((tx: any) => tx.type === "delivery");
                                    return (
                                    <div className="admin-product-expand-section">
                                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
                                        <button
                                          type="button"
                                          className="btn btn-outline"
                                          style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                                          onClick={() => {
                                            setTransactionError(null);
                                            setTransactionModal({
                                              mode: "create",
                                              draft: {
                                                ...createEmptyTransactionDraft(),
                                                customerId: customer.id,
                                                customerSnapshot: {
                                                  code: customer.code,
                                                  name: customer.name,
                                                  phoneNumber: customer.phoneNumber,
                                                },
                                              },
                                            });
                                          }}
                                        >
                                          <Plus size={14} /> {language === "MN" ? "Шинэ шилжүүлэг" : "New transfer"}
                                        </button>
                                      </div>
                                      {historyTxs.length === 0 ? (
                                        <p className="admin-expand-empty">
                                          {language === "MN" ? "Шилжүүлэг байхгүй" : "No transfers yet"}
                                        </p>
                                      ) : (
                                        <div className="admin-customer-tx-list">
                                          {historyTxs.map((tx: any) => {
                                            // Raw remaining unpaid on this delivery's own payment field —
                                            // what "Record payment" is actually allowed to collect against.
                                            const outstanding = tx.totals.grandTotal - tx.payment.paidAmount;
                                            // What's actually still owed once sales/returns against these
                                            // goods are folded in — shown in the footer instead of `outstanding`.
                                            const money = deliveryMoney.get(tx.id) ?? { paid: tx.payment.paidAmount, returned: 0, outstanding };
                                            const effectiveStatus =
                                              money.outstanding <= 0 ? "paid" : money.paid > 0 ? "partial" : "unpaid";
                                            return (
                                              <div key={tx.id} className="admin-customer-tx-card">
                                                <div className="admin-customer-tx-head">
                                                  <div className="admin-customer-tx-head-left">
                                                    <span className="admin-customer-tx-date">
                                                      {formatAdminDateTime(tx.transactionDate ?? tx.createdAt, language)}
                                                    </span>
                                                    <span className="admin-customer-tx-number">
                                                      {tx.txNumber}
                                                    </span>
                                                    <span className="admin-customer-tx-type admin-customer-tx-type-delivery">
                                                      {copy.txTypeDelivery}
                                                    </span>
                                                  </div>
                                                  <div className="admin-customer-tx-head-right">
                                                    {tx.updatedAt && (
                                                      <span style={{ fontSize: "0.72rem", color: "#8a8477", marginRight: "0.5rem" }}>
                                                        {formatAdminDateTime(tx.updatedAt, language)}
                                                      </span>
                                                    )}
                                                    {outstanding > 0 && (
                                                      <button
                                                        type="button"
                                                        className="admin-icon-btn admin-icon-btn-neutral"
                                                        title={language === "MN" ? "Төлбөр бүртгэх" : "Record payment"}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setTxPaymentError(null);
                                                          setTxPaymentModal({
                                                            customerId: customer.id,
                                                            txId: tx.id,
                                                            draft: {
                                                              date: new Date().toISOString().slice(0, 10),
                                                              amount: outstanding,
                                                              note: "",
                                                            },
                                                          });
                                                        }}
                                                      >
                                                        <Banknote size={13} />
                                                      </button>
                                                    )}
                                                    {/* Only worth offering while the tally actually holds
                                                        something — see clearTransactionSoldQuantities. */}
                                                    {tx.items.some((it: any) => (it.soldQuantity ?? 0) > 0) && (
                                                      <button
                                                        type="button"
                                                        className="admin-icon-btn admin-icon-btn-neutral"
                                                        title={language === "MN" ? "Зарсан тоог тэглэх" : "Reset the sold count"}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          clearTransactionSoldQuantities(tx);
                                                        }}
                                                      >
                                                        <RotateCcw size={13} />
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      className="admin-icon-btn admin-icon-btn-neutral"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTransactionError(null);
                                                        setTransactionModal({
                                                          mode: "edit",
                                                          draft: { ...tx, items: tx.items.map((i: any) => ({ ...i })) },
                                                          previous: { ...tx, items: tx.items.map((i: any) => ({ ...i })) },
                                                        });
                                                      }}
                                                    >
                                                      <Pencil size={13} />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="admin-icon-btn"
                                                      title={language === "MN" ? "Устгах" : "Delete"}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openConfirmModal({
                                                          title: copy.confirmDeleteTitle,
                                                          description: copy.deleteTransactionDescription,
                                                          confirmLabel: copy.delete,
                                                          destructive: true,
                                                          onConfirm: async () => {
                                                            await deleteCustomerTransaction(tx);
                                                          },
                                                        });
                                                      }}
                                                    >
                                                      <Trash2 size={13} />
                                                    </button>
                                                  </div>
                                                </div>

                                                <div className="admin-customer-tx-foot">
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</small>
                                                    <strong>{tx.items.reduce((s: number, it: any) => s + it.quantity, 0)} ш</strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</small>
                                                    <strong style={{ color: tx.items.reduce((s: number, it: any) => s + (it.quantity - it.soldQuantity), 0) > 0 ? "#b14141" : "#2f7a4a" }}>
                                                      {tx.items.reduce((s: number, it: any) => s + (it.quantity - it.soldQuantity), 0)} ш
                                                    </strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{copy.txGrandTotal}</small>
                                                    <strong>{formatStorePrice(tx.totals.grandTotal)}</strong>
                                                  </div>
                                                  {tx.totals.discount > 0 && (
                                                    <div className="admin-customer-tx-foot-item">
                                                      <small>{copy.txDiscount}</small>
                                                      <strong style={{ color: "#dc2626" }}>
                                                        −{formatStorePrice(tx.totals.discount)}
                                                        {tx.totals.discountType === "percent" ? ` (${tx.totals.discountValue}%)` : ""}
                                                      </strong>
                                                    </div>
                                                  )}
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Буцаасан дүн" : "Returned amount"}</small>
                                                    <strong style={{ color: money.returned > 0 ? "#b14141" : undefined }}>
                                                      {formatStorePrice(money.returned)}
                                                    </strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{copy.txPaidAmount}</small>
                                                    <strong>{formatStorePrice(money.paid)}</strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Үлдэгдэл" : "Tx outstanding"}</small>
                                                    <strong style={{ color: money.outstanding > 0 ? "#b14141" : "#3a3630" }}>
                                                      {formatStorePrice(money.outstanding)}
                                                    </strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{copy.txPaymentStatus}</small>
                                                    <span className={`admin-expand-order-status admin-expand-order-${effectiveStatus === "paid" ? "paid" : effectiveStatus === "partial" ? "delivering" : "new"}`}>
                                                      {effectiveStatus === "paid"
                                                        ? copy.txPaymentPaid
                                                        : effectiveStatus === "partial"
                                                          ? copy.txPaymentPartial
                                                          : copy.txPaymentUnpaid}
                                                    </span>
                                                  </div>
                                                </div>

                                                {tx.note && (
                                                  <div className="admin-customer-tx-note">{tx.note}</div>
                                                )}

                                                {(() => {
                                                  const entries = tx.payment.entries ?? [];
                                                  const entriesSum = entries.reduce((s: number, e: any) => s + e.amount, 0);
                                                  const initialPaid = tx.payment.paidAmount - entriesSum;
                                                  const paymentRows = [
                                                    ...(initialPaid > 0
                                                      ? [{
                                                          kind: "initial" as const,
                                                          entryIdx: -1,
                                                          date: (tx.payment.paidAt ?? tx.transactionDate ?? tx.createdAt ?? "").slice(0, 10),
                                                          amount: initialPaid,
                                                          note: language === "MN" ? "Гүйлгээ бүртгэхэд төлсөн" : "Paid at transaction time",
                                                        }]
                                                      : []),
                                                    ...entries.map((entry: any, entryIdx: number) => ({
                                                      kind: "entry" as const,
                                                      entryIdx,
                                                      date: entry.date || "",
                                                      amount: entry.amount,
                                                      note: entry.note,
                                                    })),
                                                  ];
                                                  if (paymentRows.length === 0) return null;
                                                  return (
                                                    <div style={{ marginTop: "0.5rem" }}>
                                                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#8a8477", marginBottom: "0.3rem" }}>
                                                        {language === "MN" ? "Төлбөрийн түүх" : "Payment history"}
                                                      </div>
                                                      <div className="admin-expand-sales-table-wrap">
                                                        <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                                          <thead>
                                                            <tr>
                                                              <th style={{ width: "2rem", textAlign: "center" }}>#</th>
                                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Огноо" : "Date"}</th>
                                                              <th style={{ textAlign: "center" }}>{language === "MN" ? "Төлсөн дүн" : "Amount"}</th>
                                                              <th style={{ textAlign: "left" }}>{language === "MN" ? "Тайлбар" : "Note"}</th>
                                                              <th style={{ textAlign: "center", width: "5rem" }}>{copy.actions}</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody>
                                                            {paymentRows.map((row, idx) => (
                                                              <tr key={`${row.kind}-${row.entryIdx}`}>
                                                                <td style={{ textAlign: "center", color: "#8a8477", fontSize: "0.75rem" }}>{idx + 1}</td>
                                                                <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>{row.date || "—"}</td>
                                                                <td style={{ textAlign: "center" }}><strong>{formatStorePrice(row.amount)}</strong></td>
                                                                <td style={{ textAlign: "left", color: "#6b7280" }}>{row.note || "—"}</td>
                                                                <td style={{ textAlign: "center" }}>
                                                                  {row.kind === "entry" ? (
                                                                    <div className="admin-table-actions" style={{ justifyContent: "center" }}>
                                                                      <button
                                                                        type="button"
                                                                        className="admin-icon-btn admin-icon-btn-neutral"
                                                                        title={language === "MN" ? "Засах" : "Edit"}
                                                                        onClick={() => {
                                                                          setTxPaymentError(null);
                                                                          setTxPaymentModal({
                                                                            customerId: customer.id,
                                                                            txId: tx.id,
                                                                            editIndex: row.entryIdx,
                                                                            draft: {
                                                                              date: row.date || new Date().toISOString().slice(0, 10),
                                                                              amount: row.amount,
                                                                              note: row.note,
                                                                            },
                                                                          });
                                                                        }}
                                                                      >
                                                                        <Pencil size={13} />
                                                                      </button>
                                                                      <button
                                                                        type="button"
                                                                        className="admin-icon-btn"
                                                                        title={language === "MN" ? "Устгах" : "Delete"}
                                                                        onClick={() =>
                                                                          openConfirmModal({
                                                                            title: copy.confirmDeleteTitle,
                                                                            description:
                                                                              language === "MN"
                                                                                ? "Энэ төлбөрийн бичилтийг устгаснаар дүн нь гүйлгээний үлдэгдэлд буцаж нэмэгдэнэ."
                                                                                : "Deleting this payment adds its amount back to the transaction's outstanding balance.",
                                                                            confirmLabel: copy.delete,
                                                                            destructive: true,
                                                                            onConfirm: async () => {
                                                                              await deleteCustomerTransactionPaymentEntry(
                                                                                tx,
                                                                                row.entryIdx,
                                                                                user?.uid ?? "",
                                                                              );
                                                                            },
                                                                          })
                                                                        }
                                                                      >
                                                                        <Trash2 size={13} />
                                                                      </button>
                                                                    </div>
                                                                  ) : (
                                                                    <span style={{ color: "#c4beb2" }}>—</span>
                                                                  )}
                                                                </td>
                                                              </tr>
                                                            ))}
                                                          </tbody>
                                                        </table>
                                                      </div>
                                                    </div>
                                                  );
                                                })()}

                                                {/* Expandable items grid */}
                                                <div style={{ marginTop: "0.5rem" }}>
                                                  <button
                                                    type="button"
                                                    onClick={() => setExpandedTxGrids((prev: Set<string>) => {
                                                      const next = new Set(prev);
                                                      if (next.has(tx.id)) { next.delete(tx.id); } else { next.add(tx.id); }
                                                      return next;
                                                    })}
                                                    style={{
                                                      display: "flex", alignItems: "center", gap: "0.3rem",
                                                      background: "none", border: "none", cursor: "pointer",
                                                      fontSize: "0.75rem", color: "#8a8477", padding: "3px 0",
                                                      marginBottom: expandedTxGrids.has(tx.id) ? "0.5rem" : 0,
                                                    }}
                                                  >
                                                    {expandedTxGrids.has(tx.id)
                                                      ? <><ChevronUp size={13} /> {language === "MN" ? "Бараа нуух" : "Hide items"}</>
                                                      : <><ChevronDown size={13} /> {language === "MN" ? `Бараа харах (${tx.items.length})` : `Show items (${tx.items.length})`}</>
                                                    }
                                                  </button>
                                                  {expandedTxGrids.has(tx.id) && (
                                                    <div className="admin-expand-sales-table-wrap">
                                                      <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                                        <thead>
                                                          <tr>
                                                            <th style={{ width: "2rem", textAlign: "center" }}>#</th>
                                                            <th style={{ textAlign: "left" }}>{copy.txProduct}</th>
                                                            <th style={{ textAlign: "center" }}>{copy.txVariant}</th>
                                                            <th style={{ textAlign: "center" }}>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</th>
                                                            <th style={{ textAlign: "center" }}>{language === "MN" ? "Зарсан" : "Sold"}</th>
                                                            <th style={{ textAlign: "center" }}>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</th>
                                                            <th style={{ textAlign: "center" }}>{copy.txUnitPrice}</th>
                                                            <th style={{ textAlign: "center" }}>{copy.txLineTotal}</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {sortItemsByCode(tx.items).map((it: any, idx: number) => (
                                                            <tr key={idx}>
                                                              <td style={{ textAlign: "center", color: "#8a8477", fontSize: "0.75rem" }}>{idx + 1}</td>
                                                              <td style={{ textAlign: "left" }}>{getProductLabel(it.productId, it.productName)}</td>
                                                              <td style={{ textAlign: "center" }}>{it.variant || "—"}</td>
                                                              <td style={{ textAlign: "center" }}>{it.quantity}</td>
                                                              <td style={{ textAlign: "center" }}>{it.soldQuantity}</td>
                                                              <td style={{ textAlign: "center" }}>
                                                                <strong style={{ color: it.quantity - it.soldQuantity > 0 ? "#b14141" : "#2f7a4a" }}>
                                                                  {it.quantity - it.soldQuantity}
                                                                </strong>
                                                              </td>
                                                              <td style={{ textAlign: "center" }}>{formatStorePrice(it.unitPrice)}</td>
                                                              <td style={{ textAlign: "center" }}><strong>{formatStorePrice(it.lineTotal)}</strong></td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    );
                                  })()}

                                  {/* Tab 1: Бүтээгдэхүүний нийт шилжүүлэг */}
                                  {expandedCustomerTab === "products" && (
                                    <div className="admin-product-expand-section">
                                      {productAggList.length === 0 ? (
                                        <p className="admin-expand-empty">
                                          {language === "MN" ? "Шилжүүлэг байхгүй" : "No transfers yet"}
                                        </p>
                                      ) : (
                                        <>
                                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem", gap: "0.5rem", flexWrap: "wrap" }}>
                                          <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                                            onClick={() =>
                                              downloadSellerProductReport(
                                                customer,
                                                productAggList.map((p) => ({
                                                  label: getProductLabel(p.productId, p.productName),
                                                  variant: p.variant,
                                                  transferred: p.transferred,
                                                  sold: p.sold,
                                                  returned: p.returned,
                                                  unitPrice: p.transferUnitPrice,
                                                  totalAmount: p.totalAmount,
                                                })),
                                              )
                                            }
                                          >
                                            <Download size={14} /> {language === "MN" ? "Excel татах" : "Export to Excel"}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-primary"
                                            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                                            onClick={() => openSellerSaleModal(customer, productAggList, customerTransferredAmount)}
                                          >
                                            <Banknote size={14} /> {language === "MN" ? "Борлуулалт / Буцаалт бүртгэх" : "Record sale / return"}
                                          </button>
                                        </div>
                                        <div className="admin-expand-sales-table-wrap">
                                          <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                            <thead>
                                              <tr>
                                                <th style={{ width: "2rem", textAlign: "center" }}>#</th>
                                                <th style={{ textAlign: "left" }}>{copy.txProduct}</th>
                                                <th style={{ textAlign: "center" }}>{copy.txVariant}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Зарсан" : "Sold"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Буцаасан" : "Returned"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Нэгж үнэ" : "Unit price"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Нийт дүн" : "Total amount"}</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {productAggList.map((p, idx) => (
                                                <tr key={`${p.productId}-${p.variant ?? ""}-${p.transferUnitPrice}`}>
                                                  <td style={{ textAlign: "center", color: "#8a8477", fontSize: "0.75rem" }}>{idx + 1}</td>
                                                  <td style={{ textAlign: "left" }}>{getProductLabel(p.productId, p.productName)}</td>
                                                  <td style={{ textAlign: "center" }}>{p.variant || "—"}</td>
                                                  <td style={{ textAlign: "center" }}><strong>{p.transferred}</strong></td>
                                                  <td style={{ textAlign: "center" }}>{p.sold}</td>
                                                  <td style={{ textAlign: "center" }}>{p.returned}</td>
                                                  <td style={{ textAlign: "center" }}>
                                                    <strong style={{ color: p.transferred - p.sold - p.returned > 0 ? "#b14141" : "#2f7a4a" }}>
                                                      {p.transferred - p.sold - p.returned}
                                                    </strong>
                                                  </td>
                                                  <td style={{ textAlign: "center" }}>
                                                    {formatStorePrice(p.transferUnitPrice)}
                                                  </td>
                                                  <td style={{ textAlign: "center" }}><strong>{formatStorePrice(p.totalAmount)}</strong></td>
                                                </tr>
                                              ))}
                                            </tbody>
                                            <tfoot>
                                              <tr style={{ borderTop: "2px solid #e8e4dc", background: "#f5f3ee" }}>
                                                <td colSpan={3} style={{ padding: "8px 12px", fontSize: "0.8rem", fontWeight: 600, color: "#8a8477", textTransform: "uppercase", textAlign: "center" }}>
                                                  {language === "MN" ? "Нийт" : "Total"}
                                                </td>
                                                <td style={{ padding: "8px 12px", fontWeight: 700, color: "#3a3630", textAlign: "center" }}>
                                                  {productAggList.reduce((s, p) => s + p.transferred, 0)}
                                                </td>
                                                <td style={{ padding: "8px 12px", fontWeight: 700, color: "#3a3630", textAlign: "center" }}>
                                                  {productAggList.reduce((s, p) => s + p.sold, 0)}
                                                </td>
                                                <td style={{ padding: "8px 12px", fontWeight: 700, color: "#3a3630", textAlign: "center" }}>
                                                  {productAggList.reduce((s, p) => s + p.returned, 0)}
                                                </td>
                                                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                                  <strong style={{ color: productAggList.reduce((s, p) => s + (p.transferred - p.sold - p.returned), 0) > 0 ? "#b14141" : "#2f7a4a" }}>
                                                    {productAggList.reduce((s, p) => s + (p.transferred - p.sold - p.returned), 0)}
                                                  </strong>
                                                </td>
                                                <td style={{ padding: "8px 12px", textAlign: "center" }} />
                                                <td style={{ padding: "8px 12px", textAlign: "center" }} />
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {/* Tab: Борлуулалт */}
                                  {expandedCustomerTab === "sales" && (() => {
                                    const totalSoldQty = customerSaleTxs.reduce(
                                      (s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + it.quantity, 0),
                                      0,
                                    );
                                    const totalSoldAmount = customerSaleTxs.reduce((s: number, tx: any) => s + tx.totals.grandTotal, 0);
                                    const totalSoldPaid = customerSaleTxs.reduce((s: number, tx: any) => s + tx.payment.paidAmount, 0);
                                    return (
                                      <div className="admin-product-expand-section">
                                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
                                          <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                                            onClick={() => openSellerSaleModal(customer, productAggList, customerTransferredAmount)}
                                          >
                                            <Banknote size={14} /> {language === "MN" ? "Борлуулалт / Буцаалт бүртгэх" : "Record sale / return"}
                                          </button>
                                        </div>
                                        <div className="admin-product-expand-stats" style={{ marginBottom: "1rem" }}>
                                          <div className="admin-expand-stat">
                                            <small>{language === "MN" ? "Борлуулалтын тоо" : "Sales"}</small>
                                            <strong>{customerSaleTxs.length}</strong>
                                          </div>
                                          <div className="admin-expand-stat">
                                            <small>{language === "MN" ? "Зарсан тоо ширхэг" : "Sold quantity"}</small>
                                            <strong>{totalSoldQty} ш</strong>
                                          </div>
                                          <div className="admin-expand-stat">
                                            <small>{language === "MN" ? "Борлуулсан дүн" : "Sold amount"}</small>
                                            <strong>{formatStorePrice(totalSoldAmount)}</strong>
                                          </div>
                                          <div className="admin-expand-stat">
                                            <small>{language === "MN" ? "Хүлээн авсан төлбөр" : "Received"}</small>
                                            <strong>{formatStorePrice(totalSoldPaid)}</strong>
                                          </div>
                                        </div>
                                        {customerSaleTxs.length === 0 ? (
                                          <p className="admin-expand-empty">
                                            {language === "MN" ? "Борлуулалт байхгүй" : "No sales yet"}
                                          </p>
                                        ) : (
                                          <div className="admin-customer-tx-list">
                                            {customerSaleTxs.map((tx: any) => (
                                              <div key={tx.id} className="admin-customer-tx-card">
                                                <div className="admin-customer-tx-head">
                                                  <div className="admin-customer-tx-head-left">
                                                    <span className="admin-customer-tx-date">
                                                      {formatAdminDateTime(tx.transactionDate ?? tx.createdAt, language)}
                                                    </span>
                                                    <span className="admin-customer-tx-number">{tx.txNumber}</span>
                                                    <span className="admin-customer-tx-type admin-customer-tx-type-sale">
                                                      {copy.txTypeSale}
                                                    </span>
                                                  </div>
                                                  <div className="admin-customer-tx-head-right">
                                                    <button
                                                      type="button"
                                                      className="admin-icon-btn admin-icon-btn-neutral"
                                                      title={language === "MN" ? "Засах" : "Edit"}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openSellerTxEditModal(customer, tx, productAggList);
                                                      }}
                                                    >
                                                      <Pencil size={13} />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="admin-icon-btn"
                                                      title={language === "MN" ? "Устгах" : "Delete"}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openConfirmModal({
                                                          title: copy.confirmDeleteTitle,
                                                          description:
                                                            language === "MN"
                                                              ? "Энэ борлуулалтын бүртгэлийг устгаснаар авсан төлбөр болон хөнгөлөлт нь борлуулагчийн үлдэгдэлд буцаж нэмэгдэнэ."
                                                              : "Deleting this sale record adds the amount received and the discount back to the seller's outstanding balance.",
                                                          confirmLabel: copy.delete,
                                                          destructive: true,
                                                          onConfirm: async () => {
                                                            await deleteCustomerTransaction(tx);
                                                          },
                                                        });
                                                      }}
                                                    >
                                                      <Trash2 size={13} />
                                                    </button>
                                                  </div>
                                                </div>

                                                {tx.note && <div className="admin-customer-tx-note">{tx.note}</div>}

                                                <div className="admin-expand-sales-table-wrap" style={{ marginTop: "0.5rem" }}>
                                                  <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                                    <thead>
                                                      <tr>
                                                        <th style={{ width: "2rem", textAlign: "center" }}>#</th>
                                                        <th style={{ textAlign: "left" }}>{copy.txProduct}</th>
                                                        <th style={{ textAlign: "center" }}>{copy.txVariant}</th>
                                                        <th style={{ textAlign: "center" }}>{language === "MN" ? "Тоо" : "Qty"}</th>
                                                        <th style={{ textAlign: "center" }}>{copy.txUnitPrice}</th>
                                                        <th style={{ textAlign: "center" }}>{copy.txLineTotal}</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {sortItemsByCode(tx.items).map((it: any, idx: number) => (
                                                        <tr key={idx}>
                                                          <td style={{ textAlign: "center", color: "#8a8477", fontSize: "0.75rem" }}>{idx + 1}</td>
                                                          <td style={{ textAlign: "left" }}>{getProductLabel(it.productId, it.productName)}</td>
                                                          <td style={{ textAlign: "center" }}>{it.variant || "—"}</td>
                                                          <td style={{ textAlign: "center" }}><strong>{it.quantity}</strong></td>
                                                          <td style={{ textAlign: "center" }}>{formatStorePrice(it.unitPrice)}</td>
                                                          <td style={{ textAlign: "center" }}><strong>{formatStorePrice(it.lineTotal)}</strong></td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>

                                                <div className="admin-customer-tx-foot">
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Зарсан тоо" : "Sold qty"}</small>
                                                    <strong>{tx.items.reduce((s: number, it: any) => s + it.quantity, 0)} ш</strong>
                                                  </div>
                                                  {tx.totals.discount > 0 && (
                                                    <div className="admin-customer-tx-foot-item">
                                                      <small>{copy.txDiscount}</small>
                                                      <strong style={{ color: "#dc2626" }}>
                                                        −{formatStorePrice(tx.totals.discount)}
                                                        {tx.totals.discountType === "percent" ? ` (${tx.totals.discountValue}%)` : ""}
                                                      </strong>
                                                    </div>
                                                  )}
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Цэвэр дүн" : "Net"}</small>
                                                    <strong>{formatStorePrice(tx.totals.grandTotal)}</strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Төлсөн" : "Paid"}</small>
                                                    <strong style={{ color: tx.payment.paidAmount >= tx.totals.grandTotal ? "#2f7a4a" : "#b45309" }}>
                                                      {formatStorePrice(tx.payment.paidAmount)}
                                                    </strong>
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {/* Tab 4: Буцаалт */}
                                  {expandedCustomerTab === "returns" && (() => {
                                    const returnTxs = customerTxs.filter((tx: any) => tx.type === "return");
                                    const totalReturnedQty = returnTxs.reduce(
                                      (s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + it.quantity, 0),
                                      0,
                                    );
                                    const totalReturnedAmount = returnTxs.reduce((s: number, tx: any) => s + tx.totals.grandTotal, 0);
                                    return (
                                      <div className="admin-product-expand-section">
                                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
                                          <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem", padding: "0.35rem 0.8rem" }}
                                            onClick={() => openSellerSaleModal(customer, productAggList, customerTransferredAmount)}
                                          >
                                            <RotateCcw size={14} /> {language === "MN" ? "Борлуулалт / Буцаалт бүртгэх" : "Record sale / return"}
                                          </button>
                                        </div>
                                        <div className="admin-product-expand-stats" style={{ marginBottom: "1rem" }}>
                                          <div className="admin-expand-stat">
                                            <small>{language === "MN" ? "Буцаалтын тоо" : "Returns"}</small>
                                            <strong>{returnTxs.length}</strong>
                                          </div>
                                          <div className="admin-expand-stat">
                                            <small>{language === "MN" ? "Буцаасан тоо ширхэг" : "Returned quantity"}</small>
                                            <strong>{totalReturnedQty} ш</strong>
                                          </div>
                                          <div className="admin-expand-stat">
                                            <small>{language === "MN" ? "Буцаасан дүн" : "Returned amount"}</small>
                                            <strong>{formatStorePrice(totalReturnedAmount)}</strong>
                                          </div>
                                        </div>
                                        {returnTxs.length === 0 ? (
                                          <p className="admin-expand-empty">
                                            {language === "MN" ? "Буцаалт байхгүй" : "No returns yet"}
                                          </p>
                                        ) : (
                                          <div className="admin-customer-tx-list">
                                            {returnTxs.map((tx: any) => (
                                              <div key={tx.id} className="admin-customer-tx-card">
                                                <div className="admin-customer-tx-head">
                                                  <div className="admin-customer-tx-head-left">
                                                    <span className="admin-customer-tx-date">
                                                      {formatAdminDateTime(tx.transactionDate ?? tx.createdAt, language)}
                                                    </span>
                                                    <span className="admin-customer-tx-number">{tx.txNumber}</span>
                                                    <span className="admin-customer-tx-type admin-customer-tx-type-return">
                                                      {copy.txTypeReturn}
                                                    </span>
                                                  </div>
                                                  <div className="admin-customer-tx-head-right">
                                                    <button
                                                      type="button"
                                                      className="admin-icon-btn admin-icon-btn-neutral"
                                                      title={language === "MN" ? "Засах" : "Edit"}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openSellerTxEditModal(customer, tx, productAggList);
                                                      }}
                                                    >
                                                      <Pencil size={13} />
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="admin-icon-btn"
                                                      title={language === "MN" ? "Устгах" : "Delete"}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openConfirmModal({
                                                          title: copy.confirmDeleteTitle,
                                                          description: copy.deleteTransactionDescription,
                                                          confirmLabel: copy.delete,
                                                          destructive: true,
                                                          onConfirm: async () => {
                                                            await deleteCustomerTransaction(tx);
                                                          },
                                                        });
                                                      }}
                                                    >
                                                      <Trash2 size={13} />
                                                    </button>
                                                  </div>
                                                </div>

                                                {tx.note && <div className="admin-customer-tx-note">{tx.note}</div>}

                                                <div className="admin-expand-sales-table-wrap" style={{ marginTop: "0.5rem" }}>
                                                  <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                                    <thead>
                                                      <tr>
                                                        <th style={{ width: "2rem", textAlign: "center" }}>#</th>
                                                        <th style={{ textAlign: "left" }}>{copy.txProduct}</th>
                                                        <th style={{ textAlign: "center" }}>{copy.txVariant}</th>
                                                        <th style={{ textAlign: "center" }}>{language === "MN" ? "Тоо" : "Qty"}</th>
                                                        <th style={{ textAlign: "center" }}>{copy.txUnitPrice}</th>
                                                        <th style={{ textAlign: "center" }}>{copy.txLineTotal}</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {sortItemsByCode(tx.items).map((it: any, idx: number) => (
                                                        <tr key={idx}>
                                                          <td style={{ textAlign: "center", color: "#8a8477", fontSize: "0.75rem" }}>{idx + 1}</td>
                                                          <td style={{ textAlign: "left" }}>{getProductLabel(it.productId, it.productName)}</td>
                                                          <td style={{ textAlign: "center" }}>{it.variant || "—"}</td>
                                                          <td style={{ textAlign: "center" }}><strong>{it.quantity}</strong></td>
                                                          <td style={{ textAlign: "center" }}>{formatStorePrice(it.unitPrice)}</td>
                                                          <td style={{ textAlign: "center" }}><strong>{formatStorePrice(it.lineTotal)}</strong></td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                </div>

                                                <div className="admin-customer-tx-foot">
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Буцаасан тоо" : "Returned qty"}</small>
                                                    <strong>{tx.items.reduce((s: number, it: any) => s + it.quantity, 0)} ш</strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{copy.txGrandTotal}</small>
                                                    <strong>{formatStorePrice(tx.totals.grandTotal)}</strong>
                                                  </div>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
