import { useEffect, useState } from "react";
import { Dictionary } from "./Dictionary";
import { Training } from "./Training";
import { Stats } from "./Stats";
import { loadSettings, loadWords, saveSettings, saveWords, shuffle, type Result, type Settings, type Word } from "./lib";

type Screen =
  | { kind: "dict" }
  | { kind: "train"; queue: Word[]; key: number }
  | { kind: "stats"; results: Result[]; total: number };

export default function App() {
  const [words, setWords] = useState<Word[]>(loadWords);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [screen, setScreen] = useState<Screen>({ kind: "dict" });

  useEffect(() => saveWords(words), [words]);
  useEffect(() => saveSettings(settings), [settings]);

  function start(list: Word[]) {
    if (!list.length) return;
    setScreen({ kind: "train", queue: shuffle(list), key: Date.now() });
  }

  function finish(results: Result[], total: number) {
    // обновляем накопленную статистику по словам
    const delta = new Map<string, { ok: number; fail: number }>();
    for (const r of results) {
      const d = delta.get(r.word.id) ?? { ok: 0, fail: 0 };
      r.success ? d.ok++ : d.fail++;
      delta.set(r.word.id, d);
    }
    setWords((ws) => ws.map((w) => (delta.has(w.id) ? { ...w, ok: w.ok + delta.get(w.id)!.ok, fail: w.fail + delta.get(w.id)!.fail } : w)));
    setScreen({ kind: "stats", results, total });
  }

  return (
    <div className="app">
      <header>
        <h1 onClick={() => screen.kind !== "train" && setScreen({ kind: "dict" })}>Словарик</h1>
        {screen.kind === "dict" && (
          <div className="settings">
            <label>
              <select value={settings.direction} onChange={(e) => setSettings({ ...settings, direction: e.target.value as Settings["direction"] })}>
                <option value="foreign">Слово → перевод</option>
                <option value="native">Перевод → слово</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.strictTones} onChange={(e) => setSettings({ ...settings, strictTones: e.target.checked })} />
              Учитывать тоны
            </label>
          </div>
        )}
      </header>

      {screen.kind === "dict" && <Dictionary words={words} setWords={setWords} onStart={() => start(words)} />}
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
