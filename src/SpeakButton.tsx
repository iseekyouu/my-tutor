import { useState } from "react";
import { api, type SpeakText } from "./api";

let current: HTMLAudioElement | null = null;

type Props = {
  /** Сохранённое слово */
  id?: number;
  /** Или текст из полей формы (слово ещё не сохранено или правится) */
  text?: SpeakText;
  className?: string;
};

/** 🔊 — проигрывает произношение слова (голос Google, через сервер). */
export function SpeakButton({ id, text, className = "icon speak" }: Props) {
  // Озвучить можно тайское написание, перевод значения или слово тайскими буквами
  const empty = !!text && !text.thai.trim() && !text.english.trim() && !text.translation.trim() && !/[\u0E00-\u0E7F]/.test(text.word);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  function play(e: React.MouseEvent) {
    e.stopPropagation(); // в словаре клик по строке открывает правку
    current?.pause();
    const audio = new Audio(text ? api.ttsTextUrl(text) : api.ttsUrl(id!));
    current = audio;
    setState("loading");
    audio.onplaying = () => setState("idle");
    audio.onerror = () => setState("error");
    audio.play().catch(() => setState("error"));
  }

  return (
    <button
      type="button"
      className={className + (state === "error" ? " failed" : "")}
      title={empty ? "Нечего озвучивать: введите тайское написание или перевод" : state === "error" ? "Озвучка недоступна" : "Послушать"}
      tabIndex={text ? -1 : undefined} // в форме Tab идёт по полям
      disabled={empty}
      onMouseDown={(e) => e.preventDefault()}
      onClick={play}
      aria-busy={state === "loading"}
    >
      {state === "loading" ? "…" : <SpeakerIcon />}
    </button>
  );
}

/** Значок динамика в цвет текста кнопки */
function SpeakerIcon() {
  return (
    <svg width="1.1em" height="1.1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}
