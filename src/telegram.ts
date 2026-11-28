// Запуск внутри Telegram (Mini App): весь экран, цвета темы Telegram.
// Вне Telegram ничего не делает — скрипт Telegram даже не загружается.

type ThemeParams = Partial<
  Record<"bg_color" | "secondary_bg_color" | "section_bg_color" | "text_color" | "hint_color" | "button_color" | "button_text_color", string>
>;

type WebApp = {
  ready(): void;
  expand(): void;
  colorScheme: "light" | "dark";
  themeParams: ThemeParams;
  isVersionAtLeast(v: string): boolean;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  onEvent(event: "themeChanged", cb: () => void): void;
};

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}

/** Telegram передаёт данные запуска в адресе: #tgWebAppData=…&tgWebAppVersion=… */
export const inTelegram = () => /tgWebApp/.test(location.hash + location.search) || sessionStorage.getItem("tg") === "1";

export function initTelegram() {
  if (!inTelegram()) return;
  sessionStorage.setItem("tg", "1"); // адрес мог потерять hash после перезагрузки
  document.documentElement.classList.add("tg");
  const script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-web-app.js";
  script.onload = setup;
  document.head.append(script);
}

function setup() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  applyTheme(tg);
  tg.onEvent("themeChanged", () => applyTheme(tg));
  tg.expand(); // на весь экран, а не половину
  // Прокрутка вниз не сворачивает приложение (Bot API 7.7+)
  if (tg.isVersionAtLeast("7.7")) tg.disableVerticalSwipes?.();
  tg.ready();
}

/** Цвета приложения — из темы Telegram: фон, карточки, текст, акцент (цвет кнопок). */
function applyTheme(tg: WebApp) {
  const p = tg.themeParams;
  const dark = tg.colorScheme === "dark";
  const card = p.section_bg_color || p.bg_color;
  const bg = p.secondary_bg_color || p.bg_color;
  const vars: Record<string, string | undefined> = {
    "--bg": bg,
    "--card": card,
    "--text": p.text_color,
    "--muted": p.hint_color,
    "--accent": p.button_color,
    "--accent-2": p.button_color && card ? `color-mix(in srgb, ${p.button_color} ${dark ? 22 : 12}%, ${card})` : undefined,
    "--line": p.text_color && card ? `color-mix(in srgb, ${p.text_color} ${dark ? 16 : 11}%, ${card})` : undefined,
    "--ok": dark ? "#5cc27a" : "#2e8a4a",
    "--bad": dark ? "#ef7a66" : "#c2412d",
  };
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) if (v) root.setProperty(k, v);
  if (bg && tg.isVersionAtLeast("6.1")) {
    tg.setHeaderColor?.(bg);
    tg.setBackgroundColor?.(bg);
  }
}
