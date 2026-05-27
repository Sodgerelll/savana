/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { TRANSFERS_COLLECTION } from "../services/transferService";
import type { Transfer, TransferStatus, PaymentStatus } from "../types/crm";

const DEFAULT_PAGE_SIZE = 20;

interface TransferFilters {
  status?: TransferStatus | "";
  paymentStatus?: PaymentStatus | "";
  type?: string;
}

export function useCustomerTransfers(
  customerId: string | undefined,
  filters: TransferFilters = {},
  pageSize = DEFAULT_PAGE_SIZE
) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentLimit, setCurrentLimit] = useState(pageSize);

  useEffect(() => {
    setCurrentLimit(pageSize);
  }, [customerId, pageSize, filters.status, filters.paymentStatus, filters.type]);

  useEffect(() => {
    if (!customerId) {
      return;
    }
    setLoading(true);

    // Fetch one extra document to detect if there are more results
    const fetchLimit = currentLimit + 1;

    const constraints: QueryConstraint[] = [
      where("customerId", "==", customerId),
      orderBy("createdAt", "desc"),
      limit(fetchLimit),
    ];

    if (filters.status) constraints.push(where("status", "==", filters.status));
    if (filters.paymentStatus) constraints.push(where("paymentStatus", "==", filters.paymentStatus));
    if (filters.type) constraints.push(where("type", "==", filters.type));

    const unsub = onSnapshot(
      query(collection(db, TRANSFERS_COLLECTION), ...constraints),
      (snap) => {
        setHasMore(snap.docs.length > currentLimit);
        setTransfers(
          snap.docs.slice(0, currentLimit).map((d) => ({ id: d.id, ...d.data() }) as Transfer)
        );
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return unsub;
  }, [customerId, currentLimit, filters.status, filters.paymentStatus, filters.type]);

  function loadMore() {
    setCurrentLimit((prev) => prev + pageSize);
  }

  return { transfers, loading, hasMore, loadMore };
}
