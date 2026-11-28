// Озвучка слова голосом Google в реальном времени — на сервере ничего не хранится.
// Google читает только тайские буквы, а слова в словаре записаны латиницей,
// поэтому озвучиваем поле «тайское написание», а если оно пустое — перевод
// английского (или русского) значения на тайский.

const THAI = /[\u0E00-\u0E7F]/; // тайский блок Unicode
const UA = { "User-Agent": "Mozilla/5.0" };

/** Первый вариант из перевода «hello, hi» → «hello» */
const first = (s: string) => s.split(/[,;/]/)[0].trim();

export type SpeakSource = { word: string; thai: string; english: string; translation: string };

/** Тайский текст для озвучки: тайское написание, само слово (если оно тайскими буквами), иначе перевод значения. */
export async function thaiText(w: SpeakSource): Promise<string | null> {
  if (w.thai.trim()) return w.thai.trim();
  if (THAI.test(w.word)) return w.word;
  const [sl, text] = w.english.trim() ? ["en", first(w.english)] : ["ru", first(w.translation)];
  if (!text) return null;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=th&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => null);
  const th = (data?.[0] ?? []).map((part: any) => part?.[0] ?? "").join("").trim();
  return th || null;
}

/** mp3 с тайской речью (Google ограничивает длину ~200 символов). */
export async function speech(thai: string): Promise<Response | null> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encodeURIComponent(thai.slice(0, 200))}`;
  const res = await fetch(url, { headers: UA });
  return res.ok && res.body ? res : null;
}
