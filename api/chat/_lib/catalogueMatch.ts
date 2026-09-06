// Finds the product a line of a basket is talking about.
//
// The model writes a name; the catalogue holds one. They agree less often than
// it looks, because the model folds the size or the packaging into the name it
// writes: "Давстай халуун жин (1 кг)" for a product called "Давстай халуун жин",
// "Зочид буудлын саван (цагаан торон савлатай)" for "Зочид буудлын саван".
//
// An exact match was all there was, so both of those resolved to nothing. They
// went into a real basket anyway, and the order they were part of — five lines,
// a phone number, an address, and a customer asking where to send the money —
// died at confirmation on the first of them.

/** Just enough shape to match against; the callers hold richer products. */
export interface MatchableProduct {
  id: number;
  name: string;
}

/** "Давстай халуун жин (1 кг)" → "давстай халуун жин" */
function core(name: string): string {
  return name
    .toLowerCase()
    .replace(/[（([][^)）\]]*[)）\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The product this line means, or undefined when nothing in the catalogue does.
 *
 * Tried in order of how much is being assumed: the id the tool recorded, then
 * the name as written, then the name with any bracketed aside removed, then a
 * catalogue name the written one begins with — "Ванны давс 1500 гр" is the
 * shop's "Ванны давс" with a size after it, and nothing else it could be.
 *
 * The last step insists the match end on a word boundary, so "Гарын саван"
 * cannot swallow "Гарын савангаар", and takes the longest candidate when
 * several fit, so the more specific product wins.
 */
export function findCatalogueProduct<T extends MatchableProduct>(
  products: T[],
  name: string,
  productId?: unknown,
): T | undefined {
  const id = Number(productId);
  if (Number.isFinite(id) && id > 0) {
    const byId = products.find((entry) => entry.id === id);
    if (byId) return byId;
  }

  const wanted = String(name ?? '')
    .trim()
    .toLowerCase();
  if (!wanted) return undefined;

  const exact = products.find((entry) => entry.name.toLowerCase() === wanted);
  if (exact) return exact;

  const stripped = core(wanted);
  if (!stripped) return undefined;

  const byCore = products.find((entry) => core(entry.name) === stripped);
  if (byCore) return byCore;

  let best: T | undefined;
  for (const entry of products) {
    const candidate = entry.name.toLowerCase();
    if (!stripped.startsWith(candidate)) continue;
    const next = stripped.charAt(candidate.length);
    if (next && !/[\s(,/-]/.test(next)) continue;
    if (!best || entry.name.length > best.name.length) best = entry;
  }
  return best;
}
