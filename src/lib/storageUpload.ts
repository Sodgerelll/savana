import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

const MAX_EMBEDDED_IMAGE_LENGTH = 350_000;
const MAX_EMBEDDED_IMAGE_DIMENSION = 1600;
const MIN_EMBEDDED_IMAGE_DIMENSION = 320;
const EMBEDDED_IMAGE_QUALITIES = [0.84, 0.76, 0.68, 0.6, 0.52, 0.44, 0.36];

function sanitizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createUploadId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadImage(sourceUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image could not be loaded."));
    image.src = sourceUrl;
  });
}

async function createEmbeddedImageDataUrl(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const originalWidth = image.naturalWidth || image.width || 1;
    const originalHeight = image.naturalHeight || image.height || 1;
    const longestSide = Math.max(originalWidth, originalHeight);
    let scale = longestSide > MAX_EMBEDDED_IMAGE_DIMENSION ? MAX_EMBEDDED_IMAGE_DIMENSION / longestSide : 1;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas context is unavailable.");
    }

    let bestCandidate = "";

    while (scale > 0) {
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));

      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of EMBEDDED_IMAGE_QUALITIES) {
        const candidate = canvas.toDataURL("image/jpeg", quality);
        bestCandidate = candidate;

        if (candidate.length <= MAX_EMBEDDED_IMAGE_LENGTH) {
          return candidate;
        }
      }

      if (Math.max(width, height) <= MIN_EMBEDDED_IMAGE_DIMENSION) {
        break;
      }

      scale *= 0.8;
    }

    if (bestCandidate.length > 0 && bestCandidate.length <= MAX_EMBEDDED_IMAGE_LENGTH) {
      return bestCandidate;
    }

    throw new Error("Image is too large to embed.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadStorefrontImage(file: File, folder: string) {
  const extension = file.name.includes(".") ? file.name.split(".").pop() ?? "jpg" : "jpg";
  const baseName = sanitizeFileName(file.name.replace(/\.[^.]+$/, "")) || "image";
  const fileRef = ref(storage, `storefront/${folder}/${createUploadId()}-${baseName}.${extension}`);

  try {
    await uploadBytes(fileRef, file, {
      contentType: file.type || undefined,
    });

    return getDownloadURL(fileRef);
  } catch {
    return createEmbeddedImageDataUrl(file);
  }
}
