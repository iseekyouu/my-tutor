// Озвучка слова голосом Google в реальном времени — на диск ничего не пишется.
// Google читает только тайские буквы, а слова в словаре записаны латиницей,
// поэтому озвучиваем поле «тайское написание», а если оно пустое — тайский текст
// от Gemini (по транслитерации и значению), запасной вариант — Google Translate.
import { suggestThai } from "./gemini";

const THAI = /[\u0E00-\u0E7F]/; // тайский блок Unicode
const UA = { "User-Agent": "Mozilla/5.0" };

/** Первый вариант из перевода «hello, hi» → «hello» */
const first = (s: string) => s.split(/[,;/]/)[0].trim();

export type SpeakSource = { word: string; thai: string; english: string; translation: string };

// Полученный тайский текст — в памяти до перезапуска: повторные нажатия не тратят лимит Gemini
const cache = new Map<string, string>();
const CACHE_MAX = 1000;
const inFlight = new Map<string, Promise<string | null>>();

/** Тайский текст для озвучки: тайское написание, само слово (если оно тайскими буквами), иначе подсказка Gemini / перевод. */
export async function thaiText(w: SpeakSource): Promise<string | null> {
  if (w.thai.trim()) return w.thai.trim();
  if (THAI.test(w.word)) return w.word;
  const key = [w.word, w.english, w.translation].map((s) => s.trim().toLowerCase()).join("\n");
  const cached = cache.get(key);
  if (cached) return cached;
  // Одновременные запросы одного слова (звук + узнать текст) ждут один ответ Gemini
  const running = inFlight.get(key);
  if (running) return running;

  const job = (async () => {
    let th: string | null = null;
    try {
      th = await suggestThai(w);
    } catch {
      th = await googleTranslate(w).catch(() => null);
    }
    if (th) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, th);
    }
    return th;
  })();
  inFlight.set(key, job);
  try {
    return await job;
  } finally {
    inFlight.delete(key);
  }
}

/** Перевод значения на тайский через неофициальный Google Translate (бывает заблокирован). */
async function googleTranslate(w: SpeakSource): Promise<string | null> {
  const [sl, text] = w.english.trim() ? ["en", first(w.english)] : ["ru", first(w.translation)];
  if (!text) return null;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=th&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => null);
  const th = (data?.[0] ?? []).map((part: any) => part?.[0] ?? "").join("").trim();
  return th || null;
}

// Готовые mp3 — в памяти до перезапуска (на диск не пишутся). Нужно и для скорости, и для
// плеера Safari/WebKit: он качает звук кусками в нескольких запросах, а Google на каждый
// запрос отдаёт чуть другой файл — куски разных файлов не склеиваются.
const audioCache = new Map<string, Uint8Array<ArrayBuffer>>();
const AUDIO_CACHE_MAX = 300; // ~15 КБ на слово → до ~5 МБ

/** mp3 с тайской речью (Google ограничивает длину ~200 символов). */
export async function speech(thai: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const text = thai.slice(0, 200);
  const cached = audioCache.get(text);
  if (cached) {
    audioCache.delete(text); // свежее — в конец очереди
    audioCache.set(text, cached);
    return cached;
  }
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=th&client=tw-ob&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return null;
  const mp3 = new Uint8Array(await res.arrayBuffer());
  if (!mp3.length) return null;
  if (audioCache.size >= AUDIO_CACHE_MAX) audioCache.delete(audioCache.keys().next().value!);
  audioCache.set(text, mp3);
  return mp3;
}
