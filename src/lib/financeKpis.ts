import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export const FINANCE_WEEKLY_KPIS_COLLECTION = "financeWeeklyKpis";

/**
 * Manually-entered weekly marketing KPIs. Orders and revenue are derived from
 * live order/sales data; CTR and conversion rate come from external analytics
 * so they are recorded by hand per ISO week (doc id: "2026-W28").
 */
export interface FinanceWeeklyKpiRecord {
  /** ISO week key, e.g. "2026-W28". */
  week: string;
  ctr: number | null;
  conversionRate: number | null;
}

function deserializeWeeklyKpi(snapshot: QueryDocumentSnapshot<DocumentData>): FinanceWeeklyKpiRecord {
  const data = snapshot.data() as Record<string, unknown>;
  return {
    week: snapshot.id,
    ctr: typeof data.ctr === "number" ? data.ctr : null,
    conversionRate: typeof data.conversionRate === "number" ? data.conversionRate : null,
  };
}

export async function saveWeeklyKpi(
  week: string,
  updates: { ctr: number | null; conversionRate: number | null },
): Promise<void> {
  await setDoc(
    doc(db, FINANCE_WEEKLY_KPIS_COLLECTION, week),
    {
      ctr: updates.ctr,
      conversionRate: updates.conversionRate,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export function subscribeToWeeklyKpis({
  onData,
  onError,
}: {
  onData: (records: FinanceWeeklyKpiRecord[]) => void;
  onError?: (error: FirestoreError) => void;
}) {
  return onSnapshot(
    collection(db, FINANCE_WEEKLY_KPIS_COLLECTION),
    (snapshot) => {
      onData(snapshot.docs.map((d) => deserializeWeeklyKpi(d)));
    },
    onError,
  );
}
