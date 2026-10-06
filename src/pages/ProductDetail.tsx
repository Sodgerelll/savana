import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import {
  DrawLeafIcon, DrawHandmadeIcon, DrawFlowerIcon, DrawBoxIcon, DrawAlertIcon, DrawShelfLifeIcon, DrawStorageIcon,
} from "../components/NatureIcons";
import { useCart } from "../context/CartContext";
import { useLanguage } from "../context/LanguageContext";
import { useStorefront } from "../context/StorefrontContext";
import ProductCard from "../components/ProductCard";
import ProductReviews, { StarRating } from "../components/ProductReviews";
import RestockNotify from "../components/RestockNotify";
import { subscribeToApprovedReviews, type ProductReview } from "../lib/productReviews";
import { SITE_URL, toPlainDescription, useDocumentMeta } from "../lib/seo";
import {
  applyDiscount,
  formatStorePrice,
  getActiveDiscount,
  getActiveProducts,
  getCategoryGradient,
  isProductSoldOut,
} from "../lib/storefrontHelpers";
import "./ProductDetail.css";

export default function ProductDetail() {
  const { id } = useParams();
  const { addItem, items } = useCart();
  const { language, t } = useLanguage();
  const { products, collections, discounts, loading } = useStorefront();
  const visibleProducts = getActiveProducts(products, collections);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const productId = Number(id);

  useEffect(() => {
    if (!Number.isFinite(productId)) return undefined;
    // Reviews are a nice-to-have; a failed read just leaves the list empty.
    return subscribeToApprovedReviews(productId, setReviews, () => setReviews([]));
  }, [productId]);

  const product = visibleProducts.find((p) => p.id === Number(id));

  const allImages = product?.images.filter(Boolean) ?? [];

  const metaPrice = product
    ? product.variants?.length
      ? Math.min(...product.variants.map((v) => v.price))
      : product.price
    : 0;
  const metaImages = allImages.filter((image) => /^https?:\/\//.test(image));
  const metaReviewAverage = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  useDocumentMeta({
    title: product?.name ?? t.productNotFound,
    description: product ? toPlainDescription(product.description || product.ingredients || product.name) : undefined,
    image: metaImages[0],
    path: product ? `/product/${product.id}` : undefined,
    type: product ? "product" : "website",
    // Only a settled miss is a real 404; while the catalogue loads, stay indexable.
    noindex: !product && !loading,
    jsonLd: product
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: toPlainDescription(product.description || product.name, 500),
          sku: String(product.id),
          brand: { "@type": "Brand", name: "SAVANA" },
          ...(metaImages.length ? { image: metaImages } : {}),
          offers: {
            "@type": "Offer",
            url: `${SITE_URL}/product/${product.id}`,
            priceCurrency: "MNT",
            price: metaPrice,
            availability: isProductSoldOut(product) ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
          },
          ...(reviews.length
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: Number(metaReviewAverage.toFixed(1)),
                  reviewCount: reviews.length,
                },
              }
            : {}),
        }
      : null,
  });

  useEffect(() => {
    if (allImages.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setActiveImageIndex((i) => (i + 1) % allImages.length);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [allImages.length]);

  if (!product) {
    return (
      <div className="container section" style={{ textAlign: "center" }}>
        <h1 style={{ marginBottom: "1rem" }}>{t.productNotFound}</h1>
        <Link to="/collections" className="btn btn-outline">
          {t.backToShop}
        </Link>
      </div>
    );
  }

  const relatedProducts = visibleProducts
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const currentPrice = selectedVariant
    ? product.variants?.find((v) => v.name === selectedVariant)?.price ?? product.price
    : product.price;
  const activeDiscount = getActiveDiscount(discounts, product.id, currentPrice);
  const effectivePrice = activeDiscount ? applyDiscount(currentPrice, activeDiscount) : currentPrice;

  const hasVariants = (product.variants?.length ?? 0) > 0;
  // Remaining stock for the current selection (a variant must be picked first).
  const selectedRemaining = hasVariants
    ? (selectedVariant
        ? (() => {
            const v = product.variants!.find((vv) => vv.name === selectedVariant);
            return Number(v?.quantity ?? 0) - Number(v?.soldCount ?? 0);
          })()
        : 0)
    : Number(product.totalStock ?? 0) - Number(product.soldCount ?? 0);
  const cartQtyForSelection =
    items.find((i) => i.product.id === product.id && i.variant === selectedVariant)?.quantity ?? 0;
  const addableMax = Math.max(0, selectedRemaining - cartQtyForSelection);
  const needsVariantSelection = hasVariants && !selectedVariant;
  const addDisabled = needsVariantSelection || addableMax <= 0;

  const productSoldOut = isProductSoldOut(product);
  const showRestockNotify = productSoldOut || (!needsVariantSelection && selectedRemaining <= 0);
  const reviewAverage = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
  const gradient = getCategoryGradient(collections, product.category);
  const activeImage = allImages[activeImageIndex] || allImages[0] || "";

  return (
    <div className="product-detail">
      <div className="container">
        <div className="breadcrumb pd-breadcrumb">
          <Link to="/">{t.home}</Link> / <Link to="/collections">{t.shop}</Link> /{" "}
          <span>{product.name}</span>
        </div>

        <div className="product-detail-grid">
          {/* Image area */}
          <div className="product-detail-images">
            <div className="product-main-image" style={{ background: gradient }}>
              {activeImage ? (
                <img src={activeImage} alt={product.name} className="product-main-photo" />
              ) : (
                <div className="product-main-icon">
                  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                    <ellipse cx="60" cy="72" rx="38" ry="26" fill="rgba(255,255,255,0.2)" />
                    <rect x="24" y="36" width="72" height="46" rx="23" fill="rgba(255,255,255,0.28)" />
                    <path d="M44 36 Q60 18 76 36" stroke="rgba(255,255,255,0.45)" strokeWidth="3.5" fill="none" />
                  </svg>
                </div>
              )}
              {product.badge && (
                <span className="pd-badge">{product.badge}</span>
              )}
              {activeDiscount && (
                <span className="pd-discount-img-badge">
                  {activeDiscount.type === "percent" ? `-${activeDiscount.value}%` : `-${formatStorePrice(activeDiscount.value)}`}
                </span>
              )}
            </div>
            {allImages.length > 1 && (
              <div className="product-thumbnails">
                {allImages.map((image, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`product-thumbnail ${index === activeImageIndex ? "active" : ""}`}
                    onClick={() => setActiveImageIndex(index)}
                    style={{ background: gradient }}
                  >
                    <img src={image} alt={`${product.name} ${index + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="product-detail-info">
            <h1>{product.name}</h1>
            {activeDiscount ? (
              <div className="pd-price-row">
                <span className="pd-price-original">{formatStorePrice(currentPrice)}</span>
                <p className="pd-price pd-price-discounted">{formatStorePrice(effectivePrice)}</p>
                <span className="pd-discount-badge">
                  {activeDiscount.type === "percent" ? `-${activeDiscount.value}%` : `-${formatStorePrice(activeDiscount.value)}`}
                </span>
              </div>
            ) : (
              <p className="pd-price">{formatStorePrice(currentPrice)}</p>
            )}
            {reviews.length > 0 && (
              <button
                type="button"
                className="pd-rating-summary"
                onClick={() =>
                  document.getElementById("product-reviews")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <StarRating value={reviewAverage} size={15} />
                <span>
                  {reviewAverage.toFixed(1)} · {reviews.length} {language === "MN" ? "сэтгэгдэл" : "reviews"}
                </span>
              </button>
            )}
            {/* How many are left is the shop's business; a shopper is only told
                when there are none. */}
            {productSoldOut && (
              <p className="pd-stock pd-stock-out">
                {language === "MN" ? "Дууссан" : "Out of stock"}
              </p>
            )}

            <div className="pd-description">
              <p>{product.description}</p>
            </div>

            {product.variants && product.variants.length > 0 ? (
              <div className="pd-variants">
                <label className="pd-label">{t.option}</label>
                <div className="variant-buttons">
                  {product.variants.map((variant) => {
                    const remaining = variant.quantity - (variant.soldCount ?? 0);
                    return (
                      <button
                        key={variant.name}
                        className={`variant-btn ${selectedVariant === variant.name ? "active" : ""} ${remaining <= 0 ? "variant-btn-out" : ""}`}
                        onClick={() => { setSelectedVariant(variant.name); setQuantity(1); }}
                        disabled={remaining <= 0}
                      >
                        <span>{variant.name} — {formatStorePrice(variant.price)}</span>
                        {variant.quantity > 0 && remaining <= 0 && (
                          <span className="variant-stock variant-stock-out">
                            {language === "MN" ? "Дууссан" : "Sold out"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : product.sizeLabel ? (
              <div className="pd-size-label">
                <span className="pd-label">{language === "MN" ? "Хэмжээ" : "Size"}</span>
                <span className="pd-size-value">{product.sizeLabel}</span>
              </div>
            ) : null}

            <div className="pd-quantity">
              <label className="pd-label">{t.quantity}</label>
              <div className="pd-quantity-row">
                <div className="quantity-selector">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}>
                    <Minus size={14} />
                  </button>
                  <span>{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(q + 1, Math.max(1, addableMax)))}
                    disabled={quantity >= addableMax}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {quantity > 1 && (
                  <span className="pd-quantity-total">
                    = {formatStorePrice(effectivePrice * quantity)}
                  </span>
                )}
              </div>
            </div>

            <button
              className="btn btn-primary pd-add-btn"
              onClick={() => addItem(product, quantity, selectedVariant)}
              disabled={addDisabled}
            >
              {needsVariantSelection
                ? (language === "MN" ? "Сонголтоо сонгоно уу" : "Select an option")
                : addableMax <= 0
                  ? (selectedRemaining <= 0
                      ? (language === "MN" ? "Дууссан" : "Out of stock")
                      : (language === "MN" ? "Сагсанд нэмэгдсэн" : "Max in cart"))
                  : t.addToCart}
            </button>

            {showRestockNotify && (
              <RestockNotify
                key={`${product.id}-${selectedVariant ?? ""}`}
                productName={product.name}
                variant={productSoldOut ? undefined : selectedVariant}
              />
            )}

          

            <div className="pd-accordion">
              {/* Ingredients and usage are what a shopper comes to this page to read,
                  so they are always open rather than waiting behind a click. */}
              {product.ingredients && (
                <section className="pd-accordion-open">
                  <h2 className="pd-accordion-heading"><DrawLeafIcon size={28} strokeWidth={1.3} /> {t.ingredients}</h2>
                  <p>{product.ingredients}</p>
                </section>
              )}
              {product.usage && (
                <section className="pd-accordion-open">
                  <h2 className="pd-accordion-heading"><DrawFlowerIcon size={28} strokeWidth={1.3} /> {t.usage}</h2>
                  <p>{product.usage}</p>
                </section>
              )}
              {product.howToUse && (
                <details>
                  <summary><DrawHandmadeIcon size={28} strokeWidth={1.3} /> {t.howToUse}</summary>
                  <p>{product.howToUse}</p>
                </details>
              )}
              {product.caution && (
                <details>
                  <summary><DrawAlertIcon size={28} strokeWidth={1.3} /> {t.caution}</summary>
                  <p>{product.caution}</p>
                </details>
              )}
              {product.shelfLife && (
                <details>
                  <summary><DrawShelfLifeIcon size={28} strokeWidth={1.3} /> {t.shelfLife}</summary>
                  <p>{product.shelfLife}</p>
                </details>
              )}
              {product.storageConditions && (
                <details>
                  <summary><DrawStorageIcon size={28} strokeWidth={1.3} /> {t.storageConditions}</summary>
                  <p>{product.storageConditions}</p>
                </details>
              )}
              <details>
                <summary><DrawBoxIcon size={28} strokeWidth={1.3} /> {t.shippingReturns}</summary>
                <p>
                  Delivery timing and fees depend on your location. Please review checkout details
                  before confirming your order.
                </p>
              </details>
            </div>
          </div>
        </div>

        <section className="pd-reviews-section" id="product-reviews">
          <h2>
            {language === "MN" ? "Сэтгэгдэл" : "Reviews"} ({reviews.length})
          </h2>
          <ProductReviews productId={product.id} productName={product.name} reviews={reviews} />
        </section>

        {relatedProducts.length > 0 && (
          <div className="related-products section">
            <div className="section-header">
              <h2>{t.youMayAlsoLike}</h2>
            </div>
            <div className="product-grid">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
