import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { describeStockError } from "../pages/admin/adminHelpers";
import {
  confirmTransfer,
  shipTransfer,
  deliverTransfer,
  cancelTransfer,
  addPayment,
  createReturn,
  createTransfer,
  type CreateTransferInput,
  type AddPaymentInput,
  type ReturnItem,
} from "../services/transferService";

export function useTransferMutations() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = profile?.uid ?? "unknown";
  const userName = profile?.displayName ?? "Хэрэглэгч";

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err) {
      // The stock module reports its refusals as codes (INSUFFICIENT_STOCK:…,
      // MISSING_VARIANT:…) so every screen can word them the same way; everything else
      // already carries a sentence of its own.
      const msg =
        err instanceof Error
          ? describeStockError(err, "MN")
          : "Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.";
      setError(msg);
      console.error(err);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    clearError: () => setError(null),

    createTransfer: (input: Omit<CreateTransferInput, "createdBy" | "createdByName">) =>
      run(() => createTransfer({ ...input, createdBy: userId, createdByName: userName })),

    confirmTransfer: (transferId: string) =>
      run(() => confirmTransfer(transferId, userId, userName)),

    shipTransfer: (transferId: string) =>
      run(() => shipTransfer(transferId, userId, userName)),

    deliverTransfer: (transferId: string) =>
      run(() => deliverTransfer(transferId, userId, userName)),

    cancelTransfer: (transferId: string) =>
      run(() => cancelTransfer(transferId, userId, userName)),

    addPayment: (input: Omit<AddPaymentInput, "createdBy" | "createdByName">) =>
      run(() => addPayment({ ...input, createdBy: userId, createdByName: userName })),

    createReturn: (
      originalTransferId: string,
      returnItems: ReturnItem[],
      reason: string
    ) => run(() => createReturn(originalTransferId, returnItems, reason, userId, userName)),
  };
}
