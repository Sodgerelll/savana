import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { buildReversalEntry, type BuiltEntry } from "./accounting/entryBuilders";
import { generateJournalEntryNumber, postJournalEntry, type SourceType } from "./accounting/postEntryClient";

/**
 * Purchases and consumption of the things the shop buys to make and wrap its goods — raw
 * materials (src/lib/rawMaterials.ts) and packaging (src/lib/storefrontRepository.ts) work
 * exactly the same way, so the stock-and-ledger logic lives here once.
 *
 * Every operation reads the item and writes it back, together with its journal entry, in a
 * single transaction:
 * - the logs are rewritten from the fresh document rather than with arrayUnion/arrayRemove,
 *   so removing an entry that another tab already removed fails instead of reversing its
 *   money and stock a second time (a double click used to do exactly that);
 * - the blended unit cost is computed from the stock the transaction actually saw.
 *
 * The ledger amount of a purchase is its landed cost — the goods plus the freight (cargo)
 * paid to bring them in. Freight used to be recorded on the entry and nowhere else: the money
 * left the account in real life but never in the books, and the material's cost ignored it.
 * The amount posted is stored on the entry (`ledgerAmount`), so a removal reverses exactly
 * what was booked — entries saved before the field existed reverse their goods value only,
 * which is what was booked for them.
 */

export interface MaterialPurchaseEntry {
  id: string;
  quantity: number;
  unitCost: number | null;
  cargo: number;
  createdByUid: string;
  paymentMethod?: string | null;
  /** What the purchase entry posted to the ledger. Absent on entries saved before it existed. */
  ledgerAmount?: number;
  supplier?: string;
}

export interface MaterialUsageEntry {
  id: string;
  quantity: number;
  unitCost: number | null;
  createdByUid: string;
  reason?: string;
}

export interface MaterialLedgerConfig {
  /** Firestore collection holding the items (`rawMaterials`, `packaging`). */
  collectionName: string;
  purchaseSourceType: SourceType;
  usageSourceType: SourceType;
  buildPurchaseEntry: (params: { amount: number; paymentMethod?: string | null }) => BuiltEntry;
  buildWriteOffEntry: (params: { amount: number }) => BuiltEntry;
  /** Error raised when the item does not exist. */
  notFoundMessage: string;
  describePurchase: (entry: MaterialPurchaseEntry, itemId: number) => string;
  describePurchaseRemoval: string;
  describeUsage: (entry: MaterialUsageEntry, itemId: number) => string;
  describeUsageRemoval: string;
}

/** Value of the goods alone — 0 when no unit cost was recorded. */
export function goodsAmount(entry: Pick<MaterialPurchaseEntry, "quantity" | "unitCost">): number {
  return entry.unitCost && entry.unitCost > 0 ? Math.round(entry.quantity * entry.unitCost) : 0;
}

/** Landed cost: the goods plus the freight paid to bring them in. */
export function landedAmount(entry: Pick<MaterialPurchaseEntry, "quantity" | "unitCost" | "cargo">): number {
  return goodsAmount(entry) + Math.max(0, Math.round(entry.cargo || 0));
}

/** What an entry actually posted to the ledger. */
export function bookedPurchaseAmount(entry: MaterialPurchaseEntry): number {
  return typeof entry.ledgerAmount === "number" ? entry.ledgerAmount : goodsAmount(entry);
}

/**
 * The item's unit cost after `quantity` units arrive at `unitCost`, blended with what was
 * already on the shelf. Returns null when there is nothing to go on, which leaves the
 * existing figure untouched.
 */
export function blendUnitCost(
  currentRemaining: number,
  currentUnitCost: number | null,
  quantity: number,
  unitCost: number | null,
): number | null {
  if (unitCost === null || unitCost <= 0 || quantity <= 0) return null;
  const held = Math.max(0, currentRemaining);
  if (currentUnitCost === null || currentUnitCost <= 0 || held <= 0) return unitCost;
  return Math.round((held * currentUnitCost + quantity * unitCost) / (held + quantity));
}

function actorUid(fallback: string): string {
  return auth?.currentUser?.uid ?? fallback;
}

function readUnitCost(value: unknown): number | null {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function readLog<T extends { id: string }>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as T[]) : [];
}

export async function recordMaterialPurchase<T extends MaterialPurchaseEntry>(
  config: MaterialLedgerConfig,
  itemId: number,
  input: T,
): Promise<void> {
  const amount = landedAmount(input);
  const entry: T = { ...input, ledgerAmount: amount };
  const entryNumber = amount > 0 ? await generateJournalEntryNumber() : null;
  const itemRef = doc(db, config.collectionName, String(itemId));

  await runTransaction(db, async (t) => {
    const snap = await t.get(itemRef);
    if (!snap.exists()) {
      throw new Error(config.notFoundMessage);
    }
    const data = snap.data() as Record<string, unknown>;
    const remaining = Number(data.remaining ?? 0);

    // The landed cost per unit, when the goods themselves were priced.
    const landedUnitCost = goodsAmount(entry) > 0 && entry.quantity > 0 ? amount / entry.quantity : null;
    const nextUnitCost = blendUnitCost(remaining, readUnitCost(data.unitCost), entry.quantity, landedUnitCost);

    t.update(itemRef, {
      remaining: remaining + entry.quantity,
      purchaseLog: [...readLog<MaterialPurchaseEntry>(data.purchaseLog), entry],
      ...(nextUnitCost !== null ? { unitCost: nextUnitCost } : {}),
      _updatedAt: serverTimestamp(),
    });

    if (entryNumber) {
      postJournalEntry(t, entryNumber, config.buildPurchaseEntry({ amount, paymentMethod: entry.paymentMethod }), {
        sourceType: config.purchaseSourceType,
        sourceId: `${itemId}:${entry.id}`,
        sourceNumber: entry.id,
        description: config.describePurchase(entry, itemId),
        createdBy: actorUid(entry.createdByUid),
      });
    }
  });
}

export async function removeMaterialPurchase(
  config: MaterialLedgerConfig,
  itemId: number,
  shown: MaterialPurchaseEntry,
): Promise<void> {
  const entryId = shown.id;
  // Reserved up front, because it runs its own transaction.
  const entryNumber = bookedPurchaseAmount(shown) > 0 ? await generateJournalEntryNumber() : null;
  const itemRef = doc(db, config.collectionName, String(itemId));

  await runTransaction(db, async (t) => {
    const snap = await t.get(itemRef);
    if (!snap.exists()) {
      throw new Error(config.notFoundMessage);
    }
    const data = snap.data() as Record<string, unknown>;
    const log = readLog<MaterialPurchaseEntry>(data.purchaseLog);
    const entry = log.find((item) => item.id === entryId);
    if (!entry) {
      throw new Error("Энэ бичилт аль хэдийн устгагдсан байна.");
    }

    t.update(itemRef, {
      remaining: Number(data.remaining ?? 0) - Number(entry.quantity ?? 0),
      purchaseLog: log.filter((item) => item.id !== entryId),
      _updatedAt: serverTimestamp(),
    });

    const amount = bookedPurchaseAmount(entry);
    if (amount > 0) {
      if (!entryNumber) {
        throw new Error("Бичилт өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.");
      }
      // Mirror image of the purchase: the goods leave again and the money goes back to the
      // account it was actually paid from.
      postJournalEntry(
        t,
        entryNumber,
        buildReversalEntry(config.buildPurchaseEntry({ amount, paymentMethod: entry.paymentMethod }).lines),
        {
          sourceType: config.purchaseSourceType,
          sourceId: `${itemId}:${entry.id}`,
          sourceNumber: entry.id,
          description: config.describePurchaseRemoval,
          createdBy: actorUid(entry.createdByUid),
        },
      );
    }
  });
}

export async function recordMaterialUsage<T extends Omit<MaterialUsageEntry, "unitCost">>(
  config: MaterialLedgerConfig,
  itemId: number,
  input: T,
): Promise<void> {
  // Reserved up front; whether it is used depends on the unit cost read inside.
  const entryNumber = await generateJournalEntryNumber();
  const itemRef = doc(db, config.collectionName, String(itemId));

  await runTransaction(db, async (t) => {
    const snap = await t.get(itemRef);
    if (!snap.exists()) {
      throw new Error(config.notFoundMessage);
    }
    const data = snap.data() as Record<string, unknown>;
    const remaining = Number(data.remaining ?? 0);
    if (input.quantity > remaining) {
      throw new Error("INSUFFICIENT_STOCK");
    }

    // Snapshotted on the entry so a later reversal posts the same amount even if the unit
    // cost has since moved with new purchases.
    const unitCost = readUnitCost(data.unitCost);
    const entry: T & MaterialUsageEntry = { ...input, unitCost };
    const amount = unitCost && unitCost > 0 ? Math.round(input.quantity * unitCost) : 0;

    t.update(itemRef, {
      remaining: remaining - input.quantity,
      usageLog: [...readLog<MaterialUsageEntry>(data.usageLog), entry],
      _updatedAt: serverTimestamp(),
    });

    if (amount > 0) {
      postJournalEntry(t, entryNumber, config.buildWriteOffEntry({ amount }), {
        sourceType: config.usageSourceType,
        sourceId: `${itemId}:${entry.id}`,
        sourceNumber: entry.id,
        description: config.describeUsage(entry, itemId),
        createdBy: actorUid(entry.createdByUid),
      });
    }
  });
}

export async function removeMaterialUsage(
  config: MaterialLedgerConfig,
  itemId: number,
  shown: MaterialUsageEntry,
): Promise<void> {
  const entryId = shown.id;
  const shownCost = readUnitCost(shown.unitCost);
  const entryNumber = shownCost && shownCost > 0 ? await generateJournalEntryNumber() : null;
  const itemRef = doc(db, config.collectionName, String(itemId));

  await runTransaction(db, async (t) => {
    const snap = await t.get(itemRef);
    if (!snap.exists()) {
      throw new Error(config.notFoundMessage);
    }
    const data = snap.data() as Record<string, unknown>;
    const log = readLog<MaterialUsageEntry>(data.usageLog);
    const entry = log.find((item) => item.id === entryId);
    if (!entry) {
      throw new Error("Энэ бичилт аль хэдийн устгагдсан байна.");
    }

    t.update(itemRef, {
      remaining: Number(data.remaining ?? 0) + Number(entry.quantity ?? 0),
      usageLog: log.filter((item) => item.id !== entryId),
      _updatedAt: serverTimestamp(),
    });

    const unitCost = readUnitCost(entry.unitCost);
    const amount = unitCost && unitCost > 0 ? Math.round(Number(entry.quantity ?? 0) * unitCost) : 0;
    if (amount > 0) {
      if (!entryNumber) {
        throw new Error("Бичилт өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу.");
      }
      postJournalEntry(t, entryNumber, buildReversalEntry(config.buildWriteOffEntry({ amount }).lines), {
        sourceType: config.usageSourceType,
        sourceId: `${itemId}:${entry.id}`,
        sourceNumber: entry.id,
        description: config.describeUsageRemoval,
        createdBy: actorUid(entry.createdByUid),
      });
    }
  });
}
