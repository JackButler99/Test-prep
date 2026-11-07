"use client";

import { useState, type FormEvent } from "react";
import type { PublicAssessment } from "@/lib/learning-types";
import { ReadingPassage } from "./reading-passage";

export function AssessmentReviewTools({ data, allowReport }: { data: PublicAssessment; allowReport: boolean }) {
  const [position, setPosition] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", error: false });
  const details = new Map(data.result?.details.map(detail => [detail.id, detail] as const));
  const missed = data.questions.filter(question => {
    const detail = details.get(question.id);
    return detail && detail.selected !== detail.answer;
  });
  const current = missed[position];
  const detail = current && details.get(current.id);

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setFeedback({ message: "", error: false });
    try {
      const response = await fetch("/api/question-issues", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: data.id, revisionId: fields.get("revisionId"), note: fields.get("note") }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      form.reset(); setFeedback({ message: "Laporan diterima untuk ditinjau admin.", error: false });
    } catch (error) { setFeedback({ message: error instanceof Error ? error.message : "Laporan belum terkirim.", error: true }); }
    finally { setBusy(false); }
  }

  if (!detail && !allowReport) return null;
  return <section className="workspace-section" aria-label="Tindak lanjut latihan">
    {current && detail && <details className="workspace-card">
      <summary>Latih ulang {missed.length} soal keliru atau kosong</summary>
      <p className="muted">Soal {position + 1} dari {missed.length} · latihan ulang mandiri</p>
      {current.stimulus && (current.section === "reading" && current.kind !== "audio"
        ? <ReadingPassage text={current.stimulus} prompt={current.prompt} />
        : <p className="preserve-text stimulus-panel">{current.stimulus}</p>)}
      <h3>{current.prompt}</h3>
      <div className="options">{current.options.map((option, index) => <button type="button" key={index}
        className={`option ${choice === index ? "chosen" : ""}`} aria-pressed={choice === index} onClick={() => setChoice(index)}>
        <span className="option-letter">{String.fromCharCode(65 + index)}</span>{option}
      </button>)}</div>
      {choice !== null && <p role="status"><strong>{choice === detail.answer ? "Tepat." : "Belum tepat."}</strong> {detail.explanation}</p>}
      <button type="button" className="button ghost" disabled={choice === null} onClick={() => {
        setPosition((position + 1) % missed.length); setChoice(null);
      }}>{position + 1 === missed.length ? "Ulang dari awal" : "Soal berikutnya"}</button>
    </details>}
    {allowReport && <details className="workspace-card">
      <summary>Laporkan soal</summary>
      <form className="platform-form" onSubmit={report} aria-busy={busy}>
        <label>Soal<select name="revisionId" required defaultValue="">
          <option value="" disabled>Pilih soal dari sesi ini</option>
          {data.questions.map((question, index) => <option key={question.id} value={question.id}>{index + 1}. {question.prompt.slice(0, 80)}</option>)}
        </select></label>
        <label>Masalah yang ditemukan<textarea name="note" minLength={10} maxLength={1000} rows={3} required /></label>
        <button className="button ghost" disabled={busy}>{busy ? "Mengirim…" : "Kirim laporan"}</button>
        {feedback.message && <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "error-banner" : "form-feedback"}>{feedback.message}</p>}
      </form>
    </details>}
  </section>;
}
