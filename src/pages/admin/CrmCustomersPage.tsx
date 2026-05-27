/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowLeftRight, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import React from "react";
import { StatusBadge } from "./StatusBadge";
import type { AdminCtx } from "./adminShellTypes";

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
    formatAdminDateTime,
    formatStorePrice,
    setTransactionError,
    setTransactionModal,
    setCustomerError,
    setCustomerModal,
    openConfirmModal,
    deleteCustomer,
    deleteCustomerTransaction,
    getNextCustomerCode,
    createEmptyCustomerDraft,
    createEmptyTransactionDraft,
  } = ctx;

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

      <div className="admin-summary-grid admin-summary-grid-sm" style={{ marginBottom: "1.5rem" }}>
        <div className="admin-summary-card">
          <span>{copy.totalCustomers}</span>
          <strong>{customers.length}</strong>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.35rem", fontSize: "0.78rem", color: "var(--color-text-secondary, #6b7280)" }}>
            <span>{copy.customerTypeOrg}: <b style={{ color: "var(--color-text, inherit)" }}>{customers.filter((c: any) => c.type === "organization").length}</b></span>
            <span>{copy.customerTypeInd}: <b style={{ color: "var(--color-text, inherit)" }}>{customers.filter((c: any) => c.type === "individual").length}</b></span>
          </div>
        </div>
        <div className="admin-summary-card">
          <span>{copy.activeCustomers}</span>
          <strong>{customers.filter((c: any) => c.status === "active").length}</strong>
        </div>
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
          <span>{copy.totalTransfers}</span>
          <strong>{customerTransactions.length}</strong>
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
                  <th style={{ textAlign: "center" }}>{copy.customerNameLabel}</th>
                  <th style={{ textAlign: "center" }}>{copy.txType}</th>
                  <th style={{ textAlign: "center" }}>{copy.customerPhone}</th>
                  <th style={{ textAlign: "center" }}>{copy.customerAddress}</th>
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
                        <td colSpan={9} className="admin-table-empty">
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
                          <td style={{ textAlign: "center" }}>
                            <div className="admin-table-primary">
                              <strong>{customer.name}</strong>
                            </div>
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {customer.type === "organization"
                              ? copy.customerTypeOrg
                              : copy.customerTypeInd}
                          </td>
                          <td style={{ textAlign: "center" }}>{customer.phoneNumber || "-"}</td>
                          <td style={{ textAlign: "center" }}>
                            <div className="admin-table-cell-wrap">
                              {addressText || "-"}
                            </div>
                          </td>
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
                          const productAgg = new Map<string, {
                            productId: number;
                            productName: string;
                            variant: string | null;
                            transferred: number;
                            sold: number;
                            totalAmount: number;
                          }>();
                          customerTxs.forEach((tx: any) => {
                            tx.items.forEach((it: any) => {
                              const key = `${it.productId}::${it.variant ?? ""}`;
                              const existing = productAgg.get(key);
                              if (existing) {
                                existing.transferred += it.quantity;
                                existing.sold += it.soldQuantity;
                                existing.totalAmount += it.lineTotal;
                              } else {
                                productAgg.set(key, {
                                  productId: it.productId,
                                  productName: it.productName,
                                  variant: it.variant,
                                  transferred: it.quantity,
                                  sold: it.soldQuantity,
                                  totalAmount: it.lineTotal,
                                });
                              }
                            });
                          });
                          const productAggList = Array.from(productAgg.values()).sort(
                            (a, b) => b.totalAmount - a.totalAmount,
                          );
                          return (
                            <tr className="admin-product-expand-row">
                              <td colSpan={9}>
                                <div className="admin-product-expand">
                                  <div className="admin-product-expand-stats">
                                    <div className="admin-expand-stat">
                                      <small>{copy.customerTotalSales}</small>
                                      <strong>{formatStorePrice(customer.totalSales)}</strong>
                                    </div>
                                    <div className="admin-expand-stat">
                                      <small>{copy.customerTotalPaid}</small>
                                      <strong>{formatStorePrice(customer.totalPaid)}</strong>
                                    </div>
                                    <div className="admin-expand-stat">
                                      <small>{copy.customerOutstanding}</small>
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
                                    </div>
                                    <div className="admin-expand-stat">
                                      <small>
                                        {language === "MN" ? "Шилжүүлгийн тоо" : "Transactions"}
                                      </small>
                                      <strong>{customerTxs.length}</strong>
                                    </div>
                                    <div className="admin-expand-stat">
                                      <small>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</small>
                                      <strong>{customerTxs.reduce((s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + it.quantity, 0), 0)} ш</strong>
                                    </div>
                                    <div className="admin-expand-stat">
                                      <small>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</small>
                                      <strong style={{ color: customerTxs.reduce((s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + (it.quantity - it.soldQuantity), 0), 0) > 0 ? "#b14141" : "#2f7a4a" }}>
                                        {customerTxs.reduce((s: number, tx: any) => s + tx.items.reduce((si: number, it: any) => si + (it.quantity - it.soldQuantity), 0), 0)} ш
                                      </strong>
                                    </div>
                                    <div className="admin-expand-stat">
                                      <small>
                                        {language === "MN" ? "Шинэчлэгдсэн" : "Last updated"}
                                      </small>
                                      <strong style={{ fontSize: "var(--fs-sm, 0.78rem)" }}>
                                        {formatAdminDateTime(customer.updatedAt, language)}
                                      </strong>
                                    </div>
                                  </div>

                                  {/* Tab navigation */}
                                  <div style={{ display: "flex", gap: "2px", background: "#f3f4f6", padding: "4px", borderRadius: "10px", width: "fit-content", marginBottom: "1rem" }}>
                                    {([
                                      { key: "products", label: language === "MN" ? "Бүтээгдэхүүнээр" : "Products" },
                                      { key: "history",  label: language === "MN" ? "Шилжүүлгээр" : "Transaction history" },
                                    ] as const).map((tab) => (
                                      <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setExpandedCustomerTab(tab.key)}
                                        style={{
                                          padding: "6px 14px",
                                          fontSize: "0.8rem",
                                          fontWeight: expandedCustomerTab === tab.key ? 600 : 400,
                                          background: expandedCustomerTab === tab.key ? "#fff" : "transparent",
                                          color: expandedCustomerTab === tab.key ? "#111827" : "#6b7280",
                                          border: "none",
                                          borderRadius: "7px",
                                          cursor: "pointer",
                                          boxShadow: expandedCustomerTab === tab.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                          transition: "all 0.15s",
                                        }}
                                      >
                                        {tab.label}
                                      </button>
                                    ))}
                                  </div>

                                  {/* Tab 2: Гүйлгээний түүх */}
                                  {expandedCustomerTab === "history" && (
                                    <div className="admin-product-expand-section">
                                      {customerTxs.length === 0 ? (
                                        <p className="admin-expand-empty">
                                          {language === "MN" ? "Гүйлгээ байхгүй" : "No transactions yet"}
                                        </p>
                                      ) : (
                                        <div className="admin-customer-tx-list">
                                          {customerTxs.map((tx: any) => {
                                            const outstanding = tx.totals.grandTotal - tx.payment.paidAmount;
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
                                                    <span className={`admin-customer-tx-type admin-customer-tx-type-${tx.type}`}>
                                                      {tx.type === "delivery"
                                                        ? copy.txTypeDelivery
                                                        : tx.type === "return"
                                                          ? copy.txTypeReturn
                                                          : copy.txTypeSale}
                                                    </span>
                                                  </div>
                                                  <div className="admin-customer-tx-head-right">
                                                    {tx.updatedAt && (
                                                      <span style={{ fontSize: "0.72rem", color: "#8a8477", marginRight: "0.5rem" }}>
                                                        {formatAdminDateTime(tx.updatedAt, language)}
                                                      </span>
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
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{copy.txPaidAmount}</small>
                                                    <strong>{formatStorePrice(tx.payment.paidAmount)}</strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{language === "MN" ? "Үлдэгдэл" : "Tx outstanding"}</small>
                                                    <strong style={{ color: outstanding > 0 ? "#b14141" : "#3a3630" }}>
                                                      {formatStorePrice(outstanding)}
                                                    </strong>
                                                  </div>
                                                  <div className="admin-customer-tx-foot-item">
                                                    <small>{copy.txPaymentStatus}</small>
                                                    <span className={`admin-expand-order-status admin-expand-order-${tx.payment.status === "paid" ? "paid" : tx.payment.status === "partial" ? "delivering" : "new"}`}>
                                                      {tx.payment.status === "paid"
                                                        ? copy.txPaymentPaid
                                                        : tx.payment.status === "partial"
                                                          ? copy.txPaymentPartial
                                                          : copy.txPaymentUnpaid}
                                                    </span>
                                                  </div>
                                                </div>

                                                {tx.note && (
                                                  <div className="admin-customer-tx-note">{tx.note}</div>
                                                )}

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
                                                            <th style={{ textAlign: "center" }}>{copy.txProduct}</th>
                                                            <th style={{ textAlign: "center" }}>{copy.txVariant}</th>
                                                            <th style={{ textAlign: "center" }}>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</th>
                                                            <th style={{ textAlign: "center" }}>{language === "MN" ? "Зарсан" : "Sold"}</th>
                                                            <th style={{ textAlign: "center" }}>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</th>
                                                            <th style={{ textAlign: "center" }}>{copy.txUnitPrice}</th>
                                                            <th style={{ textAlign: "center" }}>{copy.txLineTotal}</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {tx.items.map((it: any, idx: number) => (
                                                            <tr key={idx}>
                                                              <td style={{ textAlign: "center", color: "#8a8477", fontSize: "0.75rem" }}>{idx + 1}</td>
                                                              <td style={{ textAlign: "center" }}>{it.productName}</td>
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
                                  )}

                                  {/* Tab 1: Бүтээгдэхүүний нийт шилжүүлэг */}
                                  {expandedCustomerTab === "products" && (
                                    <div className="admin-product-expand-section">
                                      {productAggList.length === 0 ? (
                                        <p className="admin-expand-empty">
                                          {language === "MN" ? "Шилжүүлэг байхгүй" : "No transfers yet"}
                                        </p>
                                      ) : (
                                        <div className="admin-expand-sales-table-wrap">
                                          <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                            <thead>
                                              <tr>
                                                <th style={{ width: "2rem", textAlign: "center" }}>#</th>
                                                <th style={{ textAlign: "center" }}>{copy.txProduct}</th>
                                                <th style={{ textAlign: "center" }}>{copy.txVariant}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Шилжүүлсэн" : "Transferred"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Зарсан" : "Sold"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Үлдэгдэл" : "Remaining"}</th>
                                                <th style={{ textAlign: "center" }}>{language === "MN" ? "Нийт дүн" : "Total amount"}</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {productAggList.map((p, idx) => (
                                                <tr key={`${p.productId}-${p.variant ?? ""}`}>
                                                  <td style={{ textAlign: "center", color: "#8a8477", fontSize: "0.75rem" }}>{idx + 1}</td>
                                                  <td style={{ textAlign: "center" }}>{p.productName}</td>
                                                  <td style={{ textAlign: "center" }}>{p.variant || "—"}</td>
                                                  <td style={{ textAlign: "center" }}><strong>{p.transferred}</strong></td>
                                                  <td style={{ textAlign: "center" }}>{p.sold}</td>
                                                  <td style={{ textAlign: "center" }}>
                                                    <strong style={{ color: p.transferred - p.sold > 0 ? "#b14141" : "#2f7a4a" }}>
                                                      {p.transferred - p.sold}
                                                    </strong>
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
                                                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                                  <strong style={{ color: productAggList.reduce((s, p) => s + (p.transferred - p.sold), 0) > 0 ? "#b14141" : "#2f7a4a" }}>
                                                    {productAggList.reduce((s, p) => s + (p.transferred - p.sold), 0)}
                                                  </strong>
                                                </td>
                                                <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                                  <strong style={{ color: "#3a3630" }}>
                                                    {formatStorePrice(productAggList.reduce((s, p) => s + p.totalAmount, 0))}
                                                  </strong>
                                                </td>
                                              </tr>
                                            </tfoot>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  )}
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
