// Деплой на Fly.
//   bun run deploy             — код; база на сервере остаётся как есть
//   bun run deploy --with-db   — код + замена базы на сервере локальной data.db
//                                (спросит подтверждение; --yes — без вопроса)
// Секреты из .env (Bun читает его сам) уходят в `fly secrets` через stdin — не видны в логах.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const APP = "my-tutor";
const URL = `https://${APP}.fly.dev`;
const REMOTE_DB = "/data/data.db"; // DB_PATH в fly.toml
const LOCAL_DB = process.env.LOCAL_DB ?? "data.db";
const SECRETS = ["GEMINI_API_KEY"];

const args = process.argv.slice(2);
const withDb = args.includes("--with-db");
const yes = args.includes("--yes");
const flyArgs = args.filter((a) => a !== "--with-db" && a !== "--yes");

async function run(cmd: string[], stdin?: string) {
  const p = Bun.spawn(cmd, { stdin: stdin === undefined ? "inherit" : new Blob([stdin]), stdout: "inherit", stderr: "inherit" });
  const code = await p.exited;
  if (code !== 0) {
    console.error(`✗ Команда завершилась с ошибкой (${code}): ${cmd.slice(0, 4).join(" ")}…`);
    process.exit(code);
  }
}

const countWords = (path: string) => {
  const db = new Database(path, { readonly: true });
  const { n } = db.query<{ n: number }, []>("SELECT count(*) AS n FROM words").get()!;
  db.close();
  return n;
};

async function serverWords(): Promise<unknown[]> {
  const res = await fetch(`${URL}/api/words`); // заодно будит остановленную машину
  if (!res.ok) throw new Error(`сервер ответил ${res.status}`);
  return res.json();
}

// 1. С базой — подготовить снимок и подтверждение до любых изменений
let snapshot = "";
if (withDb) {
  if (!existsSync(LOCAL_DB)) {
    console.error(`✗ Нет локальной базы ${LOCAL_DB}`);
    process.exit(1);
  }
  // VACUUM INTO — целостный снимок, даже если локальный сервер сейчас запущен
  snapshot = join(tmpdir(), `slovarik-upload-${Date.now()}.db`);
  const local = new Database(LOCAL_DB, { readonly: true });
  local.run(`VACUUM INTO '${snapshot.replaceAll("'", "''")}'`);
  local.close();
  const localCount = countWords(snapshot);

  let remote: unknown[];
  try {
    remote = await serverWords();
  } catch (e) {
    console.error(`✗ Не удалось получить слова с сервера для резервной копии: ${e}`);
    process.exit(1);
  }
  mkdirSync("backups", { recursive: true });
  const backup = join("backups", `server-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await Bun.write(backup, JSON.stringify(remote, null, 2));

  console.log(`\nБаза на сервере будет ЗАМЕНЕНА локальной:`);
  console.log(`  сейчас на сервере: ${remote.length} слов  →  будет: ${localCount} (из ${LOCAL_DB})`);
  console.log(`  копия слов с сервера: ${backup} (можно вернуть через «Импорт»)`);
  console.log(`  полная копия прежней базы останется на сервере: ${REMOTE_DB}.bak-<время>\n`);
  if (!yes) {
    const answer = prompt("Заменить базу на сервере? Введите «да»:");
    if (answer?.trim().toLowerCase() !== "да") {
      rmSync(snapshot, { force: true });
      console.log("Отменено, ничего не изменено.");
      process.exit(0);
    }
  }
}

// 2. Секреты — без перезапуска, применятся при деплое
const pairs = SECRETS.flatMap((name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    console.warn(`⚠ ${name} не задан в .env — пропускаю (на сервере останется прежнее значение)`);
    return [];
  }
  return [`${name}=${value}`];
});
if (pairs.length) {
  console.log(`Секреты → Fly: ${pairs.map((p) => p.split("=")[0]).join(", ")}`);
  await run(["fly", "secrets", "import", "--stage", "-a", APP], pairs.join("\n") + "\n");
}

// 3. База — загрузить рядом с серверной; сервер подменит её при перезапуске во время деплоя
if (withDb) {
  console.log("Загружаю базу на сервер…");
  await run(["fly", "ssh", "console", "-a", APP, "-C", `rm -f ${REMOTE_DB}.import`]);
  await run(["fly", "ssh", "sftp", "put", snapshot, `${REMOTE_DB}.import`, "-a", APP]);
  rmSync(snapshot, { force: true });
}

// 4. Деплой. --ha=false: SQLite на томе — машина должна быть одна
await run(["fly", "deploy", "-a", APP, "--ha=false", ...flyArgs]);

// 5. Проверка
if (withDb) {
  const words = await serverWords().catch(() => null);
  console.log(words ? `✓ На сервере теперь ${words.length} слов` : "⚠ Не удалось проверить слова на сервере — откройте сайт");
}
