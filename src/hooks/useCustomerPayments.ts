/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { PAYMENTS_COLLECTION } from "../services/transferService";
import type { Payment } from "../types/crm";

const DEFAULT_PAGE_SIZE = 20;

export function useCustomerPayments(
  customerId: string | undefined,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentLimit, setCurrentLimit] = useState(pageSize);

  useEffect(() => {
    setCurrentLimit(pageSize);
  }, [customerId, pageSize]);

  useEffect(() => {
    if (!customerId) {
      return;
    }
    setLoading(true);

    const fetchLimit = currentLimit + 1;

    const unsub = onSnapshot(
      query(
        collection(db, PAYMENTS_COLLECTION),
        where("customerId", "==", customerId),
        orderBy("paidAt", "desc"),
        limit(fetchLimit)
      ),
      (snap) => {
        setHasMore(snap.docs.length > currentLimit);
        setPayments(
          snap.docs.slice(0, currentLimit).map((d) => ({ id: d.id, ...d.data() }) as Payment)
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [customerId, currentLimit]);

  function loadMore() {
    setCurrentLimit((prev) => prev + pageSize);
  }

  return { payments, loading, hasMore, loadMore };
}
