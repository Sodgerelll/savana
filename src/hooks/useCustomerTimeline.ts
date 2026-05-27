/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, limit as firestoreLimit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { CUSTOMER_TIMELINE_COLLECTION } from "../services/transferService";
import type { CustomerTimeline } from "../types/crm";

export function useCustomerTimeline(customerId: string | undefined, lim = 50) {
  const [events, setEvents] = useState<CustomerTimeline[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      query(
        collection(db, CUSTOMER_TIMELINE_COLLECTION),
        where("customerId", "==", customerId),
        orderBy("createdAt", "desc"),
        firestoreLimit(lim)
      ),
      (snap) => {
        setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CustomerTimeline));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [customerId, lim]);

  return { events, loading };
}
