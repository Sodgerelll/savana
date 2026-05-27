/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { getEffectivePrice } from "../services/transferService";
import type { EffectivePriceResult } from "../types/crm";

export function useEffectivePrice(
  customerId: string | undefined,
  productId: string | undefined
) {
  const [result, setResult] = useState<EffectivePriceResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId || !productId) {
      return;
    }
    setLoading(true);
    getEffectivePrice(customerId, productId)
      .then(setResult)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [customerId, productId]);

  return { result, loading };
}
