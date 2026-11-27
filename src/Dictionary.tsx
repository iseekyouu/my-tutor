import { useRef, useState } from "react";
import { ToneInput, type ToneInputHandle } from "./ToneInput";
import { parseBulk, type NewWord, type Word } from "./lib";

type Props = {
  words: Word[];
  onAdd: (items: NewWord[]) => Promise<boolean>;
  onUpdate: (id: number, item: NewWord) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  onStart: () => void;
};

export function Dictionary({ words, onAdd, onUpdate, onDelete, onStart }: Props) {
  const [word, setWord] = useState("");
  const [tr, setTr] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editTr, setEditTr] = useState("");
  const [filter, setFilter] = useState("");
  const [delId, setDelId] = useState<number | null>(null);
  const wordRef = useRef<ToneInputHandle>(null);
  const trRef = useRef<ToneInputHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add() {
    if (!word.trim() || !tr.trim()) return;
    if (!(await onAdd([{ word, translation: tr }]))) return;
    setWord("");
    setTr("");
    wordRef.current?.focus();
  }

  async function addBulk() {
    const parsed = parseBulk(bulk);
    if (!parsed.length || !(await onAdd(parsed))) return;
    setBulk("");
    setShowBulk(false);
  }

  async function saveEdit() {
    if (editId === null || !editWord.trim() || !editTr.trim()) return;
    if (await onUpdate(editId, { word: editWord, translation: editTr })) setEditId(null);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dictionary.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(file: File) {
    const text = await file.text();
    let incoming: NewWord[] = [];
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data))
        incoming = data
          .filter((d) => d && typeof d.word === "string" && typeof d.translation === "string" && d.word.trim() && d.translation.trim())
          .map((d) => ({ word: d.word, translation: d.translation, ok: Number(d.ok) || 0, fail: Number(d.fail) || 0 }));
    } catch {
      incoming = parseBulk(text);
    }
    if (incoming.length) await onAdd(incoming);
  }

  const q = filter.trim().toLowerCase();
  const shown = q ? words.filter((w) => w.word.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q)) : words;

  return (
    <div className="screen">
      <section className="card">
        <h2>Добавить слово</h2>
        <div className="add-form">
          <ToneInput ref={wordRef} value={word} onChange={setWord} placeholder="Слово (иностранное)" onEnter={() => trRef.current?.focus()} />
          <ToneInput ref={trRef} value={tr} onChange={setTr} placeholder="Перевод" onEnter={add} />
          <button className="primary" onClick={add} disabled={!word.trim() || !tr.trim()}>
            Добавить
          </button>
        </div>
        <p className="hint">Несколько вариантов перевода — через запятую: «дом, здание». Кнопка «тон» — тайские тоновые знаки и тоны в транслитерации.</p>

        <div className="row-actions">
          <button className="link" onClick={() => setShowBulk(!showBulk)}>
            {showBulk ? "Скрыть списком" : "Добавить списком"}
          </button>
          <button className="link" onClick={() => fileRef.current?.click()}>Импорт</button>
          <button className="link" onClick={exportJSON} disabled={!words.length}>Экспорт</button>
          <input ref={fileRef} type="file" accept=".json,.txt,.csv,.tsv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
        </div>

        {showBulk && (
          <div className="bulk">
            <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={6} placeholder={"По одному на строку:\nสวัสดี - привет\nขอบคุณ - спасибо"} />
            <button className="primary" onClick={addBulk} disabled={!parseBulk(bulk).length}>
              Добавить {parseBulk(bulk).length || ""}
            </button>
          </div>
        )}
      </section>

      <button className="start" onClick={onStart} disabled={!words.length}>
        Начать обучение {words.length ? `(${words.length})` : ""}
      </button>

      <section className="card">
        <div className="list-head">
          <h2>Словарь · {words.length}</h2>
          {words.length > 5 && <input className="search" placeholder="Поиск" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        </div>
        {!words.length && <p className="empty">Словарь пуст. Добавьте первые слова выше.</p>}
        <ul className="words">
          {shown.map((w) =>
            editId === w.id ? (
              <li key={w.id} className="editing">
                <ToneInput value={editWord} onChange={setEditWord} onEnter={saveEdit} />
                <ToneInput value={editTr} onChange={setEditTr} onEnter={saveEdit} />
                <div className="item-actions">
                  <button className="primary small" onClick={saveEdit}>Сохранить</button>
                  <button className="small" onClick={() => setEditId(null)}>Отмена</button>
                </div>
              </li>
            ) : (
              <li key={w.id}>
                <span className="w">{w.word}</span>
                <span className="t">{w.translation}</span>
                <span className="score" title="успехи / неудачи">
                  {w.ok + w.fail > 0 && (<><b className="ok">{w.ok}</b>/<b className="bad">{w.fail}</b></>)}
                </span>
                <span className="item-actions">
                  <button className="icon" title="Изменить" onClick={() => { setEditId(w.id); setEditWord(w.word); setEditTr(w.translation); }}>✎</button>
                  {delId === w.id ? (
                    <button className="small danger" onClick={async () => { await onDelete(w.id); setDelId(null); }} onBlur={() => setDelId(null)} autoFocus>Удалить?</button>
                  ) : (
                    <button className="icon" title="Удалить" onClick={() => setDelId(w.id)}>✕</button>
                  )}
                </span>
              </li>
            ),
          )}
        </ul>
      </section>
    </div>
  );
}
