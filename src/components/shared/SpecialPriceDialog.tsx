import { useState } from "react";
import { X } from "lucide-react";
import type { CrmProduct } from "../../types/crm";
import { ProductSelectCombobox } from "./ProductSelectCombobox";
import { formatMoney } from "./MoneyFormat";

interface SpecialPriceDialogProps {
  open: boolean;
  products: CrmProduct[];
  onClose: () => void;
  onSubmit: (data: {
    productId: string;
    productName: string;
    specialPrice: number;
    discountPercent: number;
    validUntil: Date | null;
    notes: string;
  }) => Promise<void>;
  loading?: boolean;
}

export function SpecialPriceDialog({
  open,
  products,
  onClose,
  onSubmit,
  loading,
}: SpecialPriceDialogProps) {
  const [selectedProduct, setSelectedProduct] = useState<CrmProduct | null>(null);
  const [specialPrice, setSpecialPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [hasExpiry, setHasExpiry] = useState(false);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  function handleProductSelect(p: CrmProduct) {
    setSelectedProduct(p);
    setSpecialPrice(String(p.unitPrice));
    setDiscountPercent("0");
  }

  function handlePriceChange(val: string) {
    setSpecialPrice(val);
    if (selectedProduct && Number(val) > 0) {
      const disc = Math.round(((selectedProduct.unitPrice - Number(val)) / selectedProduct.unitPrice) * 100);
      setDiscountPercent(String(Math.max(0, disc)));
    }
  }

  function handleDiscountChange(val: string) {
    setDiscountPercent(val);
    if (selectedProduct && Number(val) >= 0) {
      const price = Math.round(selectedProduct.unitPrice * (1 - Number(val) / 100));
      setSpecialPrice(String(price));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProduct || !specialPrice) return;
    await onSubmit({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      specialPrice: Number(specialPrice),
      discountPercent: Number(discountPercent),
      validUntil: hasExpiry && validUntil ? new Date(validUntil) : null,
      notes,
    });
    setSelectedProduct(null);
    setSpecialPrice("");
    setDiscountPercent("0");
    setHasExpiry(false);
    setValidUntil("");
    setNotes("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Тусгай үнэ нэмэх</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Бараа</label>
            <ProductSelectCombobox
              products={products}
              onSelect={handleProductSelect}
              placeholder="Бараа хайх..."
            />
            {selectedProduct && (
              <div className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 flex justify-between">
                <span>{selectedProduct.name}</span>
                <span>
                  Стандарт: {formatMoney(selectedProduct.unitPrice)} / Бөөний:{" "}
                  {formatMoney(selectedProduct.wholesalePrice ?? 0)}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тусгай үнэ₮</label>
              <input
                type="number"
                value={specialPrice}
                onChange={(e) => handlePriceChange(e.target.value)}
                required
                min={0}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Хөнгөлөлт%</label>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => handleDiscountChange(e.target.value)}
                min={0}
                max={100}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasExpiry}
                onChange={(e) => setHasExpiry(e.target.checked)}
                className="w-4 h-4 text-green-600 rounded"
              />
              Хугацаатай
            </label>
            {hasExpiry && (
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                required={hasExpiry}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Тэмдэглэл</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Цуцлах
            </button>
            <button
              type="submit"
              disabled={loading || !selectedProduct || !specialPrice}
              className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Хадгалж байна..." : "Хадгалах"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
