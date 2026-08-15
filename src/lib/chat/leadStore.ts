import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { createSale, type SaleChannel, type SaleItemPayload } from "../sales";
import { DEFAULT_ADDRESS_REGION } from "../checkoutAddress";
import { SHIPPING_FEE } from "../orders";
import {
  CHAT_COLLECTIONS,
  type ChatChannel,
  type ChatLeadItem,
  type ChatLeadRecord,
  type ChatLeadStatus,
  type ChatLeadType,
} from "./types";

const LEAD_PAGE_SIZE = 100;

const leadsRef = collection(db, CHAT_COLLECTIONS.LEADS);

/**
 * Chat channel → the SaleChannel the ledger records it under.
 *
 * Chat orders become **sales**, not orders: in this codebase `orders` is the
 * storefront checkout (Bonum QR) and everything taken elsewhere — store,
 * messenger, phone — belongs to the Sales module, which already posts VAT,
 * COGS and the journal entry.
 */
const CHANNEL_TO_SALE_CHANNEL: Record<ChatChannel, SaleChannel> = {
  facebook: "messenger",
  instagram: "instagram",
  widget: "other",
  admin_test: "other",
};

function parseTimestamp(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return null;
}

function asLeadType(value: unknown): ChatLeadType {
  return value === "inquiry" || value === "complaint" || value === "callback" ? value : "order";
}

function asLeadStatus(value: unknown): ChatLeadStatus {
  return value === "processing" || value === "converted" || value === "dismissed" ? value : "new";
}

function asChannel(value: unknown): ChatChannel {
  return value === "instagram" || value === "widget" || value === "admin_test" ? value : "facebook";
}

function deserializeItems(value: unknown): ChatLeadItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const quantity = Number(row.quantity);
    return {
      productId: typeof row.productId === "number" ? row.productId : null,
      name: String(row.name ?? ""),
      variant: typeof row.variant === "string" ? row.variant : null,
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
    };
  });
}

function deserializeLead(snapshot: QueryDocumentSnapshot<DocumentData>): ChatLeadRecord {
  const data = snapshot.data() as Record<string, unknown>;

  return {
    id: snapshot.id,
    schemaVersion: Number(data.schemaVersion ?? 1),
    type: asLeadType(data.type),
    status: asLeadStatus(data.status),
    conversationId: String(data.conversationId ?? ""),
    channel: asChannel(data.channel),
    customerName: String(data.customerName ?? ""),
    customerPhone: String(data.customerPhone ?? ""),
    note: String(data.note ?? ""),
    items: deserializeItems(data.items),
    convertedOrderId: typeof data.convertedOrderId === "string" ? data.convertedOrderId : null,
    createdAt: parseTimestamp(data.createdAt),
    updatedAt: parseTimestamp(data.updatedAt),
  };
}

export function subscribeToChatLeads({
  onData,
  onError,
}: {
  onData: (leads: ChatLeadRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    query(leadsRef, orderBy("createdAt", "desc"), limit(LEAD_PAGE_SIZE)),
    (snapshot) => {
      onData(snapshot.docs.map((documentSnapshot) => deserializeLead(documentSnapshot)));
    },
    onError,
  );
}

export async function setChatLeadStatus(id: string, status: ChatLeadStatus): Promise<void> {
  await updateDoc(doc(leadsRef, id), { status, updatedAt: serverTimestamp() });
}

export async function deleteChatLead(id: string): Promise<void> {
  await deleteDoc(doc(leadsRef, id));
}

export interface LeadConversionResult {
  saleId: string;
  saleNumber: string;
}

export class LeadConversionError extends Error {}

/**
 * Prices the lead's items against the live catalog.
 *
 * The lead only records what the customer asked for by name — what it costs is
 * decided here, at conversion time, so a stale chat cannot lock in an old price.
 */
export function priceLeadItems(
  items: ChatLeadItem[],
  products: Array<{ id: number; name: string; price: number; category: string; images: string[] }>,
): { priced: SaleItemPayload[]; unmatched: string[] } {
  const priced: SaleItemPayload[] = [];
  const unmatched: string[] = [];

  for (const item of items) {
    const match = products.find(
      (product) =>
        (item.productId !== null && product.id === item.productId) ||
        product.name.toLowerCase() === item.name.trim().toLowerCase(),
    );

    if (!match || match.price <= 0) {
      unmatched.push(item.name);
      continue;
    }

    priced.push({
      productId: match.id,
      name: match.name,
      category: match.category,
      image: match.images[0] ?? null,
      variant: item.variant,
      quantity: item.quantity,
      unitPrice: match.price,
      lineTotal: match.price * item.quantity,
    });
  }

  return { priced, unmatched };
}

/**
 * Converts a reviewed lead into a sale.
 *
 * Deliberately admin-triggered: a misparsed conversation must never post to the
 * ledger on its own. The sale is created at status `new` (unsettled), so the
 * admin still confirms payment through the normal Sales flow before anything
 * reaches the journal.
 */
export async function convertLeadToSale(
  lead: ChatLeadRecord,
  products: Array<{ id: number; name: string; price: number; category: string; images: string[] }>,
  actor: { uid: string; name: string },
): Promise<LeadConversionResult> {
  if (lead.convertedOrderId) {
    throw new LeadConversionError("Энэ хүсэлт аль хэдийн захиалга болсон байна.");
  }
  if (!lead.customerName.trim() || !lead.customerPhone.trim()) {
    throw new LeadConversionError("Нэр болон утасны дугаар дутуу байна.");
  }

  const { priced, unmatched } = priceLeadItems(lead.items, products);

  if (unmatched.length > 0) {
    throw new LeadConversionError(`Каталогоос олдоогүй бараа: ${unmatched.join(", ")}`);
  }
  if (priced.length === 0) {
    throw new LeadConversionError("Хүсэлтэд бүтээгдэхүүн байхгүй байна.");
  }

  const subtotal = priced.reduce((sum, item) => sum + item.lineTotal, 0);

  const sale = await createSale({
    status: "new",
    channel: CHANNEL_TO_SALE_CHANNEL[lead.channel],
    paymentMethod: "cash",
    customer: {
      type: "individual",
      fullName: lead.customerName.trim(),
      organizationName: "",
      registrationNumber: "",
      phoneNumber: lead.customerPhone.trim(),
      email: null,
      note: lead.note,
    },
    address: {
      region: DEFAULT_ADDRESS_REGION,
      districtOrSoum: "",
      khorooOrBag: "",
      streetAddress: "",
      additionalAddress: "",
    },
    items: priced,
    totals: {
      subtotal,
      shippingFee: SHIPPING_FEE,
      grandTotal: subtotal + SHIPPING_FEE,
      vatMode: "none",
      vatAmount: 0,
    },
    createdByUid: actor.uid,
    createdByName: actor.name,
  });

  await updateDoc(doc(leadsRef, lead.id), {
    status: "converted",
    convertedOrderId: sale.id,
    updatedAt: serverTimestamp(),
  });

  return { saleId: sale.id, saleNumber: sale.saleNumber };
}
