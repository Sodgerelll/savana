import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { CUSTOMER_PRICING_COLLECTION, CUSTOMER_TIMELINE_COLLECTION } from "./transferService";
import type { CustomerPricing } from "../types/crm";

export async function setSpecialPrice(
  customerId: string,
  productId: string,
  productName: string,
  specialPrice: number,
  discountPercent: number,
  validUntil: Date | null,
  notes: string,
  createdBy: string,
  createdByName: string
): Promise<void> {
  // Deactivate existing special prices for this customer/product
  const existingSnap = await getDocs(
    query(
      collection(db, CUSTOMER_PRICING_COLLECTION),
      where("customerId", "==", customerId),
      where("productId", "==", productId),
      where("isActive", "==", true)
    )
  );
  for (const d of existingSnap.docs) {
    await updateDoc(doc(db, CUSTOMER_PRICING_COLLECTION, d.id), { isActive: false });
  }

  await addDoc(collection(db, CUSTOMER_PRICING_COLLECTION), {
    customerId,
    productId,
    productName,
    specialPrice,
    discountPercent,
    validFrom: serverTimestamp(),
    validUntil: validUntil ? Timestamp.fromDate(validUntil) : null,
    notes,
    isActive: true,
    createdBy,
    createdAt: serverTimestamp(),
  });

  await addDoc(collection(db, CUSTOMER_TIMELINE_COLLECTION), {
    customerId,
    type: "PRICE_CHANGED",
    title: `Тусгай үнэ тохируулав: ${productName}`,
    description: `${new Intl.NumberFormat("mn-MN").format(specialPrice)}₮`,
    relatedId: null,
    amount: specialPrice,
    createdBy,
    createdByName,
    createdAt: serverTimestamp(),
  });
}

export async function removeSpecialPrice(pricingId: string): Promise<void> {
  await updateDoc(doc(db, CUSTOMER_PRICING_COLLECTION, pricingId), { isActive: false });
}

export async function getCustomerPricing(customerId: string): Promise<CustomerPricing[]> {
  const snap = await getDocs(
    query(
      collection(db, CUSTOMER_PRICING_COLLECTION),
      where("customerId", "==", customerId),
      where("isActive", "==", true)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerPricing);
}

export async function updateCustomerPricingSettings(
  customerId: string,
  settings: {
    category?: string;
    discountRate?: number;
    priceTier?: string;
    paymentTermDays?: number;
  },
  updatedBy: string,
  updatedByName: string
): Promise<void> {
  await updateDoc(doc(db, "customers", customerId), {
    ...settings,
    updatedAt: serverTimestamp(),
  });

  const changes: string[] = [];
  if (settings.category !== undefined) changes.push(`Ангилал: ${settings.category}`);
  if (settings.discountRate !== undefined) changes.push(`Хөнгөлөлт: ${settings.discountRate}%`);
  if (settings.priceTier !== undefined) changes.push(`Үнийн түвшин: ${settings.priceTier}`);
  if (settings.paymentTermDays !== undefined) changes.push(`Төлбөрийн хугацаа: ${settings.paymentTermDays} хоног`);

  await addDoc(collection(db, CUSTOMER_TIMELINE_COLLECTION), {
    customerId,
    type: "INFO_UPDATED",
    title: "Тохиргоо өөрчлөгдлөө",
    description: changes.join(", "),
    relatedId: null,
    amount: null,
    createdBy: updatedBy,
    createdByName: updatedByName,
    createdAt: serverTimestamp(),
  });
}
