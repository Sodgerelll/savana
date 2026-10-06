import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * Shopper reviews. Anyone signed in with a real account may leave one review
 * per product; it stays hidden until an admin approves it, and only approved
 * reviews are readable by the public (see firestore.rules).
 */
export const PRODUCT_REVIEWS_COLLECTION = "productReviews";
export const PRODUCT_REVIEW_SCHEMA_VERSION = 1;
export const REVIEW_TEXT_MAX_LENGTH = 2000;

export type ProductReviewStatus = "pending" | "approved" | "rejected";

export interface ProductReview {
  id: string;
  productId: number;
  productName: string;
  uid: string;
  authorName: string;
  rating: number;
  text: string;
  status: ProductReviewStatus;
  createdAt: string | null;
}

export interface CreateProductReviewInput {
  productId: number;
  productName: string;
  uid: string;
  authorName: string;
  rating: number;
  text: string;
}

const reviewsRef = collection(db, PRODUCT_REVIEWS_COLLECTION);

/** One review per shopper per product: the id itself enforces it. */
export function getProductReviewId(productId: number, uid: string) {
  return `${productId}_${uid}`;
}

function parseTimestamp(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate() as Date).toISOString();
  }
  return null;
}

function parseStatus(value: unknown): ProductReviewStatus {
  return value === "approved" || value === "rejected" ? value : "pending";
}

function deserializeReview(snapshot: QueryDocumentSnapshot<DocumentData>): ProductReview {
  const data = snapshot.data() as Record<string, unknown>;
  return {
    id: snapshot.id,
    productId: Number(data.productId ?? 0),
    productName: String(data.productName ?? ""),
    uid: String(data.uid ?? ""),
    authorName: String(data.authorName ?? ""),
    rating: Math.min(5, Math.max(1, Math.round(Number(data.rating ?? 5)))),
    text: String(data.text ?? ""),
    status: parseStatus(data.status),
    createdAt: parseTimestamp(data.createdAt),
  };
}

function newestFirst(left: ProductReview, right: ProductReview) {
  return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
}

export function summarizeReviews(reviews: ProductReview[]) {
  if (reviews.length === 0) return { count: 0, average: 0 };
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return { count: reviews.length, average: total / reviews.length };
}

/**
 * Approved reviews, newest first; pass a productId for one product's reviews.
 * Equality filters only, so no composite index is needed — the store is small
 * enough to sort on the client.
 */
export function subscribeToApprovedReviews(
  productId: number | null,
  onData: (reviews: ProductReview[]) => void,
  onError?: (error: FirestoreError) => void,
) {
  const constraints = [where("status", "==", "approved")];
  if (productId !== null) constraints.push(where("productId", "==", productId));
  return onSnapshot(
    query(reviewsRef, ...constraints),
    (snapshot) => onData(snapshot.docs.map(deserializeReview).sort(newestFirst)),
    onError,
  );
}

/** Every review regardless of status — admin moderation only. */
export function subscribeToAllReviews(
  onData: (reviews: ProductReview[]) => void,
  onError?: (error: FirestoreError) => void,
) {
  return onSnapshot(
    reviewsRef,
    (snapshot) => onData(snapshot.docs.map(deserializeReview).sort(newestFirst)),
    onError,
  );
}

/** The signed-in shopper's own review of a product, whatever its status. */
export async function getOwnReview(productId: number, uid: string) {
  try {
    const snapshot = await getDoc(doc(reviewsRef, getProductReviewId(productId, uid)));
    return snapshot.exists() ? deserializeReview(snapshot as QueryDocumentSnapshot<DocumentData>) : null;
  } catch {
    // The rules cannot read `uid` off a document that does not exist yet, so a
    // missing review comes back as permission-denied rather than empty.
    return null;
  }
}

export async function createProductReview(input: CreateProductReviewInput) {
  await setDoc(doc(reviewsRef, getProductReviewId(input.productId, input.uid)), {
    schemaVersion: PRODUCT_REVIEW_SCHEMA_VERSION,
    productId: input.productId,
    productName: input.productName.trim().slice(0, 200),
    uid: input.uid,
    authorName: input.authorName.trim().slice(0, 80),
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    text: input.text.trim().slice(0, REVIEW_TEXT_MAX_LENGTH),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export async function setProductReviewStatus(id: string, status: ProductReviewStatus) {
  await updateDoc(doc(reviewsRef, id), { status });
}

export async function deleteProductReview(id: string) {
  await deleteDoc(doc(reviewsRef, id));
}
