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
  balance: number;
  creditLimit: number;
  totalOrders: number;
  totalRevenue: number;
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
  parentTransferId: string | null;
  deliveredAt: Timestamp | null;
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

export interface CrmProduct {
  id: string;
  name: string;
  sku: string;
  unitPrice: number;
  wholesalePrice: number;
  costPrice: number;
  currentStock: number;
  minStockLevel: number;
  unit: ProductUnit;
  category: string;
  isActive: boolean;
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
