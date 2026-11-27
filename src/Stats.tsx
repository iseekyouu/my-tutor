import { meaning, type Result, type Settings, type Word } from "./lib";

type Props = {
  results: Result[];
  total: number;
  settings: Settings;
  onRepeat: (words: Word[]) => void;
  onBack: () => void;
};

export function Stats({ results, total, settings, onRepeat, onBack }: Props) {
  const ok = results.filter((r) => r.success).length;
  const bad = results.filter((r) => !r.success);
  const pct = results.length ? Math.round((ok / results.length) * 100) : 0;
  const expectedOf = (w: Word) => (settings.direction === "foreign" ? meaning(w) : w.word);
  const promptOf = (w: Word) => (settings.direction === "foreign" ? w.word : meaning(w));

  return (
    <div className="screen">
      <section className="card">
        <h2>Статистика</h2>
        <div className="stats">
          <div><span className="num">{results.length}</span><span>из {total} пройдено</span></div>
          <div><span className="num ok">{ok}</span><span>верно</span></div>
          <div><span className="num bad">{bad.length}</span><span>ошибок</span></div>
          <div><span className="num">{pct}%</span><span>успех</span></div>
        </div>
      </section>

      <section className="card">
        <h2>Надо повторить · {bad.length}</h2>
        {!bad.length ? (
          <p className="empty">{results.length ? "Всё верно — отлично!" : "Ни одного слова не пройдено."}</p>
        ) : (
          <ul className="words repeat">
            {bad.map((r, i) => (
              <li key={i}>
                <span className="w">{promptOf(r.word)}</span>
                <span className="t">{expectedOf(r.word)}</span>
                <span className="given">{r.revealed ? "подсмотрено" : <s>{r.given}</s>}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="buttons">
        {bad.length > 0 && (
          <button className="primary" onClick={() => onRepeat(bad.map((r) => r.word))}>Повторить ошибки</button>
        )}
        <button onClick={onBack}>В словарь</button>
      </div>
    </div>
  );
}
