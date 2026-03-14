const SOURCE_URL = "https://savana.mn/products";
const FIREBASE_PROJECT_ID = "savana-3f45a";
const FIREBASE_API_KEY = "AIzaSyCBiNJtQBZdVs4INEL_hI_-1S1x_yZkzII";
const FIRESTORE_DATABASE_ID = "(default)";
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents`;
const FIREBASE_AUTH_URL = `https://identitytoolkit.googleapis.com/v1`;
const SYSTEM_COLLECTION_ID = 999001;
const SYSTEM_COLLECTION_SLUG = "best-sellers";
const ROOT_SITE_ID = "main";
const OFFICIAL_FACEBOOK_URL = "https://www.facebook.com/SavanaOrganica";
const FALLBACK_CATEGORY_BY_MAIN_CATEGORY_ID = new Map([
  [50595, 153735],
  [50637, 153730],
  [50858, 153733],
]);
const CATEGORY_GRADIENTS = [
  "linear-gradient(135deg, #d8ccb7 0%, #bcab92 100%)",
  "linear-gradient(135deg, #bfc8aa 0%, #98a57f 100%)",
  "linear-gradient(135deg, #d8c2ae 0%, #c69a72 100%)",
  "linear-gradient(135deg, #c7d8d1 0%, #86a396 100%)",
  "linear-gradient(135deg, #dfc8c5 0%, #bc928b 100%)",
  "linear-gradient(135deg, #d8d4bc 0%, #a5a178 100%)",
  "linear-gradient(135deg, #c8cfdb 0%, #8796b1 100%)",
  "linear-gradient(135deg, #d9c4d8 0%, #af88a9 100%)",
];

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value ?? "").replace(/\r/g, "").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseImages(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return unique(
      value.flatMap((item) => {
        if (typeof item === "string") {
          return [item];
        }

        if (item && typeof item === "object" && "url" in item) {
          return [String(item.url)];
        }

        return [];
      })
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseImages(parsed);
    } catch {
      return value.trim() ? [value.trim()] : [];
    }
  }

  return [];
}

function toSlug(id) {
  return `category-${id}`;
}

function getFirstSentence(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "";
  }

  const match = normalized.match(/.+?[.!?](?:\s|$)/);
  return match ? match[0].trim() : normalized;
}

function extractInstagramHandle(url) {
  const normalized = normalizeText(url);

  if (!normalized) {
    return "";
  }

  const clean = normalized.replace(/\/+$/, "");
  const parts = clean.split("/");
  const handle = parts[parts.length - 1] ?? "";

  return handle ? `@${handle.replace(/^@/, "")}` : "";
}

function joinDescriptionParts(parts) {
  return unique(
    parts
      .map((part) => normalizeText(part))
      .filter(Boolean)
  ).join("\n\n");
}

function flattenCategories(categories, lineage = []) {
  return (categories ?? []).flatMap((category) => {
    const current = {
      id: Number(category.id),
      name: normalizeText(category.name),
      description: [...lineage, normalizeText(category.name)].filter(Boolean).join(" / "),
      image: normalizeText(category.image),
      ordering: Number(category.ordering ?? 0),
    };

    return [current, ...flattenCategories(category.children, [...lineage, current.name])];
  });
}

function guessCategoryId(product) {
  const directCategoryId = Number(product.category_id);

  if (directCategoryId > 0) {
    return directCategoryId;
  }

  const mappedMainCategoryId = FALLBACK_CATEGORY_BY_MAIN_CATEGORY_ID.get(Number(product.main_category_id));

  if (mappedMainCategoryId) {
    return mappedMainCategoryId;
  }

  const haystack = `${normalizeText(product.name)} ${normalizeText(product.short_description)} ${stripHtml(product.description)}`.toLowerCase();

  if (haystack.includes("угаалгын") || haystack.includes("аяга таваг") || haystack.includes("эдийн")) {
    return 153733;
  }

  if (haystack.includes("жин") || haystack.includes("дүрлэг")) {
    return 153730;
  }

  if (haystack.includes("ванны давс")) {
    return 153737;
  }

  if (haystack.includes("хүүхдийн")) {
    return 153781;
  }

  if (haystack.includes("саван")) {
    return 153735;
  }

  return 153730;
}

function resolvePrice(product) {
  const basePrice = Number(product.price ?? 0);
  const salePrice = Number(product.sale_price ?? 0);

  if (salePrice > 0 && salePrice < basePrice) {
    return {
      price: salePrice,
      compareAtPrice: basePrice,
      badge: "Хямдрал",
    };
  }

  return {
    price: basePrice,
    compareAtPrice: undefined,
    badge: undefined,
  };
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => encodeFirestoreValue(item)),
      },
    };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nestedValue]) => [key, encodeFirestoreValue(nestedValue)])
        ),
      },
    };
  }

  return { stringValue: String(value) };
}

function encodeDocumentFields(document) {
  return Object.fromEntries(
    Object.entries(document).map(([key, value]) => [key, encodeFirestoreValue(value)])
  );
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

  if (!match) {
    throw new Error("Could not find __NEXT_DATA__ payload.");
  }

  return JSON.parse(match[1]);
}

async function fetchSourceStorefront() {
  const html = await fetchText(SOURCE_URL);
  const payload = parseNextData(html);
  const { currentShop, categories, products } = payload.props.pageProps;

  return { currentShop, categories, products };
}

function buildImportPayload(source) {
  const categoryMap = new Map(flattenCategories(source.categories).map((category) => [category.id, category]));
  const resolvedCategoryIdByProductId = new Map(
    source.products.map((product) => [Number(product.id), guessCategoryId(product)])
  );
  const categoryIds = unique(source.products.map((product) => resolvedCategoryIdByProductId.get(Number(product.id))));
  const importedCollections = categoryIds.map((categoryId, index) => {
    const category = categoryMap.get(categoryId);

    if (!category) {
      throw new Error(`Missing category ${categoryId} for imported product.`);
    }

    return {
      id: category.id,
      name: category.name,
      slug: toSlug(category.id),
      description: category.description || category.name,
      gradient: CATEGORY_GRADIENTS[index % CATEGORY_GRADIENTS.length],
      image: category.image,
      status: "active",
    };
  });

  const hasBestSellers = source.products.some((product) => Boolean(product.featured));

  if (hasBestSellers) {
    importedCollections.push({
      id: SYSTEM_COLLECTION_ID,
      name: "Шилдэг бүтээгдэхүүн",
      slug: SYSTEM_COLLECTION_SLUG,
      description: "Онцлох болон эрэлттэй бүтээгдэхүүнүүд.",
      gradient: "linear-gradient(135deg, #c8c0a0 0%, #b5aa88 100%)",
      image: "",
      status: "active",
    });
  }

  const collectionSlugById = new Map(importedCollections.map((collection) => [collection.id, collection.slug]));

  const importedProducts = source.products.map((product) => {
    const pricing = resolvePrice(product);
    const longDescription = stripHtml(product.description);
    const shortDescription = normalizeText(product.short_description);
    const images = unique([
      ...parseImages(product.images),
      normalizeText(product.image),
    ]);
    const resolvedCategoryId = resolvedCategoryIdByProductId.get(Number(product.id)) ?? guessCategoryId(product);

    return {
      id: Number(product.id),
      name: normalizeText(product.name),
      price: pricing.price,
      compareAtPrice: pricing.compareAtPrice,
      description: joinDescriptionParts([shortDescription, longDescription]),
      category: collectionSlugById.get(resolvedCategoryId) ?? toSlug(resolvedCategoryId),
      images: images.length > 0 ? images : [""],
      badge: pricing.badge,
      bestSeller: Boolean(product.featured),
      status: product.status === "enabled" ? "active" : "inactive",
    };
  });

  const deliveryOptions = Array.isArray(source.currentShop.delivery_options)
    ? source.currentShop.delivery_options
    : [];
  const primaryDeliveryTitle = normalizeText(deliveryOptions[0]?.delivery_title);
  const primaryLocation = [primaryDeliveryTitle, "Монгол Улс"].filter(Boolean).join(", ");
  const deliveryRule = normalizeText(source.currentShop.delivery_rule);
  const paymentRule = normalizeText(source.currentShop.payment_rule);
  const termsOfService = normalizeText(source.currentShop.terms_of_service);
  const phoneNumber = normalizeText(source.currentShop.phone);
  const brandDescription = stripHtml(source.currentShop.description);
  const firstDeliverySentence = getFirstSentence(deliveryRule);
  const responseTime = firstDeliverySentence || "24-48 цагийн дотор";

  const importedSettings = {
    status: "active",
    brandName: normalizeText(source.currentShop.name) || "SAVANA",
    brandDescription,
    heroHeading: normalizeText(source.currentShop.name) || "SAVANA",
    heroSubtext: brandDescription,
    aboutIntroTitle: normalizeText(source.currentShop.name) || "SAVANA",
    aboutIntroBody: joinDescriptionParts([brandDescription, paymentRule, deliveryRule]),
    contactEmail: normalizeText(source.currentShop.email),
    location: primaryLocation || "Монгол Улс",
    responseTime,
    facebookUrl: OFFICIAL_FACEBOOK_URL,
    instagramUrl: normalizeText(source.currentShop.instagram_url),
    instagramHandle: extractInstagramHandle(source.currentShop.instagram_url),
    mapNote: normalizeText(source.currentShop.address) || firstDeliverySentence,
    marketIntro: deliveryRule || paymentRule,
    storeHoursText: joinDescriptionParts([deliveryRule, termsOfService]),
    wholesaleHeading: "Хамтран ажиллах уу?",
    wholesaleText: joinDescriptionParts([termsOfService, phoneNumber ? `Лавлах утас: ${phoneNumber}` : ""]),
    wholesaleEmail: normalizeText(source.currentShop.email),
  };

  const importedMarkets =
    deliveryOptions.length > 0
      ? deliveryOptions.map((option, index) => ({
          id: Number(option.id ?? index + 1),
          name: normalizeText(option.delivery_title) || `Хүргэлт ${index + 1}`,
          schedule: firstDeliverySentence || normalizeText(option.delivery_description) || responseTime,
          address: normalizeText(option.delivery_description) || normalizeText(source.currentShop.address) || primaryLocation,
          season: "Жилийн турш",
          status: "active",
        }))
      : [
          {
            id: 1,
            name: primaryDeliveryTitle || "Хүргэлт",
            schedule: responseTime,
            address: normalizeText(source.currentShop.address) || primaryLocation || "Монгол Улс",
            season: "Жилийн турш",
            status: "active",
          },
        ];

  return {
    settings: importedSettings,
    collections: importedCollections,
    products: importedProducts,
    markets: importedMarkets,
    testimonials: [],
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return data;
}

async function signUpTempUser() {
  const email = `codex-import-${Date.now()}@example.com`;
  const password = `Tmp!${Math.random().toString(36).slice(2)}A1`;
  const data = await fetchJson(`${FIREBASE_AUTH_URL}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  return { idToken: data.idToken };
}

async function deleteTempUser(idToken) {
  await fetchJson(`${FIREBASE_AUTH_URL}/accounts:delete?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
}

async function listPublicDocuments(path) {
  const documents = [];
  let pageToken = "";

  do {
    const url = new URL(`${FIRESTORE_BASE_URL}/${path}`);
    url.searchParams.set("pageSize", "100");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const data = await fetchJson(url.toString());
    documents.push(...(data.documents ?? []));
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return documents;
}

async function patchDocument(path, data, idToken, updateMask = []) {
  const url = new URL(`${FIRESTORE_BASE_URL}/${path}`);

  for (const fieldPath of updateMask) {
    url.searchParams.append("updateMask.fieldPaths", fieldPath);
  }

  await fetchJson(url.toString(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: encodeDocumentFields(data),
    }),
  });
}

async function deleteDocument(path, idToken) {
  const response = await fetch(`${FIRESTORE_BASE_URL}/${path}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
}

async function syncCollections(collections, idToken) {
  const existingDocs = await listPublicDocuments("collections");
  const keepIds = new Set(collections.map((collection) => String(collection.id)));
  const timestamp = new Date().toISOString();

  for (const collection of collections) {
    await patchDocument(
      `collections/${collection.id}`,
      {
        ...collection,
        siteId: "main",
        sortOrder: collection.id,
        updatedAt: timestamp,
      },
      idToken
    );
  }

  for (const document of existingDocs) {
    const docId = document.name.split("/").pop() ?? "";

    if (!keepIds.has(docId)) {
      await deleteDocument(`collections/${docId}`, idToken);
    }
  }
}

async function syncProducts(products, idToken) {
  const existingDocs = await listPublicDocuments("products");
  const keepIds = new Set(products.map((product) => String(product.id)));
  const timestamp = new Date().toISOString();

  for (const product of products) {
    await patchDocument(
      `products/${product.id}`,
      {
        ...product,
        siteId: "main",
        sortOrder: product.id,
        updatedAt: timestamp,
        variants: product.variants ?? null,
        badge: product.badge ?? null,
        compareAtPrice: product.compareAtPrice ?? null,
      },
      idToken
    );
  }

  for (const document of existingDocs) {
    const docId = document.name.split("/").pop() ?? "";

    if (!keepIds.has(docId)) {
      await deleteDocument(`products/${docId}`, idToken);
    }
  }
}

async function syncSettings(settings, idToken) {
  await patchDocument(
    "sites/main/settings/general",
    settings,
    idToken,
    Object.keys(settings)
  );
}

async function syncCollection(path, items, idToken, transform) {
  const existingDocs = await listPublicDocuments(path);
  const keepIds = new Set(items.map((item) => String(item.id)));
  const timestamp = new Date().toISOString();

  for (const item of items) {
    await patchDocument(
      `${path}/${item.id}`,
      {
        ...transform(item),
        updatedAt: timestamp,
      },
      idToken
    );
  }

  for (const document of existingDocs) {
    const docId = document.name.split("/").pop() ?? "";

    if (!keepIds.has(docId)) {
      await deleteDocument(`${path}/${docId}`, idToken);
    }
  }
}

async function syncMarkets(markets, idToken) {
  await syncCollection(`sites/${ROOT_SITE_ID}/markets`, markets, idToken, (market) => ({
    ...market,
    sortOrder: market.id,
  }));
}

async function syncTestimonials(testimonials, idToken) {
  await syncCollection(`sites/${ROOT_SITE_ID}/testimonials`, testimonials, idToken, (testimonial) => ({
    ...testimonial,
    sortOrder: testimonial.id,
  }));
}

async function syncSiteDocument(idToken) {
  await patchDocument(
    `sites/${ROOT_SITE_ID}`,
    {
      siteId: ROOT_SITE_ID,
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
    },
    idToken,
    ["siteId", "schemaVersion", "updatedAt"]
  );
}

async function run() {
  const source = await fetchSourceStorefront();
  const payload = buildImportPayload(source);
  const tempUser = await signUpTempUser();

  try {
    await syncSiteDocument(tempUser.idToken);
    await syncSettings(payload.settings, tempUser.idToken);
    await syncCollections(payload.collections, tempUser.idToken);
    await syncProducts(payload.products, tempUser.idToken);
    await syncMarkets(payload.markets, tempUser.idToken);
    await syncTestimonials(payload.testimonials, tempUser.idToken);
  } finally {
    await deleteTempUser(tempUser.idToken).catch(() => {});
  }

  console.log(
    JSON.stringify(
      {
        source: SOURCE_URL,
        importedCollections: payload.collections.length,
        importedProducts: payload.products.length,
        importedMarkets: payload.markets.length,
        importedTestimonials: payload.testimonials.length,
        brandName: payload.settings.brandName,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
