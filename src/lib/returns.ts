/**
 * Shared by the Sales and Orders modules, which already share their item shape
 * (`SaleItemPayload = OrderItemPayload`) — a return against either is just "some of these
 * items, in some quantity, coming back", so the record shape and its pure helpers live here
 * once instead of twice.
 */

import { calculateVat, type VatMode } from "./vat";

export interface RetailReturnItem {
  productId: number;
  variant: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface RetailReturnRecord {
  id: string;
  items: RetailReturnItem[];
  /** Returned value net of VAT — what was debited to Sales Returns. */
  subtotal: number;
  vatAmount: number;
  /** subtotal + vatAmount — what was credited back out of the money account. */
  totalAmount: number;
  reason: string;
  journalEntryId: string | null;
  createdByUid: string;
  createdByName: string;
  createdAt: string | null;
}

/** Identifies one returnable line of a sale/order — a product, split by variant. */
export function returnLineKey(productId: number, variant: string | null): string {
  return `${productId}|${variant ?? ""}`;
}

/** How much of each line has already come back, across every return already recorded. */
export function returnedQuantities(returns: RetailReturnRecord[]): Map<string, number> {
  const returned = new Map<string, number>();
  for (const record of returns) {
    for (const item of record.items) {
      const key = returnLineKey(item.productId, item.variant);
      returned.set(key, (returned.get(key) ?? 0) + item.quantity);
    }
  }
  return returned;
}

/** Whether any line of the given items still has quantity left to return. */
export function hasReturnableQuantity(
  items: Array<{ productId: number; variant: string | null; quantity: number }>,
  returns: RetailReturnRecord[],
): boolean {
  const returned = returnedQuantities(returns);
  return items.some((item) => item.quantity > (returned.get(returnLineKey(item.productId, item.variant)) ?? 0));
}

/** The money side of one retail return. */
export interface RetailReturnMoney {
  /** Value net of НӨАТ — debited to Sales Returns. */
  net: number;
  /** НӨАТ carried by the returned goods — debited back out of VAT payable. */
  vat: number;
  /** What the buyer gets back: net + vat. */
  gross: number;
}

/**
 * What a return of some lines of a sale/order is worth, in the terms the buyer was charged.
 *
 * Three things the naive `unitPrice × quantity` got wrong:
 * - A whole-sale discount (the Sales module's хөнгөлөлт) lowers what every line was actually
 *   sold for, so the lines are scaled by the share of the list value the buyer really paid.
 * - In `added` mode the stored prices are net and НӨАТ was charged on top, so the buyer gets
 *   the tax back too. Carving the tax out of the net price returned less than was paid.
 * - Rounding across partial returns must never give back more than was charged, so the
 *   return that brings the last units home takes exactly what is left.
 */
export function retailReturnMoney(params: {
  /** Σ unitPrice × quantity of the lines coming back now. */
  linesValue: number;
  /** Σ unitPrice × quantity of every line on the sale/order. */
  allLinesValue: number;
  /** Goods value the buyer was charged, after discounts, before any НӨАТ added on top. */
  chargedGoodsValue: number;
  /** НӨАТ recorded on the sale/order. */
  chargedVat: number;
  vatMode: VatMode;
  /** Returns already booked against the same sale/order. */
  priorReturns: RetailReturnRecord[];
  /** True when this return brings back every unit still outstanding. */
  completesReturn: boolean;
}): RetailReturnMoney {
  const chargedGoods = Math.max(0, Math.round(params.chargedGoodsValue));
  const chargedVat = params.vatMode === "none" ? 0 : Math.max(0, Math.round(params.chargedVat));
  // Gross goods value the buyer paid: `added` put the tax on top, the other modes carry it inside.
  const chargedGross = params.vatMode === "added" ? chargedGoods + chargedVat : chargedGoods;

  const priorGross = params.priorReturns.reduce((sum, record) => sum + Math.max(0, record.totalAmount), 0);
  const priorVat = params.priorReturns.reduce((sum, record) => sum + Math.max(0, record.vatAmount), 0);
  const grossLeft = Math.max(0, chargedGross - priorGross);
  const vatLeft = Math.max(0, chargedVat - priorVat);

  if (params.completesReturn) {
    const vat = Math.min(vatLeft, grossLeft);
    return { net: grossLeft - vat, vat, gross: grossLeft };
  }

  const ratio =
    params.allLinesValue > 0 ? Math.min(1, Math.max(0, chargedGoods / params.allLinesValue)) : 1;
  const goods = Math.round(Math.max(0, params.linesValue) * ratio);

  let net: number;
  let vat: number;
  if (params.vatMode === "added") {
    net = goods;
    vat = calculateVat(net, "added");
  } else if (params.vatMode === "included") {
    vat = calculateVat(goods, "included");
    net = goods - vat;
  } else {
    net = goods;
    vat = 0;
  }

  // Never more than what is still outstanding.
  vat = Math.min(vat, vatLeft);
  const gross = Math.min(net + vat, grossLeft);
  vat = Math.min(vat, gross);
  return { net: gross - vat, vat, gross };
}

/**
 * True when returning `request` would bring back every unit of every line still outstanding
 * on the sale/order.
 */
export function completesReturn(
  items: Array<{ productId: number; variant: string | null; quantity: number }>,
  priorReturns: RetailReturnRecord[],
  request: Array<{ productId: number; variant: string | null; quantity: number }>,
): boolean {
  const returned = returnedQuantities(priorReturns);
  for (const item of request) {
    const key = returnLineKey(item.productId, item.variant);
    returned.set(key, (returned.get(key) ?? 0) + item.quantity);
  }
  const shipped = new Map<string, number>();
  for (const item of items) {
    const key = returnLineKey(item.productId, item.variant);
    shipped.set(key, (shipped.get(key) ?? 0) + item.quantity);
  }
  for (const [key, quantity] of shipped) {
    if ((returned.get(key) ?? 0) < quantity) return false;
  }
  return true;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

/** Shared by `deserializeSale` and `deserializeOrder` — tolerant of anything malformed, same as their item parsing. */
export function deserializeReturns(value: unknown): RetailReturnRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((record): RetailReturnRecord | null => {
      if (typeof record !== "object" || record === null) {
        return null;
      }

      const data = record as Record<string, unknown>;
      const items = Array.isArray(data.items)
        ? data.items
            .map((item): RetailReturnItem | null => {
              if (typeof item !== "object" || item === null) return null;
              const itemData = item as Record<string, unknown>;
              return {
                productId: Number(itemData.productId ?? 0),
                variant: typeof itemData.variant === "string" ? itemData.variant : null,
                name: String(itemData.name ?? ""),
                quantity: Number(itemData.quantity ?? 0),
                unitPrice: Number(itemData.unitPrice ?? 0),
              } satisfies RetailReturnItem;
            })
            .filter((item): item is RetailReturnItem => item !== null)
        : [];

      return {
        id: String(data.id ?? ""),
        items,
        subtotal: Number(data.subtotal ?? 0),
        vatAmount: Number(data.vatAmount ?? 0),
        totalAmount: Number(data.totalAmount ?? 0),
        reason: String(data.reason ?? ""),
        journalEntryId: typeof data.journalEntryId === "string" ? data.journalEntryId : null,
        createdByUid: String(data.createdByUid ?? ""),
        createdByName: String(data.createdByName ?? ""),
        createdAt: parseTimestamp(data.createdAt),
      } satisfies RetailReturnRecord;
    })
    .filter((record): record is RetailReturnRecord => record !== null);
}
