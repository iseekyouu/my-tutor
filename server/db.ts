import { Database } from "bun:sqlite";

export type WordRow = {
  id: number;
  word: string;
  translation: string;
  ok: number;
  fail: number;
  created_at: string;
};

export type NewWord = { word: string; translation: string; ok?: number; fail?: number };
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

  const q = {
    all: db.query<WordRow, []>("SELECT * FROM words ORDER BY id DESC"),
    get: db.query<WordRow, { id: number }>("SELECT * FROM words WHERE id = $id"),
    insert: db.query<WordRow, { word: string; translation: string; ok: number; fail: number }>(
      "INSERT INTO words (word, translation, ok, fail) VALUES ($word, $translation, $ok, $fail) RETURNING *",
    ),
    update: db.query<WordRow, { id: number; word: string; translation: string }>(
      "UPDATE words SET word = $word, translation = $translation WHERE id = $id RETURNING *",
    ),
    remove: db.query<null, { id: number }>("DELETE FROM words WHERE id = $id"),
    score: db.query<null, { id: number; ok: number; fail: number }>(
      "UPDATE words SET ok = ok + $ok, fail = fail + $fail WHERE id = $id",
    ),
  };

  const clean = (s: string) => s.trim().normalize("NFC");

  return {
    list: () => q.all.all(),

    add: db.transaction((items: NewWord[]) =>
      items.map((w) =>
        q.insert.get({ word: clean(w.word), translation: clean(w.translation), ok: w.ok ?? 0, fail: w.fail ?? 0 })!,
      ),
    ),

    update: (id: number, w: NewWord) =>
      q.update.get({ id, word: clean(w.word), translation: clean(w.translation) }),

    remove: (id: number) => q.remove.run({ id }).changes > 0,

    /** Сохраняет итоги тренировки: +1 к ok или fail за каждый ответ. */
    saveResults: db.transaction((results: ResultInput[]) => {
      for (const r of results) q.score.run({ id: r.id, ok: r.success ? 1 : 0, fail: r.success ? 0 : 1 });
      return q.all.all();
    }),

    close: () => db.close(),
  };
}

export type Db = ReturnType<typeof openDb>;
