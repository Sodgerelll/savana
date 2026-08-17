import { useMemo, useState } from "react";
import { AdminModal } from "./AdminModal";
import { returnLineKey, returnedQuantities, type RetailReturnRecord } from "../../lib/returns";

export interface ReturnModalItem {
  productId: number;
  variant: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface ReturnModalState {
  kind: "sale" | "order";
  id: string;
  number: string;
  items: ReturnModalItem[];
  returns: RetailReturnRecord[];
}

export interface ReturnRequestItem {
  productId: number;
  variant: string | null;
  quantity: number;
}

interface ReturnModalProps {
  state: ReturnModalState;
  language: "MN" | "EN";
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (items: ReturnRequestItem[], reason: string) => Promise<void>;
  formatStorePrice: (amount: number) => string;
  formatAdminDateTime: (value: string | null, language: "MN" | "EN") => string;
}

export function ReturnModal({
  state,
  language,
  saving,
  error,
  onClose,
  onSubmit,
  formatStorePrice,
  formatAdminDateTime,
}: ReturnModalProps) {
  const mn = language === "MN";
  const [selected, setSelected] = useState<Record<string, { checked: boolean; quantity: number }>>({});
  const [reason, setReason] = useState("");

  const returned = useMemo(() => returnedQuantities(state.returns), [state.returns]);
  const returnableItems = useMemo(
    () =>
      state.items
        .map((item) => ({
          ...item,
          key: returnLineKey(item.productId, item.variant),
          remaining: item.quantity - (returned.get(returnLineKey(item.productId, item.variant)) ?? 0),
        }))
        .filter((item) => item.remaining > 0),
    [state.items, returned],
  );

  const returnTotal = returnableItems.reduce((sum, item) => {
    const line = selected[item.key];
    if (!line?.checked) return sum;
    return sum + (line.quantity || 0) * item.unitPrice;
  }, 0);

  const canSubmit = returnableItems.some((item) => selected[item.key]?.checked) && reason.trim().length > 0 && !saving;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const items: ReturnRequestItem[] = returnableItems
      .filter((item) => selected[item.key]?.checked)
      .map((item) => ({
        productId: item.productId,
        variant: item.variant,
        quantity: Math.min(selected[item.key]?.quantity ?? item.remaining, item.remaining),
      }));

    await onSubmit(items, reason.trim());
  }

  return (
    <AdminModal
      title={mn ? "Буцаалт бүртгэх" : "Register a return"}
      description={`${state.number}`}
      onClose={onClose}
      disableClose={saving}
      wide
    >
      <form className="admin-modal-form" onSubmit={handleSubmit}>
        {error && <div className="admin-sync-error">{error}</div>}

        {state.returns.length > 0 && (
          <div className="admin-return-history">
            <p className="admin-return-history-title">{mn ? "Өмнөх буцаалт" : "Previous returns"}</p>
            <ul>
              {state.returns.map((record) => (
                <li key={record.id}>
                  <span>{formatAdminDateTime(record.createdAt, language)}</span>
                  <span>
                    {record.items.reduce((sum, item) => sum + item.quantity, 0)} {mn ? "ширхэг" : "pcs"}
                  </span>
                  <strong>{formatStorePrice(record.totalAmount)}</strong>
                  {record.reason && <small>{record.reason}</small>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {returnableItems.length === 0 ? (
          <p>{mn ? "Буцаах боломжтой бараа алга." : "Nothing left to return."}</p>
        ) : (
          <div className="admin-return-items">
            {returnableItems.map((item) => {
              const line = selected[item.key];
              return (
                <div key={item.key} className="admin-return-item-row">
                  <input
                    type="checkbox"
                    checked={line?.checked ?? false}
                    onChange={(event) =>
                      setSelected((prev) => ({
                        ...prev,
                        [item.key]: {
                          quantity: prev[item.key]?.quantity ?? item.remaining,
                          checked: event.target.checked,
                        },
                      }))
                    }
                  />
                  <div className="admin-return-item-name">
                    <strong>{item.name}</strong>
                    {item.variant && <small>{item.variant}</small>}
                    <small>{formatStorePrice(item.unitPrice)}</small>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={item.remaining}
                    value={line?.quantity ?? item.remaining}
                    disabled={!line?.checked}
                    onChange={(event) =>
                      setSelected((prev) => ({
                        ...prev,
                        [item.key]: {
                          checked: prev[item.key]?.checked ?? false,
                          quantity: Math.max(1, Math.min(item.remaining, Number(event.target.value) || 1)),
                        },
                      }))
                    }
                    className="admin-return-item-qty"
                  />
                  <span>/ {item.remaining}</span>
                </div>
              );
            })}
          </div>
        )}

        <label className="admin-field">
          <span>{mn ? "Буцаах шалтгаан" : "Reason for return"}</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={3}
            placeholder={mn ? "Буцаах шалтгааныг бичнэ үү..." : "Describe the reason for the return..."}
          />
        </label>

        {returnTotal > 0 && (
          <div className="admin-return-total">
            {mn ? "Буцаах дүн" : "Return amount"}: <strong>{formatStorePrice(returnTotal)}</strong>
          </div>
        )}

        <div className="admin-modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            {mn ? "Цуцлах" : "Cancel"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {saving ? (mn ? "Хадгалж байна..." : "Saving...") : mn ? "Буцаалт бүртгэх" : "Register return"}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}
