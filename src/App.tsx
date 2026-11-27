import { useCallback, useEffect, useState } from "react";
import { Dictionary } from "./Dictionary";
import { Training } from "./Training";
import { Stats } from "./Stats";
import { api } from "./api";
import { loadSettings, saveSettings, shuffle, type NewWord, type Result, type Settings, type Word } from "./lib";

type Screen =
  | { kind: "loading" }
  | { kind: "dict" }
  | { kind: "train"; queue: Word[]; key: number }
  | { kind: "stats"; results: Result[]; total: number };

export default function App() {
  const [words, setWords] = useState<Word[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => saveSettings(settings), [settings]);

  /** Выполняет запрос к серверу; при ошибке показывает её и возвращает false. */
  const call = useCallback(async <T,>(fn: () => Promise<T>, apply: (data: T) => void): Promise<boolean> => {
    try {
      apply(await fn());
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Нет связи с сервером");
      return false;
    }
  }, []);

  const reload = useCallback(
    () => call(api.list, (list) => { setWords(list); setScreen((s) => (s.kind === "loading" ? { kind: "dict" } : s)); }),
    [call],
  );
  useEffect(() => { reload(); }, [reload]);

  /** Добавляет слова; возвращает, сколько добавлено (дубли сервер пропускает), или null при ошибке. */
  const add = async (items: NewWord[]) => {
    let count: number | null = null;
    await call(() => api.add(items), (created) => {
      count = created.length;
      setWords((ws) => [...created.reverse(), ...ws]);
    });
    return count;
  };
  const update = (id: number, item: NewWord) => call(() => api.update(id, item), (row) => setWords((ws) => ws.map((w) => (w.id === id ? row : w))));
  const remove = (id: number) => call(() => api.remove(id), () => setWords((ws) => ws.filter((w) => w.id !== id)));

  function start(list: Word[]) {
    if (!list.length) return;
    setScreen({ kind: "train", queue: shuffle(list), key: Date.now() });
  }

  function finish(results: Result[], total: number) {
    setScreen({ kind: "stats", results, total });
    if (results.length) call(() => api.saveResults(results.map((r) => ({ id: r.word.id, success: r.success }))), setWords);
  }

  return (
    <div className="app">
      <header>
        <h1 onClick={() => (screen.kind === "stats" ? setScreen({ kind: "dict" }) : undefined)}>Словарик</h1>
      </header>

      {error && (
        <div className="error">
          <span>{error}</span>
          <button className="small" onClick={() => (screen.kind === "loading" ? reload() : setError(null))}>
            {screen.kind === "loading" ? "Повторить" : "Скрыть"}
          </button>
        </div>
      )}

      {screen.kind === "loading" && !error && <p className="empty">Загрузка…</p>}
      {screen.kind === "dict" && <Dictionary words={words} onAdd={add} onUpdate={update} onDelete={remove} onStart={start} settings={settings} onSettings={setSettings} />}
      {screen.kind === "train" && (
        <Training key={screen.key} queue={screen.queue} settings={settings} onFinish={(r) => finish(r, screen.queue.length)} />
      )}
      {screen.kind === "stats" && (
        <Stats
          results={screen.results}
          total={screen.total}
          settings={settings}
          onRepeat={(list) => start(words.filter((w) => list.some((l) => l.id === w.id)))}
          onBack={() => setScreen({ kind: "dict" })}
        />
      )}
    </div>
  );
}
