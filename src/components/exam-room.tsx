"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { AttemptData } from "@/lib/client-types";
import { ReadingPassage } from "./reading-passage";
import { UiDialog } from "./ui-dialog";
import { StudentRoomBara } from "./student-room-bara";

type Questions = AttemptData["questions"];
type NavigatorProps = {
  questions: Questions;
  answers: AttemptData["answers"];
  index: number;
  onJump: (position: number) => void;
  busy: boolean;
};

function QuestionMap({ questions, answers, index, onJump, busy }: NavigatorProps) {
  return <nav className="exam-room-map" aria-label="Navigasi soal">
    {questions.map((question, position) => {
      const answered = answers[question.id] !== undefined;
      return <button key={question.id} type="button" disabled={busy}
        aria-current={index === position ? "step" : undefined}
        aria-label={`Soal ${position + 1}, ${answered ? "terjawab" : "kosong"}`}
        className={answered ? "is-answered" : undefined} onClick={() => onJump(position)}>
        {position + 1}{answered && <span aria-hidden="true">✓</span>}
      </button>;
    })}
  </nav>;
}

type ExamRoomProps = NavigatorProps & {
  sectionTitle: string;
  sessionLabel: string;
  clock: string | null;
  urgent: boolean;
  lastSection: boolean;
  speaking: boolean;
  error: string;
  reviewOpen: boolean;
  onReview: (open: boolean) => void;
  onChoose: (choice: number) => void;
  onPlay: () => void;
  onSubmit: () => void;
};

export function ExamRoom({ questions, answers, index, onJump, busy, sectionTitle, sessionLabel, clock, urgent,
  lastSection, speaking, error, reviewOpen, onReview, onChoose, onPlay, onSubmit }: ExamRoomProps) {
  const question = questions[index];
  const answered = questions.filter(item => answers[item.id] !== undefined).length;
  const blank = questions.length - answered;
  const isLastQuestion = index === questions.length - 1;
  const card = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const previousQuestion = useRef(question.id);
  const navigator = { questions, answers, index, onJump, busy };

  useEffect(() => {
    if (previousQuestion.current === question.id) return;
    previousQuestion.current = question.id;
    const frame = requestAnimationFrame(() => {
      title.current?.focus({ preventScroll: true });
      card.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [question.id]);

  return <main className="exam-room">
    <header className="exam-room-header">
      <div className="exam-room-bar">
        <div className="exam-room-brand"><span className="brand-mark" aria-hidden="true">I.</span><span>ITP Practice Lab</span></div>
        {clock === null ? <span className="exam-room-clock"><span className="student-room-bara-status"><StudentRoomBara /><span className="student-room-bara-time">Tanpa timer</span></span></span>
          : <div className={`exam-room-clock${urgent ? " is-urgent" : ""}`} role="timer" aria-live="off"><div className="student-room-bara-status"><StudentRoomBara /><div className="student-room-bara-time">
            <span>Waktu tersisa</span><strong>{clock}</strong>
          </div></div></div>}
      </div>
    </header>

    <div className="exam-room-layout">
      <section className="exam-room-card exam-room-question" ref={card} aria-labelledby="exam-room-prompt">
        <div className="exam-room-meta">
          <div><span className="exam-room-kicker">{sessionLabel}</span><p>{sectionTitle}</p></div>
          <button type="button" className="exam-room-button" disabled={busy} onClick={() => onReview(true)}>Daftar soal</button>
        </div>
        <p className="exam-room-position"><strong>Soal {index + 1} / {questions.length}</strong><span>{answered} terjawab</span></p>
        <h1 id="exam-room-prompt" className="exam-room-prompt" ref={title} tabIndex={-1}>{question.prompt}</h1>

        {question.kind === "audio" ? <div className="exam-room-audio">
          <div><strong>{question.group ? "Dengarkan paparan" : "Dengarkan dialog"}</strong><p>Audio latihan dapat diputar ulang.</p></div>
          <button type="button" className="exam-room-button" onClick={onPlay}>{speaking ? "Putar ulang" : "Putar audio"}</button>
        </div> : question.kind === "passage" ? <ReadingPassage text={question.stimulus} prompt={question.prompt} />
          : question.stimulus && <div className="exam-room-stimulus">{question.stimulus}</div>}

        <fieldset className="exam-room-choices">
          <legend>Pilih jawaban</legend>
          {question.options.map((option, choice) => {
            const selected = answers[question.id] === choice;
            return <button key={choice} type="button" className="exam-room-choice" aria-pressed={selected}
              aria-disabled={busy} onClick={() => { if (!busy) onChoose(choice); }}>
              <span className="exam-room-letter">{String.fromCharCode(65 + choice)}</span>
              <span className="exam-room-choice-text">{option}</span>
              {selected && <span aria-hidden="true">✓</span>}
            </button>;
          })}
        </fieldset>

        {!reviewOpen && error && <p className="error-banner" role="alert">{error}</p>}
        <p className="exam-room-status" role="status">{error ? "" : busy && !reviewOpen ? "Menyimpan jawaban…"
          : answers[question.id] !== undefined ? "Jawaban tersimpan" : "Belum dijawab"}</p>
        <div className="exam-room-actions">
          <button type="button" className="exam-room-button" disabled={index === 0 || busy} onClick={() => onJump(index - 1)}>Sebelumnya</button>
          <button type="button" className="exam-room-button is-primary" disabled={busy}
            onClick={() => isLastQuestion ? onReview(true) : onJump(index + 1)}>{isLastQuestion ? "Tinjau jawaban" : "Berikutnya"}</button>
        </div>
        <Link className="exam-room-exit" href="/" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>Simpan &amp; kembali nanti</Link>
      </section>

      <aside className="exam-room-card exam-room-overview" aria-label="Progres bagian">
        <h2>Progres bagian</h2>
        <p className="exam-room-count"><span>Terjawab</span><strong>{answered} / {questions.length}</strong></p>
        <progress className="exam-room-progress" aria-label="Jumlah soal terjawab" max={questions.length} value={answered} />
        <QuestionMap {...navigator} />
        <button type="button" className="exam-room-button" disabled={busy} onClick={() => onReview(true)}>Tinjau jawaban</button>
      </aside>
    </div>

    {reviewOpen && <UiDialog title="Tinjau jawaban" onClose={() => { if (!busy) onReview(false); }}>
      <div className="exam-room-review">
        <p className="exam-room-count"><strong>{answered} terjawab</strong><span>{blank} kosong</span></p>
        <p>Pilih nomor untuk kembali ke soal. Tanda ✓ menunjukkan soal yang sudah dijawab.</p>
        <QuestionMap {...navigator} onJump={position => { onReview(false); onJump(position); }} />
        <p>{lastSection ? "Setelah dikumpulkan, jawaban dikunci dan hasil ditampilkan."
          : "Setelah lanjut, jawaban bagian ini dikunci."}{blank > 0 && ` ${blank} soal akan tetap kosong.`}</p>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <div className="exam-room-actions">
          <button type="button" className="exam-room-button" disabled={busy} onClick={() => onReview(false)}>Kembali ke soal</button>
          <button type="button" className="exam-room-button is-primary" disabled={busy} onClick={onSubmit}>
            {busy ? "Memproses…" : lastSection ? "Kumpulkan jawaban" : "Kunci & lanjutkan"}
          </button>
        </div>
      </div>
    </UiDialog>}
  </main>;
}
