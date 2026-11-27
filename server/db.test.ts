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
    expect(db.list()[0]).toMatchObject({ word: "แมว", translation: "кошка", english: "", tags: [] });
    db.close();
    require("fs").rmSync(path, { force: true });
  });
});
