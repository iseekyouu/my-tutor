import { describe, expect, test } from "bun:test";
import { openDb } from "./db";
import { isCorrect, parseBulk } from "../src/lib";

describe("db", () => {
  test("добавление, правка, удаление", () => {
    const db = openDb(":memory:");
    const [a, b] = db.add([
      { word: " สวัสดี ", translation: "привет" },
      { word: "ม้า", translation: "лошадь", ok: 2, fail: 1 },
    ]);
    expect(a.word).toBe("สวัสดี");
    expect(b.ok).toBe(2);
    expect(db.list().map((w) => w.word)).toEqual(["ม้า", "สวัสดี"]);

    expect(db.update(a.id, { word: "สวัสดี", translation: "привет, здравствуй" })?.translation).toBe("привет, здравствуй");
    expect(db.update(999, { word: "x", translation: "y" })).toBeNull();

    const c = db.update(a.id, { word: "สวัสดี", english: "hello" });
    expect(c).toMatchObject({ translation: "", english: "hello" });

    expect(db.remove(b.id)).toBe(true);
    expect(db.remove(b.id)).toBe(false);
    expect(db.list()).toHaveLength(1);
  });

  test("результаты тренировки копятся", () => {
    const db = openDb(":memory:");
    const [w] = db.add([{ word: "แมว", translation: "кошка" }]);
    db.saveResults([{ id: w.id, success: true }, { id: w.id, success: false }]);
    const list = db.saveResults([{ id: w.id, success: true }]);
    expect(list[0]).toMatchObject({ ok: 2, fail: 1 });
  });
});

describe("сброс счётчиков", () => {
  test("обнуляет только указанные слова", () => {
    const db = openDb(":memory:");
    const [a, b] = db.add([
      { word: "náam", translation: "вода", ok: 3, fail: 2 },
      { word: "maa", translation: "идти", ok: 1, fail: 1 },
    ]);
    const list = db.resetScores([a.id]);
    expect(list.find((w) => w.id === a.id)).toMatchObject({ ok: 0, fail: 0 });
    expect(list.find((w) => w.id === b.id)).toMatchObject({ ok: 1, fail: 1 });
  });
});

describe("теги", () => {
  test("сохраняются, чистятся, правятся", () => {
    const db = openDb(":memory:");
    const [w] = db.add([{ word: "náam", translation: "вода", tags: [" Еда ", "еда", "", "напитки"] }]);
    expect(w.tags).toEqual(["еда", "напитки"]);
    expect(db.list()[0].tags).toEqual(["еда", "напитки"]);
    // без tags в правке — теги не трогаются
    expect(db.update(w.id, { word: "náam", translation: "вода!" })?.tags).toEqual(["еда", "напитки"]);
    expect(db.update(w.id, { word: "náam", translation: "вода", tags: [] })?.tags).toEqual([]);
  });
});

describe("дубли", () => {
  test("дубли пропускаются при добавлении и находятся", () => {
    const db = openDb(":memory:");
    db.add([{ word: "náam", translation: "вода" }]);
    const created = db.add([
      { word: " NÁAM ", translation: "x" }, // дубль: регистр и пробелы
      { word: "nàam", translation: "другой тон — не дубль" },
      { word: "maa", english: "come" },
      { word: "māa", english: "дубль внутри пачки (средний тон с чертой)" },
    ]);
    expect(created.map((w) => w.word)).toEqual(["nàam", "maa"]);
    expect(db.findDuplicate("Náam")?.translation).toBe("вода");
    expect(db.findDuplicate("náam", db.findDuplicate("náam")!.id)).toBeNull();
    expect(db.findDuplicate("ไม่มี")).toBeNull();
  });
});

describe("проверка ответа", () => {
  test("варианты и регистр", () => {
    expect(isCorrect("Здравствуй ", "привет, здравствуй", true)).toBe(true);
    expect(isCorrect("пока", "привет", true)).toBe(false);
    expect(isCorrect("", "x", true)).toBe(false);
  });
  test("русский или английский перевод", () => {
    expect(isCorrect("Hello", ["привет", "hello, hi"], true)).toBe(true);
    expect(isCorrect("hi", ["привет", "hello, hi"], true)).toBe(true);
    expect(isCorrect("привет", ["привет", ""], true)).toBe(true);
    expect(isCorrect("пока", ["привет", "hello"], true)).toBe(false);
    expect(isCorrect("", ["", ""], true)).toBe(false);
  });
  test("тоны", () => {
    expect(isCorrect("มา", "ม้า", true)).toBe(false);
    expect(isCorrect("มา", "ม้า", false)).toBe(true);
    expect(isCorrect("sa wat dii", "sà-wàt-dii", true)).toBe(false);
    expect(isCorrect("sa wat dii", "sà-wàt-dii", false)).toBe(true);
    expect(isCorrect("sà-wàt-dii", "sà-wàt-dii", true)).toBe(true);
  });
  test("средний тон: с чертой и без — одно и то же", () => {
    expect(isCorrect("nāam", "naam", true)).toBe(true);
    expect(isCorrect("naam", "nāam", true)).toBe(true);
    expect(isCorrect("nāam", "náam", true)).toBe(false);
  });
  test("массовый ввод", () => {
    expect(parseBulk("สวัสดี - привет\nплохая строка\nแมว\tкошка")).toEqual([
      { word: "สวัสดี", translation: "привет" },
      { word: "แมว", translation: "кошка" },
    ]);
    expect(parseBulk("สวัสดี - привет - hello\nแมว - - cat\nsà-wàt-dii - привет\nx - -")).toEqual([
      { word: "สวัสดี", translation: "привет", english: "hello" },
      { word: "แมว", translation: "", english: "cat" },
      { word: "sà-wàt-dii", translation: "привет" },
    ]);
  });
});

describe("миграция", () => {
  test("старая база без колонки english", () => {
    const { Database } = require("bun:sqlite");
    const path = `${require("os").tmpdir()}/slovarik-migrate-${Date.now()}.db`;
    const old = new Database(path);
    old.run("CREATE TABLE words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, translation TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, fail INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))");
    old.run("INSERT INTO words (word, translation) VALUES ('แมว', 'кошка')");
    old.close();
    const db = openDb(path);
    expect(db.list()[0]).toMatchObject({ word: "แมว", translation: "кошка", english: "", thai: "", tags: [] });
    db.close();
    require("fs").rmSync(path, { force: true });
  });
});

describe("озвучка", () => {
  test("слово тайскими буквами озвучивается как есть, без перевода", async () => {
    const { thaiText } = await import("./tts");
    expect(await thaiText({ word: "วันจันทร์", thai: "", english: "monday", translation: "" })).toBe("วันจันทร์");
  });
  test("тайское написание озвучивается вместо перевода", async () => {
    const { thaiText } = await import("./tts");
    expect(await thaiText({ word: "wan jan", thai: " วันจันทร์ ", english: "monday", translation: "" })).toBe("วันจันทร์");
  });
  test("тайское написание сохраняется; правка без него его не стирает", () => {
    const db = openDb(":memory:");
    const [w] = db.add([{ word: "wan jan", thai: "วันจันทร์", english: "monday" }]);
    expect(w.thai).toBe("วันจันทร์");
    expect(db.update(w.id, { word: "wan jan", english: "Monday" })?.thai).toBe("วันจันทร์");
    expect(db.update(w.id, { word: "wan jan", english: "Monday", thai: "" })?.thai).toBe("");
    expect(isCorrect("วันจันทร์", ["wan jan", "วันจันทร์"], true)).toBe(true);
  });
  test("get по id", () => {
    const db = openDb(":memory:");
    const [w] = db.add([{ word: "wan jan", english: "monday" }]);
    expect(db.get(w.id)?.english).toBe("monday");
    expect(db.get(999)).toBeNull();
  });
});

describe("таблица тегов", () => {
  test("тег хранится один раз; ненужный тег исчезает", () => {
    const db = openDb(":memory:");
    const [a, b] = db.add([
      { word: "náam", translation: "вода", tags: ["еда", "урок 1"] },
      { word: "khâo", translation: "рис", tags: ["Еда"] },
    ]);
    expect(b.tags).toEqual(["еда"]);
    db.update(a.id, { word: "náam", translation: "вода", tags: ["еда"] });
    expect([...new Set(db.list().flatMap((w) => w.tags))]).toEqual(["еда"]);
    db.remove(a.id);
    db.remove(b.id);
    expect(db.add([{ word: "x", translation: "y" }])[0].tags).toEqual([]);
  });

  test("старая база: теги из колонки JSON переносятся в таблицы", () => {
    const { Database } = require("bun:sqlite");
    const path = `${require("os").tmpdir()}/slovarik-tags-${Date.now()}.db`;
    const old = new Database(path);
    old.run("CREATE TABLE words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL, translation TEXT NOT NULL, ok INTEGER NOT NULL DEFAULT 0, fail INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), english TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]')");
    old.run(`INSERT INTO words (word, translation, tags) VALUES ('wan jan', 'понедельник', '["days","урок 1"]'), ('maa', 'идти', 'битое'), ('náam', 'вода', '["days"]')`);
    old.close();
    const db = openDb(path);
    expect(db.list().map((w) => [w.word, w.tags])).toEqual([
      ["náam", ["days"]],
      ["maa", []],
      ["wan jan", ["days", "урок 1"]],
    ]);
    db.close();
    const check = new Database(path);
    expect(check.query("PRAGMA table_info(words)").all().some((c: any) => c.name === "tags")).toBe(false);
    expect(check.query("SELECT name FROM tags ORDER BY name").all()).toEqual([{ name: "days" }, { name: "урок 1" }]);
    check.close();
    // повторный запуск — без изменений
    expect(openDb(path).list()[2].tags).toEqual(["days", "урок 1"]);
    require("fs").rmSync(path, { force: true });
  });
});

describe("подсказка тайского", () => {
  test("без ключа — понятная ошибка 503", async () => {
    const saved = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const { suggestThai } = await import("./gemini");
    await expect(suggestThai({ word: "wan jan" })).rejects.toMatchObject({ status: 503 });
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  });
});

describe("замена базы при запуске (deploy --with-db)", () => {
  const fs = require("fs");
  const { join } = require("path");
  const tmp = () => fs.mkdtempSync(join(require("os").tmpdir(), "slovarik-import-"));

  test("подменяет базу импортом, прежнюю сохраняет копией (вместе с WAL)", async () => {
    const { applyPendingImport } = await import("./import");
    const dir = tmp();
    const path = join(dir, "data.db");
    const old = openDb(path); // открыта — данные в WAL, как на живом сервере
    old.add([{ word: "старое", translation: "x" }]);
    const fresh = openDb(join(dir, "fresh.db"));
    fresh.add([{ word: "новое", translation: "y", tags: ["t"] }]);
    fresh.close();
    old.close();
    // как scripts/deploy.ts: целостный снимок через VACUUM INTO
    const { Database } = require("bun:sqlite");
    const src = new Database(join(dir, "fresh.db"), { readonly: true });
    src.run(`VACUUM INTO '${path}.import'`);
    src.close();

    const backup = applyPendingImport(path)!;
    expect(fs.existsSync(`${path}.import`)).toBe(false);
    const db = openDb(path);
    expect(db.list().map((w) => [w.word, w.tags])).toEqual([["новое", ["t"]]]);
    db.close();
    const bak = openDb(backup);
    expect(bak.list().map((w) => w.word)).toEqual(["старое"]);
    bak.close();
    expect(applyPendingImport(path)).toBeNull(); // импорта нет — ничего не делает
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("не база словаря — откладывается, старая база остаётся", async () => {
    const { applyPendingImport } = await import("./import");
    const dir = tmp();
    const path = join(dir, "data.db");
    const db = openDb(path);
    db.add([{ word: "старое", translation: "x" }]);
    db.close();
    fs.writeFileSync(`${path}.import`, "не база");
    expect(applyPendingImport(path)).toBeNull();
    expect(fs.existsSync(`${path}.import-bad`)).toBe(true);
    expect(openDb(path).list()[0].word).toBe("старое");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
