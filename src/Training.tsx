import { useEffect, useRef, useState } from "react";
import { SpeakButton } from "./SpeakButton";
import { ThaiFillButton } from "./ThaiFillButton";
import { ToneInput, type ToneInputHandle } from "./ToneInput";
import { isCorrect, meaning, type NewWord, type Result, type Settings, type Word } from "./lib";

type Props = {
  queue: Word[];
  settings: Settings;
  onFinish: (results: Result[]) => void;
  /** Сохранить правку слова в словарь; возвращает сохранённое слово или null при ошибке */
  onUpdate: (id: number, item: NewWord) => Promise<Word | null>;
};

type Phase = { kind: "ask" } | { kind: "answered"; success: boolean; revealed: boolean };

export function Training({ queue, settings, onFinish, onUpdate }: Props) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const [results, setResults] = useState<Result[]>([]);
  const [editing, setEditing] = useState(false);
  // Слова, исправленные во время теста (очередь — снимок словаря на момент старта)
  const [edited, setEdited] = useState<Record<number, Word>>({});
  const inputRef = useRef<ToneInputHandle>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const current = edited[queue[index].id] ?? queue[index];
  const foreign = settings.direction === "foreign";
  const prompt = foreign ? current.word : meaning(current);
  const expected = foreign ? meaning(current) : current.word;
  // Показываем слово — принимаем и русский, и английский перевод;
  // показываем перевод — слово можно написать и транслитерацией, и тайскими буквами
  const acceptedOf = (w: Word) => (foreign ? [w.translation, w.english] : [w.word, w.thai]);
  const okCount = results.filter((r) => r.success).length;

  useEffect(() => {
    if (editing) return;
    if (phase.kind === "ask") inputRef.current?.focus();
    else nextRef.current?.focus();
  }, [phase, index, editing]);

  function settle(revealed: boolean) {
    if (phase.kind !== "ask") return;
    const success = !revealed && isCorrect(answer, acceptedOf(current), settings.strictTones);
    setResults([...results, { word: current, success, given: answer, revealed }]);
    setPhase({ kind: "answered", success, revealed });
  }

  /** Последний ответ — засчитать как верный и сразу дальше. */
  function acceptLast(list: Result[]) {
    const updated = list.map((r, i) => (i === list.length - 1 ? { ...r, success: true, overruled: true } : r));
    setResults(updated);
    next(updated);
  }

  /** Ответ сочли неверным, но по смыслу он верный (опечатка, другая формулировка). */
  function overrule() {
    if (phase.kind !== "answered" || phase.success || phase.revealed) return;
    acceptLast(results);
  }

  /** Сохраняет правку слова; если теперь ответ подходит — засчитывает и идёт дальше. */
  async function saveEdit(item: NewWord) {
    const row = await onUpdate(current.id, item);
    if (!row) return false;
    setEdited((e) => ({ ...e, [row.id]: row }));
    const list = results.map((r) => (r.word.id === row.id ? { ...r, word: row } : r));
    setEditing(false);
    const wasWrong = phase.kind === "answered" && !phase.success && !phase.revealed;
    if (wasWrong && isCorrect(answer, acceptedOf(row), settings.strictTones)) acceptLast(list);
    else setResults(list);
    return true;
  }

  /** Озвучка нашла тайское написание, которого не было, — в словарь. */
  const fillThai = current.thai
    ? undefined
    : (thai: string) => {
        setEdited((e) => ({ ...e, [current.id]: { ...current, thai } }));
        onUpdate(current.id, { word: current.word, translation: current.translation, english: current.english, thai });
      };

  function next(final = results) {
    setEditing(false);
    if (index + 1 >= queue.length) return onFinish(final);
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
        <div className="prompt">
          {prompt}
          {foreign && <SpeakButton id={current.id} onThai={fillThai} />}
          {foreign && current.thai && <div className="thai">{current.thai}</div>}
        </div>

        <ToneInput
          ref={inputRef}
          className={phase.kind === "answered" ? (phase.success ? "is-ok" : "is-bad") : ""}
          value={answer}
          onChange={setAnswer}
          onEnter={() => (phase.kind === "ask" ? settle(false) : next())}
          placeholder={foreign ? "Перевод (рус. или англ.)…" : "Слово…"}
          disabled={phase.kind !== "ask"}
          // Тоны нужны, только когда вводишь слово и они проверяются; таблица — по кнопке «тон»
          tones={!foreign && settings.strictTones}
          tonesOpen={false}
        />

        {phase.kind === "ask" ? (
          <div className="buttons before-answer">
            <button className="primary" onClick={() => settle(false)} disabled={!answer.trim()}>Проверить</button>
            <button onClick={() => settle(true)}>Показать ответ</button>
          </div>
        ) : (
          <>
            <div className={"verdict " + (phase.success ? "ok" : "bad")}>
              {phase.success ? "Верно!" : phase.revealed ? "Ответ показан — засчитано как ошибка" : "Неверно"}
            </div>
            <div className="answer">
              {expected}
              {!foreign && <SpeakButton id={current.id} onThai={fillThai} />}
              {!foreign && current.thai && <div className="thai">{current.thai}</div>}
            </div>
            {editing ? (
              <WordEditor word={current} focusWord={!foreign} onSave={saveEdit} onCancel={() => setEditing(false)} />
            ) : (
              <div className="buttons after-answer">
                {/* Компьютер — один ряд: «Засчитать» | «Дальше» | «Изменить».
                    Телефон — пирамидка: «Дальше» во всю ширину, под ним «Засчитать» | «Изменить» */}
                {!phase.success && !phase.revealed && (
                  <button className="overrule-btn" onClick={overrule} title="Ответ верный по смыслу или с опечаткой — засчитать как верный и перейти к следующему">
                    Засчитать
                  </button>
                )}
                <button ref={nextRef} className="primary next-btn" onClick={() => next()}>
                  {index + 1 >= queue.length ? "Результаты" : "Дальше"}<span className="kbd-hint"> ↵</span>
                </button>
                <button className="edit-btn" onClick={() => setEditing(true)} title="Исправить слово или дописать вариант перевода — сохранится в словарь">
                  ✎ Изменить
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

type EditorProps = {
  word: Word;
  /** Курсор сразу в поле слова (иначе — в переводы) */
  focusWord: boolean;
  onSave: (item: NewWord) => Promise<boolean>;
  onCancel: () => void;
};

/** Правка слова прямо в тесте: Enter — сохранить, Esc — отмена. */
function WordEditor({ word, focusWord, onSave, onCancel }: EditorProps) {
  const [w, setW] = useState(word.word);
  const [th, setTh] = useState(word.thai);
  const [en, setEn] = useState(word.english);
  const [tr, setTr] = useState(word.translation);
  const [saving, setSaving] = useState(false);
  const valid = !!w.trim() && !!(en.trim() || tr.trim());

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    // Теги не передаём — они не меняются
    const ok = await onSave({ word: w, thai: th, english: en, translation: tr });
    if (!ok) setSaving(false);
  }

  return (
    <div className="word-editor" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <ToneInput value={w} onChange={setW} onEnter={save} placeholder="Слово" autoFocus={focusWord} />
      <ThaiFillButton word={w} thai={th} english={en} translation={tr} onFill={setTh}>
        <ToneInput value={th} onChange={setTh} onEnter={save} placeholder="ไทย — тайское написание" tones={false} />
      </ThaiFillButton>
      <ToneInput value={en} onChange={setEn} onEnter={save} placeholder="English (варианты через запятую)" tones={false} autoFocus={!focusWord} />
      <ToneInput value={tr} onChange={setTr} onEnter={save} placeholder="Перевод (рус., варианты через запятую)" tones={false} />
      <div className="buttons">
        <button className="primary" onClick={save} disabled={!valid || saving}>Сохранить ↵</button>
        <button onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
