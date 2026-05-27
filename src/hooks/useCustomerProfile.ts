/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Customer } from "../types/crm";

export function useCustomerProfile(customerId: string | undefined) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) {
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, "customers", customerId),
      (snap) => {
        if (snap.exists()) {
          setCustomer({ id: snap.id, ...snap.data() } as Customer);
        } else {
          setCustomer(null);
          setError("Харилцагч олдсонгүй");
        }
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Өгөгдөл ачаалахад алдаа гарлаа");
        setLoading(false);
      }
    );
    return unsub;
  }, [customerId]);

  return { customer, loading, error };
}
