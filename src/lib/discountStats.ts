/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Aggregates how much revenue was given away as discounts across the sales
 * channels (online orders, offline sales, direct/POS sales, seller transfers).
 * Only recorded discounts are counted: an item counts as discounted when its
 * stored originalUnitPrice (list price at sale time) exceeds the sale price,
 * plus any transaction-level discount on customer transactions.
 */

export interface DiscountSourceStats {
  /** Total discount amount (₮) given on this channel. */
  amount: number;
  /** Number of sales/transactions that included a discount. */
  count: number;
}

export interface DiscountStats {
  orders: DiscountSourceStats;
  /** Offline sales registered in the Sales module (store, messenger, phone, …). */
  sales: DiscountSourceStats;
  directSales: DiscountSourceStats;
  transfers: DiscountSourceStats;
  total: DiscountSourceStats;
}

function lineDiscount(item: any): number {
  const original = Number(item?.originalUnitPrice ?? 0);
  const unitPrice = Number(item?.unitPrice ?? 0);
  if (original <= unitPrice) return 0;
  return (original - unitPrice) * Number(item?.quantity ?? 0);
}

function matchesPrefix(date: string | null | undefined, datePrefix: string): boolean {
  return typeof date === "string" && date.startsWith(datePrefix);
}

/**
 * @param datePrefix ISO date prefix to filter by — "2026" for a year, "2026-07" for a month.
 */
export function computeDiscountStats(
  {
    orders,
    sales,
    directSales,
    customerTransactions,
  }: {
    orders: any[] | null | undefined;
    sales?: any[] | null | undefined;
    directSales: any[] | null | undefined;
    customerTransactions: any[] | null | undefined;
  },
  datePrefix: string,
): DiscountStats {
  const stats: DiscountStats = {
    orders: { amount: 0, count: 0 },
    sales: { amount: 0, count: 0 },
    directSales: { amount: 0, count: 0 },
    transfers: { amount: 0, count: 0 },
    total: { amount: 0, count: 0 },
  };

  for (const order of orders ?? []) {
    if (!matchesPrefix(order?.createdAt, datePrefix)) continue;
    const amount = (order?.items ?? []).reduce((sum: number, item: any) => sum + lineDiscount(item), 0);
    if (amount > 0) {
      stats.orders.amount += amount;
      stats.orders.count += 1;
    }
  }

  // Sales carry the same item shape as orders, so the per-line rule is identical.
  for (const sale of sales ?? []) {
    if (!matchesPrefix(sale?.createdAt, datePrefix)) continue;
    const amount = (sale?.items ?? []).reduce((sum: number, item: any) => sum + lineDiscount(item), 0);
    if (amount > 0) {
      stats.sales.amount += amount;
      stats.sales.count += 1;
    }
  }

  for (const sale of directSales ?? []) {
    if (!matchesPrefix(sale?.createdAt, datePrefix)) continue;
    const amount = lineDiscount(sale);
    if (amount > 0) {
      stats.directSales.amount += amount;
      stats.directSales.count += 1;
    }
  }

  for (const tx of customerTransactions ?? []) {
    if (tx?.type === "return") continue;
    if (!matchesPrefix(tx?.transactionDate ?? tx?.createdAt, datePrefix)) continue;
    const amount =
      Number(tx?.totals?.discount ?? 0) +
      (tx?.items ?? []).reduce((sum: number, item: any) => sum + lineDiscount(item), 0);
    if (amount > 0) {
      stats.transfers.amount += amount;
      stats.transfers.count += 1;
    }
  }

  stats.total.amount =
    stats.orders.amount + stats.sales.amount + stats.directSales.amount + stats.transfers.amount;
  stats.total.count = stats.orders.count + stats.sales.count + stats.directSales.count + stats.transfers.count;
  return stats;
}
