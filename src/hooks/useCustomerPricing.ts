/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { CUSTOMER_PRICING_COLLECTION } from "../services/transferService";
import type { CustomerPricing } from "../types/crm";

export function useCustomerPricing(customerId: string | undefined) {
  const [pricing, setPricing] = useState<CustomerPricing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(
        collection(db, CUSTOMER_PRICING_COLLECTION),
        where("customerId", "==", customerId),
        where("isActive", "==", true)
      ),
      (snap) => {
        setPricing(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerPricing));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [customerId]);

  return { pricing, loading };
}
