"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicAssessment } from "@/lib/learning-types";

const PARTS = { A: "Dialog pendek", B: "Percakapan panjang", C: "Paparan" };

export function ItpListening({ id, data, now, busy, online, act, sync }: {
  id: string;
  data: PublicAssessment & { listening: NonNullable<PublicAssessment["listening"]> };
  now: number;
  busy: boolean;
  online: boolean;
  act: (payload: Record<string, unknown>) => Promise<void>;
  sync: () => Promise<void>;
}) {
  const question = data.questions[0], listening = data.listening;
  const player = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);
  const source = useRef<string | null>(null);
  const syncing = useRef(false);
  const [loading, setLoading] = useState(false);
  const [playback, setPlayback] = useState<"idle" | "ready" | "playing" | "done">("idle");
  const [audioError, setAudioError] = useState("");

  useEffect(() => () => {
    request.current?.abort();
    if (source.current) URL.revokeObjectURL(source.current);
  }, []);

  async function refreshQuestion() {
    if (syncing.current) return;
    syncing.current = true;
    try { await sync(); } catch { /* The normal session poll also retries. */ }
    finally { syncing.current = false; }
  }

  useEffect(() => {
    if (listening.audioUntil !== null && now >= listening.audioUntil && !question.options.length && online) {
      void refreshQuestion();
    }
  }, [now, listening.audioUntil, question.options.length, online]);

  async function play() {
    try {
      await player.current?.play();
      setPlayback("playing");
      setAudioError("");
    } catch {
      setPlayback("ready");
      setAudioError("Tekan Mulai pemutaran untuk mengaktifkan suara di browser.");
    }
  }

  async function loadClip() {
    if (request.current || source.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setAudioError("");
    try {
      const response = await fetch(`/api/assessments/${id}/listening`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ questionId: question.id }),
      });
      if (!response.ok) throw Error((await response.json()).error);
      const blob = await response.blob();
      if (controller.signal.aborted || !player.current) return;
      source.current = URL.createObjectURL(blob);
      player.current.src = source.current;
      await play();
    } catch (error) {
      if (!controller.signal.aborted) setAudioError(error instanceof Error ? error.message : "Audio gagal dimuat.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) {
        setLoading(false);
        void refreshQuestion();
      }
    }
  }

  const canAnswer = question.options.length > 0 && playback !== "ready" && playback !== "playing";
  return <article className="workspace-card assessment-question">
    <div className="question-heading"><span className="status-badge neutral">Soal {listening.position} dari {listening.total}</span><span>Part {listening.part} · {PARTS[listening.part]}</span></div>
    <h2>Dengarkan soal Listening</h2>
    <p>Audio diputar sekali. Selesaikan soal ini sebelum melanjutkan.</p>
    <audio ref={player} preload="none" onEnded={() => { setPlayback("done"); void refreshQuestion(); }}
      onError={() => { setPlayback("done"); setAudioError("Audio terputus. Beri tahu instruktur setelah sesi."); }} />
    {audioError && <p className="error-banner" role="alert">{audioError}</p>}
    {playback === "ready" ? <button type="button" className="button primary" onClick={() => void play()}>Mulai pemutaran</button>
      : listening.audioUntil === null && playback === "idle" ? <button type="button" className="button primary" disabled={loading || !online} onClick={() => void loadClip()}>{loading ? "Memuat audio…" : "Putar audio"}</button>
      : !canAnswer && <p role="status">Tunggu sampai audio selesai.</p>}
    {canAnswer && <>
      <fieldset disabled={busy || !online}><legend>Pilih jawaban</legend>{question.options.map((option, i) =>
        <label className={`assessment-option ${data.answers[question.id] === i ? "selected" : ""}`} key={i}>
          <input type="radio" name={question.id} checked={data.answers[question.id] === i} onChange={() => void act({ action: "answer", questionId: question.id, choice: i })} />
          <span className="option-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span><span>{option}</span>
        </label>)}
      </fieldset>
      <button className="text-button" type="button" disabled={busy || !online || data.answers[question.id] === undefined}
        onClick={() => void act({ action: "answer", questionId: question.id, choice: null })}>Kosongkan jawaban</button>
      <button className="button primary" type="button" disabled={busy || !online} onClick={() => void act({ action: "listeningNext", questionId: question.id })}>
        {listening.position === listening.total ? "Selesaikan Listening" : data.answers[question.id] === undefined ? "Lewati soal" : "Soal berikutnya"}
      </button>
    </>}
  </article>;
}
