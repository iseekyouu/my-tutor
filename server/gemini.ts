// Тайское написание слова по транслитерации и переводу — через Gemini (бесплатный тариф).
// Ключ: GEMINI_API_KEY (https://aistudio.google.com/apikey), модель: GEMINI_MODEL.

const THAI = /[\u0E00-\u0E7F]/; // тайский блок Unicode
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

export type ThaiQuery = { word: string; english?: string; translation?: string };

export class ThaiError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
  }
}

function prompt(q: ThaiQuery) {
  const lines = [
    "You convert a Thai word or phrase from Latin transliteration into Thai script.",
    "The transliteration may use tone marks (à low, â falling, á high, ǎ rising, ā or none mid) and may be inaccurate.",
    "Use the meaning to choose the right word. Answer with the Thai script only — no transliteration, no explanation.",
    "",
    `Transliteration: ${q.word}`,
  ];
  if (q.english?.trim()) lines.push(`English meaning: ${q.english.trim()}`);
  if (q.translation?.trim()) lines.push(`Russian meaning: ${q.translation.trim()}`);
  return lines.join("\n");
}

export async function suggestThai(q: ThaiQuery): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ThaiError("На сервере не задан GEMINI_API_KEY", 503);

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt(q) }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { thai: { type: "STRING" } }, required: ["thai"] },
      },
    }),
  });
  if (res.status === 429) throw new ThaiError("Лимит бесплатных запросов Gemini исчерпан, попробуйте позже", 429);
  if (!res.ok) throw new ThaiError(`Gemini ответил ошибкой (${res.status})`);

  const data: any = await res.json().catch(() => null);
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ?? "";
  let thai = "";
  try {
    thai = String(JSON.parse(text).thai ?? "").trim();
  } catch {
    thai = text.trim();
  }
  if (!THAI.test(thai)) throw new ThaiError("Gemini не вернул тайское написание");
  return thai.normalize("NFC");
}
