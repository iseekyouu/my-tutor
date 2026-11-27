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

describe("проверка ответа", () => {
  test("варианты и регистр", () => {
    expect(isCorrect("Здравствуй ", "привет, здравствуй", true)).toBe(true);
    expect(isCorrect("пока", "привет", true)).toBe(false);
    expect(isCorrect("", "x", true)).toBe(false);
  });
  test("тоны", () => {
    expect(isCorrect("มา", "ม้า", true)).toBe(false);
    expect(isCorrect("มา", "ม้า", false)).toBe(true);
    expect(isCorrect("sa wat dii", "sà-wàt-dii", true)).toBe(false);
    expect(isCorrect("sa wat dii", "sà-wàt-dii", false)).toBe(true);
    expect(isCorrect("sà-wàt-dii", "sà-wàt-dii", true)).toBe(true);
  });
  test("массовый ввод", () => {
    expect(parseBulk("สวัสดี - привет\nплохая строка\nแมว\tкошка")).toEqual([
      { word: "สวัสดี", translation: "привет" },
      { word: "แมว", translation: "кошка" },
    ]);
  });
});
