#!/usr/bin/env node
/**
 * Build step: give crawlers real HTML.
 *
 * The storefront is a client-rendered SPA, so the HTML a crawler fetches is an
 * empty <div id="root">. After `vite build` this script reads the public
 * catalogue straight from Firestore's REST API (the same data anyone can read)
 * and writes, for the home page, every collection and every product:
 *
 *   - its own <title>, description, canonical link and Open Graph tags,
 *   - schema.org JSON-LD (Product with price, stock and rating),
 *   - the page's actual text inside #root, which React replaces on load,
 *
 * plus sitemap.xml and robots.txt. The static text carries the path it was
 * written for, and a one-line inline script drops it when the SPA shell is
 * served for a different path (Vercel's fallback, the service worker), so a
 * shopper never sees one page's text flash on another.
 *
 * It never fails the build: if Firestore cannot be reached the site still
 * ships, with the default tags in index.html and a sitemap of fixed routes.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const SITE_URL = "https://savana.mn";
const PROJECT_ID = "savana-3f45a";
const DATABASE_ID = process.env.VITE_FIRESTORE_DATABASE_ID?.trim() || "(default)";
// The public web API key from src/lib/firebase.ts; it only grants what the
// Firestore rules allow anonymous readers, i.e. the catalogue.
const API_KEY = "AIzaSyCBiNJtQBZdVs4INEL_hI_-1S1x_yZkzII";
const DIST = join(process.cwd(), "dist");
const FIRESTORE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;
const DEFAULT_DESCRIPTION =
  "SAVANA — Монгол орны байгалийн түүхий эдээр гар аргаар хийсэн органик саван, шампунь, ванны болон ахуйн бүтээгдэхүүн. 2019 оноос хойш.";
const DEFAULT_IMAGE = `${SITE_URL}/pwa-512.png`;
const SYSTEM_COLLECTION_SLUG = "best-sellers";
// Placeholder notes the shop launched with; the app swaps them for real
// articles at runtime (src/data/storefront.ts), so they are never published here.
const LEGACY_PLACEHOLDER_JOURNAL_TITLES = new Set([
  "Why we build routines around fewer, better essentials",
  "Ingredient clarity matters more than trend language",
  "Designing a storefront that feels tactile and slow",
]);

// ── Firestore REST ──────────────────────────────────────────────────────────

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeDocument(document) {
  return { _id: document.name.split("/").pop(), ...decodeFields(document.fields ?? {}) };
}

async function fetchJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url.split("?")[0]}`);
  return response.json();
}

async function listCollection(path) {
  const documents = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ pageSize: "300", key: API_KEY });
    if (pageToken) query.set("pageToken", pageToken);
    const page = await fetchJson(`${FIRESTORE}/${path}?${query}`);
    documents.push(...(page.documents ?? []).map(decodeDocument));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

async function getDocument(path) {
  try {
    return decodeDocument(await fetchJson(`${FIRESTORE}/${path}?key=${API_KEY}`));
  } catch {
    return null;
  }
}

async function listApprovedReviews() {
  try {
    const rows = await fetchJson(`${FIRESTORE}:runQuery?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "productReviews" }],
          where: {
            fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "approved" } },
          },
        },
      }),
    });
    return rows.filter((row) => row.document).map((row) => decodeDocument(row.document));
  } catch {
    // The collection (or its rules) may not be deployed yet.
    return [];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const plain = (value, max = 160) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const paragraphs = (value) =>
  String(value ?? "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");

const isActive = (item) => item?.status !== "inactive";
const isHttpUrl = (value) => typeof value === "string" && /^https?:\/\//.test(value);

const formatPrice = (amount) => `${new Intl.NumberFormat("mn-MN").format(amount)}₮`;

function basePrice(product) {
  return Array.isArray(product.variants) && product.variants.length
    ? Math.min(...product.variants.map((variant) => Number(variant.price ?? 0)))
    : Number(product.price ?? 0);
}

function isSoldOut(product) {
  const remaining =
    Array.isArray(product.variants) && product.variants.length
      ? product.variants.reduce(
          (sum, variant) => sum + Math.max(0, Number(variant.quantity ?? 0) - Number(variant.soldCount ?? 0)),
          0,
        )
      : Number(product.totalStock ?? 0) - Number(product.soldCount ?? 0);
  return remaining <= 0;
}

function productLinks(products) {
  if (!products.length) return "";
  return `<ul>${products
    .map(
      (product) =>
        `<li><a href="/product/${esc(product.id)}">${esc(product.name)}</a> — ${esc(formatPrice(basePrice(product)))}${
          isSoldOut(product) ? " (дууссан)" : ""
        }</li>`,
    )
    .join("")}</ul>`;
}

// ── Page writer ─────────────────────────────────────────────────────────────

const STATIC_STYLE =
  "max-width:960px;margin:0 auto;padding:180px 16px 64px;font-family:Georgia,serif;line-height:1.7;color:#26211d";

function renderPage(template, page) {
  const title = page.title ? `${page.title} | SAVANA` : "SAVANA — Байгалийн гар аргын саван, арьс арчилгаа";
  const description = plain(page.description || DEFAULT_DESCRIPTION);
  const url = `${SITE_URL}${page.path === "/" ? "/" : page.path}`;
  const image = isHttpUrl(page.image) ? page.image : DEFAULT_IMAGE;

  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${esc(image)}$2`)
    .replace(/(<meta property="og:type" content=")[^"]*(")/, `$1${esc(page.type ?? "website")}$2`);

  if (page.jsonLd) {
    const jsonLd = JSON.stringify(page.jsonLd).replace(/</g, "\\u003c");
    html = html.replace(
      "</head>",
      `  <script type="application/ld+json" id="page-jsonld">${jsonLd}</script>\n  </head>`,
    );
  }

  const guard =
    "<script>(function(){var e=document.getElementById('seo-static');if(!e)return;" +
    "var p=location.pathname.replace(/\\/+$/,'')||'/';try{p=decodeURIComponent(p)}catch(_){}" +
    "if(e.getAttribute('data-path')!==p)e.remove()})()</script>";

  return html.replace(
    '<div id="root"></div>',
    `<div id="root"><div id="seo-static" data-path="${esc(page.path)}" style="${STATIC_STYLE}">${page.body}</div></div>${guard}`,
  );
}

async function writePage(template, page) {
  const file = page.path === "/" ? join(DIST, "index.html") : join(DIST, page.path, "index.html");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, renderPage(template, page));
}

// ── Main ────────────────────────────────────────────────────────────────────

const STATIC_ROUTES = ["/", "/collections", "/about", "/contact", "/journal", "/partnerships", "/privacy", "/terms"];

async function writeSitemapAndRobots(entries) {
  const urls = entries
    .map(
      ({ path, lastmod }) =>
        `  <url><loc>${esc(`${SITE_URL}${path}`)}</loc>${lastmod ? `<lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  await writeFile(
    join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  );
  await writeFile(
    join(DIST, "robots.txt"),
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /account",
      "Disallow: /admin",
      "Disallow: /checkout",
      "Disallow: /login",
      "Disallow: /api/",
      "",
      `Sitemap: ${SITE_URL}/sitemap.xml`,
      "",
    ].join("\n"),
  );
}

async function main() {
  const template = await readFile(join(DIST, "index.html"), "utf8");

  let collections;
  let products;
  let settings;
  let reviews;
  try {
    [collections, products, settings, reviews] = await Promise.all([
      listCollection("collections"),
      listCollection("products"),
      getDocument("sites/main/settings/general"),
      listApprovedReviews(),
    ]);
  } catch (error) {
    console.warn(`[prerender-seo] catalogue unavailable, writing fixed routes only: ${error.message}`);
    await writeSitemapAndRobots(STATIC_ROUTES.map((path) => ({ path })));
    return;
  }

  settings = settings ?? {};
  const activeCollections = collections
    .filter(isActive)
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  const activeSlugs = new Set(activeCollections.map((collection) => collection.slug));
  const activeProducts = products
    .filter((product) => isActive(product) && activeSlugs.has(product.category))
    .map((product) => ({ ...product, id: Number(product.id ?? product._id) }))
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  const shownCollections = activeCollections.filter((collection) =>
    collection.slug === SYSTEM_COLLECTION_SLUG
      ? activeProducts.some((product) => product.bestSeller)
      : activeProducts.some((product) => product.category === collection.slug),
  );
  const reviewsByProduct = new Map();
  for (const review of reviews) {
    const id = Number(review.productId);
    if (!reviewsByProduct.has(id)) reviewsByProduct.set(id, []);
    reviewsByProduct.get(id).push(review);
  }
  const journalEntries = (Array.isArray(settings.journalEntries) ? settings.journalEntries : [])
    .filter((entry) => isActive(entry) && !LEGACY_PLACEHOLDER_JOURNAL_TITLES.has(String(entry.titleEn ?? "").trim()))
    .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));

  const collectionNav = `<nav><ul>${shownCollections
    .map((collection) => `<li><a href="/collections/${esc(collection.slug)}">${esc(collection.name)}</a></li>`)
    .join("")}</ul></nav>`;

  const pages = [];

  pages.push({
    path: "/",
    description: settings.heroSubtext || DEFAULT_DESCRIPTION,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SAVANA",
      legalName: "Савана органика ХХК",
      url: SITE_URL,
      logo: DEFAULT_IMAGE,
      sameAs: [settings.facebookUrl, settings.instagramUrl].filter(isHttpUrl),
    },
    body: [
      `<h1>SAVANA — байгалийн гар аргын саван, арьс арчилгаа</h1>`,
      paragraphs(settings.heroSubtext || DEFAULT_DESCRIPTION),
      `<h2>Ангилал</h2>${collectionNav}`,
      `<h2>Эрэлттэй бүтээгдэхүүн</h2>${productLinks(
        activeProducts.filter((product) => product.bestSeller && !isSoldOut(product)).slice(0, 8),
      )}`,
      paragraphs(settings.aboutIntroBody),
      journalEntries.length
        ? `<h2>Сэтгүүл</h2><ul>${journalEntries
            .slice(0, 3)
            .map((entry) => `<li><a href="/journal">${esc(entry.titleMn || entry.titleEn)}</a></li>`)
            .join("")}</ul>`
        : "",
    ].join(""),
  });

  pages.push({
    path: "/collections",
    title: "Бүх бүтээгдэхүүн",
    description: "SAVANA-ийн байгалийн гаралтай саван, шампунь, ванны болон ахуйн бүх бүтээгдэхүүн.",
    body: `<h1>Бүх бүтээгдэхүүн</h1>${collectionNav}${productLinks(activeProducts)}`,
  });

  for (const collection of shownCollections) {
    const items =
      collection.slug === SYSTEM_COLLECTION_SLUG
        ? activeProducts.filter((product) => product.bestSeller)
        : activeProducts.filter((product) => product.category === collection.slug);
    pages.push({
      path: `/collections/${collection.slug}`,
      title: collection.name,
      description: collection.description,
      image: collection.image,
      body: `<p><a href="/">Нүүр</a> / <a href="/collections">Дэлгүүр</a></p><h1>${esc(collection.name)}</h1>${paragraphs(
        collection.description,
      )}${productLinks(items)}`,
    });
  }

  for (const product of activeProducts) {
    const images = (Array.isArray(product.images) ? product.images : []).filter(isHttpUrl);
    const productReviews = reviewsByProduct.get(product.id) ?? [];
    const average = productReviews.length
      ? productReviews.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / productReviews.length
      : 0;
    const collection = activeCollections.find((item) => item.slug === product.category);
    const soldOut = isSoldOut(product);
    const related = activeProducts
      .filter((item) => item.category === product.category && item.id !== product.id)
      .slice(0, 4);
    const section = (heading, text) => (text ? `<h2>${heading}</h2>${paragraphs(text)}` : "");

    pages.push({
      path: `/product/${product.id}`,
      title: product.name,
      description: product.description || product.ingredients || product.name,
      image: images[0],
      type: "product",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: plain(product.description || product.name, 500),
        sku: String(product.id),
        brand: { "@type": "Brand", name: "SAVANA" },
        ...(images.length ? { image: images } : {}),
        ...(collection ? { category: collection.name } : {}),
        offers: {
          "@type": "Offer",
          url: `${SITE_URL}/product/${product.id}`,
          priceCurrency: "MNT",
          price: basePrice(product),
          availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
        },
        ...(productReviews.length
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: Number(average.toFixed(1)),
                reviewCount: productReviews.length,
              },
              review: productReviews.slice(0, 5).map((review) => ({
                "@type": "Review",
                author: { "@type": "Person", name: review.authorName },
                reviewRating: { "@type": "Rating", ratingValue: Number(review.rating ?? 5), bestRating: 5 },
                reviewBody: plain(review.text, 500),
              })),
            }
          : {}),
      },
      body: [
        `<p><a href="/">Нүүр</a> / <a href="/collections">Дэлгүүр</a>${
          collection ? ` / <a href="/collections/${esc(collection.slug)}">${esc(collection.name)}</a>` : ""
        }</p>`,
        `<h1>${esc(product.name)}</h1>`,
        `<p><strong>${esc(formatPrice(basePrice(product)))}</strong>${soldOut ? " — Дууссан" : ""}</p>`,
        Array.isArray(product.variants) && product.variants.length
          ? `<ul>${product.variants
              .map((variant) => `<li>${esc(variant.name)} — ${esc(formatPrice(Number(variant.price ?? 0)))}</li>`)
              .join("")}</ul>`
          : product.sizeLabel
            ? `<p>Хэмжээ: ${esc(product.sizeLabel)}</p>`
            : "",
        paragraphs(product.description),
        section("Найрлага", product.ingredients),
        section("Үйлчилгээ", product.usage),
        section("Хэрэглэх заавар", product.howToUse),
        section("Анхаар зүйлс", product.caution),
        section("Хадгалах хугацаа", product.shelfLife),
        section("Хадгалах нөхцөл", product.storageConditions),
        productReviews.length
          ? `<h2>Сэтгэгдэл (${productReviews.length})</h2><ul>${productReviews
              .slice(0, 10)
              .map((review) => `<li><strong>${esc(review.authorName)}</strong> (${esc(review.rating)}/5): ${esc(review.text)}</li>`)
              .join("")}</ul>`
          : "",
        related.length ? `<h2>Таньд таалагдаж болох</h2>${productLinks(related)}` : "",
      ].join(""),
    });
  }

  pages.push({
    path: "/journal",
    title: settings.journalHeadingMn || "SAVANA сэтгүүл",
    description: settings.journalSubtextMn,
    body: `<h1>${esc(settings.journalHeadingMn || "SAVANA сэтгүүл")}</h1>${journalEntries
      .map((entry) => `<article><h2>${esc(entry.titleMn || entry.titleEn)}</h2>${paragraphs(entry.excerptMn || entry.excerptEn)}</article>`)
      .join("")}`,
  });

  pages.push({
    path: "/about",
    title: "Бидний түүх",
    description: settings.aboutIntroBody,
    body: `<h1>${esc(settings.aboutIntroTitle || "Бидний түүх")}</h1>${paragraphs(settings.aboutIntroBody)}`,
  });

  pages.push({
    path: "/contact",
    title: "Холбоо барих",
    description: "SAVANA-тай холбогдох: утас, и-мэйл, сошиал хаяг.",
    body: `<h1>Холбоо барих</h1>${settings.contactPhone ? `<p>Утас: ${esc(settings.contactPhone)}</p>` : ""}${
      settings.contactEmail ? `<p>И-мэйл: ${esc(settings.contactEmail)}</p>` : ""
    }${settings.location ? `<p>${esc(settings.location)}</p>` : ""}`,
  });

  pages.push({
    path: "/partnerships",
    title: "Хамтрал",
    description: settings.wholesaleText,
    body: `<h1>${esc(settings.wholesaleHeading || "Хамтрал")}</h1>${paragraphs(settings.wholesaleText)}`,
  });

  for (const page of pages) {
    await writePage(template, page);
  }

  const productUpdatedAt = new Map(products.map((product) => [Number(product.id ?? product._id), product.updatedAt]));
  await writeSitemapAndRobots([
    ...STATIC_ROUTES.map((path) => ({ path })),
    ...shownCollections.map((collection) => ({ path: `/collections/${collection.slug}` })),
    ...activeProducts.map((product) => ({
      path: `/product/${product.id}`,
      lastmod: typeof productUpdatedAt.get(product.id) === "string" ? productUpdatedAt.get(product.id) : undefined,
    })),
  ]);

  console.log(
    `[prerender-seo] wrote ${pages.length} pages (${activeProducts.length} products, ${shownCollections.length} collections) and sitemap.xml`,
  );
}

main().catch((error) => {
  // SEO is an enhancement; a failure here must never block a deploy.
  console.warn(`[prerender-seo] skipped: ${error?.stack ?? error}`);
});
