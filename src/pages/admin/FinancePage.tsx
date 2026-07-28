/* eslint-disable @typescript-eslint/no-explicit-any */
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, Pause, Pencil, Play, Plus, Repeat, Trash2, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import { AdminModal } from "./AdminModal";
import type { FinanceEntryRecord, FinanceEntryType } from "../../lib/financeEntries";
import type { FinanceRecurringRecord, RecurringFrequency } from "../../lib/financeRecurring";
import { deriveAutoFinanceEntries, type AutoFinanceEntry } from "../../lib/accounting/autoFinanceEntries";
import { computeDiscountStats } from "../../lib/discountStats";

/** Manual financeEntries record or a display-only row derived from the journal. */
type LedgerRow = (FinanceEntryRecord & { auto?: undefined }) | AutoFinanceEntry;

interface EntryModalState {
  mode: "create" | "edit";
  id: string | null;
  type: FinanceEntryType;
  amount: string;
  category: string;
  note: string;
  date: string;
}

interface RecurringFormState {
  id: string | null;
  type: FinanceEntryType;
  amount: string;
  category: string;
  note: string;
  frequency: RecurringFrequency;
  startDate: string;
}

const INCOME_CATEGORIES_MN = ["Борлуулалт", "Вэб захиалга", "Бөөний борлуулалт", "Бусад орлого"];
const EXPENSE_CATEGORIES_MN = ["Түүхий эд", "Цалин", "Түрээс", "Тээвэр", "Маркетинг", "Сав баглаа", "Бусад зарлага"];
const INCOME_CATEGORIES_EN = ["Sales", "Web orders", "Wholesale", "Other income"];
const EXPENSE_CATEGORIES_EN = ["Raw materials", "Salary", "Rent", "Logistics", "Marketing", "Packaging", "Other expense"];

const MONTH_NAMES_MN = [
  "1-р сар", "2-р сар", "3-р сар", "4-р сар", "5-р сар", "6-р сар",
  "7-р сар", "8-р сар", "9-р сар", "10-р сар", "11-р сар", "12-р сар",
];
const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_MN = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"];
const WEEKDAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayKey(): string {
  const now = new Date();
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

export default function FinancePage({ ctx }: { ctx: AdminCtx }) {
  const {
    financeEntries,
    financeEntriesError,
    financeRecurring,
    journalEntries,
    orders,
    directSales,
    customerTransactions,
    language,
    formatStorePrice,
    createFinanceEntry,
    updateFinanceEntry,
    deleteFinanceEntry,
    createFinanceRecurring,
    updateFinanceRecurring,
    deleteFinanceRecurring,
    openConfirmModal,
    user,
  } = ctx;

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [entryTypeFilter, setEntryTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [entryModal, setEntryModal] = useState<EntryModalState | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [recurringListOpen, setRecurringListOpen] = useState(false);
  const [recurringForm, setRecurringForm] = useState<RecurringFormState | null>(null);
  const [recurringSaving, setRecurringSaving] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);

  const mn = language === "MN";
  const monthNames = mn ? MONTH_NAMES_MN : MONTH_NAMES_EN;
  const weekdays = mn ? WEEKDAYS_MN : WEEKDAYS_EN;
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  // Automated rows posted by the double-entry journal (online orders, wholesale
  // transfers, direct/POS sales) merged with manually recorded entries.
  const autoEntries = useMemo(
    () => deriveAutoFinanceEntries((journalEntries ?? []) as any[]),
    [journalEntries],
  );

  const allEntries = useMemo<LedgerRow[]>(
    () => [...(financeEntries as FinanceEntryRecord[]), ...autoEntries],
    [financeEntries, autoEntries],
  );

  const monthEntries = useMemo(
    () => allEntries.filter((e) => e.date.startsWith(monthPrefix)),
    [allEntries, monthPrefix],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; count: number }>();
    for (const entry of monthEntries) {
      const bucket = map.get(entry.date) ?? { income: 0, expense: 0, count: 0 };
      if (entry.type === "income") bucket.income += entry.amount;
      else bucket.expense += entry.amount;
      bucket.count += 1;
      map.set(entry.date, bucket);
    }
    return map;
  }, [monthEntries]);

  const monthIncome = useMemo(
    () => monthEntries.reduce((sum, e) => (e.type === "income" ? sum + e.amount : sum), 0),
    [monthEntries],
  );
  const monthExpense = useMemo(
    () => monthEntries.reduce((sum, e) => (e.type === "expense" ? sum + e.amount : sum), 0),
    [monthEntries],
  );
  const monthBalance = monthIncome - monthExpense;

  // Discounts given this month across online orders, direct sales & seller transfers.
  const monthDiscounts = useMemo(
    () => computeDiscountStats({ orders, directSales, customerTransactions }, monthPrefix),
    [orders, directSales, customerTransactions, monthPrefix],
  );

  const tableEntries = useMemo(() => {
    let list = selectedDay ? monthEntries.filter((e) => e.date === selectedDay) : monthEntries;
    if (entryTypeFilter !== "all") {
      list = list.filter((e) => e.type === entryTypeFilter);
    }
    return [...list].sort((a, b) =>
      a.date === b.date
        ? String((b as any).createdAt ?? "").localeCompare(String((a as any).createdAt ?? ""))
        : b.date.localeCompare(a.date),
    );
  }, [monthEntries, selectedDay, entryTypeFilter]);

  // Calendar layout: leading blanks so the 1st lands on its weekday (Monday-first).
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const calendarCells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const goToMonth = (offset: number) => {
    const next = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setSelectedDay(null);
  };

  const openCreate = (date?: string) => {
    setEntryModal({
      mode: "create",
      id: null,
      type: "income",
      amount: "",
      category: "",
      note: "",
      date: date ?? (selectedDay ?? todayKey()),
    });
    setModalError(null);
  };

  const openEdit = (entry: FinanceEntryRecord) => {
    setEntryModal({
      mode: "edit",
      id: entry.id,
      type: entry.type,
      amount: String(entry.amount),
      category: entry.category,
      note: entry.note,
      date: entry.date,
    });
    setModalError(null);
  };

  const handleSave = async () => {
    if (!entryModal) return;
    const amount = Number(entryModal.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setModalError(mn ? "Дүн 0-ээс их байх ёстой." : "Amount must be greater than 0.");
      return;
    }
    if (!entryModal.date) {
      setModalError(mn ? "Огноо сонгоно уу." : "Please select a date.");
      return;
    }
    setModalSaving(true);
    setModalError(null);
    try {
      const payload = {
        type: entryModal.type,
        amount,
        category: entryModal.category.trim(),
        note: entryModal.note.trim(),
        date: entryModal.date,
      };
      if (entryModal.mode === "create") {
        await createFinanceEntry({ ...payload, createdByUid: user?.uid ?? "" });
      } else if (entryModal.id) {
        await updateFinanceEntry(entryModal.id, payload);
      }
      setEntryModal(null);
    } catch (err: any) {
      setModalError(err?.message ?? (mn ? "Алдаа гарлаа." : "An error occurred."));
    } finally {
      setModalSaving(false);
    }
  };

  const handleDelete = (entry: FinanceEntryRecord) => {
    openConfirmModal({
      title: mn ? "Бүртгэл устгах уу?" : "Delete entry?",
      description: mn
        ? `${entry.date} өдрийн ${formatStorePrice(entry.amount)} дүнтэй ${entry.type === "income" ? "орлогын" : "зарлагын"} бүртгэлийг устгах уу?`
        : `Delete the ${entry.type} entry of ${formatStorePrice(entry.amount)} on ${entry.date}?`,
      confirmLabel: mn ? "Устгах" : "Delete",
      destructive: true,
      onConfirm: () => deleteFinanceEntry(entry.id),
    });
  };

  const categorySuggestions = entryModal?.type === "expense"
    ? (mn ? EXPENSE_CATEGORIES_MN : EXPENSE_CATEGORIES_EN)
    : (mn ? INCOME_CATEGORIES_MN : INCOME_CATEGORIES_EN);

  const today = todayKey();

  // ── Recurring rules ──

  const frequencyLabel = (frequency: RecurringFrequency) => {
    if (frequency === "weekly") return mn ? "7 хоног бүр" : "Weekly";
    if (frequency === "yearly") return mn ? "Жил бүр" : "Yearly";
    return mn ? "Сар бүр" : "Monthly";
  };

  const openRecurringCreate = () => {
    setRecurringForm({
      id: null,
      type: "expense",
      amount: "",
      category: "",
      note: "",
      frequency: "monthly",
      startDate: today,
    });
    setRecurringError(null);
  };

  const openRecurringEdit = (rule: FinanceRecurringRecord) => {
    setRecurringForm({
      id: rule.id,
      type: rule.type,
      amount: String(rule.amount),
      category: rule.category,
      note: rule.note,
      frequency: rule.frequency,
      startDate: rule.startDate,
    });
    setRecurringError(null);
  };

  const handleRecurringSave = async () => {
    if (!recurringForm) return;
    const amount = Number(recurringForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRecurringError(mn ? "Дүн 0-ээс их байх ёстой." : "Amount must be greater than 0.");
      return;
    }
    if (!recurringForm.startDate) {
      setRecurringError(mn ? "Эхлэх огноо сонгоно уу." : "Please select a start date.");
      return;
    }
    setRecurringSaving(true);
    setRecurringError(null);
    try {
      const payload = {
        type: recurringForm.type,
        amount,
        category: recurringForm.category.trim(),
        note: recurringForm.note.trim(),
        frequency: recurringForm.frequency,
        startDate: recurringForm.startDate,
      };
      if (recurringForm.id === null) {
        await createFinanceRecurring({ ...payload, createdByUid: user?.uid ?? "" });
      } else {
        await updateFinanceRecurring(recurringForm.id, payload);
      }
      setRecurringForm(null);
    } catch (err: any) {
      setRecurringError(err?.message ?? (mn ? "Алдаа гарлаа." : "An error occurred."));
    } finally {
      setRecurringSaving(false);
    }
  };

  const handleRecurringDelete = (rule: FinanceRecurringRecord) => {
    setRecurringListOpen(false);
    openConfirmModal({
      title: mn ? "Тогтмол гүйлгээ устгах уу?" : "Delete recurring rule?",
      description: mn
        ? `"${rule.category || frequencyLabel(rule.frequency)}" (${formatStorePrice(rule.amount)}, ${frequencyLabel(rule.frequency).toLowerCase()}) дүрмийг устгах уу? Өмнө үүссэн гүйлгээнүүд хадгалагдана.`
        : `Delete the "${rule.category || frequencyLabel(rule.frequency)}" rule (${formatStorePrice(rule.amount)}, ${frequencyLabel(rule.frequency).toLowerCase()})? Already-generated entries are kept.`,
      confirmLabel: mn ? "Устгах" : "Delete",
      destructive: true,
      onConfirm: () => deleteFinanceRecurring(rule.id),
    });
  };

  const recurringRules = (financeRecurring ?? []) as FinanceRecurringRecord[];

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">Finance</p>
          <h1>{mn ? "Орлого, зарлагын бүртгэл" : "Income & expense ledger"}</h1>
          <p>
            {mn
              ? "Сар бүрийн орлого, зарлагыг өдрөөр бүртгэж, балансыг хянана. Онлайн захиалга, шилжүүлэг, шууд борлуулалт журналаас автоматаар (⚡) нэмэгдэнэ."
              : "Record monthly income and expenses by day and monitor the balance. Online orders, transfers, and direct sales flow in automatically (⚡) from the journal."}
          </p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className="btn btn-outline" onClick={() => setRecurringListOpen(true)}>
            <Repeat size={16} />
            {mn ? "Тогтмол гүйлгээ" : "Recurring"}
            {recurringRules.length > 0 && ` (${recurringRules.length})`}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={16} />
            {mn ? "Бүртгэл нэмэх" : "Add entry"}
          </button>
        </div>
      </div>

      {financeEntriesError && (
        <div className="admin-section-card">
          <p style={{ color: "#b3261e" }}>{financeEntriesError}</p>
        </div>
      )}

      <div className="admin-summary-grid">
        <div className="admin-summary-card">
          <span>{mn ? "Сарын орлого" : "Monthly income"}</span>
          <strong className="finance-amount-income">{formatStorePrice(monthIncome)}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{mn ? "Сарын зарлага" : "Monthly expense"}</span>
          <strong className="finance-amount-expense">{formatStorePrice(monthExpense)}</strong>
        </div>
        <div className="admin-summary-card">
          <span>{mn ? "Сарын баланс" : "Monthly balance"}</span>
          <strong className={monthBalance >= 0 ? "finance-amount-income" : "finance-amount-expense"}>
            {formatStorePrice(monthBalance)}
          </strong>
        </div>
        <div className="admin-summary-card">
          <span>{mn ? "Сарын хямдрал" : "Monthly discounts"}</span>
          <strong className={monthDiscounts.total.amount > 0 ? "finance-amount-expense" : ""}>
            {monthDiscounts.total.amount > 0
              ? `−${formatStorePrice(monthDiscounts.total.amount)}`
              : formatStorePrice(0)}
          </strong>
          {monthDiscounts.total.count > 0 && (
            <small style={{ color: "#888" }}>
              {monthDiscounts.total.count} {mn ? "хямдралтай борлуулалт" : "discounted sales"}
            </small>
          )}
        </div>
        <div className="admin-summary-card">
          <span>{mn ? "Бүртгэлийн тоо" : "Entries"}</span>
          <strong>{monthEntries.length}</strong>
        </div>
      </div>

      <div className="admin-section-card">
        <div className="finance-calendar-head">
          <button type="button" className="admin-icon-btn admin-icon-btn-neutral" onClick={() => goToMonth(-1)} title={mn ? "Өмнөх сар" : "Previous month"}>
            <ChevronLeft size={16} />
          </button>
          <h2>
            {viewYear} {mn ? "он" : ""} · {monthNames[viewMonth]}
          </h2>
          <button type="button" className="admin-icon-btn admin-icon-btn-neutral" onClick={() => goToMonth(1)} title={mn ? "Дараах сар" : "Next month"}>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="finance-calendar">
          {weekdays.map((day) => (
            <div key={day} className="finance-calendar-weekday">
              {day}
            </div>
          ))}
          {calendarCells.map((day, index) => {
            if (day === null) {
              return <div key={`blank-${index}`} className="finance-calendar-cell finance-calendar-cell-empty" />;
            }
            const dateKey = toDateKey(viewYear, viewMonth, day);
            const stats = byDay.get(dateKey);
            const balance = stats ? stats.income - stats.expense : 0;
            const cellClasses = [
              "finance-calendar-cell",
              dateKey === today ? "finance-calendar-cell-today" : "",
              selectedDay === dateKey ? "finance-calendar-cell-selected" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={dateKey}
                type="button"
                className={cellClasses}
                onClick={() => setSelectedDay((prev) => (prev === dateKey ? null : dateKey))}
                onDoubleClick={() => openCreate(dateKey)}
              >
                <span className="finance-calendar-daynum">{day}</span>
                {stats ? (
                  <span className="finance-calendar-figures">
                    {stats.income > 0 && (
                      <span className="finance-amount-income">+{formatStorePrice(stats.income)}</span>
                    )}
                    {stats.expense > 0 && (
                      <span className="finance-amount-expense">−{formatStorePrice(stats.expense)}</span>
                    )}
                    <span className={`finance-calendar-balance ${balance >= 0 ? "finance-amount-income" : "finance-amount-expense"}`}>
                      = {formatStorePrice(balance)}
                    </span>
                  </span>
                ) : (
                  <span className="finance-calendar-figures finance-calendar-figures-empty">—</span>
                )}
              </button>
            );
          })}
        </div>
        <p className="finance-calendar-hint">
          {mn
            ? "Өдөр дээр дарж доорх жагсаалтыг шүүнэ. Давхар даралтаар тухайн өдөрт бүртгэл нэмнэ."
            : "Click a day to filter the list below. Double-click to add an entry for that day."}
        </p>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>
              {selectedDay
                ? `${selectedDay} — ${mn ? "өдрийн гүйлгээ" : "entries"}`
                : mn
                  ? "Сарын гүйлгээний жагсаалт"
                  : "Monthly entries"}
            </h2>
            <p>
              {mn
                ? "Орлого, зарлагын дэлгэрэнгүй бүртгэл."
                : "Detailed income and expense records."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            {selectedDay && (
              <button type="button" className="admin-filter-clear" onClick={() => setSelectedDay(null)}>
                <X size={14} />
                {mn ? "Бүх сарыг харах" : "Show whole month"}
              </button>
            )}
            <div style={{ display: "flex", background: "#f3f4f6", borderRadius: "0.6rem", padding: "3px", gap: "2px" }}>
              {([
                { key: "all", label: mn ? "Бүгд" : "All", activeColor: "#3a3630" },
                { key: "income", label: mn ? "Орлого" : "Income", activeColor: "#2f7a4a" },
                { key: "expense", label: mn ? "Зарлага" : "Expense", activeColor: "#b14141" },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setEntryTypeFilter(tab.key)}
                  style={{
                    padding: "0.3rem 0.85rem",
                    borderRadius: "0.45rem",
                    fontSize: "0.8rem",
                    fontWeight: entryTypeFilter === tab.key ? 600 : 500,
                    border: "none",
                    cursor: "pointer",
                    background: entryTypeFilter === tab.key ? "#fff" : "transparent",
                    color: entryTypeFilter === tab.key ? tab.activeColor : "#6b7280",
                    boxShadow: entryTypeFilter === tab.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`admin-data-table-wrap${tableEntries.length > 20 ? " admin-data-table-wrap-scroll" : ""}`}>
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{mn ? "Огноо" : "Date"}</th>
                <th>{mn ? "Төрөл" : "Type"}</th>
                <th>{mn ? "Ангилал" : "Category"}</th>
                <th>{mn ? "Тэмдэглэл" : "Note"}</th>
                <th className="admin-th-right">{mn ? "Дүн" : "Amount"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tableEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    {mn ? "Бүртгэл байхгүй байна." : "No entries yet."}
                  </td>
                </tr>
              ) : (
                tableEntries.map((entry, idx) => {
                  const isAuto = (entry as AutoFinanceEntry).auto === true;
                  const autoRow = entry as AutoFinanceEntry;
                  const manualRow = entry as FinanceEntryRecord;
                  return (
                    <tr key={entry.id}>
                      <td style={{ color: "#aaa", fontSize: "0.78rem" }}>{idx + 1}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{entry.date}</td>
                      <td>
                        <span className={`finance-type-badge ${entry.type === "income" ? "finance-type-income" : "finance-type-expense"}`}>
                          {entry.type === "income" ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />}
                          {entry.type === "income" ? (mn ? "Орлого" : "Income") : (mn ? "Зарлага" : "Expense")}
                        </span>
                        {!isAuto && manualRow.recurringId && (
                          <span className="finance-recurring-badge" title={mn ? "Тогтмол гүйлгээнээс үүссэн" : "Generated from a recurring rule"}>
                            <Repeat size={11} />
                          </span>
                        )}
                        {isAuto && (
                          <span className="finance-recurring-badge finance-auto-badge" title={mn ? "Журналын бичилтээс автоматаар үүссэн" : "Posted automatically from the journal"}>
                            <Zap size={11} />
                            {mn ? "Авто" : "Auto"}
                          </span>
                        )}
                      </td>
                      <td>{(isAuto && !mn ? autoRow.categoryEn : entry.category) || "—"}</td>
                      <td style={{ color: "#888", fontSize: "0.85rem" }}>{entry.note || "—"}</td>
                      <td className={`admin-td-right ${entry.type === "income" ? "finance-amount-income" : "finance-amount-expense"}`}>
                        <strong>
                          {entry.type === "income" ? "+" : "−"}
                          {formatStorePrice(entry.amount)}
                        </strong>
                      </td>
                      <td>
                        {isAuto ? (
                          <span style={{ color: "#bbb", fontSize: "0.75rem" }}>—</span>
                        ) : (
                          <div className="admin-table-actions">
                            <button
                              type="button"
                              className="admin-icon-btn admin-icon-btn-neutral"
                              onClick={() => openEdit(manualRow)}
                              title={mn ? "Засах" : "Edit"}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="admin-icon-btn"
                              onClick={() => handleDelete(manualRow)}
                              title={mn ? "Устгах" : "Delete"}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {tableEntries.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: "right" }}>
                    <strong>
                      {entryTypeFilter === "all"
                        ? (mn ? "Баланс" : "Balance")
                        : (mn ? "Нийт" : "Total")}
                    </strong>
                  </td>
                  <td className="admin-td-right">
                    <strong>
                      {formatStorePrice(
                        tableEntries.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0),
                      )}
                    </strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {entryModal && (
        <AdminModal
          title={
            entryModal.mode === "create"
              ? mn ? "Шинэ бүртгэл" : "New entry"
              : mn ? "Бүртгэл засах" : "Edit entry"
          }
          onClose={() => !modalSaving && setEntryModal(null)}
          disableClose={modalSaving}
        >
          <form
            className="admin-modal-form"
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
          >
            <div className="finance-type-toggle">
              <button
                type="button"
                className={`finance-type-toggle-btn ${entryModal.type === "income" ? "active income" : ""}`}
                onClick={() => setEntryModal({ ...entryModal, type: "income" })}
                disabled={modalSaving}
              >
                <ArrowUpCircle size={16} />
                {mn ? "Орлого" : "Income"}
              </button>
              <button
                type="button"
                className={`finance-type-toggle-btn ${entryModal.type === "expense" ? "active expense" : ""}`}
                onClick={() => setEntryModal({ ...entryModal, type: "expense" })}
                disabled={modalSaving}
              >
                <ArrowDownCircle size={16} />
                {mn ? "Зарлага" : "Expense"}
              </button>
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{mn ? "Дүн" : "Amount"}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={entryModal.amount}
                  onChange={(e) => setEntryModal({ ...entryModal, amount: e.target.value })}
                  required
                  disabled={modalSaving}
                />
              </label>
              <label className="admin-field">
                <span>{mn ? "Огноо" : "Date"}</span>
                <input
                  type="date"
                  value={entryModal.date}
                  onChange={(e) => setEntryModal({ ...entryModal, date: e.target.value })}
                  required
                  disabled={modalSaving}
                />
              </label>
            </div>

            <label className="admin-field">
              <span>{mn ? "Ангилал" : "Category"}</span>
              <input
                type="text"
                list="finance-category-suggestions"
                value={entryModal.category}
                onChange={(e) => setEntryModal({ ...entryModal, category: e.target.value })}
                placeholder={mn ? "Ж: Түүхий эд, Борлуулалт..." : "e.g. Raw materials, Sales..."}
                disabled={modalSaving}
              />
              <datalist id="finance-category-suggestions">
                {categorySuggestions.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </label>

            <label className="admin-field">
              <span>{mn ? "Тэмдэглэл" : "Note"}</span>
              <input
                type="text"
                value={entryModal.note}
                onChange={(e) => setEntryModal({ ...entryModal, note: e.target.value })}
                disabled={modalSaving}
              />
            </label>

            {modalError && <p className="sale-modal-error">{modalError}</p>}

            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setEntryModal(null)} disabled={modalSaving}>
                {mn ? "Цуцлах" : "Cancel"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={modalSaving}>
                {modalSaving ? (mn ? "Хадгалж байна..." : "Saving...") : (mn ? "Хадгалах" : "Save")}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {recurringListOpen && !recurringForm && (
        <AdminModal
          title={mn ? "Тогтмол гүйлгээ" : "Recurring entries"}
          onClose={() => setRecurringListOpen(false)}
        >
          <div className="finance-recurring-list">
            <p className="finance-calendar-hint" style={{ marginTop: 0 }}>
              {mn
                ? "7 хоног, сар, жил бүр давтагдах орлого, зарлага. Болзол дөхмөгц гүйлгээ автоматаар үүснэ."
                : "Income/expenses repeating weekly, monthly, or yearly. Entries are generated automatically when due."}
            </p>
            {recurringRules.length === 0 ? (
              <p className="admin-table-empty" style={{ padding: "1rem 0" }}>
                {mn ? "Тогтмол гүйлгээ бүртгээгүй байна." : "No recurring rules yet."}
              </p>
            ) : (
              recurringRules.map((rule) => (
                <div key={rule.id} className={`finance-recurring-row ${rule.active ? "" : "finance-recurring-row-paused"}`}>
                  <span className={`finance-type-badge ${rule.type === "income" ? "finance-type-income" : "finance-type-expense"}`}>
                    {rule.type === "income" ? <ArrowUpCircle size={13} /> : <ArrowDownCircle size={13} />}
                    {frequencyLabel(rule.frequency)}
                  </span>
                  <div className="finance-recurring-row-main">
                    <strong>{formatStorePrice(rule.amount)}</strong>
                    <span>
                      {rule.category || "—"}
                      {rule.note ? ` · ${rule.note}` : ""}
                    </span>
                    <small>
                      {mn ? "Эхлэх: " : "Starts: "}
                      {rule.startDate}
                      {!rule.active && ` · ${mn ? "Түр зогссон" : "Paused"}`}
                    </small>
                  </div>
                  <div className="admin-table-actions">
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn-neutral"
                      onClick={() => updateFinanceRecurring(rule.id, { active: !rule.active })}
                      title={rule.active ? (mn ? "Түр зогсоох" : "Pause") : (mn ? "Идэвхжүүлэх" : "Resume")}
                    >
                      {rule.active ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn-neutral"
                      onClick={() => openRecurringEdit(rule)}
                      title={mn ? "Засах" : "Edit"}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn"
                      onClick={() => handleRecurringDelete(rule)}
                      title={mn ? "Устгах" : "Delete"}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setRecurringListOpen(false)}>
                {mn ? "Хаах" : "Close"}
              </button>
              <button type="button" className="btn btn-primary" onClick={openRecurringCreate}>
                <Plus size={16} />
                {mn ? "Тогтмол гүйлгээ нэмэх" : "Add recurring rule"}
              </button>
            </div>
          </div>
        </AdminModal>
      )}

      {recurringForm && (
        <AdminModal
          title={
            recurringForm.id === null
              ? mn ? "Шинэ тогтмол гүйлгээ" : "New recurring rule"
              : mn ? "Тогтмол гүйлгээ засах" : "Edit recurring rule"
          }
          onClose={() => !recurringSaving && setRecurringForm(null)}
          disableClose={recurringSaving}
        >
          <form
            className="admin-modal-form"
            onSubmit={(e) => { e.preventDefault(); handleRecurringSave(); }}
          >
            <div className="finance-type-toggle">
              <button
                type="button"
                className={`finance-type-toggle-btn ${recurringForm.type === "income" ? "active income" : ""}`}
                onClick={() => setRecurringForm({ ...recurringForm, type: "income" })}
                disabled={recurringSaving}
              >
                <ArrowUpCircle size={16} />
                {mn ? "Орлого" : "Income"}
              </button>
              <button
                type="button"
                className={`finance-type-toggle-btn ${recurringForm.type === "expense" ? "active expense" : ""}`}
                onClick={() => setRecurringForm({ ...recurringForm, type: "expense" })}
                disabled={recurringSaving}
              >
                <ArrowDownCircle size={16} />
                {mn ? "Зарлага" : "Expense"}
              </button>
            </div>

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{mn ? "Дүн" : "Amount"}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={recurringForm.amount}
                  onChange={(e) => setRecurringForm({ ...recurringForm, amount: e.target.value })}
                  required
                  disabled={recurringSaving}
                />
              </label>
              <label className="admin-field">
                <span>{mn ? "Давтамж" : "Frequency"}</span>
                <select
                  value={recurringForm.frequency}
                  onChange={(e) => setRecurringForm({ ...recurringForm, frequency: e.target.value as RecurringFrequency })}
                  disabled={recurringSaving}
                >
                  <option value="weekly">{mn ? "7 хоног бүр" : "Weekly"}</option>
                  <option value="monthly">{mn ? "Сар бүр" : "Monthly"}</option>
                  <option value="yearly">{mn ? "Жил бүр" : "Yearly"}</option>
                </select>
              </label>
            </div>

            <label className="admin-field">
              <span>{mn ? "Эхлэх огноо" : "Start date"}</span>
              <input
                type="date"
                value={recurringForm.startDate}
                onChange={(e) => setRecurringForm({ ...recurringForm, startDate: e.target.value })}
                required
                disabled={recurringSaving}
              />
              <small style={{ color: "#888", fontSize: "0.75rem" }}>
                {recurringForm.frequency === "weekly"
                  ? mn ? "Энэ өдрөөс хойш 7 хоног тутам давтагдана." : "Repeats every 7 days from this date."
                  : recurringForm.frequency === "monthly"
                    ? mn ? "Сар бүрийн энэ өдөр давтагдана." : "Repeats on this day every month."
                    : mn ? "Жил бүрийн энэ өдөр давтагдана." : "Repeats on this date every year."}
              </small>
            </label>

            <label className="admin-field">
              <span>{mn ? "Ангилал" : "Category"}</span>
              <input
                type="text"
                list="finance-recurring-category-suggestions"
                value={recurringForm.category}
                onChange={(e) => setRecurringForm({ ...recurringForm, category: e.target.value })}
                placeholder={mn ? "Ж: Түрээс, Цалин, Интернет..." : "e.g. Rent, Salary, Internet..."}
                disabled={recurringSaving}
              />
              <datalist id="finance-recurring-category-suggestions">
                {(recurringForm.type === "expense"
                  ? (mn ? EXPENSE_CATEGORIES_MN : EXPENSE_CATEGORIES_EN)
                  : (mn ? INCOME_CATEGORIES_MN : INCOME_CATEGORIES_EN)
                ).map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </label>

            <label className="admin-field">
              <span>{mn ? "Тэмдэглэл" : "Note"}</span>
              <input
                type="text"
                value={recurringForm.note}
                onChange={(e) => setRecurringForm({ ...recurringForm, note: e.target.value })}
                disabled={recurringSaving}
              />
            </label>

            {recurringError && <p className="sale-modal-error">{recurringError}</p>}

            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setRecurringForm(null)} disabled={recurringSaving}>
                {mn ? "Буцах" : "Back"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={recurringSaving}>
                {recurringSaving ? (mn ? "Хадгалж байна..." : "Saving...") : (mn ? "Хадгалах" : "Save")}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </>
  );
}
