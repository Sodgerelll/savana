// Puts a corrupted catalogue word back the way the shop wrote it.
//
// A model rewriting an ingredient list in its own hand is one keystroke away
// from changing what the product contains. It happened: "ганга ӨВСНИЙ хандтай
// тос" — oil from the ganga herb — was sent to a customer as "ганга ӨВЧНИЙ
// хандтай тос", the ganga *disease*. One letter, and a plant became an
// illness in a message about something people put on their skin.
//
// A prompt rule makes that rarer. It cannot make it impossible, and an
// ingredient list is read by people with allergies, so this does not rely on
// one: every reply is checked against the words the catalogue actually uses.

/** Below this length a single differing letter is too weak a signal to act on. */
const MIN_WORD = 6;

/** Cyrillic only. A latin word is not a catalogue term of this shop's. */
const WORD = /[Ѐ-ӿ᠀-᢯]+/g;

export interface FactRepair {
  from: string;
  to: string;
}

/**
 * Whether two words of equal length differ in exactly one character.
 *
 * Substitution only, on purpose. Insertions and deletions turn ordinary
 * Mongolian inflection into a false match — a suffix is a letter added — while
 * a substitution of equal length is what a model does when it half-remembers a
 * word. Narrow is the point: this rewrites what a customer reads.
 */
function differsByOne(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let seen = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      seen += 1;
      if (seen > 1) {
        return false;
      }
    }
  }
  return seen === 1;
}

/** Keeps the shape of what was written: Найрлага stays capitalised. */
function matchCase(replacement: string, original: string): string {
  const first = original[0] ?? '';
  return first === first.toUpperCase() && first !== first.toLowerCase()
    ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
    : replacement;
}

/**
 * The words a reply is allowed to spell however it likes, and the ones it is not.
 *
 * Drawn from the fields where being wrong costs something — what a product is
 * called and what is in it. Everything else the model may phrase freely.
 */
export function catalogueVocabulary(
  products: Array<{ name: string; ingredients: string }>,
): string[] {
  const words = new Set<string>();
  for (const product of products) {
    for (const source of [product.name, product.ingredients]) {
      for (const word of String(source ?? '').toLowerCase().match(WORD) ?? []) {
        if (word.length >= MIN_WORD) {
          words.add(word);
        }
      }
    }
  }
  return [...words];
}

/**
 * Returns the reply with any near-miss of a catalogue word put back.
 *
 * A word is only touched when the catalogue does not contain it at all and
 * exactly one catalogue word of the same length is a single letter away. Two
 * candidates means we cannot know which was meant, and guessing between them
 * would be its own way of being wrong — so it is left alone and the repair is
 * reported rather than made.
 */
export function repairCatalogueWords(
  reply: string,
  vocabulary: string[],
): { text: string; repaired: FactRepair[] } {
  if (!reply || vocabulary.length === 0) {
    return { text: reply, repaired: [] };
  }

  const known = new Set(vocabulary);
  const repaired: FactRepair[] = [];

  const text = reply.replace(WORD, (word) => {
    const lower = word.toLowerCase();
    if (lower.length < MIN_WORD || known.has(lower)) {
      return word;
    }

    let candidate: string | null = null;
    for (const entry of vocabulary) {
      if (!differsByOne(lower, entry)) {
        continue;
      }
      if (candidate && candidate !== entry) {
        // Ambiguous. Silence is better than picking one at random.
        return word;
      }
      candidate = entry;
    }

    if (!candidate) {
      return word;
    }

    const fixed = matchCase(candidate, word);
    repaired.push({ from: word, to: fixed });
    return fixed;
  });

  return { text, repaired };
}
