import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export const ACCOUNTS_COLLECTION = "accounts";

// ─── Account codes used by the posting logic in src/lib/accounting/entryBuilders.ts ──
export const ACCOUNT_CODES = {
  CASH: "1010",
  BANK: "1020",
  CLEARING: "1030",
  AR: "1110",
  INVENTORY: "1210",
  /** Raw materials held before production turns them into finished goods. */
  RAW_MATERIALS: "1220",
  /** Packaging materials — boxes, labels, bottles — held before they wrap a finished good. */
  PACKAGING: "1230",
  /** Property, plant & equipment at historical cost — one account per asset class. */
  FA_BUILDINGS: "1510",
  FA_MACHINERY: "1520",
  FA_VEHICLES: "1530",
  FA_FURNITURE: "1540",
  FA_COMPUTERS: "1550",
  FA_OTHER: "1560",
  /** Contra-asset: depreciation charged so far against every fixed-asset class above. */
  ACCUMULATED_DEPRECIATION: "1590",
  /**
   * Money owed back to a reseller whose returned goods were worth more than they still owed —
   * held here until the refund is actually paid out (transferService.settleTransferRefund).
   */
  CUSTOMER_REFUNDS_PAYABLE: "2130",
  VAT_PAYABLE: "2410",
  /** Owner capital — the balancing side of the opening/seed position. */
  EQUITY: "3000",
  /** Accumulated profit and loss — the closing counterpart of revenue and expense. */
  RETAINED_EARNINGS: "3900",
  REVENUE_ONLINE: "4100",
  REVENUE_WHOLESALE: "4200",
  REVENUE_DIRECT: "4300",
  /** Delivery charged to the buyer — kept apart so goods revenue is not inflated by it. */
  REVENUE_SHIPPING: "4400",
  /** Manually recorded income that is not a product sale (grants, refunds received, …). */
  OTHER_INCOME: "4900",
  SALES_RETURNS: "4910",
  /** Proceeds above a fixed asset's carrying amount when it leaves the books. */
  GAIN_ON_ASSET_DISPOSAL: "4950",
  COGS: "5000",
  /** Manually recorded running costs — rent, salaries, marketing, … */
  OPERATING_EXPENSE: "5100",
  /** Monthly straight-line depreciation of fixed assets — a cost with no cash leaving. */
  DEPRECIATION_EXPENSE: "5200",
  /** Goods that left stock without a sale: gifts and own use. */
  GOODS_WRITE_OFF: "5900",
  /** Raw materials consumed outside of a production batch: waste, samples, testing. */
  RAW_MATERIAL_WRITE_OFF: "5910",
  /** Packaging consumed outside of a sale: waste, samples, damage. */
  PACKAGING_WRITE_OFF: "5920",
  /** Finished goods a physical count found missing (debit) or found extra (credit). */
  INVENTORY_ADJUSTMENT: "5930",
  /** Carrying amount a fixed asset still had when it was sold below it or written off. */
  LOSS_ON_ASSET_DISPOSAL: "5950",
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

export type AccountType = "asset" | "contra_asset" | "liability" | "equity" | "revenue" | "contra_revenue" | "expense";

export interface ChartOfAccountsEntry {
  code: string;
  name: string;
  nameEn: string;
  type: AccountType;
  normalBalance: "debit" | "credit";
}

export const CHART_OF_ACCOUNTS: ChartOfAccountsEntry[] = [
  { code: ACCOUNT_CODES.CASH, name: "Кассын бэлэн мөнгө", nameEn: "Cash on hand", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.BANK, name: "Банкны харилцах", nameEn: "Bank", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.CLEARING, name: "Bonum/QPay clearing", nameEn: "Bonum/QPay clearing", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.AR, name: "Худалдааны авлага", nameEn: "Accounts receivable", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.INVENTORY, name: "Бэлэн бүтээгдэхүүний нөөц", nameEn: "Finished goods inventory", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.RAW_MATERIALS, name: "Түүхий эдийн нөөц", nameEn: "Raw materials inventory", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.PACKAGING, name: "Сав баглаа боодлын нөөц", nameEn: "Packaging inventory", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.FA_BUILDINGS, name: "Барилга, байгууламж", nameEn: "Buildings & structures", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.FA_MACHINERY, name: "Машин, тоног төхөөрөмж", nameEn: "Machinery & equipment", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.FA_VEHICLES, name: "Тээврийн хэрэгсэл", nameEn: "Vehicles", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.FA_FURNITURE, name: "Тавилга, эд хогшил", nameEn: "Furniture & fixtures", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.FA_COMPUTERS, name: "Компьютер, дагалдах хэрэгсэл", nameEn: "Computers & peripherals", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.FA_OTHER, name: "Бусад үндсэн хөрөнгө", nameEn: "Other fixed assets", type: "asset", normalBalance: "debit" },
  { code: ACCOUNT_CODES.ACCUMULATED_DEPRECIATION, name: "Хуримтлагдсан элэгдэл", nameEn: "Accumulated depreciation", type: "contra_asset", normalBalance: "credit" },
  { code: ACCOUNT_CODES.CUSTOMER_REFUNDS_PAYABLE, name: "Харилцагчид буцаан олгох өглөг", nameEn: "Customer refunds payable", type: "liability", normalBalance: "credit" },
  { code: ACCOUNT_CODES.VAT_PAYABLE, name: "НӨАТ-ын өглөг", nameEn: "VAT payable", type: "liability", normalBalance: "credit" },
  { code: ACCOUNT_CODES.EQUITY, name: "Эздийн өмч", nameEn: "Owner's equity", type: "equity", normalBalance: "credit" },
  { code: ACCOUNT_CODES.RETAINED_EARNINGS, name: "Хуримтлагдсан ашиг", nameEn: "Retained earnings", type: "equity", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_ONLINE, name: "Онлайн борлуулалтын орлого", nameEn: "Online sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_WHOLESALE, name: "Бөөний борлуулалтын орлого", nameEn: "Wholesale sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_DIRECT, name: "Дэлгүүрийн шууд борлуулалтын орлого", nameEn: "Direct/POS sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_SHIPPING, name: "Хүргэлтийн орлого", nameEn: "Delivery income", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.OTHER_INCOME, name: "Бусад орлого", nameEn: "Other income", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.SALES_RETURNS, name: "Борлуулалтын буцаалт, хөнгөлөлт", nameEn: "Sales returns & allowances", type: "contra_revenue", normalBalance: "debit" },
  { code: ACCOUNT_CODES.GAIN_ON_ASSET_DISPOSAL, name: "Үндсэн хөрөнгө данснаас хассаны олз", nameEn: "Gain on asset disposal", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.COGS, name: "Борлуулсан барааны өртөг", nameEn: "Cost of goods sold", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.OPERATING_EXPENSE, name: "Үйл ажиллагааны зардал", nameEn: "Operating expenses", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.DEPRECIATION_EXPENSE, name: "Элэгдлийн зардал", nameEn: "Depreciation expense", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.GOODS_WRITE_OFF, name: "Бэлэг, дотоод хэрэглээний зардал", nameEn: "Gifts & own-use write-offs", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.RAW_MATERIAL_WRITE_OFF, name: "Түүхий эдийн зарцуулалтын зардал", nameEn: "Raw material write-offs", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.PACKAGING_WRITE_OFF, name: "Сав баглаа боодлын зарцуулалтын зардал", nameEn: "Packaging write-offs", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.INVENTORY_ADJUSTMENT, name: "Бараа материалын тооллогын зөрүү", nameEn: "Inventory count adjustments", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.LOSS_ON_ASSET_DISPOSAL, name: "Үндсэн хөрөнгө данснаас хассаны гарз", nameEn: "Loss on asset disposal", type: "expense", normalBalance: "debit" },
];

export const ACCOUNT_NAMES: Record<string, string> = Object.fromEntries(
  CHART_OF_ACCOUNTS.map((account) => [account.code, account.name]),
);

/**
 * Idempotent — safe to call repeatedly. Accounts that already exist keep their createdAt
 * and only have their descriptive fields refreshed; accounts added to the chart since the
 * last seed (the fixed-asset block, for one) are created.
 */
export async function seedChartOfAccounts(): Promise<void> {
  const existing = new Set((await getDocs(collection(db, ACCOUNTS_COLLECTION))).docs.map((snap) => snap.id));
  await Promise.all(
    CHART_OF_ACCOUNTS.map((account) =>
      setDoc(
        doc(db, ACCOUNTS_COLLECTION, account.code),
        {
          code: account.code,
          name: account.name,
          nameEn: account.nameEn,
          type: account.type,
          normalBalance: account.normalBalance,
          isActive: true,
          ...(existing.has(account.code) ? {} : { createdAt: serverTimestamp() }),
        },
        { merge: true },
      ),
    ),
  );
}

/** Codes in the built-in chart that the stored `accounts` collection does not have yet. */
export function missingAccountCodes(storedCodes: Iterable<string>): string[] {
  const stored = new Set(storedCodes);
  return CHART_OF_ACCOUNTS.map((account) => account.code).filter((code) => !stored.has(code));
}

export async function isChartOfAccountsSeeded(): Promise<boolean> {
  const snap = await getDocs(collection(db, ACCOUNTS_COLLECTION));
  return !snap.empty;
}

/** Maps a CRM/customer-transaction or order payment method string to the cash/bank/clearing account it settles into. */
export function mapPaymentMethodToAccount(method: string | null | undefined): AccountCode {
  switch (method) {
    case "CASH":
    case "cash":
      return ACCOUNT_CODES.CASH;
    case "BANK_TRANSFER":
    case "bank_transfer":
    case "bank":
      return ACCOUNT_CODES.BANK;
    case "QPAY":
    case "SOCIALPAY":
    case "qpay":
    case "bonum":
      return ACCOUNT_CODES.CLEARING;
    default:
      // CREDIT, "other", or unrecognized — default to cash rather than blocking the post.
      return ACCOUNT_CODES.CASH;
  }
}
