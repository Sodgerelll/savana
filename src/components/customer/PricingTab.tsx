import { useState, useEffect } from "react";
import { Plus, Trash2, Tag } from "lucide-react";
import type { Customer, CrmProduct } from "../../types/crm";
import { useCustomerPricing } from "../../hooks/useCustomerPricing";
import { setSpecialPrice, removeSpecialPrice, updateCustomerPricingSettings } from "../../services/customerPricingService";
import { getActiveProducts } from "../../services/transferService";
import { SpecialPriceDialog } from "../shared/SpecialPriceDialog";
import { MoneyFormat } from "../shared/MoneyFormat";
import { DateFormat } from "../shared/DateFormat";
import { toast } from "../shared/Toast";
import { useAuth } from "../../context/AuthContext";

interface Props {
  customer: Customer;
}

const CATEGORY_OPTIONS = [
  { value: "WHOLESALE", label: "Бөөний" },
  { value: "RETAIL", label: "Жижиглэн" },
  { value: "VIP", label: "VIP" },
  { value: "REGULAR", label: "Энгийн" },
];

const PRICE_TIER_OPTIONS = [
  { value: "RETAIL", label: "Жижиглэн" },
  { value: "WHOLESALE", label: "Бөөний" },
  { value: "CUSTOM", label: "Тусгай" },
];

const PAYMENT_TERM_OPTIONS = [
  { value: 0, label: "Шууд" },
  { value: 7, label: "7 хоног" },
  { value: 14, label: "14 хоног" },
  { value: 30, label: "30 хоног" },
  { value: 60, label: "60 хоног" },
];

export function PricingTab({ customer }: Props) {
  const { pricing, loading } = useCustomerPricing(customer.id);
  const { profile } = useAuth();
  const [products, setProducts] = useState<CrmProduct[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local settings state
  const [category, setCategory] = useState(customer.category);
  const [discountRate, setDiscountRate] = useState(customer.discountRate);
  const [priceTier, setPriceTier] = useState(customer.priceTier);
  const [paymentTermDays, setPaymentTermDays] = useState(customer.paymentTermDays);

  useEffect(() => {
    getActiveProducts().then(setProducts).catch(console.error);
  }, []);

  async function handleSaveSettings() {
    setSaving(true);
    try {
      await updateCustomerPricingSettings(customer.id, {
        category,
        discountRate,
        priceTier,
        paymentTermDays,
      }, profile?.uid ?? "", profile?.displayName ?? "");
      toast("Тохиргоо хадгалагдлаа", "success");
    } catch {
      toast("Алдаа гарлаа", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSpecialPrice(data: {
    productId: string;
    productName: string;
    specialPrice: number;
    discountPercent: number;
    validUntil: Date | null;
    notes: string;
  }) {
    setDialogLoading(true);
    try {
      await setSpecialPrice(
        customer.id,
        data.productId,
        data.productName,
        data.specialPrice,
        data.discountPercent,
        data.validUntil,
        data.notes,
        profile?.uid ?? "",
        profile?.displayName ?? ""
      );
      toast("Тусгай үнэ хадгалагдлаа", "success");
      setShowDialog(false);
    } catch {
      toast("Алдаа гарлаа", "error");
    } finally {
      setDialogLoading(false);
    }
  }

  async function handleRemove(pricingId: string) {
    try {
      await removeSpecialPrice(pricingId);
      toast("Тусгай үнэ устгагдлаа", "success");
    } catch {
      toast("Алдаа гарлаа", "error");
    }
  }

  return (
    <div className="space-y-8">
      {/* General Settings */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="font-semibold text-gray-800 mb-5 flex items-center gap-2">
          <Tag className="w-4 h-4" />
          Ерөнхий тохиргоо
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Ангилал</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Ерөнхий хөнгөлөлт %
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={discountRate}
              onChange={(e) => setDiscountRate(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Үнийн ангилал</label>
            <select
              value={priceTier}
              onChange={(e) => setPriceTier(e.target.value as typeof priceTier)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {PRICE_TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Төлбөрийн нөхцөл
            </label>
            <select
              value={paymentTermDays}
              onChange={(e) => setPaymentTermDays(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {PAYMENT_TERM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 rounded-xl p-3 text-xs text-blue-700 space-y-0.5">
          <div className="font-medium">Үнийн давуу эрэмбэ:</div>
          <div>1. Тусгай үнэ (хугацаа хүчинтэй бол)</div>
          <div>2. WHOLESALE ангилал → Бөөний үнэ</div>
          <div>3. VIP ангилал → Стандарт үнэ × (1 - хөнгөлөлт%)</div>
          <div>4. Бусад → Стандарт үнэ</div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Хадгалж байна..." : "Хадгалах"}
          </button>
        </div>
      </div>

      {/* Special Prices */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Бараа тус бүрийн тусгай үнэ</h3>
          <button
            type="button"
            onClick={() => setShowDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Тусгай үнэ нэмэх
          </button>
        </div>

        {loading ? (
          <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ) : pricing.length === 0 ? (
          <div className="text-center py-10 text-gray-500 border border-dashed border-gray-200 rounded-2xl">
            Тусгай үнэ тохируулаагүй байна
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Бараа</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Тусгай үнэ</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Хөнгөлөлт%</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Хүчинтэй хугацаа</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {pricing.map((p) => {
                  const product = products.find((x) => x.id === p.productId);
                  return (
                    <tr key={p.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{p.productName}</div>
                        {product && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            Стандарт: <MoneyFormat amount={product.unitPrice} /> / Бөөний:{" "}
                            <MoneyFormat amount={product.wholesalePrice ?? 0} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-purple-700">
                        <MoneyFormat amount={p.specialPrice} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {p.discountPercent > 0 ? `-${p.discountPercent}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {p.validUntil ? (
                          <DateFormat value={p.validUntil} />
                        ) : (
                          <span className="text-green-600">Хугацаагүй</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleRemove(p.id)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SpecialPriceDialog
        open={showDialog}
        products={products}
        onClose={() => setShowDialog(false)}
        loading={dialogLoading}
        onSubmit={handleAddSpecialPrice}
      />
    </div>
  );
}
