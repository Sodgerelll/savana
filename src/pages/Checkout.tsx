import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { CheckCircle2, ChevronLeft, PackageCheck, QrCode, RefreshCcw, Trash2, Truck, WalletCards } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { getDistrictOrSoumOptions, getKhorooOrBagOptions, DEFAULT_ADDRESS_REGION } from "../lib/checkoutAddress";
import {
  createOrder,
  markOrderAsPaid,
  SHIPPING_FEE,
  type OrderItemPayload,
  type OrderPaymentPayload,
} from "../lib/orders";
import { formatStorePrice, getProductPrimaryImage } from "../lib/storefrontHelpers";
import "./Checkout.css";

interface CheckoutFormState {
  fullName: string;
  phoneNumber: string;
  districtOrSoum: string;
  khorooOrBag: string;
  streetAddress: string;
  additionalAddress: string;
  note: string;
}

interface CheckoutTotals {
  subtotal: number;
  shippingFee: number;
  grandTotal: number;
}

interface CheckoutOrderState {
  id: string;
  orderNumber: string;
  items: OrderItemPayload[];
  totals: CheckoutTotals;
  payment: OrderPaymentPayload;
}

type CheckoutStep = "delivery" | "payment";

export default function Checkout() {
  const { user, profile, authMethod, loading, signInAsGuest } = useAuth();
  const { items, totalPrice, clearCart, setIsCartOpen, updateQuantity, removeItem } = useCart();
  const { language } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [guestSessionPending, setGuestSessionPending] = useState(false);
  const [guestSessionError, setGuestSessionError] = useState("");
  const [activeStep, setActiveStep] = useState<CheckoutStep>("delivery");
  const [pendingOrder, setPendingOrder] = useState<CheckoutOrderState | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const [formState, setFormState] = useState<CheckoutFormState>({
    fullName: "",
    phoneNumber: "",
    districtOrSoum: "",
    khorooOrBag: "",
    streetAddress: "",
    additionalAddress: "",
    note: "",
  });

  const copy =
    language === "MN"
      ? {
          deliveryHeading: "Хаяг, хүргэлт",
          deliverySubheading: "Хүлээн авагч болон хүргэлтийн мэдээллээ бөглөөд захиалгаа үүсгэнэ үү.",
          paymentHeading: "Төлбөр",
          paymentSubheading: "Захиалга үүссэний дараа QPay-аар төлбөрөө хийж, доорх товчоор шалгана уу.",
          guestBadge: "Зочин захиалга",
          memberBadge: "Бүртгэлтэй хэрэглэгчийн захиалга",
          backToCart: "Сагс руу буцах",
          summary: "Захиалгын мэдээлэл",
          customerInfo: "Хүлээн авагчийн мэдээлэл",
          addressInfo: "Хүргэлтийн хаяг",
          fullName: "Хүлээн авагчийн нэр",
          phoneNumber: "Утасны дугаар",
          districtOrSoum: "Дүүрэг",
          khorooOrBag: "Хороо",
          streetAddress: "Байр, орц, давхар, тоот",
          additionalAddress: "Нэмэлт хаяг",
          note: "Хүргэлтийн тайлбар",
          notePlaceholder: "Жолоочид өгөх нэмэлт заавар байвал бичнэ үү.",
          submit: "Захиалга баталгаажуулах",
          goToPayment: "Төлбөрийн хэсэг рүү очих",
          shippingFee: "Хүргэлтийн төлбөр",
          subtotal: "Барааны дүн",
          grandTotal: "Төлөх нийт дүн",
          defaultVariant: "Үндсэн сонголт",
          empty: "Сагсанд бараа алга байна.",
          continueShopping: "Дэлгүүрлүү буцах",
          requiredPhone: "Утасны дугаар заавал бөглөнө.",
          requiredItems: "Захиалга үүсгэхийн тулд дор хаяж нэг бараа хэрэгтэй.",
          successTitle: "Төлбөр баталгаажлаа",
          successText: "Таны QPay төлбөр шалгагдаж, захиалга боловсруулагдаж эхэллээ.",
          orderNumber: "Захиалгын дугаар",
          keepShopping: "Дахин дэлгүүрлэх",
          preparingGuestCheckout: "Зочин checkout бэлдэж байна...",
          guestSessionFailed: "Зочин эрх нээж чадсангүй. Дахин оролдоно уу.",
          retryGuestCheckout: "Дахин оролдох",
          sessionNotReady: "Checkout session хараахан бэлэн болоогүй байна. Түр хүлээгээд дахин оролдоно уу.",
          orderNotesHeading: "Захиалгын нөхцөл",
          orderNotes: [
            "Та захиалсан барааны төлбөрөө 100% урьдчилан шилжүүлснээр захиалга баталгаажна. Төлбөр дутуу хийгдсэн тохиолдолд хүргэлт хийгдэх боломжгүй болохыг анхаарна уу.",
            "Төлбөр баталгаажсанаас хойш 24-48 цагийн дотор хүргэнэ. Үнийн дүн 40,000₮-өөс дээш худалдан авалтад хүргэлт гарна. Хүргэлтийн төлбөр 5,000₮. Бүх нийтийн амралтын өдрүүдэд хүргэлт хийгдэхгүй болохыг анхаарна уу. 80,000₮-өөс дээш хүргэлт үнэгүй.",
            "Хүргэлттэй холбоотой лавлах утас: 77770081.",
          ],
          stepsLabel: "Checkout алхмууд",
          deliveryTab: "Хаяг, хүргэлт",
          deliveryTabHint: "Хүлээн авагч ба хаяг",
          paymentTab: "Төлбөр",
          paymentTabHint: "QPay QR ба төлөв",
          deliveryLocked: "Захиалга үүссэн тул энэ хэсэг түгжигдсэн. Төлбөрийн таб руу үргэлжлүүлнэ үү.",
          paymentInfo: "Төлбөрийн мэдээлэл",
          paymentTitle: "QPay-аар төлбөр төлөх",
          paymentText: "Доорх QR-г QPay апп-аараа уншуулж төлбөрөө гүйцээнэ үү.",
          paymentReady: "Захиалга үүссэн. Төлбөр хийсний дараа төлөв шалгана уу.",
          paymentUnavailable: "Эхлээд хаяг, хүргэлтийн мэдээллээ бөглөж захиалга үүсгэнэ үү.",
          paymentAmount: "Төлөх дүн",
          paymentStatus: "Төлбөрийн төлөв",
          paymentPending: "Хүлээгдэж байна",
          paymentPaid: "Төлөгдсөн",
          paymentReference: "Төлбөрийн лавлагаа",
          scanQr: "QPay апп ашиглан энэхүү QR кодыг уншуулна уу.",
          checkPayment: "Төлбөр шалгах",
          checkingPayment: "Төлбөр шалгаж байна",
          paymentPendingMessage: "Төлбөр хүлээгдэж байна. Төлбөрөө хийсний дараа дахин шалгана уу.",
          paymentPaidMessage: "Төлбөр баталгаажлаа. Захиалга амжилттай.",
          paymentCheckFailed: "Төлбөрийн төлөв шалгаж чадсангүй.",
          qrLoading: "QR бэлтгэж байна...",
          qrAlt: "QPay QR код",
          orderSaved: "Захиалга үүссэн. Одоо QPay-аар төлбөрөө хийнэ үү.",
          submitting: "Үүсгэж байна...",
        }
      : {
          deliveryHeading: "Address and delivery",
          deliverySubheading: "Fill in the recipient and delivery details to create the order.",
          paymentHeading: "Payment",
          paymentSubheading: "Once the order is created, complete the payment with QPay and verify it below.",
          guestBadge: "Guest checkout",
          memberBadge: "Member checkout",
          backToCart: "Back to cart",
          summary: "Order summary",
          customerInfo: "Recipient details",
          addressInfo: "Delivery address",
          fullName: "Recipient name",
          phoneNumber: "Phone number",
          districtOrSoum: "District",
          khorooOrBag: "Khoroo",
          streetAddress: "Building, entrance, floor, unit",
          additionalAddress: "Additional address",
          note: "Delivery note",
          notePlaceholder: "Add any driver instructions here.",
          submit: "Confirm order",
          goToPayment: "Open payment tab",
          shippingFee: "Shipping fee",
          subtotal: "Subtotal",
          grandTotal: "Grand total",
          defaultVariant: "Default option",
          empty: "Your cart is empty.",
          continueShopping: "Return to shop",
          requiredPhone: "Phone number is required.",
          requiredItems: "At least one cart item is required to place an order.",
          successTitle: "Payment confirmed",
          successText: "Your QPay payment has been verified and the order is now being processed.",
          orderNumber: "Order number",
          keepShopping: "Keep shopping",
          preparingGuestCheckout: "Preparing guest checkout...",
          guestSessionFailed: "Unable to start a guest session. Please try again.",
          retryGuestCheckout: "Try again",
          sessionNotReady: "Checkout session is still being prepared. Please wait a moment and try again.",
          orderNotesHeading: "Order notes",
          orderNotes: [
            "Your order is confirmed only after the full 100% prepayment is received. Please note that delivery cannot be completed if the payment is incomplete.",
            "Delivery is completed within 24-48 hours after payment confirmation. Delivery is available for purchases above 40,000₮. The delivery fee is 5,000₮. Please note that deliveries are not made on public holidays. Delivery is free for orders above 80,000₮.",
            "Delivery hotline: 77770081.",
          ],
          stepsLabel: "Checkout steps",
          deliveryTab: "Address",
          deliveryTabHint: "Recipient and address",
          paymentTab: "Payment",
          paymentTabHint: "QPay QR and status",
          deliveryLocked: "The order has already been created. Continue in the payment tab.",
          paymentInfo: "Payment details",
          paymentTitle: "Pay with QPay",
          paymentText: "Scan the QR below with your QPay app to complete the payment.",
          paymentReady: "The order has been created. Check the payment status after paying.",
          paymentUnavailable: "Complete the address and delivery step before opening payment.",
          paymentAmount: "Amount due",
          paymentStatus: "Payment status",
          paymentPending: "Pending",
          paymentPaid: "Paid",
          paymentReference: "Payment reference",
          scanQr: "Scan this QR code with your QPay app.",
          checkPayment: "Check payment",
          checkingPayment: "Checking payment",
          paymentPendingMessage: "Payment is still pending. Please pay first and check again.",
          paymentPaidMessage: "Payment confirmed. Your order is complete.",
          paymentCheckFailed: "Unable to check payment status.",
          qrLoading: "Preparing QR...",
          qrAlt: "QPay payment QR",
          orderSaved: "The order has been created. Complete the payment with QPay.",
          submitting: "Creating order...",
        };

  const districtOptions = useMemo(() => getDistrictOrSoumOptions(DEFAULT_ADDRESS_REGION), []);
  const khorooOptions = useMemo(
    () => getKhorooOrBagOptions(DEFAULT_ADDRESS_REGION, formState.districtOrSoum),
    [formState.districtOrSoum],
  );
  const shippingFee = SHIPPING_FEE;
  const liveTotals = useMemo<CheckoutTotals>(
    () => ({
      subtotal: totalPrice,
      shippingFee,
      grandTotal: totalPrice + shippingFee,
    }),
    [shippingFee, totalPrice],
  );
  const liveSummaryItems = useMemo<OrderItemPayload[]>(
    () =>
      items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        category: item.product.category,
        image: getProductPrimaryImage(item.product) || null,
        variant: item.variant ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.unitPrice * item.quantity,
      })),
    [items],
  );
  const summaryItems = pendingOrder?.items ?? liveSummaryItems;
  const summaryTotals = pendingOrder?.totals ?? liveTotals;
  const isOrderLocked = Boolean(pendingOrder);
  const isPaymentStep = activeStep === "payment";
  const isPaid = pendingOrder?.payment.status === "paid";
  const isGuestCheckout = !user || user.isAnonymous;

  useEffect(() => {
    if (loading || user || guestSessionPending || guestSessionError) {
      return;
    }

    let active = true;
    setGuestSessionPending(true);
    setSubmitError("");

    void signInAsGuest()
      .then(() => {
        if (active) {
          setGuestSessionError("");
        }
      })
      .catch((error) => {
        if (active) {
          setGuestSessionError(error instanceof Error ? error.message : copy.guestSessionFailed);
          setGuestSessionPending(false);
        }
      });

    return () => {
      active = false;
    };
  }, [copy.guestSessionFailed, guestSessionError, guestSessionPending, loading, signInAsGuest, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setGuestSessionPending(false);
    setGuestSessionError("");
  }, [user]);

  useEffect(() => {
    setIsCartOpen(false);
  }, [setIsCartOpen]);

  useEffect(() => {
    if (!formState.fullName.trim() && (profile?.displayName || user?.displayName)) {
      setFormState((current) => ({
        ...current,
        fullName: profile?.displayName ?? user?.displayName ?? "",
      }));
    }
  }, [formState.fullName, profile?.displayName, user?.displayName]);

  useEffect(() => {
    if (!formState.phoneNumber.trim() && profile?.phoneNumber) {
      setFormState((current) => ({
        ...current,
        phoneNumber: profile.phoneNumber ?? "",
      }));
    }
  }, [formState.phoneNumber, profile?.phoneNumber]);

  useEffect(() => {
    if (!districtOptions.includes(formState.districtOrSoum)) {
      setFormState((current) => ({
        ...current,
        districtOrSoum: districtOptions[0] ?? "",
        khorooOrBag: "",
      }));
    }
  }, [districtOptions, formState.districtOrSoum]);

  useEffect(() => {
    if (!khorooOptions.includes(formState.khorooOrBag)) {
      setFormState((current) => ({
        ...current,
        khorooOrBag: khorooOptions[0] ?? "",
      }));
    }
  }, [formState.khorooOrBag, khorooOptions]);

  useEffect(() => {
    if (!pendingOrder?.payment.qrPayload) {
      setPaymentQrUrl("");
      return;
    }

    let active = true;

    void QRCode.toDataURL(pendingOrder.payment.qrPayload, {
      width: 280,
      margin: 1,
      color: {
        dark: "#5A5103",
        light: "#FFFFFF",
      },
    })
      .then((dataUrl: string) => {
        if (active) {
          setPaymentQrUrl(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setPaymentQrUrl("");
        }
      });

    return () => {
      active = false;
    };
  }, [pendingOrder?.payment.qrPayload]);

  const handleFieldChange =
    (field: keyof CheckoutFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const nextValue = event.target.value;
      setFormState((current) => ({
        ...current,
        [field]: nextValue,
      }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      setSubmitError(copy.sessionNotReady);
      return;
    }

    if (items.length === 0) {
      setSubmitError(copy.requiredItems);
      return;
    }

    if (!formState.phoneNumber.trim()) {
      setSubmitError(copy.requiredPhone);
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setPaymentFeedback("");

    const nextItems = items.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      category: item.product.category,
      image: getProductPrimaryImage(item.product) || null,
      variant: item.variant ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.unitPrice * item.quantity,
    }));
    const nextTotals = {
      subtotal: totalPrice,
      shippingFee,
      grandTotal: totalPrice + shippingFee,
    };

    try {
      const result = await createOrder({
        auth: {
          uid: user.uid,
          isAnonymous: user.isAnonymous,
          method: authMethod,
        },
        customer: {
          fullName: formState.fullName.trim(),
          phoneNumber: formState.phoneNumber.trim(),
          email: profile?.email ?? user.email ?? null,
          note: formState.note.trim(),
        },
        address: {
          region: DEFAULT_ADDRESS_REGION,
          districtOrSoum: formState.districtOrSoum,
          khorooOrBag: formState.khorooOrBag,
          streetAddress: formState.streetAddress.trim(),
          additionalAddress: formState.additionalAddress.trim(),
        },
        items: nextItems,
        totals: nextTotals,
      });

      setPendingOrder({
        id: result.id,
        orderNumber: result.orderNumber,
        items: nextItems,
        totals: nextTotals,
        payment: result.payment,
      });
      clearCart();
      setActiveStep("payment");
      setPaymentFeedback(copy.orderSaved);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Order creation failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckPayment = async () => {
    if (!pendingOrder) {
      setPaymentFeedback(copy.paymentUnavailable);
      return;
    }

    setCheckingPayment(true);
    setPaymentFeedback("");

    try {
      const payment = await markOrderAsPaid(pendingOrder.id);
      setPendingOrder((current) => (current ? { ...current, payment } : current));
      setPaymentFeedback(copy.paymentPaidMessage);
    } catch (error) {
      setPaymentFeedback(error instanceof Error ? error.message : copy.paymentCheckFailed);
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleRetryGuestSession = () => {
    setGuestSessionError("");
    setSubmitError("");
  };

  if (loading || guestSessionPending || (!user && !guestSessionError)) {
    return (
      <div className="container section" style={{ textAlign: "center" }}>
        <p>{copy.preparingGuestCheckout}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container section" style={{ textAlign: "center" }}>
        <p>{guestSessionError}</p>
        <button type="button" className="btn btn-primary" onClick={handleRetryGuestSession}>
          {copy.retryGuestCheckout}
        </button>
      </div>
    );
  }

  if (pendingOrder && isPaid) {
    return (
      <div className="checkout-page">
        <div className="container checkout-success">
          <div className="checkout-success-card">
            <CheckCircle2 size={40} />
            <h1>{copy.successTitle}</h1>
            <p>{copy.successText}</p>
            <div className="checkout-success-order">
              <span>{copy.orderNumber}</span>
              <strong>{pendingOrder.orderNumber}</strong>
            </div>
            <div className="checkout-success-totals">
              <span>{copy.shippingFee}</span>
              <strong>{formatStorePrice(pendingOrder.totals.shippingFee)}</strong>
              <span>{copy.grandTotal}</span>
              <strong>{formatStorePrice(pendingOrder.totals.grandTotal)}</strong>
            </div>
            <Link to="/collections" className="btn btn-primary">
              {copy.keepShopping}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!pendingOrder && items.length === 0) {
    return (
      <div className="checkout-page">
        <div className="container checkout-empty">
          <h1>{copy.empty}</h1>
          <Link to="/collections" className="btn btn-primary">
            {copy.continueShopping}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="container checkout-shell">
        <div className="checkout-main">
          <div className="checkout-head">
            <Link
              to="/collections"
              className="checkout-back-link"
              onClick={() => {
                setIsCartOpen(true);
              }}
            >
              <ChevronLeft size={16} />
              {copy.backToCart}
            </Link>
            <span className="checkout-badge">{isGuestCheckout ? copy.guestBadge : copy.memberBadge}</span>
            <h1>{isPaymentStep ? copy.paymentHeading : copy.deliveryHeading}</h1>
            <p>{isPaymentStep ? copy.paymentSubheading : copy.deliverySubheading}</p>
          </div>

          <div className="checkout-steps" role="tablist" aria-label={copy.stepsLabel}>
            <button
              type="button"
              className={`checkout-step ${activeStep === "delivery" ? "active" : ""} ${pendingOrder ? "done" : ""}`}
              onClick={() => setActiveStep("delivery")}
              role="tab"
              aria-selected={activeStep === "delivery"}
            >
              <span className="checkout-step-index">1</span>
              <span className="checkout-step-copy">
                <strong>{copy.deliveryTab}</strong>
                <small>{copy.deliveryTabHint}</small>
              </span>
            </button>
            <button
              type="button"
              className={`checkout-step ${activeStep === "payment" ? "active" : ""} ${pendingOrder ? "" : "locked"}`}
              onClick={() => {
                if (pendingOrder) {
                  setActiveStep("payment");
                }
              }}
              role="tab"
              aria-selected={activeStep === "payment"}
              disabled={!pendingOrder}
            >
              <span className="checkout-step-index">2</span>
              <span className="checkout-step-copy">
                <strong>{copy.paymentTab}</strong>
                <small>{copy.paymentTabHint}</small>
              </span>
            </button>
          </div>

          {submitError && <div className="checkout-error">{submitError}</div>}

          {activeStep === "delivery" ? (
            <form className="checkout-form" onSubmit={handleSubmit}>
              {isOrderLocked && <div className="checkout-inline-note">{copy.deliveryLocked}</div>}

              <section className="checkout-section">
                <div className="checkout-section-head">
                  <PackageCheck size={18} />
                  <h2>{copy.customerInfo}</h2>
                </div>

                <div className="checkout-grid">
                  <label className="checkout-field">
                    <span>{copy.fullName}</span>
                    <input
                      type="text"
                      value={formState.fullName}
                      onChange={handleFieldChange("fullName")}
                      required
                      disabled={isOrderLocked}
                    />
                  </label>
                  <label className="checkout-field">
                    <span>{copy.phoneNumber}</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={formState.phoneNumber}
                      onChange={handleFieldChange("phoneNumber")}
                      required
                      disabled={isOrderLocked}
                    />
                  </label>
                </div>
              </section>

              <section className="checkout-section">
                <div className="checkout-section-head">
                  <Truck size={18} />
                  <h2>{copy.addressInfo}</h2>
                </div>

                <div className="checkout-grid">
                  <label className="checkout-field">
                    <span>{copy.districtOrSoum}</span>
                    <select
                      value={formState.districtOrSoum}
                      onChange={handleFieldChange("districtOrSoum")}
                      required
                      disabled={isOrderLocked}
                    >
                      {districtOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="checkout-field">
                    <span>{copy.khorooOrBag}</span>
                    <select
                      value={formState.khorooOrBag}
                      onChange={handleFieldChange("khorooOrBag")}
                      required
                      disabled={isOrderLocked}
                    >
                      {khorooOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="checkout-field checkout-field-wide">
                    <span>{copy.streetAddress}</span>
                    <input
                      type="text"
                      value={formState.streetAddress}
                      onChange={handleFieldChange("streetAddress")}
                      required
                      disabled={isOrderLocked}
                    />
                  </label>
                  <label className="checkout-field checkout-field-wide">
                    <span>{copy.additionalAddress}</span>
                    <input
                      type="text"
                      value={formState.additionalAddress}
                      onChange={handleFieldChange("additionalAddress")}
                      disabled={isOrderLocked}
                    />
                  </label>
                  <label className="checkout-field checkout-field-wide">
                    <span>{copy.note}</span>
                    <textarea
                      value={formState.note}
                      onChange={handleFieldChange("note")}
                      placeholder={copy.notePlaceholder}
                      rows={4}
                      disabled={isOrderLocked}
                    />
                  </label>
                </div>
              </section>

              {isOrderLocked ? (
                <button
                  type="button"
                  className="btn btn-primary checkout-submit"
                  onClick={() => setActiveStep("payment")}
                >
                  {copy.goToPayment}
                </button>
              ) : (
                <button type="submit" className="btn btn-primary checkout-submit" disabled={submitting}>
                  {submitting ? copy.submitting : copy.submit}
                </button>
              )}
            </form>
          ) : (
            <section className="checkout-section checkout-payment-panel">
              <div className="checkout-section-head">
                <WalletCards size={18} />
                <h2>{copy.paymentInfo}</h2>
              </div>

              {pendingOrder ? (
                <div className="checkout-payment-card">
                  <div className="checkout-payment-header">
                    <span className="checkout-payment-badge">QPay</span>
                    <div>
                      <h3>{copy.paymentTitle}</h3>
                      <p>{copy.paymentText}</p>
                    </div>
                  </div>

                  <div className="checkout-payment-meta">
                    <div>
                      <span>{copy.paymentReference}</span>
                      <strong>{pendingOrder.orderNumber}</strong>
                    </div>
                    <div>
                      <span>{copy.paymentAmount}</span>
                      <strong>{formatStorePrice(pendingOrder.totals.grandTotal)}</strong>
                    </div>
                    <div>
                      <span>{copy.paymentStatus}</span>
                      <strong>{pendingOrder.payment.status === "paid" ? copy.paymentPaid : copy.paymentPending}</strong>
                    </div>
                  </div>

                  <div className="checkout-payment-qr-shell">
                    {paymentQrUrl ? (
                      <img src={paymentQrUrl} alt={copy.qrAlt} className="checkout-payment-qr" />
                    ) : (
                      <div className="checkout-payment-qr-placeholder">
                        <QrCode size={48} />
                        <span>{copy.qrLoading}</span>
                      </div>
                    )}
                  </div>

                  <p className="checkout-payment-caption">{copy.scanQr}</p>

                  <button
                    type="button"
                    className="btn btn-primary checkout-submit"
                    onClick={handleCheckPayment}
                    disabled={checkingPayment}
                  >
                    <RefreshCcw size={16} />
                    {checkingPayment ? copy.checkingPayment : copy.checkPayment}
                  </button>

                  <div className={`checkout-payment-status ${pendingOrder.payment.status === "paid" ? "paid" : "pending"}`}>
                    {paymentFeedback || copy.paymentReady}
                  </div>
                </div>
              ) : (
                <div className="checkout-inline-note">{copy.paymentUnavailable}</div>
              )}
            </section>
          )}
        </div>

        <aside className="checkout-summary">
          <div className="checkout-summary-card">
            <h2>{copy.summary}</h2>

            <div className="checkout-summary-items">
              {summaryItems.map((item) => (
                <div key={`${item.productId}-${item.variant}`} className="checkout-summary-item">
                  <div className="checkout-summary-thumb">
                    {item.image ? <img src={item.image} alt={item.name} /> : <span>{item.name.slice(0, 1)}</span>}
                  </div>
                  <div className="checkout-summary-item-body">
                    <div className="checkout-summary-copy">
                      <strong>{item.name}</strong>
                      <small>{item.variant ?? copy.defaultVariant}</small>
                    </div>
                    <div className="checkout-summary-item-bottom">
                      {!isOrderLocked ? (
                        <div className="checkout-summary-qty">
                          <button type="button" onClick={() => updateQuantity(item.productId, item.quantity - 1, item.variant ?? undefined)}>−</button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(item.productId, item.quantity + 1, item.variant ?? undefined)}>+</button>
                        </div>
                      ) : (
                        <small>× {item.quantity}</small>
                      )}
                      <strong>{formatStorePrice(item.lineTotal)}</strong>
                      {!isOrderLocked && (
                        <button type="button" className="checkout-summary-remove" onClick={() => removeItem(item.productId, item.variant ?? undefined)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="checkout-summary-row">
              <span>{copy.subtotal}</span>
              <strong>{formatStorePrice(summaryTotals.subtotal)}</strong>
            </div>
            <div className="checkout-summary-row">
              <span>{copy.shippingFee}</span>
              <strong>{formatStorePrice(summaryTotals.shippingFee)}</strong>
            </div>
            <div className="checkout-summary-row total">
              <span>{copy.grandTotal}</span>
              <strong>{formatStorePrice(summaryTotals.grandTotal)}</strong>
            </div>
          </div>

          <div className="checkout-summary-note-card">
            <h3>{copy.orderNotesHeading}</h3>
            <div className="checkout-summary-note-copy">
              {copy.orderNotes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
