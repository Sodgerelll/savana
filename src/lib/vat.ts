/**
 * НӨАТ, shared by every sales channel: storefront orders, offline sales, POS direct sales
 * and reseller transactions. Kept free of Firestore imports so the pure data layer
 * (src/data/storefront.ts) can describe the shop's VAT policy without pulling in the
 * database client.
 */

/** НӨАТ rate — 10%, the single Mongolian VAT rate. */
export const VAT_RATE = 0.1;

/**
 * How НӨАТ relates to the prices that were typed in:
 * - `none` — the sale carries no VAT at all
 * - `included` — the prices already contain VAT, so it is carved out of the total
 * - `added` — the prices are net, so VAT is charged on top of them
 */
export type VatMode = "none" | "included" | "added";
export const VAT_MODE_VALUES = ["none", "included", "added"] as const;

/** Anything not recognised is treated as VAT-free, which is how untagged records behave. */
export function normalizeVatMode(value: unknown): VatMode {
  return value === "included" || value === "added" ? value : "none";
}

/** VAT on `base` for the given mode. Included mode carves it out, added mode charges on top. */
export function calculateVat(base: number, mode: VatMode): number {
  if (base <= 0) {
    return 0;
  }

  if (mode === "included") {
    return Math.round(base - base / (1 + VAT_RATE));
  }

  if (mode === "added") {
    return Math.round(base * VAT_RATE);
  }

  return 0;
}

/**
 * Splits a gross amount — one that already contains any VAT it carries — into the tax and
 * the net revenue behind it. Both `included` and `added` totals are gross by the time they
 * are stored, so this is the single way every module derives the tax it must report.
 */
export function vatCarriedBy(grossAmount: number, mode: VatMode): number {
  return mode === "none" ? 0 : calculateVat(grossAmount, "included");
}
