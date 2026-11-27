import { forwardRef, useImperativeHandle, useRef, useState } from "react";

type Tone = { insert: string; label: string; title: string };

// Тайские тоновые знаки ставятся над согласной (после неё в строке)
const THAI: Tone[] = [
  { insert: "่", label: "ก่", title: "ไม้เอก (mai ek)" },
  { insert: "้", label: "ก้", title: "ไม้โท (mai tho)" },
  { insert: "๊", label: "ก๊", title: "ไม้ตรี (mai tri)" },
  { insert: "๋", label: "ก๋", title: "ไม้จัตวา (mai chattawa)" },
];

// Тоны в транслитерации: ставятся на гласную перед курсором
const LATIN: Tone[] = [
  { insert: "̀", label: "à", title: "низкий тон" },
  { insert: "̂", label: "â", title: "нисходящий тон" },
  { insert: "́", label: "á", title: "высокий тон" },
  { insert: "̌", label: "ǎ", title: "восходящий тон" },
];

type Props = {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
};

export type ToneInputHandle = { focus: () => void };

export const ToneInput = forwardRef<ToneInputHandle, Props>(function ToneInput(
  { value, onChange, onEnter, placeholder, disabled, autoFocus, className },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  function insert(mark: string) {
    const el = input.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = (value.slice(0, start) + mark).normalize("NFC");
    const next = before + value.slice(end);
    onChange(next);
    el.focus();
    requestAnimationFrame(() => {
      if (document.activeElement === el) el.setSelectionRange(before.length, before.length);
    });
  }

  return (
    <div className={"tone-input " + (className ?? "")}>
      <div className="tone-row">
        <input
          ref={input}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter?.();
            }
          }}
        />
        <button
          type="button"
          className={"tone-toggle" + (open ? " active" : "")}
          title="Тоны"
          onClick={() => setOpen(!open)}
          disabled={disabled}
        >
          тон
        </button>
      </div>
      {open && !disabled && (
        <div className="tone-bar">
          {THAI.map((t) => (
            <button key={t.insert} type="button" className="thai" title={t.title} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(t.insert)}>
              {t.label}
            </button>
          ))}
          <span className="sep" />
          {LATIN.map((t) => (
            <button key={t.insert} type="button" title={t.title} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(t.insert)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
