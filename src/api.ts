import type { NewWord, Word } from "./lib";

/**
 * Адрес сервера. По умолчанию — тот же origin, что и страница.
 * Для Android-сборки задаётся при сборке:
 *   PUBLIC_API_URL=http://192.168.1.10:3000 bun run build
 */
let BASE = "";
try {
  BASE = (process.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");
} catch {
  /* переменная не подставлена — работаем с тем же origin */
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Ошибка сервера (${res.status})`);
  return data as T;
}


export type SpeakText = { word: string; thai: string; english: string; translation: string };

export const api = {
  list: () => request<Word[]>("/api/words"),
  add: (words: NewWord[]) => request<Word[]>("/api/words", { method: "POST", body: JSON.stringify(words) }),
  update: (id: number, w: NewWord) => request<Word>(`/api/words/${id}`, { method: "PUT", body: JSON.stringify(w) }),
  remove: (id: number) => request<{ ok: true }>(`/api/words/${id}`, { method: "DELETE" }),
  resetScores: (ids: number[]) => request<Word[]>("/api/reset", { method: "POST", body: JSON.stringify({ ids }) }),
  /** Тайское написание по транслитерации и переводу (Gemini) */
  suggestThai: (w: { word: string; english: string; translation: string }) =>
    request<{ thai: string }>("/api/thai", { method: "POST", body: JSON.stringify(w) }),
  /** Адрес mp3 с озвучкой слова */
  ttsUrl: (id: number) => `${BASE}/api/tts/${id}`,
  /** Адрес mp3 для ещё не сохранённого слова (по полям формы) */
  ttsTextUrl: (w: SpeakText) => `${BASE}/api/tts?${new URLSearchParams(w)}`,
  saveResults: (results: { id: number; success: boolean }[]) =>
    request<Word[]>("/api/results", { method: "POST", body: JSON.stringify(results) }),
};
