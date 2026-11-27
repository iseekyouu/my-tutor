import { forwardRef, useImperativeHandle, useRef, useState } from "react";

// Гласные транслитерации и пять тонов: средний (черта, ā), низкий, нисходящий,
// высокий, восходящий. Кнопка вставляет гласную с тоном в позицию курсора.
const VOWELS = ["a", "e", "i", "o", "u"];
const TONES = [
  { mark: "\u0304", name: "средний" },
  { mark: "̀", name: "низкий" },
  { mark: "̂", name: "нисходящий" },
  { mark: "́", name: "высокий" },
  { mark: "̌", name: "восходящий" },
];

type Props = {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Показывать панель гласных с тонами (не нужна для полей с русским переводом) */
  tones?: boolean;
};

export type ToneInputHandle = { focus: () => void };

export const ToneInput = forwardRef<ToneInputHandle, Props>(function ToneInput(
  { value, onChange, onEnter, placeholder, disabled, autoFocus, className, tones = true },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(true);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }));

  function insert(text: string) {
    const el = input.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = (value.slice(0, start) + text).normalize("NFC");
    onChange(before + value.slice(end));
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
        {tones && (
          <button
            type="button"
            tabIndex={-1} // Tab идёт сразу к следующему полю, минуя кнопки тонов
            className={"tone-toggle" + (open ? " active" : "")}
            title="Гласные с тонами"
            onClick={() => setOpen(!open)}
            disabled={disabled}
          >
            тон
          </button>
        )}
      </div>
      {tones && open && !disabled && (
        <div className="tone-grid">
          {VOWELS.flatMap((v) =>
            TONES.map((t) => {
              const letter = (v + t.mark).normalize("NFC");
              return (
                <button
                  key={letter}
                  type="button"
                  tabIndex={-1}
                  title={`${v} — ${t.name} тон`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(letter)}
                >
                  {letter}
                </button>
              );
            }),
          )}
        </div>
      )}
    </div>
  );
});
