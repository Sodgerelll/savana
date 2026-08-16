import { useState, useEffect } from "react";
import { X, Plus, Trash2, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from "lucide-react";
import type { CrmProduct, TransferType, PaymentMethod, TransferFormItem } from "../../types/crm";
import { ProductSelectCombobox } from "../shared/ProductSelectCombobox";
import { MoneyFormat, formatMoney } from "../shared/MoneyFormat";
import { getEffectivePrice, getActiveProducts } from "../../services/transferService";
import { useTransferMutations } from "../../hooks/useTransferMutations";
import { toast } from "../shared/Toast";
import { ConfirmDialog } from "../shared/ConfirmDialog";

const TRANSFER_TYPES: { value: TransferType; label: string }[] = [
  { value: "SALE", label: "Борлуулалт" },
  { value: "SAMPLE", label: "Дээж" },
  { value: "CONSIGNMENT", label: "Комисс" },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Бэлэн" },
  { value: "BANK_TRANSFER", label: "Банк" },
  { value: "QPAY", label: "QPay" },
  { value: "SOCIALPAY", label: "SocialPay" },
  { value: "CREDIT", label: "Зээлээр" },
];

interface Props {
  customerId: string;
  customerName: string;
  customerBalance: number;
  customerCreditLimit: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function InlineTransferWizard({
  customerId,
  customerName,
  customerBalance,
  customerCreditLimit,
  onClose,
  onSuccess,
}: Props) {
  const mutations = useTransferMutations();
  const [products, setProducts] = useState<CrmProduct[]>([]);
  const [items, setItems] = useState<TransferFormItem[]>([]);
  const [transferType, setTransferType] = useState<TransferType>("SALE");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paidAmount, setPaidAmount] = useState("");
  const [taxEnabled, setTaxEnabled] = useState(true);
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getActiveProducts().then(setProducts).catch(console.error);
  }, []);

  // Derived totals
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const discountAmount = items.reduce(
    (s, i) => s + Math.round(i.quantity * i.originalPrice) - i.lineTotal,
    0
  );
  const taxAmount = taxEnabled ? Math.round(subtotal * 0.1) : 0;
  const totalAmount = subtotal + taxAmount;
  const paidAmt = paymentMethod === "CREDIT" ? 0 : Math.min(Number(paidAmount) || 0, totalAmount);
  const remainingAmount = totalAmount - paidAmt;

  async function addProduct(product: CrmProduct) {
    // A product with variants contributes one selectable row per variant, so identity is
    // the product *and* the variant, not the product alone.
    if (items.find((i) => i.productId === product.id && i.variant === product.variant)) return;
    const priceResult = await getEffectivePrice(customerId, product.id);
    // getEffectivePrice works at product level; a variant row falls back to its own price
    // when no customer-specific or wholesale price applies to the product as a whole.
    const price =
      priceResult.type === "standard" && product.variant ? product.unitPrice : priceResult.price;
    const quantity = 1;
    const lineTotal = Math.round(quantity * price);

    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        variant: product.variant,
        sku: product.sku ?? "",
        currentStock: product.currentStock ?? 0,
        minStockLevel: product.minStockLevel ?? 0,
        quantity,
        unitPrice: price,
        originalPrice: product.unitPrice,
        discountPercent: 0,
        lineTotal,
        priceType: priceResult.type,
      },
    ]);
  }

  /** Rows are keyed by product *and* variant, since one product can contribute several. */
  function itemKey(item: { productId: string; variant: string | null }): string {
    return `${item.productId}:${item.variant ?? ""}`;
  }

  function updateItem(key: string, field: keyof TransferFormItem, value: number | string) {
    setItems((prev) =>
      prev.map((item) => {
        if (itemKey(item) !== key) return item;
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unitPrice" || field === "discountPercent") {
          const qty = field === "quantity" ? Number(value) : updated.quantity;
          const price = field === "unitPrice" ? Number(value) : updated.unitPrice;
          const disc = field === "discountPercent" ? Number(value) : updated.discountPercent;
          updated.lineTotal = Math.round(qty * price * (1 - disc / 100));
        }
        return updated;
      })
    );
  }

  async function handleDraft() {
    if (items.length === 0) return;
    setSavingDraft(true);
    const result = await mutations.createTransfer({
      customerId,
      customerName,
      type: transferType,
      items: items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        variant: i.variant,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        originalPrice: i.originalPrice,
        discountPercent: i.discountPercent,
      })),
      paymentMethod,
      paidAmount: paidAmt,
      taxEnabled,
      referenceNumber,
      notes,
    });
    setSavingDraft(false);
    if (result) {
      toast("Ноорог хадгалагдлаа", "success");
      onClose();
      onSuccess();
    } else if (mutations.error) {
      toast(mutations.error, "error");
    }
  }

  async function handleConfirm() {
    if (items.length === 0) return;
    setConfirming(true);

    const transferId = await mutations.createTransfer({
      customerId,
      customerName,
      type: transferType,
      items: items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        variant: i.variant,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        originalPrice: i.originalPrice,
        discountPercent: i.discountPercent,
      })),
      paymentMethod,
      paidAmount: paidAmt,
      taxEnabled,
      referenceNumber,
      notes,
    });

    if (!transferId) {
      setConfirming(false);
      if (mutations.error) toast(mutations.error, "error");
      return;
    }

    const result = await mutations.confirmTransfer(transferId);
    setConfirming(false);

    if (result !== null) {
      const alerts = (result as { lowStockAlerts?: string[] }).lowStockAlerts ?? [];
      if (alerts.length > 0) {
        toast(`Нөөц бага: ${alerts.join(", ")}`, "warning");
      }
      toast("Шилжүүлэг батлагдлаа ✓", "success");
      onClose();
      onSuccess();
    } else if (mutations.error) {
      toast(mutations.error, "error");
    }
  }

  const newDebt = customerBalance + (paymentMethod === "CREDIT" ? totalAmount : remainingAmount);
  const creditExceeded = newDebt > customerCreditLimit && customerCreditLimit > 0;

  return (
    <div className="border-b border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900">Шинэ шилжүүлэг</h3>
          <span className="text-sm text-gray-500">— {customerName}</span>
          <div className="flex gap-1">
            {TRANSFER_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTransferType(t.value)}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  transferType === t.value
                    ? "bg-green-100 text-green-700 font-medium"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep(step === 1 ? 2 : 1)}
            className="text-gray-400 hover:text-gray-600"
          >
            {step === 1 ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Step 1: Items */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="max-w-md">
              <ProductSelectCombobox
                products={products}
                onSelect={addProduct}
                placeholder="Бараа нэмэх..."
              />
            </div>

            {items.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-500">Бараа</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-500 w-24">Нөөц</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-500 w-24">Тоо</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">Нэгж үнэ</th>
                      <th className="text-center px-4 py-2.5 font-medium text-gray-500 w-20">Хөнг.%</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-500 w-32">Дүн</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const stockError = item.quantity > item.currentStock;
                      const stockWarn = !stockError && item.currentStock <= item.minStockLevel;

                      return (
                        <tr
                          key={itemKey(item)}
                          className={`border-b border-gray-50 last:border-0 ${
                            stockError ? "bg-red-50" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{item.productName}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-xs text-gray-400">{item.sku}</span>
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  item.priceType === "special"
                                    ? "bg-purple-100 text-purple-700"
                                    : item.priceType === "wholesale"
                                      ? "bg-blue-100 text-blue-700"
                                      : item.priceType === "discount"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {item.priceType === "special"
                                  ? "Тусгай"
                                  : item.priceType === "wholesale"
                                    ? "Бөөний"
                                    : item.priceType === "discount"
                                      ? "Хөнгөлөлт"
                                      : "Стандарт"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {stockError ? (
                              <span className="text-red-600 font-medium flex items-center justify-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {item.currentStock}
                              </span>
                            ) : stockWarn ? (
                              <span className="text-yellow-600 font-medium">{item.currentStock}</span>
                            ) : (
                              <span className="text-gray-600">{item.currentStock}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={1}
                              max={item.currentStock}
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(itemKey(item), "quantity", Number(e.target.value))
                              }
                              className={`w-20 border rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-green-500 ${
                                stockError ? "border-red-400 bg-red-50" : "border-gray-200"
                              }`}
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={0}
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateItem(itemKey(item), "unitPrice", Number(e.target.value))
                              }
                              className="w-28 border border-gray-200 rounded-lg px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={item.discountPercent}
                              onChange={(e) =>
                                updateItem(itemKey(item), "discountPercent", Number(e.target.value))
                              }
                              className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            <MoneyFormat amount={item.lineTotal} />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setItems((prev) =>
                                  prev.filter((i) => itemKey(i) !== itemKey(item))
                                )
                              }
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

            {/* Totals summary */}
            {items.length > 0 && (
              <div className="flex items-center justify-between bg-gray-50 rounded-xl px-5 py-4">
                <div className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taxEnabled}
                      onChange={(e) => setTaxEnabled(e.target.checked)}
                      className="w-4 h-4 text-green-600 rounded"
                    />
                    <span className="text-gray-600">НӨАТ 10%</span>
                  </label>
                  {taxEnabled && (
                    <span className="text-gray-500">
                      (+<MoneyFormat amount={taxAmount} />)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6 text-sm">
                  {discountAmount > 0 && (
                    <div className="text-yellow-600">
                      Хөнгөлөлт: <MoneyFormat amount={-discountAmount} />
                    </div>
                  )}
                  <div className="text-gray-600">
                    Дүн: <MoneyFormat amount={subtotal} />
                  </div>
                  <div className="text-xl font-bold text-green-700">
                    НИЙТ: <MoneyFormat amount={totalAmount} />
                  </div>
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={items.some((i) => i.quantity > i.currentStock)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Төлбөр & Батлах
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Payment */}
        {step === 2 && (
          <div className="max-w-lg space-y-5">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Төлбөрийн хэлбэр</h4>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(m.value);
                      if (m.value === "CREDIT") setPaidAmount("0");
                      else setPaidAmount(String(totalAmount));
                    }}
                    className={`py-2.5 px-3 text-sm rounded-xl border transition-colors ${
                      paymentMethod === m.value
                        ? "border-green-500 bg-green-50 text-green-700 font-medium"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod !== "CREDIT" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Төлөх дүн
                </label>
                <input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  max={totalAmount}
                  min={0}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                {remainingAmount > 0 && (
                  <p className="text-sm text-yellow-600 mt-1.5">
                    Үлдэгдэл {formatMoney(remainingAmount)} зээлд бүртгэгдэнэ
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-yellow-50 rounded-xl p-4 text-sm text-yellow-800 space-y-1">
                <div>
                  Нийт <span className="font-semibold">{formatMoney(totalAmount)}</span> өрд нэмэгдэнэ
                </div>
                <div>
                  Одоогийн өр: {formatMoney(customerBalance)} →{" "}
                  <span className={`font-semibold ${creditExceeded ? "text-red-600" : ""}`}>
                    Шинэ өр: {formatMoney(newDebt)}
                  </span>
                </div>
              </div>
            )}

            {creditExceeded && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Зээлийн лимит хэтэрлээ! Лимит: {formatMoney(customerCreditLimit)}, Шинэ өр:{" "}
                  {formatMoney(newDebt)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Лавлах дугаар
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Гүйлгээний №..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Тэмдэглэл</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="..."
                />
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Дүн:</span>
                <MoneyFormat amount={subtotal} />
              </div>
              {taxEnabled && (
                <div className="flex justify-between text-gray-600">
                  <span>НӨАТ:</span>
                  <MoneyFormat amount={taxAmount} />
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5 mt-1">
                <span>НИЙТ:</span>
                <MoneyFormat amount={totalAmount} className="text-green-700" />
              </div>
              {paymentMethod !== "CREDIT" && paidAmt > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Төлнө:</span>
                  <MoneyFormat amount={paidAmt} />
                </div>
              )}
            </div>

            {mutations.error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {mutations.error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Буцах
              </button>
              <button
                type="button"
                onClick={handleDraft}
                disabled={savingDraft || items.length === 0}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {savingDraft ? "Хадгалж байна..." : "Ноорог хадгалах"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={confirming || items.length === 0 || items.some((i) => i.quantity > i.currentStock)}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                {confirming ? "Батлаж байна..." : "Батлах ✓"}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Шилжүүлэг батлах уу?"
        description={`Нийт ${formatMoney(totalAmount)}. Нөөцөөс хасагдана.`}
        confirmLabel="Батлах"
        onConfirm={async () => {
          setShowConfirm(false);
          await handleConfirm();
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
