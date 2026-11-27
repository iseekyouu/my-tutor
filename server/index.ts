import index from "../index.html";
import { openDb, type NewWord, type ResultInput } from "./db";

const db = openDb(process.env.DB_PATH ?? "data.db");
const port = Number(process.env.PORT ?? 3000);
const isDev = process.env.NODE_ENV !== "production";

// CORS — чтобы к API могло ходить Android-приложение (Capacitor) с другого origin
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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
  isOptTags(v.tags) &&
  (isText(v.translation) || isText(v.english));

async function body(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
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
    "/api/results": {
      POST: async (req) => {
        const data = await body(req);
        const valid = Array.isArray(data) && data.every((r: any) => Number.isInteger(r?.id) && typeof r?.success === "boolean");
        if (!valid) return error("Ожидается массив [{ id, success }]");
        return json(db.saveResults(data as ResultInput[]));
      },
      OPTIONS: () => new Response(null, { headers: cors }),
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
