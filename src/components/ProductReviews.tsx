import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import {
  createProductReview,
  getOwnReview,
  REVIEW_TEXT_MAX_LENGTH,
  type ProductReview,
} from "../lib/productReviews";
import { formatStoreDate } from "../lib/storefrontHelpers";
import "./ProductReviews.css";

export function StarRating({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="star-rating" aria-label={`${value.toFixed(1)} / 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          strokeWidth={1.5}
          className={star <= Math.round(value) ? "star-filled" : "star-empty"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

interface ProductReviewsProps {
  productId: number;
  productName: string;
  reviews: ProductReview[];
}

export default function ProductReviews({ productId, productName, reviews }: ProductReviewsProps) {
  const { language } = useLanguage();
  const { user, profile } = useAuth();
  const mn = language === "MN";
  const canReview = Boolean(user && !user.isAnonymous);

  const ownReviewKey = user && !user.isAnonymous ? `${productId}_${user.uid}` : "";
  // Tagged with the product and shopper it was loaded for, so a stale answer
  // never shows on another product or after signing out.
  const [ownReviewState, setOwnReviewState] = useState<{ key: string; review: ProductReview | null } | null>(null);
  const ownReview = ownReviewState && ownReviewState.key === ownReviewKey ? ownReviewState.review : null;
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [authorNameDraft, setAuthorName] = useState<string | null>(null);
  const authorName = authorNameDraft ?? (profile?.displayName?.trim() || user?.displayName?.trim() || "");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (!user || user.isAnonymous) return undefined;
    const key = `${productId}_${user.uid}`;
    let cancelled = false;
    void getOwnReview(productId, user.uid).then((review) => {
      if (!cancelled) setOwnReviewState({ key, review });
    });
    return () => {
      cancelled = true;
    };
  }, [productId, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || user.isAnonymous || !authorName.trim() || !text.trim()) return;
    setStatus("sending");
    try {
      await createProductReview({ productId, productName, uid: user.uid, authorName, rating, text });
      setStatus("sent");
      setOwnReviewState({ key: ownReviewKey, review: await getOwnReview(productId, user.uid) });
    } catch {
      setStatus("error");
    }
  };

  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;

  return (
    <div className="product-reviews">
      {reviews.length > 0 ? (
        <div className="product-reviews-summary">
          <strong>{average.toFixed(1)}</strong>
          <StarRating value={average} size={18} />
          <span>
            {reviews.length} {mn ? "сэтгэгдэл" : reviews.length === 1 ? "review" : "reviews"}
          </span>
        </div>
      ) : (
        <p className="product-reviews-empty">
          {mn ? "Энэ бүтээгдэхүүнд одоогоор сэтгэгдэл алга. Анхны сэтгэгдлийг та үлдээгээрэй." : "No reviews yet. Be the first to share yours."}
        </p>
      )}

      {reviews.length > 0 && (
        <ul className="product-reviews-list">
          {reviews.map((review) => (
            <li key={review.id} className="product-review">
              <div className="product-review-head">
                <StarRating value={review.rating} size={14} />
                <strong>{review.authorName}</strong>
                {review.createdAt && <span>{formatStoreDate(review.createdAt, language)}</span>}
              </div>
              <p>{review.text}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="product-review-form-wrap">
        <h3>{mn ? "Сэтгэгдэл үлдээх" : "Write a review"}</h3>
        {!canReview ? (
          <p className="product-review-note">
            {mn ? "Сэтгэгдэл үлдээхийн тулд " : "Please "}
            <Link to="/login">{mn ? "нэвтэрнэ үү" : "sign in"}</Link>
            {mn ? "." : " to leave a review."}
          </p>
        ) : ownReview ? (
          <p className="product-review-note">
            {ownReview.status === "approved"
              ? mn ? "Таны сэтгэгдэл нийтлэгдсэн байна. Баярлалаа!" : "Your review is published. Thank you!"
              : ownReview.status === "rejected"
                ? mn ? "Таны сэтгэгдэл нийтлэгдээгүй." : "Your review was not published."
                : mn ? "Таны сэтгэгдлийг хүлээн авлаа. Шалгасны дараа нийтлэгдэнэ." : "Thanks! Your review will appear once it has been checked."}
          </p>
        ) : (
          <form className="product-review-form" onSubmit={handleSubmit}>
            <div className="product-review-stars-input" role="radiogroup" aria-label={mn ? "Үнэлгээ" : "Rating"}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  aria-label={`${star}`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                >
                  <Star
                    size={24}
                    strokeWidth={1.5}
                    className={star <= (hoverRating || rating) ? "star-filled" : "star-empty"}
                  />
                </button>
              ))}
            </div>
            <input
              type="text"
              value={authorName}
              maxLength={80}
              placeholder={mn ? "Таны нэр" : "Your name"}
              aria-label={mn ? "Таны нэр" : "Your name"}
              onChange={(event) => setAuthorName(event.target.value)}
              required
            />
            <textarea
              value={text}
              rows={4}
              maxLength={REVIEW_TEXT_MAX_LENGTH}
              placeholder={mn ? "Бүтээгдэхүүний талаарх таны сэтгэгдэл..." : "What did you think of it?"}
              aria-label={mn ? "Сэтгэгдэл" : "Review"}
              onChange={(event) => setText(event.target.value)}
              required
            />
            {status === "error" && (
              <p className="product-review-error">
                {mn ? "Илгээж чадсангүй. Дахин оролдоно уу." : "Could not send your review. Please try again."}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={status === "sending"}>
              {status === "sending" ? (mn ? "Илгээж байна..." : "Sending...") : mn ? "Илгээх" : "Submit"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
