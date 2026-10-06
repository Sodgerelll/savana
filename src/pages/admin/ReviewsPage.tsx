import { useEffect, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import type { AdminCtx } from "./adminShellTypes";
import { StarRating } from "../../components/ProductReviews";
import {
  deleteProductReview,
  setProductReviewStatus,
  subscribeToAllReviews,
  type ProductReview,
  type ProductReviewStatus,
} from "../../lib/productReviews";

const STATUS_LABELS: Record<ProductReviewStatus, { mn: string; en: string }> = {
  pending: { mn: "Хүлээгдэж буй", en: "Pending" },
  approved: { mn: "Нийтлэгдсэн", en: "Published" },
  rejected: { mn: "Татгалзсан", en: "Rejected" },
};

/**
 * Moderation queue for shopper reviews. Nothing a shopper writes reaches the
 * storefront until it is approved here.
 */
export default function ReviewsPage({ ctx }: { ctx: AdminCtx }) {
  const { language, formatAdminDateTime } = ctx;
  const mn = language === "MN";
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ProductReviewStatus | "all">("pending");

  useEffect(
    () =>
      subscribeToAllReviews(
        (next) => {
          setReviews(next);
          setError("");
        },
        (err) => setError(err.message),
      ),
    [],
  );

  const pendingCount = reviews.filter((review) => review.status === "pending").length;
  const approved = reviews.filter((review) => review.status === "approved");
  const average = approved.length ? approved.reduce((sum, review) => sum + review.rating, 0) / approved.length : 0;
  const visible = filter === "all" ? reviews : reviews.filter((review) => review.status === filter);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="admin-kicker">{mn ? "Контент" : "Content"}</p>
          <h1>{mn ? "Бүтээгдэхүүний сэтгэгдэл" : "Product reviews"}</h1>
          <p>
            {mn
              ? "Хэрэглэгчдийн үлдээсэн сэтгэгдлийг баталснаар бүтээгдэхүүний хуудас болон нүүр хуудсанд харагдана."
              : "Reviews appear on the product page and home page once approved here."}
          </p>
        </div>
      </div>

      {error && <div className="admin-sync-error">{error}</div>}

      <div className="admin-summary-grid">
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Хүлээгдэж буй" : "Awaiting review"}</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Нийтлэгдсэн" : "Published"}</span>
          <strong>{approved.length}</strong>
        </div>
        <div className="admin-summary-card admin-summary-card-compact">
          <span>{mn ? "Дундаж үнэлгээ" : "Average rating"}</span>
          <strong>{approved.length ? average.toFixed(1) : "—"}</strong>
        </div>
      </div>

      <div className="admin-data-card">
        <div className="admin-data-card-head">
          <div>
            <h2>{mn ? "Сэтгэгдлүүд" : "Reviews"}</h2>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {(["pending", "approved", "rejected", "all"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`btn ${filter === key ? "btn-primary" : ""}`}
                onClick={() => setFilter(key)}
              >
                {key === "all" ? (mn ? "Бүгд" : "All") : mn ? STATUS_LABELS[key].mn : STATUS_LABELS[key].en}
              </button>
            ))}
          </div>
        </div>
        <div className="admin-data-table-wrap">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>{mn ? "Огноо" : "Date"}</th>
                <th>{mn ? "Бүтээгдэхүүн" : "Product"}</th>
                <th>{mn ? "Үнэлгээ" : "Rating"}</th>
                <th>{mn ? "Сэтгэгдэл" : "Review"}</th>
                <th>{mn ? "Төлөв" : "Status"}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    {mn ? "Сэтгэгдэл алга." : "No reviews."}
                  </td>
                </tr>
              ) : (
                visible.map((review) => (
                  <tr key={review.id}>
                    <td>{formatAdminDateTime(review.createdAt, language)}</td>
                    <td>
                      <div className="admin-table-primary">
                        <strong>{review.productName || `#${review.productId}`}</strong>
                        <small>{review.authorName}</small>
                      </div>
                    </td>
                    <td>
                      <StarRating value={review.rating} size={14} />
                    </td>
                    <td>
                      <div className="admin-table-primary admin-table-cell-wrap">
                        <p style={{ whiteSpace: "pre-line" }}>{review.text}</p>
                      </div>
                    </td>
                    <td>{mn ? STATUS_LABELS[review.status].mn : STATUS_LABELS[review.status].en}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.35rem" }}>
                        {review.status !== "approved" && (
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            title={mn ? "Нийтлэх" : "Publish"}
                            aria-label={mn ? "Нийтлэх" : "Publish"}
                            onClick={() => void run(() => setProductReviewStatus(review.id, "approved"))}
                          >
                            <Check size={15} />
                          </button>
                        )}
                        {review.status !== "rejected" && (
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn-neutral"
                            title={mn ? "Татгалзах" : "Reject"}
                            aria-label={mn ? "Татгалзах" : "Reject"}
                            onClick={() => void run(() => setProductReviewStatus(review.id, "rejected"))}
                          >
                            <X size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-icon-btn"
                          title={mn ? "Устгах" : "Delete"}
                          aria-label={mn ? "Устгах" : "Delete"}
                          onClick={() => {
                            if (window.confirm(mn ? "Энэ сэтгэгдлийг устгах уу?" : "Delete this review?")) {
                              void run(() => deleteProductReview(review.id));
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
