import { Database } from "bun:sqlite";
import { cleanTags, wordKey } from "../src/lib";

export type WordRow = {
  id: number;
  word: string;
  translation: string; // русский перевод ("" — нет)
  english: string; // английский перевод ("" — нет)
  thai: string; // тайское написание ("" — нет), по нему озвучка
  tags: string[];
  ok: number;
  fail: number;
  created_at: string;
};

export type NewWord = { word: string; translation?: string; english?: string; thai?: string; tags?: string[]; ok?: number; fail?: number };
// Запросы слов собирают теги слова в JSON-массив
type RawRow = Omit<WordRow, "tags"> & { tags: string };
export type ResultInput = { id: number; success: boolean };

export function openDb(path: string) {
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.run(`CREATE TABLE IF NOT EXISTS words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    word        TEXT    NOT NULL,
    translation TEXT    NOT NULL,
    ok          INTEGER NOT NULL DEFAULT 0,
    fail        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);
  // Теги — отдельная таблица; связь слово ↔ тег — word_tags
  db.run(`CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT    NOT NULL UNIQUE
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS word_tags (
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (word_id, tag_id)
  )`);
  db.run("CREATE INDEX IF NOT EXISTS word_tags_tag ON word_tags(tag_id)");

  // Миграции: колонки, добавленные позже
  const cols = db.query<{ name: string }, []>("PRAGMA table_info(words)").all();
  if (!cols.some((c) => c.name === "english")) db.run("ALTER TABLE words ADD COLUMN english TEXT NOT NULL DEFAULT ''");
  if (!cols.some((c) => c.name === "thai")) db.run("ALTER TABLE words ADD COLUMN thai TEXT NOT NULL DEFAULT ''");

  const t = {
    clear: db.query<null, { word: number }>("DELETE FROM word_tags WHERE word_id = $word"),
    tag: db.query<null, { name: string }>("INSERT OR IGNORE INTO tags (name) VALUES ($name)"),
    link: db.query<null, { word: number; name: string }>(
      "INSERT OR IGNORE INTO word_tags (word_id, tag_id) SELECT $word, id FROM tags WHERE name = $name",
    ),
    // Тег, которого не осталось ни у одного слова, исчезает
    prune: db.query<null, []>("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM word_tags)"),
  };

  /** Заменяет теги слова (порядок сохраняется). */
  function setTags(word: number, tags: string[]) {
    t.clear.run({ word });
    for (const name of cleanTags(tags)) {
      t.tag.run({ name });
      t.link.run({ word, name });
    }
  }

  // Миграция: раньше теги лежали JSON-строкой в колонке words.tags — переносим в таблицы
  if (cols.some((c) => c.name === "tags")) {
    db.transaction(() => {
      for (const r of db.query<{ id: number; tags: string }, []>("SELECT id, tags FROM words").all()) {
        try {
          setTags(r.id, cleanTags(JSON.parse(r.tags)));
        } catch {
          /* битое значение — без тегов */
        }
      }
      db.run("ALTER TABLE words DROP COLUMN tags");
    })();
  }

  // Теги слова — JSON-массив в порядке добавления
  const SELECT = `SELECT w.*, (
      SELECT json_group_array(name) FROM (
        SELECT t.name FROM word_tags wt JOIN tags t ON t.id = wt.tag_id WHERE wt.word_id = w.id ORDER BY wt.rowid
      )
    ) AS tags FROM words w`;

  const row = (r: RawRow | null): WordRow | null => {
    if (!r) return null;
    let tags: unknown = [];
    try {
      tags = JSON.parse(r.tags);
    } catch {
      /* без тегов */
    }
    return { ...r, tags: cleanTags(tags) };
  };

  const q = {
    all: db.query<RawRow, []>(`${SELECT} ORDER BY w.id DESC`),
    get: db.query<RawRow, { id: number }>(`${SELECT} WHERE w.id = $id`),
    insert: db.query<{ id: number }, { word: string; translation: string; english: string; thai: string; ok: number; fail: number }>(
      "INSERT INTO words (word, translation, english, thai, ok, fail) VALUES ($word, $translation, $english, $thai, $ok, $fail) RETURNING id",
    ),
    // thai = null — оставить как есть (клиент его не прислал)
    update: db.query<{ id: number }, { id: number; word: string; translation: string; english: string; thai: string | null }>(
      "UPDATE words SET word = $word, translation = $translation, english = $english, thai = COALESCE($thai, thai) WHERE id = $id RETURNING id",
    ),
    remove: db.query<null, { id: number }>("DELETE FROM words WHERE id = $id"),
    reset: db.query<null, { id: number }>("UPDATE words SET ok = 0, fail = 0 WHERE id = $id"),
    score: db.query<null, { id: number; ok: number; fail: number }>(
      "UPDATE words SET ok = ok + $ok, fail = fail + $fail WHERE id = $id",
    ),
  };

  const clean = (s: string | undefined) => (s ?? "").trim().normalize("NFC");
  const get = (id: number) => row(q.get.get({ id }));
  const list = () => q.all.all().map((r) => row(r)!);

  return {
    list,
    get,

    /** Слово с таким же написанием (см. wordKey), кроме exceptId. */
    findDuplicate: (word: string, exceptId?: number) => {
      const key = wordKey(word);
      return list().find((w) => w.id !== exceptId && wordKey(w.word) === key) ?? null;
    },

    /** Добавляет слова; дубли (уже в базе или повторы внутри пачки) пропускает. */
    add: db.transaction((items: NewWord[]) => {
      const seen = new Set(list().map((w) => wordKey(w.word)));
      const created: WordRow[] = [];
      for (const w of items) {
        const key = wordKey(w.word);
        if (seen.has(key)) continue;
        seen.add(key);
        const { id } = q.insert.get({
          word: clean(w.word),
          translation: clean(w.translation),
          english: clean(w.english),
          thai: clean(w.thai),
          ok: w.ok ?? 0,
          fail: w.fail ?? 0,
        })!;
        setTags(id, w.tags ?? []);
        created.push(get(id)!);
      }
      return created;
    }),

    /** Правка слова; без tags в правке теги не трогаются. */
    update: db.transaction((id: number, w: NewWord) => {
      const done = q.update.get({
        id,
        word: clean(w.word),
        translation: clean(w.translation),
        english: clean(w.english),
        thai: w.thai === undefined ? null : clean(w.thai),
      });
      if (!done) return null;
      if (w.tags !== undefined) {
        setTags(id, w.tags);
        t.prune.run();
      }
      return get(id);
    }),

    remove: db.transaction((id: number) => {
      const removed = q.remove.run({ id }).changes > 0;
      if (removed) t.prune.run();
      return removed;
    }),

    /** Обнуляет счётчики успехов/неудач у этих слов; возвращает весь словарь. */
    resetScores: db.transaction((ids: number[]) => {
      for (const id of ids) q.reset.run({ id });
      return list();
    }),

    /** Сохраняет итоги тренировки: +1 к ok или fail за каждый ответ. */
    saveResults: db.transaction((results: ResultInput[]) => {
      for (const r of results) q.score.run({ id: r.id, ok: r.success ? 1 : 0, fail: r.success ? 0 : 1 });
      return list();
    }),

    close: () => db.close(),
  };
}

export type Db = ReturnType<typeof openDb>;
