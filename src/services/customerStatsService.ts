import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  TRANSFERS_COLLECTION,
  PAYMENTS_COLLECTION,
} from "./transferService";
import type {
  CustomerProductStat,
  CustomerPaymentStats,
  Transfer,
  Payment,
} from "../types/crm";

export async function getCustomerProductStats(customerId: string): Promise<CustomerProductStat[]> {
  const snap = await getDocs(
    query(
      collection(db, TRANSFERS_COLLECTION),
      where("customerId", "==", customerId),
      where("status", "in", ["CONFIRMED", "SHIPPED", "DELIVERED"]),
      orderBy("createdAt", "desc")
    )
  );

  const transfers = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transfer);

  // Aggregate per product
  const productMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      sku: string;
      quantities: number[];
      dates: Date[];
      totalSpent: number;
      returnedQuantity: number;
    }
  >();

  for (const transfer of transfers) {
    const isReturn = transfer.type === "RETURN";
    for (const item of transfer.items) {
      const existing = productMap.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantities: [],
        dates: [],
        totalSpent: 0,
        returnedQuantity: 0,
      };

      if (isReturn) {
        existing.returnedQuantity += item.quantity;
      } else {
        existing.quantities.push(item.quantity);
        existing.totalSpent += item.lineTotal;
        if (transfer.createdAt) {
          const d = transfer.createdAt.toDate?.() ?? new Date(transfer.createdAt as unknown as number);
          existing.dates.push(d);
        }
      }
      productMap.set(item.productId, existing);
    }
  }

  const now = new Date();

  return Array.from(productMap.values()).map((p) => {
    const totalQuantity = p.quantities.reduce((s, q) => s + q, 0);
    const orderCount = p.quantities.length;
    const averageQuantity = orderCount > 0 ? totalQuantity / orderCount : 0;

    // Calculate average interval days
    let averageIntervalDays = 0;
    let nextPredictedDate: Date | null = null;
    let isOverdue = false;

    if (p.dates.length >= 2) {
      const sorted = [...p.dates].sort((a, b) => a.getTime() - b.getTime());
      let totalInterval = 0;
      for (let i = 1; i < sorted.length; i++) {
        totalInterval += (sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      }
      averageIntervalDays = Math.round(totalInterval / (sorted.length - 1));

      if (averageIntervalDays > 0 && sorted.length > 0) {
        const lastDate = sorted[sorted.length - 1];
        nextPredictedDate = new Date(lastDate.getTime() + averageIntervalDays * 24 * 60 * 60 * 1000);
        isOverdue = nextPredictedDate < now;
      }
    }

    const lastDate = p.dates.length > 0 ? p.dates.reduce((a, b) => (a > b ? a : b)) : null;

    return {
      productId: p.productId,
      productName: p.productName,
      sku: p.sku,
      totalQuantity,
      returnedQuantity: p.returnedQuantity,
      netQuantity: totalQuantity - p.returnedQuantity,
      totalSpent: p.totalSpent,
      orderCount,
      lastOrderDate: lastDate
        ? { toDate: () => lastDate, seconds: Math.floor(lastDate.getTime() / 1000), nanoseconds: 0 } as never
        : null,
      averageQuantity: Math.round(averageQuantity),
      averageIntervalDays,
      nextPredictedDate,
      isOverdue,
    };
  });
}

export async function getCustomerPaymentStats(
  customerId: string,
  customerBalance: number,
  customerCreditLimit: number
): Promise<CustomerPaymentStats> {
  const paymentsSnap = await getDocs(
    query(
      collection(db, PAYMENTS_COLLECTION),
      where("customerId", "==", customerId),
      orderBy("paidAt", "desc"),
      limit(20)
    )
  );

  const paymentHistory = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Payment);
  const totalPaid = paymentHistory.reduce((s, p) => s + p.amount, 0);

  const creditUsagePercent =
    customerCreditLimit > 0
      ? Math.min(100, Math.round((customerBalance / customerCreditLimit) * 100))
      : 0;

  return {
    totalPaid,
    totalDebt: customerBalance,
    creditLimit: customerCreditLimit,
    creditUsagePercent,
    paymentHistory,
    averagePaymentDays: 0, // simplified
  };
}
