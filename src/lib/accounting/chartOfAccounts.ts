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
  COGS: "5000",
  /** Manually recorded running costs — rent, salaries, marketing, … */
  OPERATING_EXPENSE: "5100",
  /** Goods that left stock without a sale: gifts and own use. */
  GOODS_WRITE_OFF: "5900",
  /** Raw materials consumed outside of a production batch: waste, samples, testing. */
  RAW_MATERIAL_WRITE_OFF: "5910",
  /** Packaging consumed outside of a sale: waste, samples, damage. */
  PACKAGING_WRITE_OFF: "5920",
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "contra_revenue" | "expense";

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
  { code: ACCOUNT_CODES.VAT_PAYABLE, name: "НӨАТ-ын өглөг", nameEn: "VAT payable", type: "liability", normalBalance: "credit" },
  { code: ACCOUNT_CODES.EQUITY, name: "Эздийн өмч", nameEn: "Owner's equity", type: "equity", normalBalance: "credit" },
  { code: ACCOUNT_CODES.RETAINED_EARNINGS, name: "Хуримтлагдсан ашиг", nameEn: "Retained earnings", type: "equity", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_ONLINE, name: "Онлайн борлуулалтын орлого", nameEn: "Online sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_WHOLESALE, name: "Бөөний борлуулалтын орлого", nameEn: "Wholesale sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_DIRECT, name: "Дэлгүүрийн шууд борлуулалтын орлого", nameEn: "Direct/POS sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_SHIPPING, name: "Хүргэлтийн орлого", nameEn: "Delivery income", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.OTHER_INCOME, name: "Бусад орлого", nameEn: "Other income", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.SALES_RETURNS, name: "Борлуулалтын буцаалт, хөнгөлөлт", nameEn: "Sales returns & allowances", type: "contra_revenue", normalBalance: "debit" },
  { code: ACCOUNT_CODES.COGS, name: "Борлуулсан барааны өртөг", nameEn: "Cost of goods sold", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.OPERATING_EXPENSE, name: "Үйл ажиллагааны зардал", nameEn: "Operating expenses", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.GOODS_WRITE_OFF, name: "Бэлэг, дотоод хэрэглээний зардал", nameEn: "Gifts & own-use write-offs", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.RAW_MATERIAL_WRITE_OFF, name: "Түүхий эдийн зарцуулалтын зардал", nameEn: "Raw material write-offs", type: "expense", normalBalance: "debit" },
  { code: ACCOUNT_CODES.PACKAGING_WRITE_OFF, name: "Сав баглаа боодлын зарцуулалтын зардал", nameEn: "Packaging write-offs", type: "expense", normalBalance: "debit" },
];

export const ACCOUNT_NAMES: Record<string, string> = Object.fromEntries(
  CHART_OF_ACCOUNTS.map((account) => [account.code, account.name]),
);

/** Idempotent — safe to call repeatedly, existing docs are merged/overwritten with the same seed values. */
export async function seedChartOfAccounts(): Promise<void> {
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
          createdAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ),
  );
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
