import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ToneInput, type ToneInputHandle } from "./ToneInput";
import { SpeakButton } from "./SpeakButton";
import { TagInput } from "./TagInput";
import { ThaiFillButton } from "./ThaiFillButton";
import { cleanTags, meaning, parseBulk, wordKey, type NewWord, type Settings, type Word } from "./lib";

type Props = {
  words: Word[];
  onAdd: (items: NewWord[]) => Promise<number | null>; // сколько добавлено
  onUpdate: (id: number, item: NewWord) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  onResetScores: (ids: number[]) => Promise<boolean>;
  /** Начать тренировку по этим словам */
  onStart: (list: Word[]) => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
};

export function Dictionary({ words, onAdd, onUpdate, onDelete, onResetScores, onStart, settings, onSettings }: Props) {
  const [word, setWord] = useState("");
  const [tr, setTr] = useState("");
  const [en, setEn] = useState("");
  const [th, setTh] = useState("");
  const [tags, setTags] = useState<string[]>([]); // остаются после добавления — удобно вводить группу
  const [editId, setEditId] = useState<number | null>(null);
  const [editWord, setEditWord] = useState("");
  const [editTr, setEditTr] = useState("");
  const [editEn, setEditEn] = useState("");
  const [editTh, setEditTh] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]); // выбранные теги; пусто — все слова
  const [filter, setFilter] = useState("");
  const [delId, setDelId] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const wordRef = useRef<ToneInputHandle>(null);
  const trRef = useRef<ToneInputHandle>(null);
  const enRef = useRef<ToneInputHandle>(null);
  const thRef = useRef<ToneInputHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const openIdRef = useRef<number | null>(null); // открытая правка — для обработчиков, сработавших после закрытия
  // Отложенное сохранение после клика вне строки; если раньше него кликнули по другому слову —
  // выполняется сразу, до открытия новой правки (иначе правка старого слова потерялась бы)
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flushPendingSave() {
    if (pendingSaveRef.current === null) return;
    clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = null;
    saveEditRef.current(true);
  }
  const openEdit = (id: number | null) => {
    openIdRef.current = id;
    setEditId(id);
  };
  function startEdit(w: Word) {
    flushPendingSave(); // сначала сохранить правку, которую покинули кликом
    openEdit(w.id);
    setEditWord(w.word);
    setEditTr(w.translation);
    setEditEn(w.english);
    setEditTh(w.thai);
    setEditTags(w.tags);
  }

  /** Все теги словаря с количеством слов, по алфавиту. */
  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of words) for (const t of w.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b, "ru"));
  }, [words]);
  const tagNames = allTags.map(([t]) => t);
  // Недавние теги: по словам от новых к старым (словарь отсортирован так с сервера)
  const recentTags = useMemo(() => [...new Set(words.flatMap((w) => w.tags))], [words]);
  // Выбранный тег мог исчезнуть (последнее слово удалили или переименовали тег)
  const activeTags = tagFilter.filter((t) => tagNames.includes(t));
  // Слова с любым из выбранных тегов
  const toTrain = activeTags.length ? words.filter((w) => w.tags.some((t) => activeTags.includes(t))) : words;
  const toggleTag = (t: string) => setTagFilter(activeTags.includes(t) ? activeTags.filter((x) => x !== t) : [...activeTags, t]);
  // Слова с ненулевыми счётчиками — их обнуляет «Сбросить счётчики» (с учётом тега)
  const scored = toTrain.filter((w) => w.ok + w.fail > 0);
  /** Уже существующее слово с таким же написанием (кроме exceptId). */
  const findDup = (text: string, exceptId?: number) => {
    const key = wordKey(text);
    return key ? (words.find((w) => w.id !== exceptId && wordKey(w.word) === key) ?? null) : null;
  };
  const dup = findDup(word);
  const editDup = editId === null ? null : findDup(editWord, editId);
  const canAdd = !!word.trim() && !!(tr.trim() || en.trim()) && !dup;
  const [notice, setNotice] = useState<string | null>(null);

  /** Сообщение после импорта: сколько добавлено и сколько дублей пропущено. */
  function report(sent: number, added: number) {
    const skipped = sent - added;
    setNotice(`Добавлено: ${added}` + (skipped ? `, пропущено дублей: ${skipped}` : ""));
  }

  async function add() {
    if (!canAdd) return;
    setNotice(null);
    if ((await onAdd([{ word, thai: th, translation: tr, english: en, tags }])) === null) return;
    setWord("");
    setTr("");
    setEn("");
    setTh("");
    wordRef.current?.focus();
  }

  /**
   * Сохраняет правку. leaving — правку покидают (Esc или фокус ушёл из строки):
   * тогда незаполненная правка отбрасывается, а не держит строку открытой.
   */
  async function saveEdit(leaving = false) {
    const id = editId;
    if (id === null || savingRef.current || openIdRef.current !== id) return;
    // Закрываем только «свою» правку: пока шёл запрос, могли открыть другое слово
    const close = () => openIdRef.current === id && openEdit(null);
    const orig = words.find((w) => w.id === id);
    const valid = !!editWord.trim() && !!(editTr.trim() || editEn.trim()) && !findDup(editWord, id);
    if (!valid) return leaving ? close() : undefined;
    const sameTags = orig && orig.tags.join("\n") === editTags.join("\n");
    if (orig && orig.word === editWord && orig.translation === editTr && orig.english === editEn && orig.thai === editTh && sameTags) return close();
    savingRef.current = true;
    try {
      if (await onUpdate(id, { word: editWord, thai: editTh, translation: editTr, english: editEn, tags: editTags })) close();
    } finally {
      savingRef.current = false;
    }
  }

  // Последняя версия saveEdit — для отложенного вызова после потери фокуса
  const saveEditRef = useRef(saveEdit);
  useLayoutEffect(() => {
    saveEditRef.current = saveEdit;
  });

  // Клик за пределами строки правки — сохранить и закрыть. Отложенно: поле тегов
  // при потере фокуса само дописывает набранный тег, ждём это обновление
  const editRowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (editId === null) return;
    const onDown = (e: MouseEvent) => {
      if (editRowRef.current?.contains(e.target as Node)) return;
      clearTimeout(pendingSaveRef.current ?? undefined);
      pendingSaveRef.current = setTimeout(flushPendingSave);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editId]);

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
          .map((d) => ({
            word: typeof d?.word === "string" ? d.word : "",
            translation: typeof d?.translation === "string" ? d.translation : "",
            english: typeof d?.english === "string" ? d.english : "",
            thai: typeof d?.thai === "string" ? d.thai : "",
            tags: cleanTags(d?.tags),
            ok: Number(d?.ok) || 0,
            fail: Number(d?.fail) || 0,
          }))
          .filter((d) => d.word.trim() && (d.translation.trim() || d.english.trim()));
    } catch {
      incoming = parseBulk(text);
    }
    if (!incoming.length) return setNotice("В файле не найдено слов");
    const added = await onAdd(incoming);
    if (added !== null) report(incoming.length, added);
  }

  const q = filter.trim().toLowerCase();
  const shown = q ? toTrain.filter((w) => [w.word, w.thai, w.translation, w.english, ...w.tags].some((s) => s.toLowerCase().includes(q))) : toTrain;

  return (
    <div className="screen">
      <section className="card train-box">
        {allTags.length > 0 && (
          <div className="tag-filter" title="Можно выбрать несколько тегов — в обучение попадут слова с любым из них">
            <span>Теги:</span>
            <button className={activeTags.length ? "" : "active"} onClick={() => setTagFilter([])}>
              Все · {words.length}
            </button>
            {allTags.map(([t, n]) => (
              <button key={t} className={activeTags.includes(t) ? "active" : ""} aria-pressed={activeTags.includes(t)} onClick={() => toggleTag(t)}>
                {t} · {n}
              </button>
            ))}
          </div>
        )}
        <div className="settings">
          <label title="Что показывается на карточке и что нужно вводить">
            <span>Показывать:</span>
            <select value={settings.direction} onChange={(e) => onSettings({ ...settings, direction: e.target.value as Settings["direction"] })}>
              <option value="foreign">слово → вводить перевод</option>
              <option value="native">перевод → вводить слово</option>
            </select>
          </label>
          <label className="check" title="Включено: náam и naam — разные ответы. Выключено: знаки тонов не проверяются">
            <input type="checkbox" checked={settings.strictTones} onChange={(e) => onSettings({ ...settings, strictTones: e.target.checked })} />
            Учитывать тоны
          </label>
        </div>
        <button className="start" onClick={() => onStart(toTrain)} disabled={!toTrain.length}>
          Начать обучение {toTrain.length ? `(${toTrain.length})` : ""}
          {activeTags.length > 0 && <span className="start-tag"> · {activeTags.join(", ")}</span>}
        </button>
      </section>

      <section className="card">
        <h2>Добавить слово</h2>
        <div className="add-form">
          <div className="translations">
            <ToneInput ref={wordRef} value={word} onChange={setWord} placeholder="Слово (иностранное)" onEnter={() => thRef.current?.focus()} />
            <ThaiFillButton word={word} thai={th} english={en} translation={tr} onFill={setTh}>
              <ToneInput ref={thRef} value={th} onChange={setTh} placeholder="ไทย — тайское написание" onEnter={() => enRef.current?.focus()} tones={false} />
            </ThaiFillButton>
          </div>
          <div className="translations">
            <ToneInput ref={enRef} value={en} onChange={setEn} placeholder="English" onEnter={() => trRef.current?.focus()} tones={false} />
            <ToneInput ref={trRef} value={tr} onChange={setTr} placeholder="Перевод (рус.)" onEnter={add} tones={false} />
            <TagInput value={tags} onChange={setTags} suggestions={tagNames} recent={recentTags} onEnter={add} placeholder="Теги (Enter или запятая)" />
          </div>
          {/* Не disabled, а aria-disabled: иначе Tab перепрыгивает кнопку. tabIndex — для Safari */}
          <button className="primary" onClick={add} aria-disabled={!canAdd} tabIndex={0}>
            Добавить
          </button>
        </div>
        {dup && (
          <p className="warn">
            Уже есть в словаре: <b>{dup.word}</b> — {meaning(dup)}
          </p>
        )}
        {notice && <p className="notice">{notice}</p>}
        <p className="hint">Достаточно одного перевода — русского или английского; в тренировке засчитывается любой. Тайское написание необязательно: по нему работает 🔊 (и в самом поле), без него — тайский текст, который подскажет Gemini. Кнопка-искра в поле заполняет его по слову и переводу (Gemini) — проверьте результат. Несколько вариантов — через запятую: «дом, здание». Гласные с тонами — в таблице под полем слова: строка — гласная, столбец — тон (средний, низкий, нисходящий, высокий, восходящий).</p>

        <div className="row-actions">
          <button className="link" onClick={() => fileRef.current?.click()}>Импорт</button>
          <button className="link" onClick={exportJSON} disabled={!words.length}>Экспорт</button>
          <input ref={fileRef} type="file" accept=".json,.txt,.csv,.tsv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
        </div>

      </section>

      <section className="card">
        <div className="list-head">
          <h2>Словарь · {activeTags.length ? `${toTrain.length} из ${words.length}` : words.length}</h2>
          <div className="list-tools">
            {scored.length > 0 &&
              (confirmReset ? (
                <button
                  className="small danger"
                  autoFocus
                  onBlur={() => setConfirmReset(false)}
                  onClick={async () => {
                    await onResetScores(scored.map((w) => w.id));
                    setConfirmReset(false);
                  }}
                >
                  Сбросить у {scored.length}?
                </button>
              ) : (
                <button
                  className="link"
                  title={activeTags.length ? `Обнулить успехи/неудачи у слов с тегами: ${activeTags.join(", ")}` : "Обнулить успехи/неудачи у всех слов"}
                  onClick={() => setConfirmReset(true)}
                >
                  Сбросить счётчики
                </button>
              ))}
            {words.length > 5 && <input className="search" placeholder="Поиск" value={filter} onChange={(e) => setFilter(e.target.value)} />}
          </div>
        </div>
        {!words.length && <p className="empty">Словарь пуст. Добавьте первые слова выше.</p>}
        <ul className="words">
          {shown.map((w) =>
            editId === w.id ? (
              <li
                key={w.id}
                ref={editRowRef}
                className="editing"
                onKeyDown={(e) => e.key === "Escape" && saveEdit(true)}
                onMouseDown={(e) => {
                  // Клик по пустому месту внутри строки не забирает фокус у поля — правка остаётся открытой
                  if (!(e.target as HTMLElement).closest("input, textarea, select, button, label")) e.preventDefault();
                }}
                onBlur={(e) => {
                  // Tab увёл фокус за пределы строки — сохраняем (клики снаружи ловит обработчик выше)
                  const to = e.relatedTarget as Node | null;
                  if (to && !e.currentTarget.contains(to)) setTimeout(() => saveEditRef.current(true));
                }}
              >
                <div className="translations">
                  <ToneInput value={editWord} onChange={setEditWord} onEnter={saveEdit} autoFocus />
                  <ThaiFillButton word={editWord} thai={editTh} english={editEn} translation={editTr} onFill={setEditTh}>
                    <ToneInput value={editTh} onChange={setEditTh} onEnter={saveEdit} placeholder="ไทย — тайское написание" tones={false} />
                  </ThaiFillButton>
                  {editDup && (
                    <p className="warn">
                      Уже есть: <b>{editDup.word}</b> — {meaning(editDup)}. Правка не сохранится.
                    </p>
                  )}
                </div>
                <div className="translations">
                  <ToneInput value={editEn} onChange={setEditEn} onEnter={saveEdit} placeholder="English" tones={false} />
                  <ToneInput value={editTr} onChange={setEditTr} onEnter={saveEdit} placeholder="Перевод (рус.)" tones={false} />
                  <TagInput value={editTags} onChange={setEditTags} suggestions={tagNames} recent={recentTags} onEnter={saveEdit} />
                </div>
              </li>
            ) : (
              <li key={w.id} className="editable" title="Нажмите, чтобы изменить" onClick={() => startEdit(w)}>
                <span className="w">
                  {w.word}
                  <SpeakButton id={w.id} onThai={w.thai ? undefined : (thai) => onUpdate(w.id, { word: w.word, translation: w.translation, english: w.english, thai })} />
                  {w.thai && <span className="thai">{w.thai}</span>}
                </span>
                <span className="t">
                  {meaning(w)}
                  {w.tags.length > 0 && (
                    <span className="tags">
                      {w.tags.map((t) => (
                        <button
                          key={t}
                          className="tag"
                          title="Показать слова с этим тегом"
                          onClick={(e) => {
                            e.stopPropagation(); // клик по тегу — фильтр, а не правка
                            setTagFilter([t]);
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </span>
                  )}
                </span>
                <span className="score" title="успехи / неудачи">
                  {w.ok + w.fail > 0 && (<><b className="ok">{w.ok}</b>/<b className="bad">{w.fail}</b></>)}
                </span>
                {/* Удаление не открывает правку */}
                <span className="item-actions" onClick={(e) => e.stopPropagation()}>
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
