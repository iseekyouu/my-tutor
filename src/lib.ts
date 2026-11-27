export type Word = {
  id: string;
  word: string; // иностранное слово
  translation: string; // перевод
  ok: number; // всего успехов
  fail: number; // всего неудач
};

export type Direction = "foreign" | "native"; // что показываем
export type Settings = { direction: Direction; strictTones: boolean };

export type Result = { word: Word; success: boolean; given: string; revealed: boolean };

const WORDS_KEY = "lingo.words.v1";
const SETTINGS_KEY = "lingo.settings.v1";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — работаем в памяти */
  }
}

export const loadWords = () => readJSON<Word[]>(WORDS_KEY, []);
export const saveWords = (w: Word[]) => writeJSON(WORDS_KEY, w);
export const loadSettings = () =>
  readJSON<Settings>(SETTINGS_KEY, { direction: "foreign", strictTones: true });
export const saveSettings = (s: Settings) => writeJSON(SETTINGS_KEY, s);

export const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export function makeWord(word: string, translation: string): Word {
  return { id: newId(), word: word.trim().normalize("NFC"), translation: translation.trim().normalize("NFC"), ok: 0, fail: 0 };
}

/** Разбор массового ввода: по строке «слово - перевод» (также — – = или Tab). */
export function parseBulk(text: string): Word[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)(?:\s+[-–—=]\s+|\t)(.+)$/);
      return m ? makeWord(m[1], m[2]) : null;
    })
    .filter((w): w is Word => !!w && !!w.word && !!w.translation);
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

function normalize(s: string, strictTones: boolean): string {
  let r = s.normalize("NFD").toLowerCase();
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

export function isCorrect(given: string, answer: string, strictTones: boolean): boolean {
  const g = normalize(given, strictTones);
  if (!g) return false;
  return variants(answer).some((v) => normalize(v, strictTones) === g) || normalize(answer, strictTones) === g;
}
