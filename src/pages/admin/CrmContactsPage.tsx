/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import {
  getCrmContactDisplayName,
  matchesCrmContactSearch,
  normalizeContactPhone,
} from "../../lib/crmContacts";
import { getProductLabel } from "./adminHelpers";

export default function CrmContactsPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    crmContacts,
    crmContactsError,
    sales,
    orders,
    openCrmContactCreateModal,
    openCrmContactModal,
    handleCrmContactDeleteRequest,
    formatAdminDateTime,
    formatStorePrice,
    getSaleChannelLabel,
    getOrderStatusLabel,
    getOrderStatusClassName,
    getOrderTotalQuantity,
  } = ctx;

  const mn = language === "MN";
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "individual" | "organization">("all");
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);

  /**
   * Purchases per customer, pooling offline sales and storefront orders into one history.
   * A sale counts when it was booked against the customer, and either kind counts when it
   * merely carries their phone number — purchases made before the directory existed have
   * no link, but the phone still identifies who bought.
   */
  const purchasesByContactId = useMemo(() => {
    const grouped = new Map<string, any[]>();
    const contactIdByPhone = new Map<string, string>();

    (crmContacts as any[]).forEach((contact: any) => {
      grouped.set(contact.id, []);
      const phone = normalizeContactPhone(contact.phoneNumber);
      // First contact registered with a phone wins it, so one purchase is never counted twice.
      if (phone && !contactIdByPhone.has(phone)) {
        contactIdByPhone.set(phone, contact.id);
      }
    });

    const attach = (contactId: string | null, purchase: any) => {
      if (contactId && grouped.has(contactId)) {
        grouped.get(contactId)!.push(purchase);
      }
    };

    (sales as any[]).forEach((sale: any) => {
      attach(
        sale.customer.contactId ??
          contactIdByPhone.get(normalizeContactPhone(sale.customer.phoneNumber ?? "")) ??
          null,
        {
          key: `sale-${sale.id}`,
          number: sale.saleNumber,
          createdAt: sale.createdAt,
          channelLabel: getSaleChannelLabel(sale.channel, language),
          status: sale.status,
          items: sale.items,
          total: sale.totals.grandTotal,
        },
      );
    });

    (orders as any[]).forEach((order: any) => {
      attach(contactIdByPhone.get(normalizeContactPhone(order.customer.phoneNumber ?? "")) ?? null, {
        key: `order-${order.id}`,
        number: order.orderNumber,
        createdAt: order.createdAt,
        channelLabel: mn ? "Онлайн дэлгүүр" : "Online store",
        status: order.status,
        items: order.items,
        total: order.totals.grandTotal,
      });
    });

    grouped.forEach((purchases) =>
      purchases.sort((a: any, b: any) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))),
    );

    return grouped;
  }, [crmContacts, sales, orders, language, mn, getSaleChannelLabel]);

  const contactPurchaseSummary = (contactId: string) => {
    const purchases = purchasesByContactId.get(contactId) ?? [];

    return {
      purchases,
      revenue: purchases.reduce((sum: number, purchase: any) => sum + purchase.total, 0),
      // Sorted newest-first above, so the first row is the latest purchase.
      lastPurchaseAt: purchases[0]?.createdAt ?? null,
    };
  };

  const visibleContacts = useMemo(
    () =>
      (crmContacts as any[]).filter((contact: any) => {
        if (typeFilter !== "all" && contact.type !== typeFilter) return false;
        return matchesCrmContactSearch(contact, search);
      }),
    [crmContacts, search, typeFilter],
  );

  const filtersActive = search.trim() !== "" || typeFilter !== "all";
  const individualCount = (crmContacts as any[]).filter((contact: any) => contact.type === "individual").length;
  const organizationCount = (crmContacts as any[]).filter((contact: any) => contact.type === "organization").length;
  const activeCount = (crmContacts as any[]).filter((contact: any) => contact.status === "active").length;

  const formatAddress = (address: any) =>
    address
      ? [address.region, address.districtOrSoum, address.khorooOrBag, address.streetAddress]
          .filter(Boolean)
          .join(", ") || "—"
      : "—";

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">CRM</p>
          <h1>{copy.contactsTitle}</h1>
          <p>{copy.contactsText}</p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-primary" onClick={openCrmContactCreateModal}>
            <Plus size={16} />
            {copy.newContact}
          </button>
        </div>
      </div>

      {crmContactsError && <div className="admin-sync-error">{crmContactsError}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.totalContacts}</span>
          <strong>{crmContacts.length}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.customerTypeInd}</span>
          <strong>{individualCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.customerTypeOrg}</span>
          <strong>{organizationCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{copy.activeCustomers}</span>
          <strong>{activeCount}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-group">
          <input
            type="text"
            className="admin-search-input"
            placeholder={copy.contactSearchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="admin-filter-group">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}>
            <option value="all">{copy.customerTypeAll}</option>
            <option value="individual">{copy.customerTypeInd}</option>
            <option value="organization">{copy.customerTypeOrg}</option>
          </select>
        </div>
        <div className="admin-filter-meta">
          {filtersActive && (
            <button
              type="button"
              className="admin-filter-clear"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
              }}
            >
              <X size={14} />
              {copy.clearFilters}
            </button>
          )}
          <span className="admin-filter-count">
            {visibleContacts.length} / {crmContacts.length} {copy.showingResults}
          </span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{copy.contactsTitle}</h2>
            <p>{copy.contactsListText}</p>
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{copy.customerCode}</th>
                <th>{copy.txType}</th>
                <th>{copy.customerNameLabel}</th>
                <th>{copy.customerPhone}</th>
                <th>{copy.customerEmail}</th>
                <th>{copy.customerAddress}</th>
                <th>{copy.customerRegisteredAt}</th>
                <th>{copy.contactPurchaseCount}</th>
                <th>{copy.status}</th>
                <th style={{ width: "2.5rem" }}></th>
                <th className="admin-table-sticky-action">{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visibleContacts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="admin-table-empty">
                    {crmContacts.length === 0 ? copy.contactEmpty : copy.contactNoMatch}
                  </td>
                </tr>
              ) : (
                visibleContacts.map((contact: any) => {
                  const isExpanded = expandedContactId === contact.id;
                  const purchases = contactPurchaseSummary(contact.id);

                  return (
                  <Fragment key={contact.id}>
                  <tr
                    className={`admin-product-row-clickable ${isExpanded ? "admin-product-row-expanded" : ""}`}
                    onClick={() => setExpandedContactId(isExpanded ? null : contact.id)}
                  >
                    <td>
                      <div className="admin-table-primary">
                        <strong>{contact.code || "—"}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>
                          {contact.type === "organization" ? copy.customerTypeOrg : copy.customerTypeInd}
                        </strong>
                        {contact.type === "organization" && contact.registrationNumber && (
                          <small>
                            {mn ? "РД" : "Reg."}: {contact.registrationNumber}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>{getCrmContactDisplayName(contact) || "—"}</strong>
                        {contact.type === "organization" && contact.fullName && (
                          <small>
                            {copy.customerContactPerson}: {contact.fullName}
                          </small>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{contact.phoneNumber || "—"}</strong>
                        {contact.secondaryPhone && <small>{contact.secondaryPhone}</small>}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{contact.email || "—"}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <strong>{formatAddress(contact.address)}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatAdminDateTime(contact.createdAt, language)}</strong>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>
                          {purchases.purchases.length} {mn ? "удаа" : "×"}
                        </strong>
                        {purchases.purchases.length > 0 && <small>{formatStorePrice(purchases.revenue)}</small>}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{contact.status === "active" ? copy.active : copy.inactive}</strong>
                      </div>
                    </td>
                    <td className="admin-td-center">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                    <td className="admin-table-sticky-action">
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={(event) => {
                            event.stopPropagation();
                            openCrmContactModal(contact);
                          }}
                          aria-label={`${copy.edit} ${getCrmContactDisplayName(contact)}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCrmContactDeleteRequest(contact);
                          }}
                          aria-label={`${copy.delete} ${getCrmContactDisplayName(contact)}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="admin-product-expand-row">
                      <td colSpan={11}>
                        <div className="admin-product-expand">
                          <div className="admin-product-expand-section">
                            {purchases.purchases.length === 0 ? (
                              <p className="admin-inline-note" style={{ margin: 0 }}>
                                {copy.contactNoPurchases}
                              </p>
                            ) : (
                              <div className="admin-expand-sales-table-wrap">
                                <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                  <thead>
                                    <tr>
                                      <th style={{ width: "2rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>
                                        #
                                      </th>
                                      <th style={{ textAlign: "center" }}>{mn ? "Дугаар" : "Number"}</th>
                                      <th style={{ textAlign: "center" }}>{mn ? "Огноо" : "Date"}</th>
                                      <th style={{ textAlign: "center" }}>{mn ? "Суваг" : "Channel"}</th>
                                      <th style={{ textAlign: "center" }}>{copy.status}</th>
                                      <th style={{ textAlign: "center" }}>{mn ? "Бүтээгдэхүүн" : "Products"}</th>
                                      <th style={{ textAlign: "center" }}>{mn ? "Тоо" : "Qty"}</th>
                                      <th style={{ textAlign: "center" }}>{mn ? "Нийт дүн" : "Total"}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {purchases.purchases.map((purchase: any, purchaseIndex: number) => (
                                      <tr key={purchase.key}>
                                        <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>
                                          {purchaseIndex + 1}
                                        </td>
                                        <td style={{ textAlign: "center" }}>{purchase.number}</td>
                                        <td style={{ textAlign: "center" }}>
                                          {formatAdminDateTime(purchase.createdAt, language)}
                                        </td>
                                        <td style={{ textAlign: "center" }}>{purchase.channelLabel}</td>
                                        <td style={{ textAlign: "center" }}>
                                          <span className={getOrderStatusClassName(purchase.status)}>
                                            {getOrderStatusLabel(purchase.status, language)}
                                          </span>
                                        </td>
                                        <td style={{ textAlign: "left" }}>
                                          {purchase.items
                                            .map(
                                              (item: any) =>
                                                `${getProductLabel(item.productId, item.name)}${
                                                  item.variant ? ` (${item.variant})` : ""
                                                } × ${item.quantity}`,
                                            )
                                            .join(", ") || "—"}
                                        </td>
                                        <td style={{ textAlign: "center" }}>{getOrderTotalQuantity(purchase)}</td>
                                        <td style={{ textAlign: "center" }}>
                                          <strong>{formatStorePrice(purchase.total)}</strong>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          <div className="admin-product-expand-stats">
                            <div className="admin-expand-stat">
                              <small>{copy.contactPurchaseCount}</small>
                              <strong>{purchases.purchases.length}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{copy.contactPurchaseTotal}</small>
                              <strong>{formatStorePrice(purchases.revenue)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{copy.contactLastPurchase}</small>
                              <strong>
                                {purchases.lastPurchaseAt
                                  ? formatAdminDateTime(purchases.lastPurchaseAt, language)
                                  : "—"}
                              </strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{copy.contactAveragePurchase}</small>
                              <strong>
                                {purchases.purchases.length > 0
                                  ? formatStorePrice(Math.round(purchases.revenue / purchases.purchases.length))
                                  : "—"}
                              </strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{copy.customerPhone}</small>
                              <strong>{contact.phoneNumber || "—"}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{copy.customerNote}</small>
                              <strong>{contact.note || "—"}</strong>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
