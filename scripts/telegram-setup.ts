// Настройка Telegram-бота: кнопка меню открывает словарь как Mini App.
// Запуск: bun run telegram:setup (токен — TELEGRAM_BOT_TOKEN в .env, от @BotFather).
// Токен нужен только здесь, на сервер он не попадает.

const URL = process.env.APP_URL ?? "https://my-tutor.fly.dev/";
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  console.error("✗ Нет TELEGRAM_BOT_TOKEN в .env. Создайте бота у @BotFather (/newbot) и вставьте токен.");
  process.exit(1);
}

async function call(method: string, body: object = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  if (!data.ok) {
    console.error(`✗ ${method}: ${data.description}`);
    process.exit(1);
  }
  return data.result;
}

const me = await call("getMe");
await call("setChatMenuButton", { menu_button: { type: "web_app", text: "Словарик", web_app: { url: URL } } });
await call("setMyShortDescription", { short_description: "Тренажёр тайских слов с тонами и озвучкой" });
await call("setMyDescription", {
  description: "Словарик — тренажёр тайских слов: тоны, озвучка, теги.\n\nНажмите «Начать», затем кнопку «Словарик» слева от поля ввода.",
});
console.log(`✓ Бот @${me.username} настроен: кнопка «Словарик» открывает ${URL}`);
console.log(`  Открыть: https://t.me/${me.username}`);
