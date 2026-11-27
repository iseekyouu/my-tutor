import { Database } from "bun:sqlite";
import { cleanTags, wordKey } from "../src/lib";

export type WordRow = {
  id: number;
  word: string;
  translation: string; // русский перевод ("" — нет)
  english: string; // английский перевод ("" — нет)
  tags: string[];
  ok: number;
  fail: number;
  created_at: string;
};

export type NewWord = { word: string; translation?: string; english?: string; tags?: string[]; ok?: number; fail?: number };
// В базе теги лежат JSON-строкой
type RawRow = Omit<WordRow, "tags"> & { tags: string };
export type ResultInput = { id: number; success: boolean };

export function openDb(path: string) {
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(`CREATE TABLE IF NOT EXISTS words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    word        TEXT    NOT NULL,
    translation TEXT    NOT NULL,
    ok          INTEGER NOT NULL DEFAULT 0,
    fail        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);
  // Миграция: английский перевод добавлен позже
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(words)").all();
  if (!cols.some((c) => c.name === "english")) db.run("ALTER TABLE words ADD COLUMN english TEXT NOT NULL DEFAULT ''");
  if (!cols.some((c) => c.name === "tags")) db.run("ALTER TABLE words ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");

  const row = (r: RawRow | null): WordRow | null => {
    if (!r) return null;
    let tags: unknown = [];
    try {
      tags = JSON.parse(r.tags);
    } catch {
      /* битое значение — без тегов */
    }
    return { ...r, tags: cleanTags(tags) };
  };

  const q = {
    all: db.query<RawRow, []>("SELECT * FROM words ORDER BY id DESC"),
    insert: db.query<RawRow, { word: string; translation: string; english: string; tags: string; ok: number; fail: number }>(
      "INSERT INTO words (word, translation, english, tags, ok, fail) VALUES ($word, $translation, $english, $tags, $ok, $fail) RETURNING *",
    ),
    // tags = null — оставить как есть (клиент не прислал теги)
    update: db.query<RawRow, { id: number; word: string; translation: string; english: string; tags: string | null }>(
      "UPDATE words SET word = $word, translation = $translation, english = $english, tags = COALESCE($tags, tags) WHERE id = $id RETURNING *",
    ),
    remove: db.query<null, { id: number }>("DELETE FROM words WHERE id = $id"),
    score: db.query<null, { id: number; ok: number; fail: number }>(
      "UPDATE words SET ok = ok + $ok, fail = fail + $fail WHERE id = $id",
    ),
  };

  const clean = (s: string | undefined) => (s ?? "").trim().normalize("NFC");

  return {
    list: () => q.all.all().map((r) => row(r)!),

    /** Слово с таким же написанием (см. wordKey), кроме exceptId. */
    findDuplicate: (word: string, exceptId?: number) => {
      const key = wordKey(word);
      return row(q.all.all().find((w) => w.id !== exceptId && wordKey(w.word) === key) ?? null);
    },

    /** Добавляет слова; дубли (уже в базе или повторы внутри пачки) пропускает. */
    add: db.transaction((items: NewWord[]) => {
      const seen = new Set(q.all.all().map((w) => wordKey(w.word)));
      const created: WordRow[] = [];
      for (const w of items) {
        const key = wordKey(w.word);
        if (seen.has(key)) continue;
        seen.add(key);
        const tags = JSON.stringify(cleanTags(w.tags));
        created.push(
          row(q.insert.get({ word: clean(w.word), translation: clean(w.translation), english: clean(w.english), tags, ok: w.ok ?? 0, fail: w.fail ?? 0 }))!,
        );
      }
      return created;
    }),

    update: (id: number, w: NewWord) =>
      row(
        q.update.get({
          id,
          word: clean(w.word),
          translation: clean(w.translation),
          english: clean(w.english),
          tags: w.tags === undefined ? null : JSON.stringify(cleanTags(w.tags)),
        }),
      ),

    remove: (id: number) => q.remove.run({ id }).changes > 0,

    /** Сохраняет итоги тренировки: +1 к ok или fail за каждый ответ. */
    saveResults: db.transaction((results: ResultInput[]) => {
      for (const r of results) q.score.run({ id: r.id, ok: r.success ? 1 : 0, fail: r.success ? 0 : 1 });
      return q.all.all().map((r) => row(r)!);
    }),

    close: () => db.close(),
  };
}

export type Db = ReturnType<typeof openDb>;
