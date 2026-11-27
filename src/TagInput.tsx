import { forwardRef, useId, useImperativeHandle, useRef, useState } from "react";
import { cleanTags } from "./lib";

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Существующие теги — для подсказок */
  suggestions: string[];
  /** Недавно использованные теги, от новых к старым — первые 3 невыбранных показываются под полем */
  recent?: string[];
  /** Enter в пустом поле (например, добавить слово) */
  onEnter?: () => void;
  placeholder?: string;
};

export type TagInputHandle = { focus: () => void };

/** Поле тегов: Enter или запятая превращают набранное в тег, Backspace в пустом поле убирает последний. */
export const TagInput = forwardRef<TagInputHandle, Props>(function TagInput(
  { value, onChange, suggestions, recent = [], onEnter, placeholder = "Теги" },
  ref,
) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  function commit(raw = text) {
    const next = cleanTags([...value, ...raw.split(",")]);
    if (next.length !== value.length) onChange(next);
    setText("");
  }

  const quick = recent.filter((t) => !value.includes(t)).slice(0, 3);

  return (
    <div className="tag-field">
      <div className="tag-input" onClick={() => input.current?.focus()}>
        {value.map((t) => (
          <span key={t} className="tag">
            {t}
            <button type="button" tabIndex={-1} title="Убрать тег" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(value.filter((x) => x !== t))}>
              ×
            </button>
          </span>
        ))}
        <input
          ref={input}
          className="tag-text"
          value={text}
          list={listId}
          placeholder={value.length ? "" : placeholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) commit(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) commit();
              else onEnter?.();
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && commit()}
        />
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {quick.length > 0 && (
        <div className="tag-recent">
          <span>Недавние:</span>
          {quick.map((t) => (
            // mousedown не забирает фокус — иначе правка слова закрылась бы
            <button key={t} type="button" tabIndex={-1} className="tag" title="Добавить тег" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange([...value, t])}>
              + {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
