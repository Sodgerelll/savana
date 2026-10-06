import { useEffect } from "react";

/**
 * Per-page <head> tags. The build-time prerender (scripts/prerender-seo.mjs)
 * writes the same tags into static HTML for crawlers; this keeps them correct
 * as the shopper moves around the single-page app, and for crawlers that run
 * the JavaScript.
 */
export const SITE_URL = "https://savana.mn";
export const SITE_NAME = "SAVANA";
export const DEFAULT_DESCRIPTION =
  "SAVANA — Монгол орны байгалийн түүхий эдээр гар аргаар хийсэн органик саван, шампунь, ванны болон ахуйн бүтээгдэхүүн. 2019 оноос хойш.";

export interface DocumentMeta {
  title?: string;
  description?: string;
  /** Absolute http(s) URL; inline data: images are skipped. */
  image?: string;
  path?: string;
  type?: "website" | "product" | "article";
  jsonLd?: Record<string, unknown> | null;
  noindex?: boolean;
}

function setMeta(attribute: "name" | "property", key: string, value: string | null) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (value === null) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = value;
}

function setCanonical(url: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = url;
}

export function toPlainDescription(value: string, maxLength = 160) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function useDocumentMeta(meta: DocumentMeta) {
  const { title, description, image, path, type, noindex } = meta;
  const jsonLd = meta.jsonLd ? JSON.stringify(meta.jsonLd) : "";

  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Байгалийн гар аргын саван, арьс арчилгаа`;
    const fullDescription = toPlainDescription(description || DEFAULT_DESCRIPTION);
    const url = `${SITE_URL}${path ?? window.location.pathname}`;
    const httpImage = image && /^https?:\/\//.test(image) ? image : `${SITE_URL}/pwa-512.png`;

    document.title = fullTitle;
    setMeta("name", "description", fullDescription);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : null);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", fullDescription);
    setMeta("property", "og:type", type ?? "website");
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", httpImage);
    setCanonical(url);

    const existing = document.getElementById("page-jsonld");
    if (jsonLd) {
      const script = existing ?? document.createElement("script");
      script.id = "page-jsonld";
      script.setAttribute("type", "application/ld+json");
      script.textContent = jsonLd;
      if (!existing) document.head.appendChild(script);
    } else {
      existing?.remove();
    }
  }, [title, description, image, path, type, noindex, jsonLd]);
}
