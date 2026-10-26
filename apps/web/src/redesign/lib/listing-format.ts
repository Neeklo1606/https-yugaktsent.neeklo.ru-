/** «78.33» → «78,3 м²»: русская запятая, одна цифра после неё */
export function formatArea(m2: number): string {
  const rounded = Math.round(m2 * 10) / 10;
  return `${String(rounded).replace('.', ',')}\u00a0м²`;
}

/** «3-комнатная» → «3-к.кв» (формат карточек по ТЗ), «Студия» остаётся студией */
export function shortRoomLabel(name: string | null | undefined): string | null {
  const t = name?.trim();
  if (!t) return null;
  const m = t.match(/^(\d+)\s*-?\s*(?:к\b|комн)/i);
  if (m) return `${m[1]}-к.кв`;
  if (/студ/i.test(t)) return 'Студия';
  return t;
}
