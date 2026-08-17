/**
 * Shared by the Sales and Orders modules, which already share their item shape
 * (`SaleItemPayload = OrderItemPayload`) — a return against either is just "some of these
 * items, in some quantity, coming back", so the record shape and its pure helpers live here
 * once instead of twice.
 */

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
