/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AlertCircle,
  Building2,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardPaste,
  Download,
  FileText,
  Landmark,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  TrendingDown,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { AdminCtx } from "./adminShellTypes";
import { AdminModal } from "./AdminModal";
import { downloadCsv } from "../../lib/chat/exportCsv";
import {
  FIXED_ASSET_CATEGORIES,
  FIXED_ASSET_CATEGORY_KEYS,
  addMonths,
  assetCostFor,
  businessMonth,
  createDepreciationRun,
  createFixedAsset,
  deleteDepreciationRun,
  deleteFixedAsset,
  depreciableAmount,
  depreciationEndMonth,
  depreciationRunDeleteBlocker,
  depreciationScheduleForYear,
  disposeFixedAsset,
  isFinanciallyLocked,
  isValidDate,
  isValidMonth,
  latestRun,
  monthEndDate,
  monthOf,
  monthlyDepreciationRate,
  movementForYear,
  parseAssetImport,
  pendingDepreciationMonths,
  plainScheduledAccumulated,
  postedAccumulated,
  previewDisposal,
  registerAsOf,
  restoreDisposedAsset,
  scheduledAccumulated,
  subscribeToDepreciationRuns,
  subscribeToFixedAssets,
  updateFixedAsset,
  validateFixedAssetInput,
  type DepreciationRun,
  type FixedAsset,
  type FixedAssetCategory,
  type FixedAssetDisposalReason,
  type FixedAssetFunding,
  type FixedAssetInput,
} from "../../lib/fixedAssets";

type View = "register" | "depreciation" | "reports";
type ReportKind = "register" | "movement" | "schedule";

interface AssetFormState {
  mode: "create" | "edit";
  asset: FixedAsset | null;
  locked: boolean;
  name: string;
  category: FixedAssetCategory;
  quantity: string;
  unitCost: string;
  salvageValue: string;
  lifeYears: string;
  acquisitionDate: string;
  funding: FixedAssetFunding;
  openingAsOf: string;
  openingAccumulated: string;
  location: string;
  responsible: string;
  note: string;
}

interface DisposeFormState {
  asset: FixedAsset;
  date: string;
  reason: FixedAssetDisposalReason;
  proceeds: string;
  paymentMethod: "cash" | "bank";
  note: string;
}

interface ImportRowState {
  key: number;
  include: boolean;
  name: string;
  acquisitionDate: string;
  dateIsYearOnly: boolean;
  quantity: string;
  unitCost: string;
  category: FixedAssetCategory;
  lifeYears: string;
  openingAccumulated: string;
  /** Opening depreciation typed by hand — stop recalculating it when the inputs change. */
  accumulatedTouched: boolean;
  error: string | null;
  done: boolean;
}

const SIGNATORIES_STORAGE_KEY = "savana.fixedAssets.reportHeader";

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toNumber(value: string): number {
  const parsed = Number(String(value).replace(/\s/g, "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatLife(months: number, mn: boolean): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (mn) return [years ? `${years} жил` : "", rest ? `${rest} сар` : ""].filter(Boolean).join(" ") || "0";
  return [years ? `${years}y` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ") || "0";
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readReportHeader(fallbackCompany: string): { company: string; director: string; accountant: string } {
  try {
    const raw = window.localStorage.getItem(SIGNATORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        company: typeof parsed.company === "string" && parsed.company ? parsed.company : fallbackCompany,
        director: typeof parsed.director === "string" ? parsed.director : "",
        accountant: typeof parsed.accountant === "string" ? parsed.accountant : "",
      };
    }
  } catch {
    // Storage unavailable (private mode) — fall back to defaults.
  }
  return { company: fallbackCompany, director: "", accountant: "" };
}

/** Plain opening-register input for an import row, or an error message. */
function importRowToInput(row: ImportRowState, openingAsOf: string): FixedAssetInput | string {
  const quantity = toNumber(row.quantity);
  const unitCost = toNumber(row.unitCost);
  const lifeMonths = Math.round(toNumber(row.lifeYears) * 12);
  if (!isValidDate(row.acquisitionDate)) return "Огноо буруу";
  if (monthOf(row.acquisitionDate) > openingAsOf) return "Эхний үлдэгдлийн сараас хойш авсан — тусад нь худалдан авалтаар бүртгэнэ";
  const input: FixedAssetInput = {
    name: row.name,
    category: row.category,
    quantity,
    unitCost,
    salvageValue: 0,
    usefulLifeMonths: lifeMonths,
    acquisitionDate: row.acquisitionDate,
    funding: "opening",
    openingAsOf,
    openingAccumulatedDepreciation: toNumber(row.openingAccumulated),
    location: "",
    responsible: "",
    note: row.dateIsYearOnly ? "Эхний үлдэгдлийн жагсаалтаас — зөвхөн он мэдэгдэж байсан" : "Эхний үлдэгдлийн жагсаалтаас",
  };
  return validateFixedAssetInput(input) ?? input;
}

function suggestedOpening(row: Pick<ImportRowState, "quantity" | "unitCost" | "lifeYears" | "acquisitionDate">, openingAsOf: string): number {
  const cost = assetCostFor({ quantity: toNumber(row.quantity) || 0, unitCost: toNumber(row.unitCost) || 0 });
  const lifeMonths = Math.round(toNumber(row.lifeYears) * 12);
  if (!isValidDate(row.acquisitionDate) || !isValidMonth(openingAsOf) || !(lifeMonths > 0) || !(cost > 0)) return 0;
  return plainScheduledAccumulated(
    { cost, salvageValue: 0, usefulLifeMonths: lifeMonths, acquisitionDate: row.acquisitionDate, openingAsOf: null, openingAccumulatedDepreciation: 0 },
    openingAsOf,
  );
}

export default function FixedAssetsPage({ ctx }: { ctx: AdminCtx }) {
  const { language, formatStorePrice, openConfirmModal, user, settings } = ctx;
  const mn = language === "MN";
  const uid: string = user?.uid ?? "";
  const money = (value: number) => formatStorePrice(Math.round(value));

  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [runs, setRuns] = useState<DepreciationRun[]>([]);
  const [loadError, setLoadError] = useState<{ code: string; message: string } | null>(null);
  const [view, setView] = useState<View>("register");
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    let unsubscribeAssets = () => {};
    let unsubscribeRuns = () => {};
    const onError = (error: { code: string; message: string }) => setLoadError({ code: error.code, message: error.message });
    // Opened a tick late on purpose. StrictMode mounts, unmounts and remounts every effect in
    // development, and listening to a query, dropping it and listening again in the same tick
    // while the server refuses it (rules not deployed yet) trips an internal assertion in the
    // Firestore SDK (ID ca9 / b815) that takes the whole client down until a reload. The
    // cleanup cancels the timer, so only one listen is ever opened per mount.
    const timer = setTimeout(() => {
      unsubscribeAssets = subscribeToFixedAssets({
        onData: (next) => {
          setAssets(next);
          setLoadError(null);
        },
        onError,
      });
      unsubscribeRuns = subscribeToDepreciationRuns({ onData: setRuns, onError });
    }, 0);
    return () => {
      clearTimeout(timer);
      unsubscribeAssets();
      unsubscribeRuns();
    };
  }, []);

  const currentMonth = businessMonth();
  const lastClosedMonth = addMonths(currentMonth, -1);
  const categoryLabel = (key: FixedAssetCategory) => (mn ? FIXED_ASSET_CATEGORIES[key].mn : FIXED_ASSET_CATEGORIES[key].en);
  const fundingLabel = (funding: FixedAssetFunding) =>
    funding === "opening" ? (mn ? "Эхний үлдэгдэл" : "Opening balance") : funding === "bank" ? (mn ? "Банк" : "Bank") : (mn ? "Бэлэн мөнгө" : "Cash");

  // ── Current figures ──
  const activeAssets = useMemo(() => assets.filter((asset) => asset.status === "active"), [assets]);
  const totals = useMemo(() => {
    let cost = 0;
    let accumulated = 0;
    let monthly = 0;
    for (const asset of activeAssets) {
      cost += Math.round(asset.cost);
      accumulated += postedAccumulated(asset, runs);
      monthly += scheduledAccumulated(asset, currentMonth) - scheduledAccumulated(asset, lastClosedMonth);
    }
    return { cost, accumulated, nbv: cost - accumulated, monthly };
  }, [activeAssets, runs, currentMonth, lastClosedMonth]);

  const pending = useMemo(() => pendingDepreciationMonths(assets, runs, lastClosedMonth), [assets, runs, lastClosedMonth]);
  const pendingTotal = pending.reduce((sum, month) => sum + month.totalAmount, 0);

  // ── Register view ──
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FixedAssetCategory>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "disposed" | "all">("active");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;
      if (categoryFilter !== "all" && asset.category !== categoryFilter) return false;
      if (!q) return true;
      return [asset.code, asset.name, asset.location, asset.responsible, asset.note].some((field) => field.toLowerCase().includes(q));
    });
  }, [assets, search, categoryFilter, statusFilter]);

  // ── Asset create / edit ──
  const [assetForm, setAssetForm] = useState<AssetFormState | null>(null);
  const [assetSaving, setAssetSaving] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  const openCreate = () => {
    setAssetError(null);
    setAssetForm({
      mode: "create",
      asset: null,
      locked: false,
      name: "",
      category: "machinery",
      quantity: "1",
      unitCost: "",
      salvageValue: "0",
      lifeYears: String(FIXED_ASSET_CATEGORIES.machinery.defaultLifeYears),
      acquisitionDate: todayKey(),
      funding: "cash",
      openingAsOf: lastClosedMonth,
      openingAccumulated: "0",
      location: "",
      responsible: "",
      note: "",
    });
  };

  const openEdit = (asset: FixedAsset) => {
    setAssetError(null);
    setAssetForm({
      mode: "edit",
      asset,
      locked: isFinanciallyLocked(asset, runs),
      name: asset.name,
      category: asset.category,
      quantity: String(asset.quantity),
      unitCost: String(asset.unitCost),
      salvageValue: String(asset.salvageValue),
      lifeYears: String(Number((asset.usefulLifeMonths / 12).toFixed(4))),
      acquisitionDate: asset.acquisitionDate,
      funding: asset.funding,
      openingAsOf: asset.openingAsOf ?? lastClosedMonth,
      openingAccumulated: String(asset.openingAccumulatedDepreciation),
      location: asset.location,
      responsible: asset.responsible,
      note: asset.note,
    });
  };

  const formInput = (form: AssetFormState): FixedAssetInput => {
    // Locked assets keep their financial fields exactly as stored — only the text can change.
    if (form.locked && form.asset) {
      const a = form.asset;
      return {
        name: form.name,
        category: a.category,
        quantity: a.quantity,
        unitCost: a.unitCost,
        salvageValue: a.salvageValue,
        usefulLifeMonths: a.usefulLifeMonths,
        acquisitionDate: a.acquisitionDate,
        funding: a.funding,
        openingAsOf: a.openingAsOf,
        openingAccumulatedDepreciation: a.openingAccumulatedDepreciation,
        location: form.location,
        responsible: form.responsible,
        note: form.note,
      };
    }
    return {
      name: form.name,
      category: form.category,
      quantity: toNumber(form.quantity),
      unitCost: toNumber(form.unitCost),
      salvageValue: toNumber(form.salvageValue || "0"),
      usefulLifeMonths: Math.round(toNumber(form.lifeYears) * 12),
      acquisitionDate: form.acquisitionDate,
      funding: form.funding,
      openingAsOf: form.funding === "opening" ? form.openingAsOf : null,
      openingAccumulatedDepreciation: form.funding === "opening" ? toNumber(form.openingAccumulated || "0") : 0,
      location: form.location,
      responsible: form.responsible,
      note: form.note,
    };
  };

  const formPreview = useMemo(() => {
    if (!assetForm) return null;
    const input = formInput(assetForm);
    const cost = assetCostFor(input);
    if (!(cost > 0) || !(input.usefulLifeMonths > 0) || !isValidDate(input.acquisitionDate)) return { cost: Number.isFinite(cost) ? cost : 0, monthly: 0, end: null as string | null };
    const basis = { ...input, cost };
    return { cost, monthly: monthlyDepreciationRate(basis), end: depreciationEndMonth(basis) };
  }, [assetForm]);

  const fillSuggestedOpening = () => {
    if (!assetForm) return;
    const input = formInput(assetForm);
    const cost = assetCostFor(input);
    if (!(cost > 0) || !(input.usefulLifeMonths > 0) || !isValidDate(input.acquisitionDate) || !isValidMonth(assetForm.openingAsOf)) return;
    const suggested = plainScheduledAccumulated({ ...input, cost, openingAsOf: null }, assetForm.openingAsOf);
    setAssetForm({ ...assetForm, openingAccumulated: String(suggested) });
  };

  const handleAssetSave = async () => {
    if (!assetForm) return;
    const input = formInput(assetForm);
    const error = validateFixedAssetInput(input);
    if (error) {
      setAssetError(error);
      return;
    }
    setAssetSaving(true);
    setAssetError(null);
    try {
      if (assetForm.mode === "create") await createFixedAsset(input, uid);
      else if (assetForm.asset) await updateFixedAsset(assetForm.asset, input, runs, uid);
      setAssetForm(null);
    } catch (err: any) {
      setAssetError(err?.message ?? (mn ? "Алдаа гарлаа." : "An error occurred."));
    } finally {
      setAssetSaving(false);
    }
  };

  const handleDelete = (asset: FixedAsset) => {
    openConfirmModal({
      title: mn ? "Хөрөнгийг устгах уу?" : "Delete asset?",
      description: mn
        ? `${asset.code} ${asset.name} (${money(asset.cost)}) бүртгэлийг устгаж, журналын бичилтийг нь цуцална. Буруу бүртгэсэн тохиолдолд л ашиглана — ашиглалтаас гарсан бол «Данснаас хасах»-ыг ашиглана уу.`
        : `Delete ${asset.code} ${asset.name} (${money(asset.cost)}) and reverse its journal entry? Use this only for a mistaken registration — use "Dispose" for an asset that left service.`,
      confirmLabel: mn ? "Устгах" : "Delete",
      destructive: true,
      onConfirm: () => deleteFixedAsset(asset, runs, uid),
    });
  };

  // ── Disposal ──
  const [disposeForm, setDisposeForm] = useState<DisposeFormState | null>(null);
  const [disposeSaving, setDisposeSaving] = useState(false);
  const [disposeError, setDisposeError] = useState<string | null>(null);

  const disposePreview = useMemo(() => {
    if (!disposeForm || !isValidDate(disposeForm.date)) return null;
    const proceeds = disposeForm.reason === "sold" ? Math.max(0, toNumber(disposeForm.proceeds) || 0) : 0;
    return previewDisposal(disposeForm.asset, runs, disposeForm.date, proceeds);
  }, [disposeForm, runs]);

  const handleDispose = async () => {
    if (!disposeForm) return;
    setDisposeSaving(true);
    setDisposeError(null);
    try {
      await disposeFixedAsset(
        disposeForm.asset,
        runs,
        {
          date: disposeForm.date,
          reason: disposeForm.reason,
          proceeds: disposeForm.reason === "sold" ? toNumber(disposeForm.proceeds || "0") : 0,
          paymentMethod: disposeForm.paymentMethod,
          note: disposeForm.note,
        },
        uid,
      );
      setDisposeForm(null);
    } catch (err: any) {
      setDisposeError(err?.message ?? (mn ? "Алдаа гарлаа." : "An error occurred."));
    } finally {
      setDisposeSaving(false);
    }
  };

  const handleRestore = (asset: FixedAsset) => {
    openConfirmModal({
      title: mn ? "Данснаас хасалтыг цуцлах уу?" : "Undo disposal?",
      description: mn
        ? `${asset.code} ${asset.name}-ийн данснаас хассан бичилтийг буцааж, хөрөнгийг идэвхтэй болгоно. Хасагдсан хугацааны элэгдэл дараагийн элэгдлийн бичилтэд нөхөгдөнө.`
        : `Reverse the disposal of ${asset.code} ${asset.name} and make it active again. Depreciation for the gap catches up on the next run.`,
      confirmLabel: mn ? "Цуцлах" : "Undo",
      onConfirm: () => restoreDisposedAsset(asset, uid),
    });
  };

  // ── Depreciation runs ──
  const [runSaving, setRunSaving] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [runMonth, setRunMonth] = useState(currentMonth);
  const latest = latestRun(runs);
  const runsDesc = useMemo(() => [...runs].sort((a, b) => b.period.localeCompare(a.period)), [runs]);

  const postMonths = async (periods: string[]) => {
    setRunSaving(true);
    setRunError(null);
    // Each month builds on the one before, so post them one at a time against a local copy.
    let workingRuns = [...runs];
    try {
      for (const period of periods) {
        setRunProgress(mn ? `${period} байгуулж байна...` : `Posting ${period}...`);
        const created = await createDepreciationRun(assets, workingRuns, period, uid);
        workingRuns = [...workingRuns, created];
      }
    } catch (err: any) {
      setRunError(err?.message ?? (mn ? "Алдаа гарлаа." : "An error occurred."));
    } finally {
      setRunSaving(false);
      setRunProgress(null);
    }
  };

  const handleRunAllPending = () => {
    if (pending.length === 0) return;
    openConfirmModal({
      title: mn ? "Элэгдэл байгуулах уу?" : "Post depreciation?",
      description: mn
        ? `${pending[0].period} – ${pending[pending.length - 1].period} хүртэлх ${pending.length} сарын элэгдэл, нийт ${money(pendingTotal)}. Сар бүр тусдаа журналын бичилт (Дт 5200 / Кт 1590) тухайн сарын сүүлийн өдрөөр үүснэ.`
        : `${pending.length} months (${pending[0].period} – ${pending[pending.length - 1].period}), ${money(pendingTotal)} in total. One journal entry per month (Dr 5200 / Cr 1590), dated each month's last day.`,
      confirmLabel: mn ? "Байгуулах" : "Post",
      onConfirm: () => postMonths(pending.map((month) => month.period)),
    });
  };

  const handleRunSingle = () => {
    if (!isValidMonth(runMonth)) return;
    void postMonths([runMonth]);
  };

  const handleDeleteRun = (run: DepreciationRun) => {
    const blocker = depreciationRunDeleteBlocker(run, runs, assets);
    if (blocker) {
      setRunError(blocker);
      return;
    }
    openConfirmModal({
      title: mn ? "Элэгдлийг буцаах уу?" : "Reverse depreciation?",
      description: mn
        ? `${run.period}-ийн ${money(run.totalAmount)} элэгдлийн бичилтийг буцаах бичилтээр цуцална.`
        : `Reverse the ${run.period} depreciation of ${money(run.totalAmount)} with a reversing entry.`,
      confirmLabel: mn ? "Буцаах" : "Reverse",
      destructive: true,
      onConfirm: () => deleteDepreciationRun(run, runs, assets, uid),
    });
  };

  const assetById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // ── Import ──
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ImportRowState[]>([]);
  const [importOpeningAsOf, setImportOpeningAsOf] = useState(`${Number(currentMonth.slice(0, 4)) - 1}-12`);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  const withSuggestedOpening = (row: ImportRowState, openingAsOf: string): ImportRowState =>
    row.accumulatedTouched ? row : { ...row, openingAccumulated: String(suggestedOpening(row, openingAsOf)) };

  const handleParse = () => {
    const parsed = parseAssetImport(importText);
    if (parsed.length === 0) {
      setImportError(mn ? "Мөр олдсонгүй. Excel-ээс «Огноо | Нэр | Тоо | Нэгжийн өртөг | Нийт» баганатай мөрүүдийг хуулж буулгана уу." : "No rows found. Copy rows with Date | Name | Qty | Unit cost | Total columns from Excel.");
      return;
    }
    setImportError(null);
    setImportRows(
      parsed.map((row, index) =>
        withSuggestedOpening(
          {
            key: index,
            include: true,
            name: row.name,
            acquisitionDate: row.acquisitionDate,
            dateIsYearOnly: row.dateIsYearOnly,
            quantity: String(row.quantity),
            unitCost: String(row.unitCost),
            category: row.category,
            lifeYears: String(FIXED_ASSET_CATEGORIES[row.category].defaultLifeYears),
            openingAccumulated: "0",
            accumulatedTouched: false,
            error: null,
            done: false,
          },
          importOpeningAsOf,
        ),
      ),
    );
  };

  const updateImportRow = (key: number, patch: Partial<ImportRowState>) => {
    setImportRows((rows) =>
      rows.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch, error: null };
        if (patch.category && !("lifeYears" in patch)) next.lifeYears = String(FIXED_ASSET_CATEGORIES[patch.category].defaultLifeYears);
        return "openingAccumulated" in patch ? next : withSuggestedOpening(next, importOpeningAsOf);
      }),
    );
  };

  const changeImportOpeningAsOf = (value: string) => {
    setImportOpeningAsOf(value);
    setImportRows((rows) => rows.map((row) => withSuggestedOpening(row, value)));
  };

  const importSummary = useMemo(() => {
    let count = 0;
    let cost = 0;
    let accumulated = 0;
    for (const row of importRows) {
      if (!row.include || row.done) continue;
      count += 1;
      cost += assetCostFor({ quantity: toNumber(row.quantity) || 0, unitCost: toNumber(row.unitCost) || 0 });
      accumulated += Math.round(toNumber(row.openingAccumulated) || 0);
    }
    return { count, cost, accumulated };
  }, [importRows]);

  const handleImport = async () => {
    if (!isValidMonth(importOpeningAsOf)) {
      setImportError(mn ? "Эхний үлдэгдлийн сарыг оруулна уу." : "Enter the opening month.");
      return;
    }
    const prepared = importRows
      .filter((row) => row.include && !row.done)
      .map((row) => ({ row, input: importRowToInput(row, importOpeningAsOf) }));
    const invalid = prepared.filter((item) => typeof item.input === "string");
    if (invalid.length > 0) {
      setImportRows((rows) =>
        rows.map((row) => {
          const hit = invalid.find((item) => item.row.key === row.key);
          return hit ? { ...row, error: hit.input as string } : row;
        }),
      );
      setImportError(mn ? `${invalid.length} мөрөнд алдаа байна — засах эсвэл сонголтоос хасна уу.` : `${invalid.length} rows have errors.`);
      return;
    }
    setImportSaving(true);
    setImportError(null);
    let doneCount = 0;
    for (const item of prepared) {
      setImportProgress(`${doneCount + 1} / ${prepared.length}`);
      try {
        await createFixedAsset(item.input as FixedAssetInput, uid);
        doneCount += 1;
        setImportRows((rows) => rows.map((row) => (row.key === item.row.key ? { ...row, done: true } : row)));
      } catch (err: any) {
        setImportRows((rows) => rows.map((row) => (row.key === item.row.key ? { ...row, error: err?.message ?? "Алдаа" } : row)));
        setImportError(mn ? "Зарим мөрийг оруулж чадсангүй — алдааг засаад дахин оролдоно уу. Амжилттай орсон мөрүүд давхардахгүй." : "Some rows failed — fix and retry; imported rows will not be duplicated.");
        break;
      }
    }
    setImportSaving(false);
    setImportProgress(null);
    if (doneCount === prepared.length) {
      setImportOpen(false);
      setImportRows([]);
      setImportText("");
    }
  };

  // ── Reports ──
  const [reportKind, setReportKind] = useState<ReportKind>("register");
  const [reportMonth, setReportMonth] = useState(currentMonth);
  const [reportYear, setReportYear] = useState(Number(currentMonth.slice(0, 4)));
  const [reportHeader, setReportHeader] = useState(() => readReportHeader(settings?.brandName ? `${settings.brandName}` : ""));

  const updateReportHeader = (patch: Partial<typeof reportHeader>) => {
    const next = { ...reportHeader, ...patch };
    setReportHeader(next);
    try {
      window.localStorage.setItem(SIGNATORIES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Not persisted — fine, the fields still apply to this print.
    }
  };

  const registerRows = useMemo(
    () => (isValidMonth(reportMonth) ? registerAsOf(assets, runs, reportMonth) : []),
    [assets, runs, reportMonth],
  );
  const registerByCategory = useMemo(() => {
    return FIXED_ASSET_CATEGORY_KEYS.map((key) => {
      const rows = registerRows.filter((row) => row.asset.category === key);
      return {
        key,
        rows,
        cost: rows.reduce((sum, row) => sum + row.cost, 0),
        accumulated: rows.reduce((sum, row) => sum + row.accumulated, 0),
        nbv: rows.reduce((sum, row) => sum + row.carryingAmount, 0),
        unposted: rows.reduce((sum, row) => sum + row.unposted, 0),
        quantity: rows.reduce((sum, row) => sum + row.asset.quantity, 0),
      };
    }).filter((group) => group.rows.length > 0);
  }, [registerRows]);
  const registerTotals = useMemo(
    () => ({
      cost: registerRows.reduce((sum, row) => sum + row.cost, 0),
      accumulated: registerRows.reduce((sum, row) => sum + row.accumulated, 0),
      nbv: registerRows.reduce((sum, row) => sum + row.carryingAmount, 0),
      unposted: registerRows.reduce((sum, row) => sum + row.unposted, 0),
      quantity: registerRows.reduce((sum, row) => sum + row.asset.quantity, 0),
    }),
    [registerRows],
  );

  const movementRows = useMemo(() => movementForYear(assets, runs, reportYear), [assets, runs, reportYear]);
  const scheduleRows = useMemo(() => depreciationScheduleForYear(assets, runs, reportYear), [assets, runs, reportYear]);
  const scheduleMonthTotals = useMemo(
    () => Array.from({ length: 12 }, (_, index) => scheduleRows.reduce((sum, row) => sum + row.months[index].amount, 0)),
    [scheduleRows],
  );

  const movementLabel = (category: FixedAssetCategory | "total") => (category === "total" ? (mn ? "Нийт" : "Total") : categoryLabel(category));

  const reportTitle =
    reportKind === "register"
      ? mn ? `Үндсэн хөрөнгийн тайлан — ${monthEndDate(reportMonth)}-ны байдлаар` : `Fixed asset register as of ${monthEndDate(reportMonth)}`
      : reportKind === "movement"
        ? mn ? `Үндсэн хөрөнгийн хөдөлгөөний тайлан — ${reportYear} он` : `Fixed asset movement — ${reportYear}`
        : mn ? `Элэгдлийн хуваарь — ${reportYear} он` : `Depreciation schedule — ${reportYear}`;

  /** Header + rows of whichever report is on screen, for CSV and for the printable page. */
  const reportTable = (): { headers: string[]; rows: Array<Array<string | number>>; footer?: Array<string | number> } => {
    if (reportKind === "register") {
      return {
        headers: mn
          ? ["Код", "Нэр", "Ангилал", "Олж авсан", "Тоо", "Нэгжийн өртөг", "Үндсэн өртөг", "Ашиглах хугацаа", "Хуримтлагдсан элэгдэл", "Үлдэгдэл өртөг", "Байршил", "Хариуцагч"]
          : ["Code", "Name", "Class", "Acquired", "Qty", "Unit cost", "Cost", "Useful life", "Accumulated depreciation", "Net book value", "Location", "Responsible"],
        rows: registerRows.map((row) => [
          row.asset.code,
          row.asset.name,
          categoryLabel(row.asset.category),
          row.asset.acquisitionDate,
          row.asset.quantity,
          row.asset.unitCost,
          row.cost,
          formatLife(row.asset.usefulLifeMonths, mn),
          row.accumulated,
          row.carryingAmount,
          row.asset.location,
          row.asset.responsible,
        ]),
        footer: [mn ? "НИЙТ" : "TOTAL", "", "", "", registerTotals.quantity, "", registerTotals.cost, "", registerTotals.accumulated, registerTotals.nbv, "", ""],
      };
    }
    if (reportKind === "movement") {
      return {
        headers: mn
          ? ["Ангилал", "Өртөг: эхний үлдэгдэл", "Нэмэгдсэн", "Хасагдсан", "Өртөг: эцсийн үлдэгдэл", "Элэгдэл: эхний үлдэгдэл", "Байгуулсан элэгдэл", "Хасагдсан элэгдэл", "Элэгдэл: эцсийн үлдэгдэл", "Цэвэр дүн: эхэнд", "Цэвэр дүн: эцэст"]
          : ["Class", "Cost: opening", "Additions", "Disposals", "Cost: closing", "Depreciation: opening", "Charge", "On disposals", "Depreciation: closing", "NBV: opening", "NBV: closing"],
        rows: movementRows.map((row) => [
          movementLabel(row.category),
          row.costOpening,
          row.additions,
          row.disposalsCost,
          row.costClosing,
          row.accOpening,
          row.depreciationCharge,
          row.disposalsAccumulated,
          row.accClosing,
          row.nbvOpening,
          row.nbvClosing,
        ]),
      };
    }
    return {
      headers: [mn ? "Код" : "Code", mn ? "Нэр" : "Name", ...Array.from({ length: 12 }, (_, i) => `${i + 1}${mn ? "-р сар" : ""}`), mn ? "Нийт" : "Total"],
      rows: scheduleRows.map((row) => [row.asset.code, row.asset.name, ...row.months.map((cell) => cell.amount), row.total]),
      footer: [mn ? "НИЙТ" : "TOTAL", "", ...scheduleMonthTotals, scheduleMonthTotals.reduce((a, b) => a + b, 0)],
    };
  };

  const handleCsv = () => {
    const table = reportTable();
    const rows = table.footer ? [...table.rows, table.footer] : table.rows;
    const base = reportKind === "register" ? `undsen-hurungu-${reportMonth}` : reportKind === "movement" ? `undsen-hurungu-hudulguun-${reportYear}` : `elegdel-${reportYear}`;
    downloadCsv(base, table.headers, rows);
  };

  const handlePrint = () => {
    const table = reportTable();
    const cell = (value: string | number) =>
      typeof value === "number" ? `<td class="num">${escapeHtml(new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 2 }).format(value))}</td>` : `<td>${escapeHtml(value)}</td>`;
    const html = `<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title>
<style>
  body { font-family: "Times New Roman", serif; color: #111; margin: 24px; }
  .top { display: flex; justify-content: space-between; font-weight: bold; }
  h1 { text-align: center; font-size: 16px; margin: 18px 0 12px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #333; padding: 4px 6px; vertical-align: top; }
  th { background: #eee; }
  td.num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: bold; }
  .signs { margin-top: 36px; display: grid; gap: 22px; font-size: 13px; }
  @page { size: ${reportKind === "schedule" || reportKind === "movement" ? "A4 landscape" : "A4 portrait"}; margin: 12mm; }
</style></head><body>
<div class="top"><span>${escapeHtml(reportHeader.company)}</span><span>${escapeHtml(todayKey())}</span></div>
<h1>${escapeHtml(reportTitle)}</h1>
<table><thead><tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
<tbody>${table.rows.map((row) => `<tr>${row.map(cell).join("")}</tr>`).join("")}</tbody>
${table.footer ? `<tfoot><tr>${table.footer.map(cell).join("")}</tr></tfoot>` : ""}</table>
<div class="signs">
  <div>${mn ? "Захирал" : "Director"}: ........................................ ${reportHeader.director ? `/${escapeHtml(reportHeader.director)}/` : ""}</div>
  <div>${mn ? "Нягтлан бодогч" : "Accountant"}: ........................................ ${reportHeader.accountant ? `/${escapeHtml(reportHeader.accountant)}/` : ""}</div>
</div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ── Render ──
  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">Finance</p>
          <h1>{mn ? "Үндсэн хөрөнгө" : "Fixed assets"}</h1>
          <p>
            {mn
              ? "Үндсэн хөрөнгийн бүртгэл, шулуун шугамын элэгдэл, данснаас хасалт. Бүх гүйлгээ журналд (1510–1590, 5200) автоматаар бичигдэнэ."
              : "Fixed-asset register, straight-line depreciation and disposals — every change posts to the journal (1510–1590, 5200)."}
          </p>
        </div>
        <div className="admin-topbar-actions">
          <button type="button" className={view === "register" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setView("register")}>
            {mn ? "Бүртгэл" : "Register"}
          </button>
          <button type="button" className={view === "depreciation" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setView("depreciation")}>
            {mn ? "Элэгдэл" : "Depreciation"}
            {pending.length > 0 && <span className="fa-pill fa-pill-warn">{pending.length}</span>}
          </button>
          <button type="button" className={view === "reports" ? "btn btn-primary" : "btn btn-outline"} onClick={() => setView("reports")}>
            {mn ? "Тайлан" : "Reports"}
          </button>
        </div>
      </div>

      {loadError && (
        <p className="sale-modal-error">
          {loadError.code === "permission-denied"
            ? mn
              ? "Үндсэн хөрөнгийн цуглуулгад хандах эрх алга — Firestore дүрэм (firestore.rules) deploy хийгдээгүй байна: firebase deploy --only firestore:rules"
              : "No access to the fixed-asset collections — the Firestore rules (firestore.rules) are not deployed: firebase deploy --only firestore:rules"
            : `${mn ? "Өгөгдөл ачаалж чадсангүй: " : "Could not load data: "}${loadError.message}`}
        </p>
      )}

      <button type="button" className="admin-summary-toggle" onClick={() => setSummaryOpen((prev) => !prev)} aria-expanded={summaryOpen}>
        <span>{mn ? "Тойм үзүүлэлт" : "Summary"}</span>
        {summaryOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <div className={`admin-summary-grid ${summaryOpen ? "admin-summary-grid-open" : ""}`}>
        <div className="admin-summary-card">
          <span><Building2 size={14} /> {mn ? "Үндсэн өртөг" : "Cost"}</span>
          <strong>{money(totals.cost)}</strong>
        </div>
        <div className="admin-summary-card">
          <span><TrendingDown size={14} /> {mn ? "Хуримтлагдсан элэгдэл" : "Accumulated depreciation"}</span>
          <strong>{money(totals.accumulated)}</strong>
        </div>
        <div className="admin-summary-card">
          <span><Wallet size={14} /> {mn ? "Үлдэгдэл өртөг" : "Net book value"}</span>
          <strong>{money(totals.nbv)}</strong>
        </div>
        <div className="admin-summary-card">
          <span><Landmark size={14} /> {mn ? "Идэвхтэй хөрөнгө" : "Active assets"}</span>
          <strong>{activeAssets.length}</strong>
        </div>
        <div className="admin-summary-card">
          <span><Calculator size={14} /> {mn ? "Энэ сарын элэгдэл" : "This month's depreciation"}</span>
          <strong>{money(totals.monthly)}</strong>
        </div>
      </div>

      {pending.length > 0 && view !== "depreciation" && (
        <div className="admin-data-card fa-notice">
          <AlertCircle size={18} />
          <p>
            {mn
              ? `${pending.length} сарын элэгдэл (${money(pendingTotal)}) байгуулагдаагүй байна — тайлан, журналын үлдэгдэл бүрэн биш.`
              : `${pending.length} months of depreciation (${money(pendingTotal)}) not posted yet — reports and ledger balances are incomplete.`}
          </p>
          <button type="button" className="btn btn-outline" onClick={() => setView("depreciation")}>
            {mn ? "Элэгдэл рүү" : "Go to depreciation"}
          </button>
        </div>
      )}

      {/* ── Register ── */}
      {view === "register" && (
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div>
              <h2>{mn ? "Үндсэн хөрөнгийн бүртгэл" : "Asset register"}</h2>
              <p>
                {mn
                  ? "Элэгдэл олж авсны дараа сараас эхэлж, данснаас хассан сараас зогсоно. Элэгдэл байгуулагдсан хөрөнгийн өртөг, хугацааг засах боломжгүй."
                  : "Depreciation starts the month after acquisition and stops the month of disposal. Cost and life lock once depreciation has been posted."}
              </p>
            </div>
            <div className="admin-topbar-actions">
              <button type="button" className="btn btn-outline" onClick={() => { setImportError(null); setImportOpen(true); }}>
                <ClipboardPaste size={16} />
                {mn ? "Excel-ээс оруулах" : "Import from Excel"}
              </button>
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Plus size={16} />
                {mn ? "Шинэ хөрөнгө" : "New asset"}
              </button>
            </div>
          </div>

          <div className="admin-filter-bar">
            <div className="admin-filter-search">
              <Search size={16} className="admin-filter-search-icon" />
              <input type="text" placeholder={mn ? "Код, нэр, байршил, хариуцагчаар хайх..." : "Search code, name, location..."} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="admin-search-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as any)}>
              <option value="all">{mn ? "Бүх ангилал" : "All classes"}</option>
              {FIXED_ASSET_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>{categoryLabel(key)}</option>
              ))}
            </select>
            <select className="admin-search-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="active">{mn ? "Ашиглалтад байгаа" : "In use"}</option>
              <option value="disposed">{mn ? "Данснаас хассан" : "Disposed"}</option>
              <option value="all">{mn ? "Бүгд" : "All"}</option>
            </select>
            <div className="admin-filter-meta">
              {search && (
                <button type="button" className="admin-filter-clear" onClick={() => setSearch("")}>
                  <X size={14} />
                  {mn ? "Цэвэрлэх" : "Clear"}
                </button>
              )}
            </div>
          </div>

          <div className="admin-data-table-wrap">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>{mn ? "Код" : "Code"}</th>
                  <th>{mn ? "Нэр" : "Name"}</th>
                  <th>{mn ? "Ангилал" : "Class"}</th>
                  <th>{mn ? "Олж авсан" : "Acquired"}</th>
                  <th className="admin-th-right">{mn ? "Тоо" : "Qty"}</th>
                  <th className="admin-th-right">{mn ? "Үндсэн өртөг" : "Cost"}</th>
                  <th className="admin-th-right">{mn ? "Хуримт. элэгдэл" : "Acc. depreciation"}</th>
                  <th className="admin-th-right">{mn ? "Үлдэгдэл өртөг" : "Net book value"}</th>
                  <th className="admin-th-right">{mn ? "Сарын элэгдэл" : "Monthly"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="admin-table-empty">
                      {assets.length === 0
                        ? mn ? "Үндсэн хөрөнгө бүртгэгдээгүй байна. «Excel-ээс оруулах»-аар одоо байгаа жагсаалтаа оруулна уу." : "No assets yet. Use \"Import from Excel\" to bring in your current list."
                        : mn ? "Шүүлтүүрт тохирох хөрөнгө алга." : "No assets match the filters."}
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset) => {
                    const accumulated = postedAccumulated(asset, runs);
                    const nbv = Math.round(asset.cost) - accumulated;
                    const monthly = asset.status === "active" ? scheduledAccumulated(asset, currentMonth) - scheduledAccumulated(asset, lastClosedMonth) : 0;
                    const locked = isFinanciallyLocked(asset, runs);
                    const isOpen = expanded === asset.id;
                    return (
                      <Fragment key={asset.id}>
                        <tr className={asset.status === "disposed" ? "fa-row-disposed" : ""} onClick={() => setExpanded(isOpen ? null : asset.id)} style={{ cursor: "pointer" }}>
                          <td><strong>{asset.code}</strong></td>
                          <td>
                            {asset.name}
                            {asset.status === "disposed" && <span className="fa-pill">{mn ? "Хассан" : "Disposed"}</span>}
                            {asset.status === "active" && nbv <= Math.round(asset.salvageValue) && <span className="fa-pill fa-pill-muted">{mn ? "Бүрэн элэгдсэн" : "Fully depreciated"}</span>}
                          </td>
                          <td>{categoryLabel(asset.category)}</td>
                          <td>{asset.acquisitionDate}</td>
                          <td className="admin-td-right">{asset.quantity}</td>
                          <td className="admin-td-right">{money(asset.cost)}</td>
                          <td className="admin-td-right">{money(accumulated)}</td>
                          <td className="admin-td-right"><strong>{money(nbv)}</strong></td>
                          <td className="admin-td-right">{monthly ? money(monthly) : "—"}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="admin-table-actions">
                              <button type="button" className="admin-icon-btn admin-icon-btn-neutral" title={mn ? "Засах" : "Edit"} onClick={() => openEdit(asset)}>
                                <Pencil size={15} />
                              </button>
                              {asset.status === "active" ? (
                                <button
                                  type="button"
                                  className="admin-icon-btn admin-icon-btn-neutral"
                                  title={mn ? "Данснаас хасах (борлуулах / актлах)" : "Dispose (sell / write off)"}
                                  onClick={() => {
                                    setDisposeError(null);
                                    setDisposeForm({ asset, date: todayKey(), reason: "scrapped", proceeds: "", paymentMethod: "cash", note: "" });
                                  }}
                                >
                                  <FileText size={15} />
                                </button>
                              ) : (
                                <button type="button" className="admin-icon-btn admin-icon-btn-neutral" title={mn ? "Данснаас хасалтыг цуцлах" : "Undo disposal"} onClick={() => handleRestore(asset)}>
                                  <Undo2 size={15} />
                                </button>
                              )}
                              {!locked && (
                                <button type="button" className="admin-icon-btn" title={mn ? "Устгах" : "Delete"} onClick={() => handleDelete(asset)}>
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="fa-detail-row">
                            <td colSpan={10}>
                              <dl className="fa-detail-grid">
                                <div><dt>{mn ? "Нэгжийн өртөг" : "Unit cost"}</dt><dd>{formatStorePrice(asset.unitCost)}</dd></div>
                                <div><dt>{mn ? "Үлдэх өртөг" : "Residual value"}</dt><dd>{money(asset.salvageValue)}</dd></div>
                                <div><dt>{mn ? "Ашиглах хугацаа" : "Useful life"}</dt><dd>{formatLife(asset.usefulLifeMonths, mn)}</dd></div>
                                <div><dt>{mn ? "Элэгдэл дуусах сар" : "Fully depreciated in"}</dt><dd>{depreciationEndMonth(asset)}</dd></div>
                                <div><dt>{mn ? "Элэгдүүлэх дүн" : "Depreciable amount"}</dt><dd>{money(depreciableAmount(asset))}</dd></div>
                                <div><dt>{mn ? "Эх үүсвэр" : "Funding"}</dt><dd>{fundingLabel(asset.funding)}{asset.openingAsOf ? ` · ${asset.openingAsOf} ${mn ? "байдлаар" : ""} ${money(asset.openingAccumulatedDepreciation)}` : ""}</dd></div>
                                <div><dt>{mn ? "Данс" : "Account"}</dt><dd>{asset.accountCode} / 1590</dd></div>
                                <div><dt>{mn ? "Байршил" : "Location"}</dt><dd>{asset.location || "—"}</dd></div>
                                <div><dt>{mn ? "Хариуцагч" : "Responsible"}</dt><dd>{asset.responsible || "—"}</dd></div>
                                {asset.note && <div><dt>{mn ? "Тэмдэглэл" : "Note"}</dt><dd>{asset.note}</dd></div>}
                                {asset.disposal && (
                                  <div>
                                    <dt>{mn ? "Данснаас хассан" : "Disposed"}</dt>
                                    <dd>
                                      {asset.disposal.date} · {asset.disposal.reason === "sold" ? (mn ? `борлуулсан ${money(asset.disposal.proceeds)}` : `sold for ${money(asset.disposal.proceeds)}`) : mn ? "актласан" : "written off"} ·{" "}
                                      <span className={asset.disposal.gainLoss >= 0 ? "finance-amount-income" : "finance-amount-expense"}>
                                        {asset.disposal.gainLoss >= 0 ? (mn ? "олз " : "gain ") : mn ? "гарз " : "loss "}
                                        {money(Math.abs(asset.disposal.gainLoss))}
                                      </span>
                                    </dd>
                                  </div>
                                )}
                              </dl>
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
      )}

      {/* ── Depreciation ── */}
      {view === "depreciation" && (
        <>
          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>{mn ? "Элэгдэл байгуулах" : "Post depreciation"}</h2>
                <p>
                  {mn
                    ? "Сар бүр бүх хөрөнгийн элэгдлийг нэг бичилтээр (Дт 5200 Элэгдлийн зардал / Кт 1590 Хуримтлагдсан элэгдэл) тухайн сарын сүүлийн өдрөөр байгуулна. Сарууд дарааллаараа байгуулагдана; хожуу бүртгэсэн хөрөнгийн өнгөрсөн саруудын элэгдэл дараагийн бичилтэд нөхөгдөнө."
                    : "Each month posts one entry for all assets (Dr 5200 / Cr 1590), dated the month's last day. Months go in order; an asset registered late catches up on the next run."}
                </p>
              </div>
            </div>

            {pending.length > 0 ? (
              <>
                <div className="admin-data-table-wrap">
                  <table className="admin-data-table">
                    <thead>
                      <tr>
                        <th>{mn ? "Сар" : "Month"}</th>
                        <th className="admin-th-right">{mn ? "Хөрөнгийн тоо" : "Assets"}</th>
                        <th className="admin-th-right">{mn ? "Элэгдлийн дүн" : "Amount"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((month) => (
                        <tr key={month.period}>
                          <td>{month.period}</td>
                          <td className="admin-td-right">{month.assetCount}</td>
                          <td className="admin-td-right">{money(month.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td><strong>{mn ? "Нийт" : "Total"}</strong></td>
                        <td />
                        <td className="admin-td-right"><strong>{money(pendingTotal)}</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="fa-actions-row">
                  <button type="button" className="btn btn-primary" onClick={handleRunAllPending} disabled={runSaving}>
                    <Calculator size={16} />
                    {runSaving ? runProgress ?? (mn ? "Байгуулж байна..." : "Posting...") : mn ? `Бүгдийг байгуулах (${pending.length} сар)` : `Post all (${pending.length} months)`}
                  </button>
                </div>
              </>
            ) : (
              <p className="admin-table-empty" style={{ padding: "1rem 0" }}>
                {mn ? `${lastClosedMonth} хүртэлх хаагдсан саруудын элэгдэл бүрэн байгуулагдсан.` : `Depreciation is posted through ${lastClosedMonth}.`}
              </p>
            )}

            <div className="fa-actions-row">
              <label className="admin-field" style={{ margin: 0 }}>
                <span>{mn ? "Тодорхой сар (энэ сарыг оролцуулан)" : "A specific month (up to this one)"}</span>
                <input type="month" value={runMonth} max={currentMonth} min={latest ? addMonths(latest.period, 1) : undefined} onChange={(e) => setRunMonth(e.target.value)} disabled={runSaving} />
              </label>
              <button type="button" className="btn btn-outline" onClick={handleRunSingle} disabled={runSaving || !isValidMonth(runMonth)}>
                {mn ? "Энэ сарыг байгуулах" : "Post this month"}
              </button>
            </div>
            {runError && <p className="sale-modal-error">{runError}</p>}
          </div>

          <div className="admin-data-card">
            <div className="admin-data-card-head">
              <div>
                <h2>{mn ? "Байгуулсан элэгдэл" : "Posted depreciation"}</h2>
                <p>{mn ? "Зөвхөн хамгийн сүүлийн сарыг буцаах боломжтой." : "Only the latest month can be reversed."}</p>
              </div>
            </div>
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Сар" : "Month"}</th>
                    <th>{mn ? "Огноо" : "Date"}</th>
                    <th className="admin-th-right">{mn ? "Хөрөнгийн тоо" : "Assets"}</th>
                    <th className="admin-th-right">{mn ? "Дүн" : "Amount"}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {runsDesc.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="admin-table-empty">{mn ? "Элэгдэл байгуулаагүй байна." : "Nothing posted yet."}</td>
                    </tr>
                  ) : (
                    runsDesc.map((run) => (
                      <Fragment key={run.id}>
                        <tr onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)} style={{ cursor: "pointer" }}>
                          <td><strong>{run.period}</strong></td>
                          <td>{run.date}</td>
                          <td className="admin-td-right">{run.lines.length}</td>
                          <td className="admin-td-right">{money(run.totalAmount)}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {latest?.id === run.id && (
                              <button type="button" className="admin-icon-btn" title={mn ? "Буцаах" : "Reverse"} onClick={() => handleDeleteRun(run)}>
                                <RotateCcw size={15} />
                              </button>
                            )}
                          </td>
                        </tr>
                        {expandedRun === run.id && (
                          <tr className="fa-detail-row">
                            <td colSpan={5}>
                              <table className="admin-data-table fa-inner-table">
                                <tbody>
                                  {run.lines.map((runLine) => {
                                    const asset = assetById.get(runLine.assetId);
                                    return (
                                      <tr key={runLine.assetId}>
                                        <td>{asset?.code ?? runLine.assetId}</td>
                                        <td>{asset?.name ?? (mn ? "(устгагдсан)" : "(deleted)")}</td>
                                        <td className="admin-td-right">{money(runLine.amount)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Reports ── */}
      {view === "reports" && (
        <div className="admin-data-card">
          <div className="admin-data-card-head">
            <div>
              <h2>{reportTitle}</h2>
              <p>
                {reportKind === "register"
                  ? mn ? "Тухайн сарын эцсийн байдлаарх хөрөнгө бүрийн өртөг, хуримтлагдсан элэгдэл, үлдэгдэл өртөг — журналд бичигдсэн дүнгээр." : "Each asset's cost, accumulated depreciation and net book value at month end, as posted."
                  : reportKind === "movement"
                    ? mn ? "Санхүүгийн тайлангийн тодруулгын «Үндсэн хөрөнгө» хүснэгт: эхний үлдэгдэл + нэмэгдсэн − хасагдсан = эцсийн үлдэгдэл." : "The fixed-asset note: opening + additions − disposals = closing."
                    : mn ? "Хөрөнгө тус бүрийн сарын элэгдэл. Налуу бичвэр — байгуулагдаагүй (төлөвлөгөөт) дүн." : "Monthly depreciation per asset. Italic — not yet posted (projected)."}
              </p>
            </div>
            <div className="admin-topbar-actions">
              <button type="button" className="btn btn-outline" onClick={handleCsv}>
                <Download size={16} />
                {mn ? "Excel (CSV)" : "CSV"}
              </button>
              <button type="button" className="btn btn-primary" onClick={handlePrint}>
                <Printer size={16} />
                {mn ? "Хэвлэх" : "Print"}
              </button>
            </div>
          </div>

          <div className="admin-filter-bar">
            <select className="admin-search-input" value={reportKind} onChange={(e) => setReportKind(e.target.value as ReportKind)}>
              <option value="register">{mn ? "Үндсэн хөрөнгийн тайлан (жагсаалт)" : "Asset register"}</option>
              <option value="movement">{mn ? "Хөдөлгөөний тайлан (жилээр)" : "Movement (yearly)"}</option>
              <option value="schedule">{mn ? "Элэгдлийн хуваарь (жилээр)" : "Depreciation schedule (yearly)"}</option>
            </select>
            {reportKind === "register" ? (
              <input className="admin-search-input" type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
            ) : (
              <div className="finance-calendar-head" style={{ margin: 0 }}>
                <button type="button" className="admin-icon-btn admin-icon-btn-neutral" onClick={() => setReportYear(reportYear - 1)}>
                  <ChevronLeft size={16} />
                </button>
                <h2 style={{ margin: 0 }}>{reportYear}</h2>
                <button type="button" className="admin-icon-btn admin-icon-btn-neutral" onClick={() => setReportYear(reportYear + 1)}>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {reportKind === "register" && (
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th>{mn ? "Код" : "Code"}</th>
                    <th>{mn ? "Нэр" : "Name"}</th>
                    <th>{mn ? "Олж авсан" : "Acquired"}</th>
                    <th className="admin-th-right">{mn ? "Тоо" : "Qty"}</th>
                    <th className="admin-th-right">{mn ? "Үндсэн өртөг" : "Cost"}</th>
                    <th className="admin-th-right">{mn ? "Хуримт. элэгдэл" : "Acc. depreciation"}</th>
                    <th className="admin-th-right">{mn ? "Үлдэгдэл өртөг" : "Net book value"}</th>
                  </tr>
                </thead>
                <tbody>
                  {registerByCategory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="admin-table-empty">{mn ? "Энэ үед бүртгэлтэй хөрөнгө алга." : "No assets held at this date."}</td>
                    </tr>
                  ) : (
                    registerByCategory.map((group) => (
                      <Fragment key={group.key}>
                        <tr className="fa-group-row">
                          <td colSpan={3}><strong>{categoryLabel(group.key)}</strong> <small>({FIXED_ASSET_CATEGORIES[group.key].accountCode})</small></td>
                          <td className="admin-td-right"><strong>{group.quantity}</strong></td>
                          <td className="admin-td-right"><strong>{money(group.cost)}</strong></td>
                          <td className="admin-td-right"><strong>{money(group.accumulated)}</strong></td>
                          <td className="admin-td-right"><strong>{money(group.nbv)}</strong></td>
                        </tr>
                        {group.rows.map((row) => (
                          <tr key={row.asset.id}>
                            <td>{row.asset.code}</td>
                            <td>
                              {row.asset.name}
                              {row.unposted > 0 && (
                                <span className="fa-pill fa-pill-warn" title={mn ? "Байгуулагдаагүй элэгдэл" : "Unposted depreciation"}>
                                  +{money(row.unposted)}
                                </span>
                              )}
                            </td>
                            <td>{row.asset.acquisitionDate}</td>
                            <td className="admin-td-right">{row.asset.quantity}</td>
                            <td className="admin-td-right">{money(row.cost)}</td>
                            <td className="admin-td-right">{money(row.accumulated)}</td>
                            <td className="admin-td-right">{money(row.carryingAmount)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
                {registerRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3}><strong>{mn ? "НИЙТ" : "TOTAL"}</strong></td>
                      <td className="admin-td-right"><strong>{registerTotals.quantity}</strong></td>
                      <td className="admin-td-right"><strong>{money(registerTotals.cost)}</strong></td>
                      <td className="admin-td-right"><strong>{money(registerTotals.accumulated)}</strong></td>
                      <td className="admin-td-right"><strong>{money(registerTotals.nbv)}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {registerTotals.unposted > 0 && (
                <p className="finance-calendar-hint">
                  {mn
                    ? `Анхаар: ${money(registerTotals.unposted)} элэгдэл байгуулагдаагүй тул дээрх үлдэгдэл өртөг түүгээр их гарч байна.`
                    : `Note: ${money(registerTotals.unposted)} of depreciation is not posted yet, so the net book value above is higher by that much.`}
                </p>
              )}
            </div>
          )}

          {reportKind === "movement" && (
            <div className="admin-data-table-wrap">
              <table className="admin-data-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>{mn ? "Ангилал" : "Class"}</th>
                    <th colSpan={4} className="fa-th-group">{mn ? "Өртөг" : "Cost"}</th>
                    <th colSpan={4} className="fa-th-group">{mn ? "Хуримтлагдсан элэгдэл" : "Accumulated depreciation"}</th>
                    <th colSpan={2} className="fa-th-group">{mn ? "Үлдэгдэл өртөг" : "Net book value"}</th>
                  </tr>
                  <tr>
                    <th className="admin-th-right">{mn ? "Эхний үлд." : "Opening"}</th>
                    <th className="admin-th-right">{mn ? "Нэмэгдсэн" : "Additions"}</th>
                    <th className="admin-th-right">{mn ? "Хасагдсан" : "Disposals"}</th>
                    <th className="admin-th-right">{mn ? "Эцсийн үлд." : "Closing"}</th>
                    <th className="admin-th-right">{mn ? "Эхний үлд." : "Opening"}</th>
                    <th className="admin-th-right">{mn ? "Байгуулсан" : "Charge"}</th>
                    <th className="admin-th-right">{mn ? "Хасагдсан" : "Disposals"}</th>
                    <th className="admin-th-right">{mn ? "Эцсийн үлд." : "Closing"}</th>
                    <th className="admin-th-right">{mn ? "Эхэнд" : "Opening"}</th>
                    <th className="admin-th-right">{mn ? "Эцэст" : "Closing"}</th>
                  </tr>
                </thead>
                <tbody>
                  {movementRows.length <= 1 ? (
                    <tr>
                      <td colSpan={11} className="admin-table-empty">{mn ? "Энэ онд хөрөнгийн хөдөлгөөн алга." : "No asset movement this year."}</td>
                    </tr>
                  ) : (
                    movementRows.map((row) => {
                      const Cell = row.category === "total" ? "strong" : "span";
                      return (
                        <tr key={row.category} className={row.category === "total" ? "fa-group-row" : ""}>
                          <td><Cell>{movementLabel(row.category)}</Cell></td>
                          {[row.costOpening, row.additions, row.disposalsCost, row.costClosing, row.accOpening, row.depreciationCharge, row.disposalsAccumulated, row.accClosing, row.nbvOpening, row.nbvClosing].map((value, index) => (
                            <td key={index} className="admin-td-right"><Cell>{money(value)}</Cell></td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {reportKind === "schedule" && (
            <div className="admin-data-table-wrap">
              <table className="admin-data-table fa-schedule-table">
                <thead>
                  <tr>
                    <th>{mn ? "Хөрөнгө" : "Asset"}</th>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th key={i} className="admin-th-right">{i + 1}</th>
                    ))}
                    <th className="admin-th-right">{mn ? "Нийт" : "Total"}</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="admin-table-empty">{mn ? "Энэ онд элэгдэл алга." : "No depreciation this year."}</td>
                    </tr>
                  ) : (
                    scheduleRows.map((row) => (
                      <tr key={row.asset.id}>
                        <td><strong>{row.asset.code}</strong> {row.asset.name}</td>
                        {row.months.map((cellValue, index) => (
                          <td key={index} className={`admin-td-right ${cellValue.posted ? "" : "fa-projected"}`}>
                            {cellValue.amount ? new Intl.NumberFormat("mn-MN").format(cellValue.amount) : "—"}
                          </td>
                        ))}
                        <td className="admin-td-right"><strong>{money(row.total)}</strong></td>
                      </tr>
                    ))
                  )}
                </tbody>
                {scheduleRows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td><strong>{mn ? "НИЙТ" : "TOTAL"}</strong></td>
                      {scheduleMonthTotals.map((value, index) => (
                        <td key={index} className="admin-td-right"><strong>{new Intl.NumberFormat("mn-MN").format(value)}</strong></td>
                      ))}
                      <td className="admin-td-right"><strong>{money(scheduleMonthTotals.reduce((a, b) => a + b, 0))}</strong></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          <div className="admin-form-grid fa-report-header">
            <label className="admin-field">
              <span>{mn ? "Байгууллагын нэр (хэвлэхэд)" : "Company name (print)"}</span>
              <input type="text" value={reportHeader.company} onChange={(e) => updateReportHeader({ company: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>{mn ? "Захирал" : "Director"}</span>
              <input type="text" value={reportHeader.director} onChange={(e) => updateReportHeader({ director: e.target.value })} />
            </label>
            <label className="admin-field">
              <span>{mn ? "Нягтлан бодогч" : "Accountant"}</span>
              <input type="text" value={reportHeader.accountant} onChange={(e) => updateReportHeader({ accountant: e.target.value })} />
            </label>
          </div>
        </div>
      )}

      {/* ── Asset modal ── */}
      {assetForm && (
        <AdminModal
          title={assetForm.mode === "create" ? (mn ? "Шинэ үндсэн хөрөнгө" : "New fixed asset") : `${assetForm.asset?.code ?? ""} ${mn ? "засах" : "edit"}`}
          onClose={() => !assetSaving && setAssetForm(null)}
          disableClose={assetSaving}
          wide
        >
          <form className="admin-modal-form" onSubmit={(e) => { e.preventDefault(); void handleAssetSave(); }}>
            {assetForm.locked && (
              <p className="finance-calendar-hint" style={{ marginTop: 0 }}>
                {mn
                  ? "Энэ хөрөнгөд элэгдэл байгуулагдсан (эсвэл данснаас хасагдсан) тул зөвхөн нэр, байршил, хариуцагч, тэмдэглэлийг засна."
                  : "Depreciation has been posted (or the asset is disposed) — only name, location, responsible and note can change."}
              </p>
            )}
            <label className="admin-field">
              <span>{mn ? "Нэр" : "Name"} *</span>
              <input type="text" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} required disabled={assetSaving} />
            </label>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{mn ? "Ангилал (данс)" : "Class (account)"}</span>
                <select
                  value={assetForm.category}
                  disabled={assetSaving || assetForm.locked}
                  onChange={(e) => {
                    const category = e.target.value as FixedAssetCategory;
                    setAssetForm({ ...assetForm, category, lifeYears: assetForm.mode === "create" ? String(FIXED_ASSET_CATEGORIES[category].defaultLifeYears) : assetForm.lifeYears });
                  }}
                >
                  {FIXED_ASSET_CATEGORY_KEYS.map((key) => (
                    <option key={key} value={key}>{FIXED_ASSET_CATEGORIES[key].accountCode} · {categoryLabel(key)}</option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>{mn ? "Ашиглах хугацаа (жил)" : "Useful life (years)"}</span>
                <input type="number" min="0.0833" step="any" value={assetForm.lifeYears} onChange={(e) => setAssetForm({ ...assetForm, lifeYears: e.target.value })} disabled={assetSaving || assetForm.locked} required />
              </label>
              <label className="admin-field">
                <span>{mn ? "Тоо ширхэг" : "Quantity"}</span>
                <input type="number" min="1" step="any" value={assetForm.quantity} onChange={(e) => setAssetForm({ ...assetForm, quantity: e.target.value })} disabled={assetSaving || assetForm.locked} required />
              </label>
              <label className="admin-field">
                <span>{mn ? "Нэгжийн өртөг (НӨАТ-гүй)" : "Unit cost (excl. VAT)"}</span>
                <input type="number" min="0" step="any" value={assetForm.unitCost} onChange={(e) => setAssetForm({ ...assetForm, unitCost: e.target.value })} disabled={assetSaving || assetForm.locked} required />
              </label>
              <label className="admin-field">
                <span>{mn ? "Олж авсан огноо" : "Acquisition date"}</span>
                <input type="date" value={assetForm.acquisitionDate} onChange={(e) => setAssetForm({ ...assetForm, acquisitionDate: e.target.value })} disabled={assetSaving || assetForm.locked} required />
              </label>
              <label className="admin-field">
                <span>{mn ? "Үлдэх өртөг" : "Residual value"}</span>
                <input type="number" min="0" step="any" value={assetForm.salvageValue} onChange={(e) => setAssetForm({ ...assetForm, salvageValue: e.target.value })} disabled={assetSaving || assetForm.locked} />
              </label>
              <label className="admin-field">
                <span>{mn ? "Эх үүсвэр" : "Funding"}</span>
                <select value={assetForm.funding} onChange={(e) => setAssetForm({ ...assetForm, funding: e.target.value as FixedAssetFunding })} disabled={assetSaving || assetForm.locked}>
                  <option value="cash">{mn ? "Бэлэн мөнгөөр худалдан авсан (1010)" : "Bought with cash (1010)"}</option>
                  <option value="bank">{mn ? "Банкаар худалдан авсан (1020)" : "Bought via bank (1020)"}</option>
                  <option value="opening">{mn ? "Эхний үлдэгдэл — өмнө нь авсан (3000)" : "Opening balance — owned before (3000)"}</option>
                </select>
              </label>
            </div>

            {assetForm.funding === "opening" && (
              <div className="admin-form-grid">
                <label className="admin-field">
                  <span>{mn ? "Эхний үлдэгдлийн сар" : "Opening balance month"}</span>
                  <input type="month" value={assetForm.openingAsOf} onChange={(e) => setAssetForm({ ...assetForm, openingAsOf: e.target.value })} disabled={assetSaving || assetForm.locked} required />
                </label>
                <label className="admin-field">
                  <span>{mn ? "Тэр үеийн хуримтлагдсан элэгдэл" : "Accumulated depreciation then"}</span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input type="number" min="0" step="any" value={assetForm.openingAccumulated} onChange={(e) => setAssetForm({ ...assetForm, openingAccumulated: e.target.value })} disabled={assetSaving || assetForm.locked} style={{ flex: 1 }} />
                    <button type="button" className="btn btn-outline" onClick={fillSuggestedOpening} disabled={assetSaving || assetForm.locked} title={mn ? "Шулуун шугамаар тооцоолох" : "Compute straight-line"}>
                      <Calculator size={15} />
                    </button>
                  </div>
                </label>
              </div>
            )}

            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{mn ? "Байршил" : "Location"}</span>
                <input type="text" value={assetForm.location} onChange={(e) => setAssetForm({ ...assetForm, location: e.target.value })} disabled={assetSaving} />
              </label>
              <label className="admin-field">
                <span>{mn ? "Хариуцагч" : "Responsible"}</span>
                <input type="text" value={assetForm.responsible} onChange={(e) => setAssetForm({ ...assetForm, responsible: e.target.value })} disabled={assetSaving} />
              </label>
            </div>
            <label className="admin-field">
              <span>{mn ? "Тэмдэглэл" : "Note"}</span>
              <input type="text" value={assetForm.note} onChange={(e) => setAssetForm({ ...assetForm, note: e.target.value })} disabled={assetSaving} />
            </label>

            {formPreview && (
              <p className="finance-calendar-hint">
                {mn ? "Үндсэн өртөг" : "Cost"}: <strong>{money(formPreview.cost)}</strong>
                {formPreview.monthly > 0 && (
                  <>
                    {" · "}{mn ? "сарын элэгдэл" : "monthly depreciation"} ≈ <strong>{money(formPreview.monthly)}</strong>
                    {formPreview.end && <> · {mn ? "дуусах" : "ends"} {formPreview.end}</>}
                  </>
                )}
              </p>
            )}

            {assetError && <p className="sale-modal-error">{assetError}</p>}
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setAssetForm(null)} disabled={assetSaving}>
                {mn ? "Болих" : "Cancel"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={assetSaving}>
                {assetSaving ? (mn ? "Хадгалж байна..." : "Saving...") : mn ? "Хадгалах" : "Save"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {/* ── Disposal modal ── */}
      {disposeForm && (
        <AdminModal
          title={mn ? "Данснаас хасах" : "Dispose of asset"}
          description={`${disposeForm.asset.code} ${disposeForm.asset.name}`}
          onClose={() => !disposeSaving && setDisposeForm(null)}
          disableClose={disposeSaving}
        >
          <form className="admin-modal-form" onSubmit={(e) => { e.preventDefault(); void handleDispose(); }}>
            <div className="finance-type-toggle">
              <button type="button" className={`finance-type-toggle-btn ${disposeForm.reason === "scrapped" ? "active expense" : ""}`} onClick={() => setDisposeForm({ ...disposeForm, reason: "scrapped" })} disabled={disposeSaving}>
                {mn ? "Актлах / устгах" : "Write off"}
              </button>
              <button type="button" className={`finance-type-toggle-btn ${disposeForm.reason === "sold" ? "active income" : ""}`} onClick={() => setDisposeForm({ ...disposeForm, reason: "sold" })} disabled={disposeSaving}>
                {mn ? "Борлуулах" : "Sell"}
              </button>
            </div>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span>{mn ? "Огноо" : "Date"}</span>
                <input type="date" value={disposeForm.date} min={disposeForm.asset.acquisitionDate} onChange={(e) => setDisposeForm({ ...disposeForm, date: e.target.value })} disabled={disposeSaving} required />
              </label>
              {disposeForm.reason === "sold" && (
                <>
                  <label className="admin-field">
                    <span>{mn ? "Борлуулсан үнэ (НӨАТ-гүй)" : "Proceeds (excl. VAT)"}</span>
                    <input type="number" min="0" step="any" value={disposeForm.proceeds} onChange={(e) => setDisposeForm({ ...disposeForm, proceeds: e.target.value })} disabled={disposeSaving} required />
                  </label>
                  <label className="admin-field">
                    <span>{mn ? "Мөнгө орсон" : "Received into"}</span>
                    <select value={disposeForm.paymentMethod} onChange={(e) => setDisposeForm({ ...disposeForm, paymentMethod: e.target.value as "cash" | "bank" })} disabled={disposeSaving}>
                      <option value="cash">{mn ? "Касс (1010)" : "Cash (1010)"}</option>
                      <option value="bank">{mn ? "Банк (1020)" : "Bank (1020)"}</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <label className="admin-field">
              <span>{mn ? "Шалтгаан / тэмдэглэл" : "Reason / note"}</span>
              <input type="text" value={disposeForm.note} onChange={(e) => setDisposeForm({ ...disposeForm, note: e.target.value })} disabled={disposeSaving} />
            </label>

            {disposePreview && (
              <table className="admin-data-table fa-inner-table">
                <tbody>
                  <tr><td>{mn ? "Үндсэн өртөг" : "Cost"}</td><td className="admin-td-right">{money(disposeForm.asset.cost)}</td></tr>
                  <tr><td>{mn ? "Хуримтлагдсан элэгдэл (хасах сарын өмнөх сар хүртэл)" : "Accumulated depreciation (to the month before)"}</td><td className="admin-td-right">{money(disposePreview.accumulatedDepreciation)}</td></tr>
                  {disposePreview.depreciationCatchUp !== 0 && (
                    <tr><td>{mn ? "— үүнээс энэ бичилтээр нөхөж байгуулах элэгдэл" : "— of which charged by this entry"}</td><td className="admin-td-right">{money(disposePreview.depreciationCatchUp)}</td></tr>
                  )}
                  <tr><td>{mn ? "Үлдэгдэл өртөг" : "Carrying amount"}</td><td className="admin-td-right"><strong>{money(disposePreview.carryingAmount)}</strong></td></tr>
                  <tr>
                    <td>{disposePreview.gainLoss >= 0 ? (mn ? "Олз (4950)" : "Gain (4950)") : mn ? "Гарз (5950)" : "Loss (5950)"}</td>
                    <td className={`admin-td-right ${disposePreview.gainLoss >= 0 ? "finance-amount-income" : "finance-amount-expense"}`}><strong>{money(Math.abs(disposePreview.gainLoss))}</strong></td>
                  </tr>
                </tbody>
              </table>
            )}

            {disposeError && <p className="sale-modal-error">{disposeError}</p>}
            <div className="admin-modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setDisposeForm(null)} disabled={disposeSaving}>
                {mn ? "Болих" : "Cancel"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={disposeSaving}>
                {disposeSaving ? (mn ? "Хадгалж байна..." : "Saving...") : mn ? "Данснаас хасах" : "Dispose"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {/* ── Import modal ── */}
      {importOpen && (
        <AdminModal
          title={mn ? "Эхний үлдэгдэл — Excel-ээс оруулах" : "Opening register — import from Excel"}
          description={
            mn
              ? "Excel-ийн жагсаалтаас «Авсан огноо | Нэр | Тоо | Үндсэн өртөг | Нийт» баганатай мөрүүдийг сонгож хуулаад (Ctrl+C) доор буулгана (Ctrl+V)."
              : "Copy the rows with Date | Name | Qty | Unit cost | Total from Excel and paste them below."
          }
          onClose={() => !importSaving && setImportOpen(false)}
          disableClose={importSaving}
          xl
        >
          <div className="admin-modal-form">
            {importRows.length === 0 ? (
              <>
                <label className="admin-field">
                  <span>{mn ? "Excel-ээс хуулсан мөрүүд" : "Rows copied from Excel"}</span>
                  <textarea rows={10} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"2024\tDell нөүтвүүк\t1\t1873274.8\t1873274.8\n2022\tEpson L3110 принтер\t1\t468750\t468750"} />
                </label>
                {importError && <p className="sale-modal-error">{importError}</p>}
                <div className="admin-modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setImportOpen(false)}>{mn ? "Болих" : "Cancel"}</button>
                  <button type="button" className="btn btn-primary" onClick={handleParse} disabled={!importText.trim()}>{mn ? "Задлах" : "Parse"}</button>
                </div>
              </>
            ) : (
              <>
                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>{mn ? "Эхний үлдэгдлийн сар (жагсаалт аль сарын эцсийн байдлаарх вэ)" : "Opening month (the list is as of the end of)"}</span>
                    <input type="month" value={importOpeningAsOf} onChange={(e) => changeImportOpeningAsOf(e.target.value)} disabled={importSaving} />
                  </label>
                  <p className="finance-calendar-hint" style={{ margin: 0 }}>
                    {mn
                      ? "Хөрөнгө бүр Дт 15xx / Кт 3000 Эздийн өмч, тухайн сар хүртэлх элэгдэл нь Дт 3900 / Кт 1590-аар бичигдэнэ. Дараагийн сараас эхлэн элэгдэл системд байгуулагдана. Зөвхөн он мэдэгдэж буй огноог 7-р сарын 1 гэж (хагас жилийн зарчмаар) авсан — жинхэнэ огноо байвал засна уу."
                      : "Each asset posts Dr 15xx / Cr 3000 equity, and depreciation to that month Dr 3900 / Cr 1590. The system depreciates from the following month. Year-only dates were set to 1 July (half-year convention) — correct them if you know the real date."}
                  </p>
                </div>
                <div className="admin-data-table-wrap">
                  <table className="admin-data-table fa-import-table">
                    <thead>
                      <tr>
                        <th />
                        <th>{mn ? "Нэр" : "Name"}</th>
                        <th>{mn ? "Олж авсан" : "Acquired"}</th>
                        <th>{mn ? "Тоо" : "Qty"}</th>
                        <th>{mn ? "Нэгжийн өртөг" : "Unit cost"}</th>
                        <th>{mn ? "Ангилал" : "Class"}</th>
                        <th>{mn ? "Хугацаа (жил)" : "Life (y)"}</th>
                        <th>{mn ? "Хуримт. элэгдэл" : "Acc. depr."}</th>
                        <th className="admin-th-right">{mn ? "Үлдэгдэл" : "NBV"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((row) => {
                        const cost = assetCostFor({ quantity: toNumber(row.quantity) || 0, unitCost: toNumber(row.unitCost) || 0 });
                        const disabled = importSaving || row.done;
                        return (
                          <Fragment key={row.key}>
                            <tr className={row.done ? "fa-row-done" : !row.include ? "fa-row-disposed" : ""}>
                              <td><input type="checkbox" checked={row.include} disabled={disabled} onChange={(e) => updateImportRow(row.key, { include: e.target.checked })} /></td>
                              <td><input type="text" value={row.name} disabled={disabled} onChange={(e) => updateImportRow(row.key, { name: e.target.value })} /></td>
                              <td>
                                <input
                                  type="date"
                                  className={row.dateIsYearOnly || !row.acquisitionDate ? "fa-input-warn" : ""}
                                  title={row.dateIsYearOnly ? (mn ? "Зөвхөн он мэдэгдэж байсан" : "Only the year was known") : undefined}
                                  value={row.acquisitionDate}
                                  disabled={disabled}
                                  onChange={(e) => updateImportRow(row.key, { acquisitionDate: e.target.value, dateIsYearOnly: false })}
                                />
                              </td>
                              <td><input type="number" min="1" step="any" value={row.quantity} disabled={disabled} onChange={(e) => updateImportRow(row.key, { quantity: e.target.value })} style={{ width: 64 }} /></td>
                              <td><input type="number" min="0" step="any" value={row.unitCost} disabled={disabled} onChange={(e) => updateImportRow(row.key, { unitCost: e.target.value })} /></td>
                              <td>
                                <select value={row.category} disabled={disabled} onChange={(e) => updateImportRow(row.key, { category: e.target.value as FixedAssetCategory })}>
                                  {FIXED_ASSET_CATEGORY_KEYS.map((key) => (
                                    <option key={key} value={key}>{categoryLabel(key)}</option>
                                  ))}
                                </select>
                              </td>
                              <td><input type="number" min="0.0833" step="any" value={row.lifeYears} disabled={disabled} onChange={(e) => updateImportRow(row.key, { lifeYears: e.target.value })} style={{ width: 64 }} /></td>
                              <td><input type="number" min="0" step="any" value={row.openingAccumulated} disabled={disabled} onChange={(e) => updateImportRow(row.key, { openingAccumulated: e.target.value, accumulatedTouched: true })} /></td>
                              <td className="admin-td-right">{money(cost - (toNumber(row.openingAccumulated) || 0))}</td>
                            </tr>
                            {row.error && (
                              <tr>
                                <td />
                                <td colSpan={8}><span className="finance-amount-expense">{row.error}</span></td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="finance-calendar-hint">
                  {mn ? "Сонгосон" : "Selected"}: <strong>{importSummary.count}</strong> · {mn ? "Үндсэн өртөг" : "Cost"} <strong>{money(importSummary.cost)}</strong> · {mn ? "Хуримтлагдсан элэгдэл" : "Accumulated"} <strong>{money(importSummary.accumulated)}</strong> · {mn ? "Үлдэгдэл өртөг" : "NBV"} <strong>{money(importSummary.cost - importSummary.accumulated)}</strong>
                </p>
                {importError && <p className="sale-modal-error">{importError}</p>}
                <div className="admin-modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setImportRows([])} disabled={importSaving}>{mn ? "Буцах" : "Back"}</button>
                  <button type="button" className="btn btn-primary" onClick={() => void handleImport()} disabled={importSaving || importSummary.count === 0}>
                    {importSaving ? `${mn ? "Оруулж байна" : "Importing"} ${importProgress ?? ""}` : mn ? `Оруулах (${importSummary.count})` : `Import (${importSummary.count})`}
                  </button>
                </div>
              </>
            )}
          </div>
        </AdminModal>
      )}
    </>
  );
}
