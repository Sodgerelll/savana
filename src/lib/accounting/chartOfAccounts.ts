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
  VAT_PAYABLE: "2410",
  REVENUE_ONLINE: "4100",
  REVENUE_WHOLESALE: "4200",
  REVENUE_DIRECT: "4300",
  SALES_RETURNS: "4910",
  COGS: "5000",
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

export type AccountType = "asset" | "liability" | "revenue" | "contra_revenue" | "expense";

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
  { code: ACCOUNT_CODES.VAT_PAYABLE, name: "НӨАТ-ын өглөг", nameEn: "VAT payable", type: "liability", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_ONLINE, name: "Онлайн борлуулалтын орлого", nameEn: "Online sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_WHOLESALE, name: "Бөөний борлуулалтын орлого", nameEn: "Wholesale sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.REVENUE_DIRECT, name: "Дэлгүүрийн шууд борлуулалтын орлого", nameEn: "Direct/POS sales revenue", type: "revenue", normalBalance: "credit" },
  { code: ACCOUNT_CODES.SALES_RETURNS, name: "Борлуулалтын буцаалт, хөнгөлөлт", nameEn: "Sales returns & allowances", type: "contra_revenue", normalBalance: "debit" },
  { code: ACCOUNT_CODES.COGS, name: "Борлуулсан барааны өртөг", nameEn: "Cost of goods sold", type: "expense", normalBalance: "debit" },
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
