import index from "../index.html";
import { openDb, type NewWord, type ResultInput } from "./db";
import { applyPendingImport } from "./import";
import { suggestThai, ThaiError } from "./gemini";
import { speech, thaiText, type SpeakSource } from "./tts";

const dbPath = process.env.DB_PATH ?? "data.db";
applyPendingImport(dbPath); // bun run deploy --with-db: подменить базу загруженной
const db = openDb(dbPath);
const port = Number(process.env.PORT ?? 3000);
const isDev = process.env.NODE_ENV !== "production";

// CORS — чтобы к API могло ходить Android-приложение (Capacitor) с другого origin
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
  "Access-Control-Expose-Headers": "X-Thai-Text, Content-Range",
};

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });
const error = (message: string, status = 400) => json({ error: message }, status);

const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isOptText = (v: unknown) => v === undefined || typeof v === "string";
// Нужен хотя бы один перевод: русский (translation) или английский (english)
const isOptTags = (v: unknown) => v === undefined || (Array.isArray(v) && v.every((t) => typeof t === "string"));
const isNewWord = (v: any): v is NewWord =>
  v &&
  isText(v.word) &&
  isOptText(v.translation) &&
  isOptText(v.english) &&
  isOptText(v.thai) &&
  isOptTags(v.tags) &&
  (isText(v.translation) || isText(v.english));

async function body(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/**
 * mp3 с произношением: тайское написание, а без него — перевод значения на тайский.
 * Отдаётся целиком с размером и по частям (Range → 206): плеер Safari/WebKit — в том числе
 * внутри Telegram на iPhone и Mac — сначала просит «bytes=0-1» и без 206 звук не играет.
 */
async function speak(req: Request, src: SpeakSource): Promise<Response> {
  let thai: string | null;
  let mp3: Uint8Array<ArrayBuffer>;
  try {
    thai = await thaiText(src);
    const audio = thai && (await speech(thai));
    if (!thai || !audio) return error("Не удалось получить озвучку", 502);
    mp3 = audio;
  } catch {
    return error("Не удалось получить озвучку", 502);
  }
  const headers = { ...cors, "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "X-Thai-Text": encodeURIComponent(thai) };
  const size = mp3.length;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("Range") ?? "");
  if (range && (range[1] || range[2])) {
    // bytes=a-b, bytes=a- (до конца), bytes=-n (последние n)
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    return new Response(mp3.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(mp3, { headers: { ...headers, "Content-Length": String(size) } });
}

const server = Bun.serve({
  port,
  hostname: "0.0.0.0", // доступно с телефона в той же сети
  development: isDev && { hmr: true, console: true },

  routes: {
    "/": index,

    "/api/words": {
      GET: () => json(db.list()),
      // Принимает одно слово или массив слов (массовое добавление / импорт)
      POST: async (req) => {
        const data = await body(req);
        const items: unknown[] = Array.isArray(data) ? data : [data];
        if (!items.length || !items.every(isNewWord)) return error("Ожидается { word, translation?, english? } (хотя бы один перевод) или массив таких объектов");
        // Одно слово — сообщаем о дубле; в массиве дубли просто пропускаются
        if (!Array.isArray(data)) {
          const dup = db.findDuplicate((data as NewWord).word);
          if (dup) return error(`Слово «${dup.word}» уже есть в словаре`, 409);
        }
        return json(db.add(items as NewWord[]), 201);
      },
      OPTIONS: () => new Response(null, { headers: cors }),
    },

    "/api/words/:id": {
      PUT: async (req) => {
        const data = await body(req);
        if (!isNewWord(data)) return error("Ожидается { word, translation?, english? } (хотя бы один перевод)");
        const dup = db.findDuplicate(data.word, Number(req.params.id));
        if (dup) return error(`Слово «${dup.word}» уже есть в словаре`, 409);
        const row = db.update(Number(req.params.id), data);
        return row ? json(row) : error("Слово не найдено", 404);
      },
      DELETE: (req) => (db.remove(Number(req.params.id)) ? json({ ok: true }) : error("Слово не найдено", 404)),
      OPTIONS: () => new Response(null, { headers: cors }),
    },

    // Итоги тренировки: [{ id, success }] → обновлённый словарь
    // Сброс счётчиков: { ids: number[] } → обновлённый словарь
    "/api/reset": {
      POST: async (req) => {
        const data = await body(req);
        const ids = data?.ids;
        if (!Array.isArray(ids) || !ids.every(Number.isInteger)) return error("Ожидается { ids: number[] }");
        return json(db.resetScores(ids));
      },
      OPTIONS: () => new Response(null, { headers: cors }),
    },

    "/api/results": {
      POST: async (req) => {
        const data = await body(req);
        const valid = Array.isArray(data) && data.every((r: any) => Number.isInteger(r?.id) && typeof r?.success === "boolean");
        if (!valid) return error("Ожидается массив [{ id, success }]");
        return json(db.saveResults(data as ResultInput[]));
      },
      OPTIONS: () => new Response(null, { headers: cors }),
    },

    // Подсказка тайского написания (Gemini): { word, english?, translation? } → { thai }
    "/api/thai": {
      POST: async (req) => {
        const data = await body(req);
        const short = (v: unknown) => v === undefined || (typeof v === "string" && v.length <= 200);
        if (!isText(data?.word) || !short(data.word) || !short(data.english) || !short(data.translation) || !isOptText(data.english) || !isOptText(data.translation))
          return error("Ожидается { word, english?, translation? } (до 200 символов)");
        try {
          return json({ thai: await suggestThai(data) });
        } catch (e) {
          return e instanceof ThaiError ? error(e.message, e.status) : error("Не удалось получить тайское написание", 502);
        }
      },
      OPTIONS: () => new Response(null, { headers: cors }),
    },

    // Озвучка сохранённого слова: тайское написание или перевод значения → речь Google, без сохранения
    "/api/tts/:id": {
      GET: (req) => {
        const w = db.get(Number(req.params.id));
        return w ? speak(req, w) : error("Слово не найдено", 404);
      },
    },
    // Озвучка ещё не сохранённого слова (форма добавления/правки): ?word=&thai=&english=&translation=
    "/api/tts": {
      GET: (req) => {
        const p = new URL(req.url).searchParams;
        const src = { word: p.get("word") ?? "", thai: p.get("thai") ?? "", english: p.get("english") ?? "", translation: p.get("translation") ?? "" };
        if (Object.values(src).some((v) => v.length > 200)) return error("Слишком длинный текст (до 200 символов)");
        if (!src.word.trim() && !src.thai.trim() && !src.english.trim() && !src.translation.trim()) return error("Нечего озвучивать");
        return speak(req, src);
      },
    },

    "/api/*": () => error("Not found", 404),
  },

  fetch: () => new Response("Not found", { status: 404 }),
});

console.log(`Словарик: ${server.url}  (база: ${process.env.DB_PATH ?? "data.db"})`);

process.on("SIGINT", () => {
  db.close();
  process.exit(0);
});
