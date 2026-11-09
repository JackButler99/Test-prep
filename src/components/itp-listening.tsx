"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicAssessment } from "@/lib/learning-types";
import { AssessmentChoices } from "./assessment-workspace";

const PARTS = { A: "Dialog pendek", B: "Percakapan panjang", C: "Paparan" };

export function ItpListening({ id, data, now, busy, online, act, sync, loadPreviewAudio }: {
  id: string;
  data: PublicAssessment & { listening: NonNullable<PublicAssessment["listening"]> };
  now: number;
  busy: boolean;
  online: boolean;
  act: (payload: Record<string, unknown>) => Promise<void>;
  sync: () => Promise<void>;
  loadPreviewAudio?: (questionId: string, signal: AbortSignal) => Promise<Blob>;
}) {
  const question = data.questions[0], listening = data.listening;
  const player = useRef<HTMLAudioElement>(null);
  const request = useRef<AbortController | null>(null);
  const source = useRef<string | null>(null);
  const syncing = useRef(false);
  const [loading, setLoading] = useState(false);
  const [playback, setPlayback] = useState<"idle" | "ready" | "playing" | "done">("idle");
  const [audioError, setAudioError] = useState("");
  const [audioProgress, setAudioProgress] = useState(0);

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

  async function fetchAudio(signal: AbortSignal) {
    if (loadPreviewAudio) return loadPreviewAudio(question.id, signal);
    const response = await fetch(`/api/assessments/${id}/listening`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ questionId: question.id }),
    });
    if (!response.ok) throw Error((await response.json()).error);
    return response.blob();
  }

  async function loadClip() {
    if (request.current || source.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setAudioError("");
    try {
      const blob = await fetchAudio(controller.signal);
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
  const canLoad = listening.audioUntil === null && playback === "idle";
  const phase = canAnswer ? "Siap dijawab" : loading ? "Memuat audio" : playback === "playing" ? "Sedang diputar"
    : canLoad || playback === "ready" ? "Siap diputar" : "Menunggu pilihan jawaban";
  const choice = data.answers[question.id];
  return <article className="assessment-surface assessment-question-panel assessment-listening-panel" aria-labelledby="assessment-listening-title">
    <div className="assessment-question-tools">
      <span className="assessment-pill">Soal {listening.position} dari {listening.total}</span>
      <span className="assessment-listening-part">Part {listening.part} · {PARTS[listening.part]}</span>
    </div>
    <h2 className="assessment-prompt" id="assessment-listening-title">{canAnswer ? "Pilih jawaban Listening" : "Dengarkan klip Listening"}</h2>
    <div className="assessment-audio-box assessment-listening-audio">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 14v-2a9 9 0 0 1 18 0v2M3 13h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm18 0h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-5Z"/>
      </svg>
      <div className="assessment-audio-information">
        <strong role="status">{phase}</strong>
        {playback === "playing" ? <progress aria-label="Progres pemutaran audio" value={audioProgress} max={100} />
          : <p>{canAnswer ? "Jawab berdasarkan klip yang sudah diputar."
            : "Klip diputar sekali. Pilihan jawaban muncul setelah audio selesai."}</p>}
      </div>
      {playback === "ready" ? <button type="button" className="assessment-control assessment-control-primary" onClick={() => void play()}>Mulai pemutaran</button>
        : canLoad && <button type="button" className="assessment-control assessment-control-primary" disabled={loading || !online}
          onClick={() => void loadClip()}>{loading ? "Memuat audio…" : "Putar audio"}</button>}
    </div>
    <audio ref={player} preload="none" onTimeUpdate={event => {
      const { currentTime, duration } = event.currentTarget;
      if (Number.isFinite(duration) && duration > 0) setAudioProgress(Math.min(100, currentTime / duration * 100));
    }} onEnded={() => { setPlayback("done"); void refreshQuestion(); }}
      onError={() => { setPlayback("done"); setAudioError("Audio terputus. Beri tahu pengelola setelah sesi."); }} />
    {audioError && <p className="error-banner" role="alert">{audioError}</p>}
    {canAnswer && <>
      <AssessmentChoices question={question} choice={choice} disabled={busy || !online}
        onAnswer={choice => void act({ action: "answer", questionId: question.id, choice })} />
      <div className="assessment-listening-actions">
        <button className="assessment-control assessment-control-primary" type="button" disabled={busy || !online}
          onClick={() => void act({ action: "listeningNext", questionId: question.id })}>
          {listening.position === listening.total ? "Selesaikan Listening" : choice === undefined ? "Lewati soal →" : "Soal berikutnya →"}
        </button>
      </div>
    </>}
  </article>;
}
