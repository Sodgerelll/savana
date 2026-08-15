// Turns a catalog-aware model reply into reviewable FAQ drafts.
//
// Lives outside the page component so it can be tested on its own, and so the
// admin page keeps exporting only its component (React Fast Refresh).

/** Sent as the user turn; the storefront prompt supplies the catalog it reads. */
export const FAQ_GENERATOR_INSTRUCTION = `Та SAVANA брэндийн мэдлэгийн сан бэлтгэж байна.
Доорх дэлгүүрийн мэдээлэл, бүтээгдэхүүний каталогийг уншаад худалдан авагчид ХАМГИЙН ТҮГЭЭМЭЛ асуух 8 асуулт, тэдгээрийн хариултыг гарга.

ДҮРЭМ:
- Зөвхөн Монгол хэл (Кирилл). "Та" гэж хүндэтгэлтэй.
- Хариулт 1-3 өгүүлбэр, тодорхой.
- Каталогт БАЙХГҮЙ зүйлийг бүү зохио. Мэдээлэл дутвал тэр асуултыг огт бүү оруул.
- Эмчилгээний амлалт бүү өг ("эмчилнэ", "эдгээнэ" гэх мэт бүү бич).
- Хүргэлт, төлбөр, найрлага, хэрэглээ, хадгалалт, бөөний талаар нэг нэгийг оруулахыг хич.

ГАРАЛТ: ЗӨВХӨН JSON массив буцаа, өөр ямар ч текст бүү бич.
Формат: [{"question":"...","answer":"...","topic":"..."}]`;

export interface GeneratedFaq {
  question: string;
  answer: string;
  topic: string;
}

/**
 * Extracts the JSON array from a model reply.
 *
 * Models routinely wrap JSON in a ```json fence or put a sentence in front of
 * it, so we slice to the outermost bracket pair instead of trusting the whole
 * string to parse. Anything malformed yields an empty list — the caller shows
 * "could not generate" rather than importing garbage into the knowledge base.
 */
export function parseGeneratedFaqs(reply: string): GeneratedFaq[] {
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return {
        question: typeof row.question === "string" ? row.question.trim() : "",
        answer: typeof row.answer === "string" ? row.answer.trim() : "",
        topic: typeof row.topic === "string" ? row.topic.trim() : "",
      };
    })
    .filter((entry) => entry.question.length > 0 && entry.answer.length > 0);
}
