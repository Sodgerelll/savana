import type { Timestamp } from "firebase/firestore";

// ─── Customer ────────────────────────────────────────────────────────────────

export type CustomerEntityType = "ORGANIZATION" | "INDIVIDUAL" | "RETAIL_POINT";
export type CustomerCategory = "WHOLESALE" | "RETAIL" | "VIP" | "REGULAR";
export type PriceTier = "RETAIL" | "WHOLESALE" | "CUSTOM";

export interface Customer {
  id: string;
  name: string;
  type: CustomerEntityType;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  district: string;
  registrationNumber: string;
  category: CustomerCategory;
  discountRate: number;
  priceTier: PriceTier;
  paymentTermDays: number;
  /**
   * What the customer still owes. This is the same field src/lib/customers.ts maintains —
   * the CRM used to keep a second `balance` field alongside it, so the same debt was
   * tracked twice on the same document and the two never agreed.
   */
  outstandingBalance: number;
  /** Everything ever billed to the customer, and everything they have paid so far. */
  totalSales: number;
  totalPaid: number;
  creditLimit: number;
  totalOrders: number;
  totalReturns: number;
  lastOrderDate: Timestamp | null;
  notes: string;
  isActive: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

export type TransferType = "SALE" | "RETURN" | "SAMPLE" | "CONSIGNMENT";
export type TransferStatus = "DRAFT" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "CREDIT";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "QPAY" | "SOCIALPAY" | "CREDIT";

export interface TransferItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  discountPercent: number;
  lineTotal: number;
  /** Which variant of the product is being moved, when the product has any. */
  variant?: string | null;
}

export interface Transfer {
  id: string;
  transferNumber: string;
  customerId: string;
  customerName: string;
  type: TransferType;
  status: TransferStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  items: TransferItem[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  notes: string;
  /**
   * RETURN transfers only: cash owed back to the customer, once the return has cancelled
   * whatever they still owed on the original. Goods coming back settle debt first; only
   * what is left over is a refund.
   */
  refundDue?: number;
  parentTransferId: string | null;
  deliveredAt: Timestamp | null;
  /** journalEntries doc id posted when this transfer was confirmed — used to reverse on cancel. */
  journalEntryId?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// ─── Payment ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  transferId: string | null;
  customerId: string;
  customerName: string;
  amount: number;
  method: "CASH" | "BANK_TRANSFER" | "QPAY" | "SOCIALPAY";
  referenceNumber: string;
  notes: string;
  paidAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp | null;
}

// ─── Stock Movement ───────────────────────────────────────────────────────────

export type StockMovementType = "IN" | "OUT" | "ADJUSTMENT" | "RETURN";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  transferId: string | null;
  customerId: string | null;
  customerName: string | null;
  type: StockMovementType;
  quantity: number;
  balanceAfter: number;
  reason: string;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
}

// ─── Customer Pricing ─────────────────────────────────────────────────────────

export interface CustomerPricing {
  id: string;
  customerId: string;
  productId: string;
  productName: string;
  specialPrice: number;
  discountPercent: number;
  validFrom: Timestamp;
  validUntil: Timestamp | null;
  notes: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Timestamp | null;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | "TRANSFER_CREATED"
  | "TRANSFER_CONFIRMED"
  | "TRANSFER_SHIPPED"
  | "TRANSFER_DELIVERED"
  | "TRANSFER_CANCELLED"
  | "PAYMENT_RECEIVED"
  | "RETURN_CREATED"
  | "PRICE_CHANGED"
  | "NOTE_ADDED"
  | "INFO_UPDATED";

export interface CustomerTimeline {
  id: string;
  customerId: string;
  type: TimelineEventType;
  title: string;
  description: string;
  relatedId: string | null;
  amount: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp | null;
}

// ─── Product (extended) ───────────────────────────────────────────────────────

export type ProductUnit = "PIECE" | "BOX" | "KG" | "LITER";

/**
 * A catalogue product as the CRM screens need it. This is a *view* over the real
 * `products` documents, built by getActiveProducts() — the CRM used to read fields
 * (`currentStock`, `unitPrice`, `isActive`) that the product editor never wrote, so every
 * lookup silently returned zero.
 */
export interface CrmProduct {
  id: string;
  name: string;
  sku: string;
  /** The catalogue `price` field. */
  unitPrice: number;
  /** Falls back to `unitPrice` when the product has no separate wholesale price. */
  wholesalePrice: number;
  costPrice: number;
  /** Remaining units: `totalStock - soldCount`, or the variant's own remainder. */
  currentStock: number;
  minStockLevel: number;
  unit: ProductUnit;
  category: string;
  isActive: boolean;
  /** Set when this row represents one variant of a product rather than the whole product. */
  variant: string | null;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface CustomerProductStat {
  productId: string;
  productName: string;
  sku: string;
  totalQuantity: number;
  returnedQuantity: number;
  netQuantity: number;
  totalSpent: number;
  orderCount: number;
  lastOrderDate: Timestamp | null;
  averageQuantity: number;
  averageIntervalDays: number;
  nextPredictedDate: Date | null;
  isOverdue: boolean;
}

export interface CustomerPaymentStats {
  totalPaid: number;
  totalDebt: number;
  creditLimit: number;
  creditUsagePercent: number;
  paymentHistory: Payment[];
  averagePaymentDays: number;
}

// ─── Effective Price Result ───────────────────────────────────────────────────

export type PriceType = "special" | "wholesale" | "discount" | "standard";

export interface EffectivePriceResult {
  price: number;
  type: PriceType;
  label: string;
}

// ─── Transfer Form (wizard state) ─────────────────────────────────────────────

export interface TransferFormItem {
  productId: string;
  productName: string;
  /** Which variant of the product this row covers; null for products without variants. */
  variant: string | null;
  sku: string;
  currentStock: number;
  minStockLevel: number;
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  discountPercent: number;
  lineTotal: number;
  priceType: PriceType;
}

export interface TransferForm {
  type: TransferType;
  items: TransferFormItem[];
  paymentMethod: PaymentMethod;
  paidAmount: number;
  taxEnabled: boolean;
  referenceNumber: string;
  notes: string;
}
