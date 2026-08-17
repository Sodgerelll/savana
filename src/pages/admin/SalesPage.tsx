/* eslint-disable @typescript-eslint/no-explicit-any */
import { Calendar, ChevronDown, ChevronUp, Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import { getProductLabel } from "./adminHelpers";
import { isSaleSettled } from "../../lib/sales";
import { hasReturnableQuantity, returnLineKey, returnedQuantities } from "../../lib/returns";

type SalesPeriodFilter = "today" | "week" | "month";

/** Today's date as a local (not UTC) YYYY-MM-DD, suitable for an <input type="date">. */
function todayDateInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** This month as YYYY-MM, suitable for an <input type="month">. */
function currentMonthInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** The ISO-8601 week (Monday start) containing `date`, as {year, week} — the year of an ISO
 *  week is the year its Thursday falls in, which can differ from the calendar year at either
 *  end of December/January. */
function isoWeekOf(date: Date): { year: number; week: number } {
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const isoDayOfWeek = thursday.getDay() || 7; // Monday=1 .. Sunday=7
  thursday.setDate(thursday.getDate() + 4 - isoDayOfWeek);
  const yearStart = new Date(thursday.getFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: thursday.getFullYear(), week };
}

/** This week as YYYY-Www, suitable for an <input type="week">. */
function currentWeekInputValue(): string {
  const { year, week } = isoWeekOf(new Date());
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The Monday of ISO week `week` in ISO year `year`. */
function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const jan4IsoDayOfWeek = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4IsoDayOfWeek - 1));
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  return monday;
}

/** [start, end) window a sale's createdAt must fall in to count for the period — each period
 *  reads its own picker value, since "Сар" picks a month, "7 хоног" picks an ISO week, and
 *  "Өдөр" picks a single day. */
function periodRange(
  period: SalesPeriodFilter,
  selectedDate: string,
  selectedWeek: string,
  selectedMonth: string,
): { start: Date; end: Date } {
  const now = new Date();

  if (period === "today") {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const start = new Date(y || now.getFullYear(), (m || now.getMonth() + 1) - 1, d || now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  if (period === "week") {
    const match = /^(\d{4})-W(\d{2})$/.exec(selectedWeek);
    const fallback = isoWeekOf(now);
    const year = match ? Number(match[1]) : fallback.year;
    const week = match ? Number(match[2]) : fallback.week;
    const start = isoWeekMonday(year, week);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  // month
  const match = /^(\d{4})-(\d{2})$/.exec(selectedMonth);
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  return { start: new Date(year, monthIndex, 1), end: new Date(year, monthIndex + 1, 1) };
}

export default function SalesPage({ ctx }: { ctx: AdminCtx }) {
  const {
    copy,
    language,
    sales,
    salesError,
    saleChannelOptions,
    saleCustomerTypeOptions,
    openSaleModal,
    openSaleCreateModal,
    openSaleReturnModal,
    handleSaleDeleteRequest,
    formatAdminDateTime,
    formatStorePrice,
    getOrderStatusLabel,
    getOrderStatusClassName,
    getSaleChannelLabel,
    getSaleCustomerTypeLabel,
    getSaleCustomerName,
    getOrderTotalQuantity,
    crmContacts,
  } = ctx;

  const mn = language === "MN";
  // Sales booked against a directory customer show that customer's code, so it is visible
  // at a glance which rows are tied to a registered харилцагч and which were typed by hand.
  const contactCodeById = useMemo(
    () => new Map((crmContacts as any[]).map((contact: any) => [contact.id, contact.code])),
    [crmContacts],
  );
  const [periodFilter, setPeriodFilter] = useState<SalesPeriodFilter>("today");
  const [selectedDate, setSelectedDate] = useState<string>(todayDateInputValue());
  const [selectedWeek, setSelectedWeek] = useState<string>(currentWeekInputValue());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthInputValue());
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>("all");
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  // Collapsed by default on phones, where 8 stat cards eat the whole first screen — desktop
  // always shows them, this toggle only has an effect below the mobile breakpoint.
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Every stat card and the table itself scope to this — it affects everything on the page,
  // unlike the channel/customer-type filters below, which only narrow the table.
  const periodFilteredSales = useMemo(() => {
    const range = periodRange(periodFilter, selectedDate, selectedWeek, selectedMonth);
    return (sales as any[]).filter((sale: any) => {
      if (!sale.createdAt) return false;
      const createdAt = new Date(sale.createdAt);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= range.start && createdAt < range.end;
    });
  }, [sales, periodFilter, selectedDate, selectedWeek, selectedMonth]);

  const paidSalesCount = useMemo(
    () => periodFilteredSales.filter((sale: any) => sale.status !== "new").length,
    [periodFilteredSales],
  );
  const deliveredSalesCount = useMemo(
    () => periodFilteredSales.filter((sale: any) => sale.status === "delivered").length,
    [periodFilteredSales],
  );
  const individualSalesCount = useMemo(
    () => periodFilteredSales.filter((sale: any) => sale.customer.type === "individual").length,
    [periodFilteredSales],
  );
  const organizationSalesCount = useMemo(
    () => periodFilteredSales.filter((sale: any) => sale.customer.type === "organization").length,
    [periodFilteredSales],
  );
  const salesRevenueTotal = useMemo(
    () =>
      periodFilteredSales.reduce(
        (sum: number, sale: any) =>
          sale.status === "new" ? sum : sum + (Number(sale.totals?.grandTotal) || 0),
        0,
      ),
    [periodFilteredSales],
  );
  const salesPendingTotal = useMemo(
    () =>
      periodFilteredSales.reduce(
        (sum: number, sale: any) =>
          sale.status === "new" ? sum + (Number(sale.totals?.grandTotal) || 0) : sum,
        0,
      ),
    [periodFilteredSales],
  );
  const salesReturnedTotal = useMemo(
    () =>
      periodFilteredSales.reduce(
        (sum: number, sale: any) =>
          sum + (sale.returns ?? []).reduce((rSum: number, r: any) => rSum + (Number(r.totalAmount) || 0), 0),
        0,
      ),
    [periodFilteredSales],
  );
  const salesReturnedQuantity = useMemo(
    () =>
      periodFilteredSales.reduce(
        (sum: number, sale: any) =>
          sum +
          (sale.returns ?? []).reduce(
            (rSum: number, r: any) => rSum + r.items.reduce((iSum: number, it: any) => iSum + it.quantity, 0),
            0,
          ),
        0,
      ),
    [periodFilteredSales],
  );

  const visibleSales = useMemo(
    () =>
      periodFilteredSales.filter((sale: any) => {
        if (channelFilter !== "all" && sale.channel !== channelFilter) return false;
        if (customerTypeFilter !== "all" && sale.customer.type !== customerTypeFilter) return false;
        return true;
      }),
    [periodFilteredSales, channelFilter, customerTypeFilter],
  );

  const filtersActive =
    channelFilter !== "all" ||
    customerTypeFilter !== "all" ||
    periodFilter !== "today" ||
    selectedDate !== todayDateInputValue() ||
    selectedWeek !== currentWeekInputValue() ||
    selectedMonth !== currentMonthInputValue();

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{mn ? "Борлуулалт" : "Sales"}</p>
          <h1>{mn ? "Борлуулалтын бүртгэл" : "Sales register"}</h1>          
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-primary" onClick={openSaleCreateModal}>
            <Plus size={16} />
            {mn ? "Борлуулалт бүртгэх" : "Register a sale"}
          </button>
        </div>
      </div>

      {salesError && <div className="admin-sync-error">{salesError}</div>}

      <div className="admin-period-toggle">
        <Calendar size={14} className="admin-period-toggle-icon" />
        {(
          [
            { key: "today", label: mn ? "Өдөр" : "Day" },
            { key: "week", label: mn ? "7 хоног" : "7 days" },
            { key: "month", label: mn ? "Сар" : "Month" },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            className={`admin-period-toggle-btn ${periodFilter === option.key ? "admin-period-toggle-btn-active" : ""}`}
            onClick={() => setPeriodFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
        {periodFilter === "today" && (
          <input
            type="date"
            className="admin-period-toggle-date"
            value={selectedDate}
            max={todayDateInputValue()}
            onChange={(event) => setSelectedDate(event.target.value || todayDateInputValue())}
          />
        )}
        {periodFilter === "week" && (
          <input
            type="week"
            className="admin-period-toggle-date"
            value={selectedWeek}
            max={currentWeekInputValue()}
            onChange={(event) => setSelectedWeek(event.target.value || currentWeekInputValue())}
          />
        )}
        {periodFilter === "month" && (
          <input
            type="month"
            className="admin-period-toggle-date"
            value={selectedMonth}
            max={currentMonthInputValue()}
            onChange={(event) => setSelectedMonth(event.target.value || currentMonthInputValue())}
          />
        )}
      </div>

      <button
        type="button"
        className="admin-summary-toggle"
        onClick={() => setSummaryOpen((prev) => !prev)}
        aria-expanded={summaryOpen}
      >
        <span>{mn ? "Тойм үзүүлэлт" : "Summary"}</span>
        {summaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <div className={`admin-summary-grid ${summaryOpen ? "admin-summary-grid-open" : ""}`}>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Нийт борлуулалт" : "Total sales"}</span>
          <strong>{periodFilteredSales.length}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Төлбөр төлөгдсөн" : "Paid"}</span>
          <strong>{paidSalesCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Хүргэгдсэн" : "Delivered"}</span>
          <strong>{deliveredSalesCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Харилцагчийн төрөл" : "Customer type"}</span>
          <strong>{individualSalesCount + organizationSalesCount}</strong>
          <div className="admin-summary-card-breakdown">
            <span>
              {mn ? "Хувь хүн" : "Individuals"}: <b>{individualSalesCount}</b>
            </span>
            <span>
              {mn ? "Байгууллага" : "Organizations"}: <b>{organizationSalesCount}</b>
            </span>
          </div>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Төлөгдсөн" : "Paid"}</span>
          <strong>{formatStorePrice(salesRevenueTotal)}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Хүлээгдэж буй" : "Pending"}</span>
          <strong>{formatStorePrice(salesPendingTotal)}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Буцаасан дүн" : "Returned amount"}</span>
          <strong>{formatStorePrice(salesReturnedTotal)}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Буцаасан тоо ширхэг" : "Returned quantity"}</span>
          <strong>{salesReturnedQuantity}</strong>
        </div>
      </div>

      <div className="admin-filter-bar">
        <div className="admin-filter-group">
          <SlidersHorizontal size={14} className="admin-filter-group-icon" />
          <select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
            <option value="all">{mn ? "Бүх суваг" : "All channels"}</option>
            {(saleChannelOptions as any[]).map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <select value={customerTypeFilter} onChange={(event) => setCustomerTypeFilter(event.target.value)}>
            <option value="all">{mn ? "Бүх харилцагч" : "All customer types"}</option>
            {(saleCustomerTypeOptions as any[]).map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-meta">
          {filtersActive && (
            <button
              type="button"
              className="admin-filter-clear"
              onClick={() => {
                setChannelFilter("all");
                setCustomerTypeFilter("all");
                setPeriodFilter("today");
                setSelectedDate(todayDateInputValue());
                setSelectedWeek(currentWeekInputValue());
                setSelectedMonth(currentMonthInputValue());
              }}
            >
              <X size={14} />
              {mn ? "Цэвэрлэх" : "Clear"}
            </button>
          )}
          <span className="admin-filter-count">
            {visibleSales.length} / {periodFilteredSales.length} {mn ? "үр дүн" : "results"}
          </span>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{mn ? "Борлуулалт" : "Sales"}</h2>            
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{mn ? "Үүссэн хугацаа" : "Created"}</th>
                <th>{copy.status}</th>
                <th>{copy.paymentLabel}</th>
                <th>{mn ? "Нийт дүн" : "Total"}</th>
                <th style={{ width: "2.5rem" }}></th>
                <th>{copy.actions}</th>
              </tr>
            </thead>
            <tbody>
              {visibleSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    {mn ? "Борлуулалт бүртгэгдээгүй байна." : "No sales registered yet."}
                  </td>
                </tr>
              ) : (
                visibleSales.map((sale: any) => {
                  const isExpanded = expandedSaleId === sale.id;
                  const saleReturnedQty = returnedQuantities(sale.returns ?? []);
                  return (
                  <Fragment key={sale.id}>
                  <tr
                    className={`admin-product-row-clickable ${isExpanded ? "admin-product-row-expanded" : ""}`}
                    onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                  >
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatAdminDateTime(sale.createdAt, language)}</strong>                        
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <span className={getOrderStatusClassName(sale.status)}>
                          {getOrderStatusLabel(sale.status, language)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong
                          style={{
                            fontSize: "var(--fs-md)",
                            color: sale.status === "new" ? "#c2760c" : "#2f7a4a",
                          }}
                        >
                          {sale.status === "new"
                            ? mn ? "Хүлээгдэж буй" : "Pending"
                            : mn ? "Төлөгдсөн" : "Paid"}
                        </strong>
                        <small>
                          {sale.paymentMethod === "cash"
                            ? mn ? "Бэлэн мөнгө" : "Cash"
                            : sale.paymentMethod === "bank_transfer"
                            ? mn ? "Банкны шилжүүлэг" : "Bank transfer"
                            : "Bonum"}
                        </small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{formatStorePrice(sale.totals.grandTotal)}</strong>
                        {sale.totals.discountTotal > 0 && (
                          <small>
                            {mn ? "Хямдрал" : "Discount"}: −{formatStorePrice(sale.totals.discountTotal)}
                          </small>
                        )}
                        {(sale.totals.vatAmount ?? 0) > 0 && (
                          <small>
                            {mn ? "НӨАТ" : "VAT"}: {formatStorePrice(sale.totals.vatAmount)}
                          </small>
                        )}
                      </div>
                    </td>
                    <td className="admin-td-center">
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button
                          type="button"
                          className="admin-icon-btn admin-icon-btn-neutral"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSaleModal(sale);
                          }}
                          aria-label={`${copy.edit} ${sale.saleNumber}`}
                        >
                          <Pencil size={15} />
                        </button>
                        {isSaleSettled(sale.status) && hasReturnableQuantity(sale.items, sale.returns ?? []) && (
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            onClick={(event) => {
                              event.stopPropagation();
                              openSaleReturnModal(sale);
                            }}
                            aria-label={`${mn ? "Буцаалт" : "Return"} ${sale.saleNumber}`}
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-icon-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleSaleDeleteRequest(sale);
                          }}
                          aria-label={`${copy.delete} ${sale.saleNumber}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="admin-product-expand-row">
                      <td colSpan={6}>
                        <div className="admin-product-expand">
                          <div className="admin-product-expand-stats">
                            <div className="admin-expand-stat">
                              <small>{mn ? "Борлуулалт" : "Sale"}</small>
                              <strong>{sale.saleNumber}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Суваг" : "Channel"}</small>
                              <strong>{getSaleChannelLabel(sale.channel, language)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Харилцагчийн төрөл" : "Customer type"}</small>
                              <strong>{getSaleCustomerTypeLabel(sale.customer.type, language)}</strong>
                              {sale.customer.type === "organization" && sale.customer.registrationNumber && (
                                <small>
                                  {mn ? "РД" : "Reg."}: {sale.customer.registrationNumber}
                                </small>
                              )}
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Бараа" : "Items"}</small>
                              <strong>
                                {mn
                                  ? `${sale.items.length} нэр төрөл`
                                  : `${sale.items.length} ${sale.items.length === 1 ? "product" : "products"}`}
                              </strong>
                              <small>
                                {mn
                                  ? `Нийт ${getOrderTotalQuantity(sale)} ширхэг`
                                  : `Total ${getOrderTotalQuantity(sale)} pcs`}
                              </small>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Харилцагч" : "Customer"}</small>
                              <strong>{getSaleCustomerName(sale) || "-"}</strong>
                              {sale.customer.type === "organization" && sale.customer.fullName && (
                                <small>{sale.customer.fullName}</small>
                              )}
                              {contactCodeById.get(sale.customer.contactId) && (
                                <small>{contactCodeById.get(sale.customer.contactId)}</small>
                              )}
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Утас" : "Phone"}</small>
                              <strong>{sale.customer.phoneNumber || "-"}</strong>
                            </div>
                          </div>

                          <div className="admin-product-expand-section">
                            <div className="admin-expand-sales-table-wrap">
                              <table className="admin-expand-sales-table" style={{ textAlign: "center" }}>
                                <thead>
                                  <tr>
                                    <th style={{ width: "2rem", textAlign: "center", color: "#aaa", fontWeight: 500 }}>
                                      #
                                    </th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Бүтээгдэхүүн" : "Product"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Ангилал" : "Category"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Хэмжээ" : "Variant"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Тоо" : "Qty"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Нэгж үнэ" : "Unit price"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Хямдрал" : "Discount"}</th>
                                    <th style={{ textAlign: "center" }}>{mn ? "Нийт" : "Total"}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sale.items.map((item: any, itemIndex: number) => {
                                    const listPrice = item.originalUnitPrice ?? item.unitPrice;
                                    const lineDiscount = Math.max(0, listPrice - item.unitPrice) * item.quantity;
                                    return (
                                      <tr key={`${sale.id}-${item.productId}-${item.variant ?? "default"}-${itemIndex}`}>
                                        <td style={{ textAlign: "center", color: "#aaa", fontSize: "0.78rem" }}>
                                          {itemIndex + 1}
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                          {getProductLabel(item.productId, item.name)}
                                        </td>
                                        <td style={{ textAlign: "center" }}>{item.category || "—"}</td>
                                        <td style={{ textAlign: "center" }}>{item.variant || "—"}</td>
                                        <td style={{ textAlign: "center" }}>
                                          {item.quantity}
                                          {(() => {
                                            const returnedQty = saleReturnedQty.get(returnLineKey(item.productId, item.variant)) ?? 0;
                                            return returnedQty > 0 ? (
                                              <div style={{ color: "#8f3321", fontSize: "0.72rem" }}>
                                                {mn ? "Буцаасан" : "Returned"}: {returnedQty}
                                              </div>
                                            ) : null;
                                          })()}
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                          {lineDiscount > 0 ? (
                                            <div
                                              style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 2,
                                              }}
                                            >
                                              <s style={{ color: "#9ca3af", fontSize: "0.78rem" }}>
                                                {formatStorePrice(listPrice)}
                                              </s>
                                              <span style={{ color: "#dc2626" }}>{formatStorePrice(item.unitPrice)}</span>
                                            </div>
                                          ) : (
                                            formatStorePrice(item.unitPrice)
                                          )}
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                          {lineDiscount > 0 ? (
                                            <span style={{ color: "#dc2626" }}>−{formatStorePrice(lineDiscount)}</span>
                                          ) : (
                                            "—"
                                          )}
                                        </td>
                                        <td style={{ textAlign: "center" }}>
                                          <strong>{formatStorePrice(item.lineTotal)}</strong>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr>
                                    <td></td>
                                    <td colSpan={3} style={{ textAlign: "center" }}>
                                      <strong>{mn ? "Нийт" : "Total"}</strong>
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                      <strong>{getOrderTotalQuantity(sale)}</strong>
                                    </td>
                                    <td></td>
                                    <td style={{ textAlign: "center" }}>
                                      {sale.totals.discountTotal > 0 ? (
                                        <strong style={{ color: "#dc2626" }}>
                                          −{formatStorePrice(sale.totals.discountTotal)}
                                        </strong>
                                      ) : (
                                        ""
                                      )}
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                      <strong>{formatStorePrice(sale.totals.subtotal)}</strong>
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          </div>

                          <div className="admin-product-expand-stats">
                            <div className="admin-expand-stat">
                              <small>{mn ? "Барааны дүн" : "Subtotal"}</small>
                              <strong>{formatStorePrice(sale.totals.subtotal)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>
                                {mn ? "НӨАТ (10%)" : "VAT (10%)"}
                                {sale.totals.vatMode === "included"
                                  ? mn ? " · үнэд багтсан" : " · included"
                                  : sale.totals.vatMode === "added"
                                    ? mn ? " · нэмэгдсэн" : " · added"
                                    : ""}
                              </small>
                              <strong>{formatStorePrice(sale.totals.vatAmount ?? 0)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Хүргэлтийн үнэ" : "Shipping fee"}</small>
                              <strong>{formatStorePrice(sale.totals.shippingFee)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Нийт дүн" : "Grand total"}</small>
                              <strong>{formatStorePrice(sale.totals.grandTotal)}</strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Хаяг" : "Address"}</small>
                              <strong>
                                {[
                                  sale.address.region,
                                  sale.address.districtOrSoum,
                                  sale.address.khorooOrBag,
                                  sale.address.streetAddress,
                                  sale.address.additionalAddress,
                                ]
                                  .filter(Boolean)
                                  .join(", ") || "—"}
                              </strong>
                            </div>
                            <div className="admin-expand-stat">
                              <small>{mn ? "Тэмдэглэл" : "Note"}</small>
                              <strong>{sale.customer.note || "—"}</strong>
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
