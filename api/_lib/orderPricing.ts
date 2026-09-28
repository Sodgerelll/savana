// Server-side pricing of a storefront order.
//
// The order document is written by the shopper's own browser, so every price, line total
// and total on it is a claim, not a fact. Before a Bonum invoice is raised the order is
// re-priced here from the catalogue, the live discounts and the shop settings — the same
// sources and the same arithmetic the checkout uses — and the invoice is issued for this
// figure alone. What the browser claimed is kept only as a note on the order.
//
// Kept free of Firestore calls apart from `loadOrderPricingInputs`, so the arithmetic can be
// tested on plain objects.

/* eslint-disable @typescript-eslint/no-explicit-any */

const SITE_ID = 'main';
/** Mirrors DEFAULT_SHIPPING_FEE in src/data/storefront.ts. */
const DEFAULT_SHIPPING_FEE = 8000;
/** Mirrors VAT_RATE in src/lib/vat.ts. */
const VAT_RATE = 0.1;
/** Same ceiling the Firestore rules put on a storefront order. */
const MAX_LINES = 100;
/** A single line beyond this is a typo or an attack, never a retail basket. */
const MAX_QUANTITY_PER_LINE = 1000;

export type VatMode = 'none' | 'included' | 'added';

/** Why an order could not be priced — the message is shown to the shopper as is. */
export class OrderPricingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'OrderPricingError';
    this.code = code;
  }
}

export interface ClientOrderItem {
  productId?: unknown;
  variant?: unknown;
  quantity?: unknown;
  image?: unknown;
}

export interface PricedOrderItem {
  productId: number;
  name: string;
  category: string;
  image: string | null;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number;
  lineTotal: number;
}

export interface PricedOrderTotals {
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
  discountTotal: number;
  vatMode: VatMode;
  vatAmount: number;
}

export interface OrderPricingInputs {
  /** Product documents by numeric id; null when the document does not exist. */
  products: Map<number, Record<string, unknown> | null>;
  /** Raw documents of sites/main/discounts. */
  discounts: Array<Record<string, unknown>>;
  /** Raw sites/main/settings/general document (empty object when missing). */
  settings: Record<string, unknown>;
  /** `YYYY-MM-DD` in Ulaanbaatar. */
  today: string;
}

/** `YYYY-MM-DD` in Ulaanbaatar (UTC+8, no daylight saving), how discount windows are stored. */
export function ulaanbaatarDateKey(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function asShippingFee(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : DEFAULT_SHIPPING_FEE;
}

function asThreshold(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function asVatMode(value: unknown): VatMode {
  return value === 'included' || value === 'added' ? value : 'none';
}

/** Mirrors calculateVat in src/lib/vat.ts. */
export function vatFor(base: number, mode: VatMode): number {
  if (base <= 0) return 0;
  if (mode === 'included') return Math.round(base - base / (1 + VAT_RATE));
  if (mode === 'added') return Math.round(base * VAT_RATE);
  return 0;
}

/** Mirrors applyDiscount in src/lib/storefrontHelpers.ts. */
function applyDiscount(price: number, discount: Record<string, unknown>): number {
  const value = Number(discount.value ?? 0);
  if (discount.type === 'percent') {
    return Math.round(price * (1 - value / 100));
  }
  return Math.max(0, price - value);
}

/**
 * The live price of a product after its best active discount. Mirrors isDiscountActive in
 * src/lib/storefrontHelpers.ts; when two discounts overlap, the one that leaves the lower
 * price wins, which is also what the checkout picks (getBestDiscountedPrice).
 */
export function discountedUnitPrice(
  listPrice: number,
  productId: number,
  discounts: Array<Record<string, unknown>>,
  today: string,
): number {
  let best = listPrice;
  for (const discount of discounts) {
    if (Number(discount.productId) !== productId) continue;
    if (discount.status !== 'active') continue;
    const startAt = String(discount.startAt ?? '');
    const endAt = String(discount.endAt ?? '');
    if (!(startAt <= today && endAt >= today)) continue;
    best = Math.min(best, applyDiscount(listPrice, discount));
  }
  return best;
}

function wholePositive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** An image the order list may show: a web address or an inline picture, nothing else. */
function safeImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.startsWith('https://') || value.startsWith('data:image/') ? value : null;
}

/**
 * Prices a storefront basket exactly as the checkout does — list price (the variant's when
 * one is named), less the product's live discount, delivery by the shop's fee and free
 * threshold, НӨАТ by the shop's mode — but from the catalogue rather than from the browser.
 */
export function priceWebOrder(
  clientItems: ClientOrderItem[],
  inputs: OrderPricingInputs,
): { items: PricedOrderItem[]; totals: PricedOrderTotals } {
  if (!Array.isArray(clientItems) || clientItems.length === 0) {
    throw new OrderPricingError('EMPTY', 'Захиалгад бүтээгдэхүүн байхгүй байна.');
  }
  if (clientItems.length > MAX_LINES) {
    throw new OrderPricingError('TOO_MANY_LINES', 'Захиалгын мөрийн тоо хэт олон байна.');
  }

  const items: PricedOrderItem[] = clientItems.map((raw) => {
    const productId = wholePositive(raw?.productId);
    const quantity = wholePositive(raw?.quantity);
    if (productId === null || quantity === null || quantity > MAX_QUANTITY_PER_LINE) {
      throw new OrderPricingError('BAD_LINE', 'Захиалгын мөр буруу байна. Сагсаа шинэчилнэ үү.');
    }

    const product = inputs.products.get(productId) ?? null;
    if (!product || product.status === 'inactive') {
      throw new OrderPricingError(
        'UNAVAILABLE',
        'Сагсанд байгаа бүтээгдэхүүн худалдаанаас гарсан байна. Сагсаа шинэчилнэ үү.',
      );
    }

    const name = String(product.name ?? '');
    const variantName = typeof raw?.variant === 'string' && raw.variant.trim() ? raw.variant : null;
    let listPrice = Number(product.price ?? 0);

    if (variantName) {
      const variants = Array.isArray(product.variants) ? (product.variants as Array<Record<string, unknown>>) : [];
      const variant = variants.find((entry) => entry?.name === variantName);
      if (!variant) {
        throw new OrderPricingError(
          'UNKNOWN_VARIANT',
          `"${name}" — сонгосон хэмжээ олдсонгүй. Сагсаа шинэчилнэ үү.`,
        );
      }
      // Mirrors getUnitPrice in src/context/CartContext.tsx: the variant's price, falling back
      // to the product's when the variant carries none.
      listPrice = Number(variant.price ?? product.price ?? 0);
    }

    if (!Number.isFinite(listPrice) || listPrice <= 0) {
      throw new OrderPricingError('UNPRICED', `"${name}" бүтээгдэхүүний үнэ тохируулагдаагүй байна.`);
    }

    listPrice = Math.round(listPrice);
    const unitPrice = discountedUnitPrice(listPrice, productId, inputs.discounts, inputs.today);

    return {
      productId,
      name,
      category: String(product.category ?? ''),
      image: safeImage(raw?.image),
      variant: variantName,
      quantity,
      unitPrice,
      originalUnitPrice: listPrice,
      lineTotal: unitPrice * quantity,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discountTotal = items.reduce(
    (sum, item) => sum + (item.originalUnitPrice - item.unitPrice) * item.quantity,
    0,
  );

  const settings = inputs.settings ?? {};
  const minOrder = asThreshold(settings.minOrderForDelivery);
  if (minOrder > 0 && subtotal < minOrder) {
    throw new OrderPricingError(
      'BELOW_MINIMUM',
      `${minOrder.toLocaleString('en-US')}₮-өөс доош дүнтэй захиалгыг хүргэх боломжгүй.`,
    );
  }

  const fee = asShippingFee(settings.shippingFee);
  const threshold = asThreshold(settings.freeShippingThreshold);
  const shippingFee = threshold > 0 && subtotal >= threshold ? 0 : fee;
  const vatMode = asVatMode(settings.vatMode);
  const vatAmount = vatFor(subtotal, vatMode);
  const grandTotal = subtotal + shippingFee + (vatMode === 'added' ? vatAmount : 0);

  return {
    items,
    totals: { subtotal, shippingFee, grandTotal, discountTotal, vatMode, vatAmount },
  };
}

/** Reads the catalogue rows, discounts and settings an order's pricing depends on. */
export async function loadOrderPricingInputs(
  db: any,
  clientItems: ClientOrderItem[],
  now: Date,
): Promise<OrderPricingInputs> {
  const productIds = Array.from(
    new Set(
      (Array.isArray(clientItems) ? clientItems : [])
        .map((item) => wholePositive(item?.productId))
        .filter((id): id is number => id !== null),
    ),
  );

  const [productSnaps, discountsSnap, settingsSnap] = await Promise.all([
    Promise.all(productIds.map((id) => db.collection('products').doc(String(id)).get())),
    db.collection(`sites/${SITE_ID}/discounts`).get(),
    db.doc(`sites/${SITE_ID}/settings/general`).get(),
  ]);

  const products = new Map<number, Record<string, unknown> | null>();
  productIds.forEach((id, index) => {
    const snap = productSnaps[index];
    products.set(id, snap?.exists ? (snap.data() as Record<string, unknown>) : null);
  });

  return {
    products,
    discounts: (discountsSnap?.docs ?? []).map((snap: any) => snap.data() as Record<string, unknown>),
    settings: settingsSnap?.exists ? (settingsSnap.data() as Record<string, unknown>) : {},
    today: ulaanbaatarDateKey(now),
  };
}
