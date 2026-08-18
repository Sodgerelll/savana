import type { Product } from "../../data/products";
import type { JournalEntry, SiteNavigationItem } from "../../data/storefront";
import type { OrderItemPayload, OrderRecord, OrderStatus } from "../../lib/orders";
import {
  SALE_CHANNEL_VALUES,
  SALE_CUSTOMER_TYPE_VALUES,
  type SaleChannel,
  type SaleCustomerType,
  type SaleRecord,
} from "../../lib/sales";
import type { UserAuthMethod, UserProfile, UserRole } from "../../lib/userProfiles";

export function getProductCode(productId: number): string {
  return `#${String((productId + 99) % 1000).padStart(3, "0")}`;
}

/**
 * Turns the stock module's coded errors into a sentence an admin can act on.
 *
 * `INSUFFICIENT_STOCK:<available>`, `MISSING_VARIANT:<product>` and
 * `UNKNOWN_VARIANT:<variant>` travel as the Error message (src/lib/inventory.ts) so that
 * every screen that moves stock can say the same thing about them.
 */
export function describeStockError(error: Error, language: "MN" | "EN"): string {
  const message = String(error.message ?? "");

  if (message.startsWith("INSUFFICIENT_STOCK:")) {
    const available = message.slice("INSUFFICIENT_STOCK:".length);
    return language === "MN"
      ? `Нөөц хүрэлцэхгүй байна. Боломжит үлдэгдэл: ${available}`
      : `Insufficient stock. Available: ${available}`;
  }

  if (message.startsWith("MISSING_VARIANT:")) {
    const productName = message.slice("MISSING_VARIANT:".length);
    return language === "MN"
      ? `"${productName}" — хувилбартай бүтээгдэхүүн тул хувилбарыг заавал сонгоно уу.`
      : `"${productName}" has variants — pick which one is leaving stock.`;
  }

  if (message.startsWith("UNKNOWN_VARIANT:")) {
    const variant = message.slice("UNKNOWN_VARIANT:".length);
    return language === "MN"
      ? `"${variant}" хувилбар бүтээгдэхүүн дээр байхгүй байна. Хувилбарын нэр өөрчлөгдсөн эсэхийг шалгана уу.`
      : `The product has no variant called "${variant}" — check whether it was renamed.`;
  }

  return message || (language === "MN" ? "Алдаа гарлаа." : "Error occurred.");
}

export function getProductLabel(productId: number, productName: string): string {
  return `${getProductCode(productId)} - ${productName}`;
}

export function cloneVariants(variants?: Product["variants"]): Product["variants"] {
  return variants?.map((v) => ({ ...v }));
}

export function cloneProduct(product: Product): Product {
  return {
    ...product,
    images: [...product.images],
    variants: product.variants?.map((variant) => ({ ...variant })),
  };
}

export function cloneOrderRecord(order: OrderRecord): OrderRecord {
  return {
    ...order,
    auth: { ...order.auth },
    customer: { ...order.customer },
    address: { ...order.address },
    items: order.items.map((item) => ({ ...item })),
    totals: { ...order.totals },
    payment: { ...order.payment },
  };
}

export function getUserIdentity(profile: UserProfile) {
  return profile.displayName || profile.phoneNumber || profile.email || profile.uid;
}

export function getRoleLabel(role: UserRole, language: "MN" | "EN") {
  switch (role) {
    case "sysadmin":
      return language === "MN" ? "Систем админ" : "System admin";
    case "admin":
      return language === "MN" ? "Админ" : "Admin";
    case "worker":
      return language === "MN" ? "Ажилтан" : "Employee";
    default:
      return language === "MN" ? "Хэрэглэгч" : "Customer";
  }
}

export function getManageableRoleOptions(currentRole: UserRole): UserRole[] {
  const roles: UserRole[] = ["sysadmin", "admin", "worker"];
  return currentRole === "customer" ? [...roles, "customer" as const] : roles;
}

export function getUserProviderSummary(profile: UserProfile) {
  return profile.providers.length > 0 ? profile.providers.join(", ") : "-";
}

export function getAuthMethodLabel(method: UserAuthMethod, language: "MN" | "EN") {
  switch (method) {
    case "email":
      return language === "MN" ? "И-мэйл" : "Email";
    case "google":
      return "Google";
    case "facebook":
      return "Facebook";
    case "phone":
      return language === "MN" ? "Утас" : "Phone";
    case "guest":
      return language === "MN" ? "Зочин" : "Guest";
    default:
      return language === "MN" ? "Тодорхойгүй" : "Unknown";
  }
}

export function getOrderStatusLabel(status: OrderStatus, language: "MN" | "EN") {
  switch (status) {
    case "paid":
      return language === "MN" ? "Төлбөр төлөгдсөн" : "Payment paid";
    case "delivering":
      return language === "MN" ? "Хүргэлт хийгдэж байгаа" : "Delivering";
    case "delivered":
      return language === "MN" ? "Хүргэгдсэн" : "Delivered";
    default:
      return language === "MN" ? "Шинэ" : "New";
  }
}

export function getOrderStatusClassName(status: OrderStatus) {
  switch (status) {
    case "paid":
      return "admin-order-status-badge paid";
    case "delivering":
      return "admin-order-status-badge delivering";
    case "delivered":
      return "admin-order-status-badge delivered";
    default:
      return "admin-order-status-badge new";
  }
}

export function getSaleChannelLabel(channel: SaleChannel, language: "MN" | "EN") {
  switch (channel) {
    case "store":
      return language === "MN" ? "Дэлгүүр" : "Store";
    case "messenger":
      return language === "MN" ? "Мессенжер" : "Messenger";
    case "facebook":
      return language === "MN" ? "Фэйсбүүк" : "Facebook";
    case "instagram":
      return language === "MN" ? "Инстаграм" : "Instagram";
    case "phone":
      return language === "MN" ? "Утас" : "Phone";
    case "email":
      return language === "MN" ? "Имэйл" : "Email";
    case "fair":
      return language === "MN" ? "Үзэсгэлэн" : "Fair / Market";
    case "own_use":
      return language === "MN" ? "Өөрийн хэрэгцээнд" : "Own use";
    case "gift":
      return language === "MN" ? "Бэлэг" : "Gift";
    default:
      return language === "MN" ? "Бусад" : "Other";
  }
}

export function getSaleChannelOptions(language: "MN" | "EN") {
  return SALE_CHANNEL_VALUES.map((channel) => ({
    value: channel,
    label: getSaleChannelLabel(channel, language),
  }));
}

export function getSaleCustomerTypeLabel(type: SaleCustomerType, language: "MN" | "EN") {
  if (type === "organization") {
    return language === "MN" ? "Байгууллага" : "Organization";
  }

  return language === "MN" ? "Хувь хүн" : "Individual";
}

export function getSaleCustomerTypeOptions(language: "MN" | "EN") {
  return SALE_CUSTOMER_TYPE_VALUES.map((type) => ({
    value: type,
    label: getSaleCustomerTypeLabel(type, language),
  }));
}

/** Buyer shown in lists: the organization for a company sale, the person otherwise. */
export function getSaleCustomerName(sale: SaleRecord) {
  if (sale.customer.type === "organization") {
    return sale.customer.organizationName || sale.customer.fullName || sale.customer.phoneNumber;
  }

  return sale.customer.fullName || sale.customer.phoneNumber;
}

export function cloneSaleRecord(sale: SaleRecord): SaleRecord {
  return {
    ...sale,
    customer: { ...sale.customer },
    address: { ...sale.address },
    items: sale.items.map((item) => ({ ...item })),
    totals: { ...sale.totals },
  };
}

/** Works for both orders and sales — they share the item payload shape. */
export function getOrderTotalQuantity(document: { items: OrderItemPayload[] }) {
  return document.items.reduce((total, item) => total + item.quantity, 0);
}

export function getOrderPaymentStatusLabel(status: OrderRecord["payment"]["status"], language: "MN" | "EN") {
  switch (status) {
    case "paid":
      return language === "MN" ? "Төлөгдсөн" : "Paid";
    case "failed":
      return language === "MN" ? "Амжилтгүй" : "Failed";
    case "cancelled":
      return language === "MN" ? "Цуцлагдсан" : "Cancelled";
    default:
      return language === "MN" ? "Хүлээгдэж буй" : "Pending";
  }
}

export function formatAdminDateTime(value: string | null, language: "MN" | "EN") {
  if (!value) {
    return "-";
  }

  const locale = language === "MN" ? "mn-MN" : "en-US";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const local = new Date(y, m - 1, d);
    return local.toLocaleDateString(locale);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(locale);
}

export function getLocalizedManagedText(language: "MN" | "EN", english: string, mongolian: string) {
  const primary = language === "MN" ? mongolian : english;
  const fallback = language === "MN" ? english : mongolian;
  return primary.trim() || fallback.trim();
}

export function getManagedNavigationLabel(item: SiteNavigationItem, language: "MN" | "EN") {
  return getLocalizedManagedText(language, item.labelEn, item.labelMn);
}

export function getManagedJournalTitle(entry: JournalEntry, language: "MN" | "EN") {
  return getLocalizedManagedText(language, entry.titleEn, entry.titleMn);
}

export function getManagedJournalCategory(entry: JournalEntry, language: "MN" | "EN") {
  return getLocalizedManagedText(language, entry.categoryEn, entry.categoryMn);
}
