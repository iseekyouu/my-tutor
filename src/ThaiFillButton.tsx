import { useState, type ReactNode } from "react";
import { api } from "./api";
import { SpeakButton } from "./SpeakButton";

type Props = {
  word: string;
  english: string;
  translation: string;
  onFill: (thai: string) => void;
  /** Поле ввода, к которому пристыкована кнопка */
  children: ReactNode;
  /** Тайское написание из поля — для кнопки «Послушать» */
  thai: string;
};

/** Поле тайского написания с кнопками внутри: 🔊 — послушать, искра — подставить написание от Gemini по слову и переводу. */
export function ThaiFillButton({ word, english, translation, thai, onFill, children }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fill() {
    if (!word.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      onFill((await api.suggestThai({ word, english, translation })).thai);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="thai-field">
      <div className="thai-box">
        {children}
        <div className="field-actions">
          <SpeakButton text={{ word, thai, english, translation }} className="field-btn" onThai={thai.trim() ? undefined : onFill} />
          <button
            type="button"
            className="field-btn fill-thai"
            tabIndex={-1} // Tab идёт по полям, минуя кнопку
            title={word.trim() ? "Заполнить тайское написание (Gemini)" : "Сначала введите слово"}
            onMouseDown={(e) => e.preventDefault()} // не забирает фокус — правка слова не закрывается
            onClick={fill}
            disabled={!word.trim() || busy}
            aria-busy={busy}
          >
            {busy ? "…" : <SparkIcon />}
          </button>
        </div>
      </div>
      {error && <p className="warn fill-error">{error}</p>}
    </div>
  );
}

/** Значок «искры» в цвет акцента */
function SparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" />
      <path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" opacity=".7" />
    </svg>
  );
}
