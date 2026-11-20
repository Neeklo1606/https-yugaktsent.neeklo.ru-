/** Normalize user search input for catalog/autocomplete (no vector/ES). */
export function normalizeSearchQuery(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ё/gi, 'е')
    .replace(/^м\.?\s*/i, '')
    .replace(/[«»"'`]/g, '')
    .replace(GENERIC_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * «ЖК Борский», «жилой комплекс Сердце», «новостройки» — служебные слова, в названиях ЖК их нет.
 * Без них поиск «жк» ничего не находил. Только целые слова (граница — пробел/край строки).
 */
const GENERIC_WORDS =
  /(^|\s)(жк|ж\/к|ж\.к\.?|жилой комплекс|жилом комплексе|жилые комплексы|комплекс|новостройк[аиу]?)(?=\s|$)/gi;

/** Запрос состоит только из служебных слов («жк», «новостройки») — показать все ЖК. */
export function isGenericComplexQuery(raw: string): boolean {
  const t = raw.trim();
  return t.length > 0 && normalizeSearchQuery(t) === '';
}

/** Extra contains variants for typo-tolerant ILIKE (metro names, hyphenated). */
export function searchQueryVariants(raw: string): string[] {
  const base = normalizeSearchQuery(raw);
  if (!base) return [];
  const variants = new Set<string>([base]);
  const noHyphen = base.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noHyphen && noHyphen !== base) variants.add(noHyphen);
  if (base.length >= 4) variants.add(base.replace(/(.)\1+/g, '$1'));
  return [...variants];
}
