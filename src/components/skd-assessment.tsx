"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PackageSnapshot, PublicAssessment } from "@/lib/learning-types";
import { SKD_SECTIONS, skdFigure } from "@/lib/skd-format";
import { ConfirmDialog } from "./ui-dialog";
import { SkdFigureOrText } from "./skd-figure";
import "./skd-assessment.css";
import { StudentRoomBara } from "./student-room-bara";

const previewBackHref = "/manage/packages#package-list";

function SkdPreviewBackLink() {
  return <Link className="button ghost skd-preview-back" href={previewBackHref} aria-label="Kembali ke Materi latihan">
    <span aria-hidden="true">←</span> Kembali
  </Link>;
}

function finishPreview(data: PublicAssessment, snapshot: PackageSnapshot): PublicAssessment {
  const details = snapshot.questions.map(question => {
    const selected = data.answers[question.id] ?? null;
    return { id: question.id, selected, answer: question.answer, explanation: question.explanation,
      points: selected === null ? 0 : question.scores[selected], maxPoints: 5, observedMs: 0, optionScores: question.scores };
  });
  return { ...data, status: "finished", finishedAt: Date.now(), deadline: null, result: {
    points: details.reduce((total, row) => total + row.points, 0),
    maxPoints: details.length * 5,
    correct: details.filter(row => row.selected === row.answer).length,
    total: details.length, details,
  } };
}

export function SkdAssessment({ initial, preview }: { initial: PublicAssessment; preview?: PackageSnapshot }) {
  const [data, setData] = useState(initial);
  const [position, setPosition] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const pending = useRef(false);
  const questionCard = useRef<HTMLElement>(null);
  const endpoint = `/api/assessments/${encodeURIComponent(data.id)}`;

  useEffect(() => {
    if (data.status === "finished") return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [data.status]);

  async function act(action?: Record<string, unknown>) {
    if (pending.current) return;
    if (preview) {
      if (!action || action.action === "advance") setData(current => finishPreview(current, preview));
      else {
        const id = String(action.questionId);
        const choice = action.choice as number | null;
        setData(current => {
          const answers = { ...current.answers };
          if (choice === null) delete answers[id]; else answers[id] = choice;
          return { ...current, answers };
        });
      }
      return;
    }
    pending.current = true;
    if (action) setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, action
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }
        : { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw Error(result.error ?? "Sesi belum bisa diperbarui.");
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sesi belum bisa diperbarui.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const remaining = data.deadline === null || now === null ? null : Math.max(0, Math.ceil((data.deadline - now) / 1000));
  useEffect(() => {
    if (remaining !== 0 || data.status !== "active") return;
    void act();
    const retry = window.setInterval(() => void act(), 3000);
    return () => window.clearInterval(retry);
  }, [remaining, data.status]);

  const selected = data.questions[position];
  const answered = Object.keys(data.answers).length;
  const clock = remaining === null ? "—" : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  if (data.status === "finished" && data.result) return <SkdResults data={data} preview={!!preview} />;
  if (!selected) return <main className="skd-shell">
    {preview && <SkdPreviewBackLink />}
    <p>Soal sesi ini belum tersedia.</p>
  </main>;
  const hasFigure = Boolean(skdFigure(selected.stimulus));
  return <main className="skd-shell">
    {preview && <SkdPreviewBackLink />}
    <header className="skd-top">
      <div><span className="eyebrow">{preview ? "PRATINJAU ADMIN" : "LATIHAN CPNS INDEPENDEN"} · ACUAN {data.skd?.year}</span>
        <h1>{data.title}</h1>
        {!preview && <Link href="/">Simpan dan kembali ke beranda</Link>}</div>
      <div className="skd-clock"><div className="student-room-bara-status"><StudentRoomBara /><div className="student-room-bara-time"><span>{data.deadline === null ? "Waktu latihan" : "Sisa waktu gabungan"}</span>
        <strong>{data.deadline === null ? "Tanpa timer" : clock}</strong></div></div></div>
    </header>
    {preview && <p className="muted">Jawaban dan hasil pratinjau ada di tab ini.</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="skd-workspace">
      <article className="workspace-card skd-question" ref={questionCard}>
        <p className="muted">{selected.section.toUpperCase()} · Soal {position + 1} dari {data.questions.length} · {selected.skill}</p>
        {selected.stimulus && <div className="skd-stimulus"><SkdFigureOrText value={selected.stimulus} /></div>}
        <h2>{selected.prompt}</h2>
        <fieldset className={hasFigure ? "skd-figure-options" : undefined} disabled={busy || remaining === 0}>
          <legend className="sr-only">Pilih jawaban</legend>
          {selected.options.map((option, index) => <label className="skd-option" key={index}>
            <input type="radio" name={selected.id} checked={data.answers[selected.id] === index}
              onChange={() => void act({ action: "answer", questionId: selected.id, choice: index })} />
            <strong>{String.fromCharCode(65 + index)}</strong><SkdFigureOrText value={option} />
          </label>)}
        </fieldset>
        <div className="skd-actions">
          <button className="button ghost" type="button" disabled={busy || position === 0} onClick={() => setPosition(position - 1)}>← Sebelumnya</button>
          <button className="button ghost" type="button" disabled={busy || remaining === 0 || data.answers[selected.id] === undefined}
            onClick={() => void act({ action: "answer", questionId: selected.id, choice: null })}>Kosongkan</button>
          <button className="button primary" type="button" disabled={busy || position === data.questions.length - 1} onClick={() => setPosition(position + 1)}>Berikutnya →</button>
        </div>
      </article>
      <aside className="workspace-card skd-navigator">
        <h2>Navigasi soal</h2>
        <p>{answered} dari {data.questions.length} terjawab</p>
        <nav aria-label="Nomor soal SKD">
          {data.sections.map(section => <div className="skd-nav-part" key={section.key}>
            <h3>{section.title}</h3>
            <div className="skd-number-grid">
              {data.questions.map((question, index) => question.section === section.key && <button type="button" key={question.id}
                className={data.answers[question.id] === undefined ? "" : "answered"} disabled={busy}
                aria-current={index === position ? "step" : undefined} onClick={() => {
                  setPosition(index);
                  questionCard.current?.scrollIntoView({ block: "nearest" });
                }}
                aria-label={`Soal ${index + 1}, ${data.answers[question.id] === undefined ? "kosong" : "terjawab"}`}>{index + 1}</button>)}
            </div>
          </div>)}
        </nav>
        <button className="button primary" type="button" disabled={busy || remaining === 0} onClick={() => setConfirm(true)}>Kumpulkan jawaban</button>
      </aside>
    </div>
    {confirm && <ConfirmDialog title="Kumpulkan jawaban?" description={`${data.questions.length - answered} soal masih kosong. Hasil latihan muncul setelah jawaban dikumpulkan.`}
      confirmLabel="Kumpulkan" busy={busy} onClose={() => setConfirm(false)} onConfirm={() => {
        setConfirm(false);
        void act({ action: "advance", sectionIndex: 0 });
      }} />}
  </main>;
}

function SkdResults({ data, preview }: { data: PublicAssessment; preview: boolean }) {
  const result = data.result!;
  const rows = new Map(result.details.map(row => [row.id, row]));
  return <main className="skd-shell">
    {preview && <SkdPreviewBackLink />}
    <header className="skd-top">
      <div><span className="eyebrow">HASIL {preview ? "PRATINJAU" : "LATIHAN"} · ACUAN {data.skd?.year}</span>
        <h1>{data.title}</h1><p>{data.skd?.mode === "full"
          ? "Bandingkan poin latihan dengan ambang batas kebutuhan umum CPNS 2024. Hasil ini tidak memprediksi kelulusan seleksi."
          : "Poin latihan berdasarkan bobot pada paket ini."}</p></div>
      <div className="skd-clock"><span>Total poin</span><strong>{result.points} / {result.maxPoints}</strong></div>
    </header>
    <div className="skd-score-grid">
      {data.sections.map(section => {
        const scores = data.questions.filter(question => question.section === section.key).map(question => rows.get(question.id)!);
        const points = scores.reduce((total, row) => total + row.points, 0);
        const threshold = data.skd?.mode === "full" ? SKD_SECTIONS.find(part => part.key === section.key)?.generalThreshold : undefined;
        return <article className="workspace-card" key={section.key}>
          <h2>{section.title}</h2><strong>{points} / {scores.reduce((total, row) => total + row.maxPoints, 0)} poin</strong>
          {threshold !== undefined && <p>{points >= threshold ? `Ambang ${threshold} tercapai` : `Kurang ${threshold - points} poin dari ambang ${threshold}`}</p>}
          <p>{scores.filter(row => row.selected === null).length} soal kosong</p>
        </article>;
      })}
    </div>
    {data.sections.map(section => <section className="workspace-section" key={section.key}>
      <h2>Pembahasan {section.title}</h2>
      {data.questions.map((question, index) => {
        if (question.section !== section.key) return null;
        const row = rows.get(question.id)!;
        return <details className="workspace-card skd-review" key={question.id}>
          <summary><strong>Soal {index + 1} · {question.skill}</strong><span>{row.points} / {row.maxPoints} poin</span></summary>
          {question.stimulus && <div className="skd-stimulus"><SkdFigureOrText value={question.stimulus} /></div>}
          <p>{question.prompt}</p>
          <ol type="A">
            {question.options.map((option, i) => <li key={i}><SkdFigureOrText value={option} />
              {section.key === "tkp" && row.optionScores && <small>{row.optionScores[i]} poin</small>}
              {i === row.selected && <small>Pilihanmu</small>}
              {i === row.answer && <small>{section.key === "tkp" ? "Bobot tertinggi" : "Kunci"}</small>}
            </li>)}
          </ol>
          <p className="preserve-text">{row.explanation}</p>
        </details>;
      })}
    </section>)}
    <Link className={`button ${!preview && data.skd?.mode === "practice" ? "primary" : "ghost"}`}
      href={preview ? previewBackHref : "/belajar/cpns-skd?mode=latihan"}>
      {preview ? "Kembali ke Materi latihan" : data.skd?.mode === "practice" ? "Lihat paket simulasi SKD" : "Kembali ke daftar paket"}
    </Link>
  </main>;
}
