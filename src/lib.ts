export type Word = {
  id: number;
  word: string; // иностранное слово
  translation: string; // русский перевод ("" — нет)
  english: string; // английский перевод ("" — нет)
  thai: string; // тайское написание ("" — нет), по нему озвучка
  tags: string[]; // теги-группы, в нижнем регистре
  ok: number; // всего успехов
  fail: number; // всего неудач
};

export type NewWord = { word: string; translation?: string; english?: string; thai?: string; tags?: string[]; ok?: number; fail?: number };

export type Direction = "foreign" | "native"; // что показываем
export type Settings = { direction: Direction; strictTones: boolean };

export type Result = { word: Word; success: boolean; given: string; revealed: boolean };

const SETTINGS_KEY = "lingo.settings.v1";

// Настройки — локально на устройстве; словарь — на сервере (см. api.ts)
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as Settings;
  } catch {
    /* хранилище недоступно */
  }
  return { direction: "foreign", strictTones: true };
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно */
  }
}

/**
 * Ключ для поиска дублей: без учёта регистра, лишних пробелов и черты среднего
 * тона (nāam = naam). Остальные тоны различаются: náam ≠ nàam.
 */
export const wordKey = (s: string) =>
  s.normalize("NFD").toLowerCase().replace(/\u0304/g, "").replace(/\s+/g, " ").trim().normalize("NFC");

/** Теги: без пробелов по краям, в нижнем регистре, без пустых и повторов. */
export function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(out)];
}

/** Переводы слова для показа: «дом · house». */
export const meaning = (w: Pick<Word, "translation" | "english">) =>
  [w.translation, w.english].filter((s) => s?.trim()).join(" · ");

/**
 * Разбор массового ввода, по строке: «слово - перевод» или «слово - перевод - english»
 * (разделители — – = с пробелами вокруг, или Tab). Пустой русский: «слово - - house».
 */
export function parseBulk(text: string): NewWord[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+[-–—=](?=\s|$)|\t/).map((s) => s.trim());
      if (parts.length < 2 || parts.length > 3 || !parts[0]) return null;
      const w: NewWord = { word: parts[0], translation: parts[1] };
      if (parts[2]) w.english = parts[2];
      return w.translation || w.english ? w : null;
    })
    .filter((w): w is NewWord => !!w);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Тайские тоновые знаки: ไม้เอก ไม้โท ไม้ตรี ไม้จัตวา
const THAI_TONES = /[่-๋]/g;
// Комбинируемые диакритики латиницы (тоны в транслитерации: à á â ǎ …)
const LATIN_DIACRITICS = /[̀-ͯ]/g;

// Средний тон: «ā» и «a» — одно и то же (черту можно ставить, а можно нет)
const MID_TONE = /\u0304/g;

function normalize(s: string, strictTones: boolean): string {
  let r = s.normalize("NFD").toLowerCase().replace(MID_TONE, "");
  if (!strictTones) r = r.replace(THAI_TONES, "").replace(LATIN_DIACRITICS, "");
  return r
    .replace(/[.,!?;:"«»()]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
}

/** Варианты правильного ответа: «дом, здание» или «дом / здание» или «дом; здание». */
export function variants(answer: string): string[] {
  return answer.split(/[,;/]/).map((s) => s.trim()).filter(Boolean);
}

/** Ответ верен, если совпал с любым вариантом любого из правильных ответов (рус. или англ.). */
export function isCorrect(given: string, answer: string | string[], strictTones: boolean): boolean {
  const g = normalize(given, strictTones);
  if (!g) return false;
  return (Array.isArray(answer) ? answer : [answer])
    .filter((a) => a.trim())
    .some((a) => variants(a).some((v) => normalize(v, strictTones) === g) || normalize(a, strictTones) === g);
}
