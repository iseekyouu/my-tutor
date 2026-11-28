// Замена базы при запуске: `bun run deploy --with-db` кладёт локальную базу рядом с
// серверной как <DB_PATH>.import, и при следующем старте сервер подменяет ею базу.
// Прежняя база сохраняется копией <DB_PATH>.bak-<время> (хранятся последние 5).
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, renameSync, rmSync } from "fs";
import { basename, dirname, join } from "path";

const KEEP_BACKUPS = 5;

export function applyPendingImport(path: string): string | null {
  const incoming = `${path}.import`;
  if (!existsSync(incoming)) return null;

  // Файл должен быть базой SQLite с таблицей слов — иначе откладываем его и работаем со старой базой
  try {
    const check = new Database(incoming, { readonly: true });
    check.query("SELECT count(*) FROM words").get();
    check.close();
  } catch (e) {
    renameSync(incoming, `${incoming}-bad`);
    console.error(`Импорт базы пропущен: ${incoming} — не база словаря (${e})`);
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let backup = "";
  if (existsSync(path)) {
    // VACUUM INTO — целостная копия вместе с журналом WAL
    backup = `${path}.bak-${stamp}`;
    const old = new Database(path);
    old.run(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    old.close();
    for (const f of [path, `${path}-wal`, `${path}-shm`]) rmSync(f, { force: true });
  }
  renameSync(incoming, path);

  // Старые копии — только последние KEEP_BACKUPS
  const dir = dirname(path);
  const prefix = `${basename(path)}.bak-`;
  const backups = readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
  for (const f of backups.slice(0, -KEEP_BACKUPS)) rmSync(join(dir, f), { force: true });

  console.log(`База заменена импортом${backup ? `, прежняя сохранена: ${backup}` : ""}`);
  return backup || path;
}
