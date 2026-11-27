export type Word = {
  id: number;
  word: string; // иностранное слово
  translation: string; // перевод
  ok: number; // всего успехов
  fail: number; // всего неудач
};

export type NewWord = { word: string; translation: string; ok?: number; fail?: number };

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

/** Разбор массового ввода: по строке «слово - перевод» (также — – = или Tab). */
export function parseBulk(text: string): NewWord[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)(?:\s+[-–—=]\s+|\t)(.+)$/);
      return m ? { word: m[1].trim(), translation: m[2].trim() } : null;
    })
    .filter((w): w is NewWord => !!w && !!w.word && !!w.translation);
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
