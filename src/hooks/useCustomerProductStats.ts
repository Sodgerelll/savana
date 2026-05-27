/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { getCustomerProductStats } from "../services/customerStatsService";
import type { CustomerProductStat } from "../types/crm";

export function useCustomerProductStats(customerId: string | undefined) {
  const [stats, setStats] = useState<CustomerProductStat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) {
      return;
    }
    setLoading(true);
    getCustomerProductStats(customerId)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [customerId]);

  return { stats, loading };
}
