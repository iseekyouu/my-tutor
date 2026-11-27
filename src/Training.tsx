import { useEffect, useRef, useState } from "react";
import { ToneInput, type ToneInputHandle } from "./ToneInput";
import { isCorrect, type Result, type Settings, type Word } from "./lib";

type Props = {
  queue: Word[];
  settings: Settings;
  onFinish: (results: Result[]) => void;
};

type Phase = { kind: "ask" } | { kind: "answered"; success: boolean; revealed: boolean };

export function Training({ queue, settings, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const [results, setResults] = useState<Result[]>([]);
  const inputRef = useRef<ToneInputHandle>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const current = queue[index];
  const prompt = settings.direction === "foreign" ? current.word : current.translation;
  const expected = settings.direction === "foreign" ? current.translation : current.word;
  const okCount = results.filter((r) => r.success).length;

  useEffect(() => {
    if (phase.kind === "ask") inputRef.current?.focus();
    else nextRef.current?.focus();
  }, [phase, index]);

  function settle(revealed: boolean) {
    if (phase.kind !== "ask") return;
    const success = !revealed && isCorrect(answer, expected, settings.strictTones);
    setResults([...results, { word: current, success, given: answer, revealed }]);
    setPhase({ kind: "answered", success, revealed });
  }

  function next() {
    if (index + 1 >= queue.length) return onFinish(results);
    setIndex(index + 1);
    setAnswer("");
    setPhase({ kind: "ask" });
  }

  return (
    <div className="screen training">
      <div className="progress">
        <span>
          {index + 1} / {queue.length}
        </span>
        <span>
          <b className="ok">✓ {okCount}</b> &nbsp; <b className="bad">✗ {results.length - okCount}</b>
        </span>
        <button className="stop" onClick={() => onFinish(results)}>Стоп</button>
      </div>
      <div className="bar"><div style={{ width: `${(results.length / queue.length) * 100}%` }} /></div>

      <section className="card prompt-card">
        <div className="prompt">{prompt}</div>

        <ToneInput
          ref={inputRef}
          className={phase.kind === "answered" ? (phase.success ? "is-ok" : "is-bad") : ""}
          value={answer}
          onChange={setAnswer}
          onEnter={() => (phase.kind === "ask" ? settle(false) : next())}
          placeholder="Перевод…"
          disabled={phase.kind !== "ask"}
        />

        {phase.kind === "ask" ? (
          <div className="buttons">
            <button className="primary" onClick={() => settle(false)} disabled={!answer.trim()}>Проверить</button>
            <button onClick={() => settle(true)}>Показать ответ</button>
          </div>
        ) : (
          <>
            <div className={"verdict " + (phase.success ? "ok" : "bad")}>
              {phase.success ? "Верно!" : phase.revealed ? "Ответ показан — засчитано как ошибка" : "Неверно"}
            </div>
            <div className="answer">{expected}</div>
            <div className="buttons">
              <button ref={nextRef} className="primary" onClick={next}>
                {index + 1 >= queue.length ? "Результаты" : "Дальше"} ↵
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
