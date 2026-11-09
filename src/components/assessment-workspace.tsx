"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PublicAssessment } from "@/lib/learning-types";
import { ReadingPassage } from "./reading-passage";
import { UiDialog } from "./ui-dialog";

type Question = PublicAssessment["questions"][number];

export function AssessmentChoices({ question, choice, disabled, onAnswer }: {
  question: Question;
  choice?: number;
  disabled: boolean;
  onAnswer: (choice: number | null) => void;
}) {
  return <>
    <fieldset className="assessment-choices" disabled={disabled}>
      <legend>Pilih satu jawaban</legend>
      {question.options.map((option, index) => <label className="assessment-choice" key={index}>
        <input type="radio" name={question.id} checked={choice === index} onChange={() => onAnswer(index)} />
        <span className="assessment-choice-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
        <span className="assessment-choice-text">{option}</span>
        <span className="assessment-choice-mark" aria-hidden="true" />
      </label>)}
    </fieldset>
    <button className="assessment-control assessment-control-text" type="button"
      disabled={disabled || choice === undefined} onClick={() => onAnswer(null)}>Kosongkan jawaban</button>
  </>;
}

function QuestionMap({ data, position, flagged, busy, onJump }: {
  data: PublicAssessment; position: number; flagged: Record<string, boolean>; busy: boolean; onJump: (position: number) => void;
}) {
  return <nav className="assessment-question-map" aria-label="Navigasi soal">
    {data.questions.map((question, index) => {
      const answered = data.answers[question.id] !== undefined;
      const marked = flagged[question.id];
      return <button className={answered ? "is-answered" : undefined} key={question.id} type="button" disabled={busy}
        aria-current={index === position ? "step" : undefined}
        aria-label={`Soal ${index + 1}, ${answered ? "terjawab" : "kosong"}${marked ? ", ditandai" : ""}`}
        onClick={() => onJump(index)}>
        {index + 1}
        {answered && <span className="assessment-map-check" aria-hidden="true">✓</span>}
        {marked && <span className="assessment-map-flag" aria-hidden="true">★</span>}
      </button>;
    })}
  </nav>;
}

export function AssessmentWorkspace({ data, position, onJump, busy, online, onAction, speaking, onSpeak, onStop, listening, recordsViewingTime }: {
  data: PublicAssessment;
  position: number;
  onJump: (position: number) => void;
  busy: boolean;
  online: boolean;
  onAction: (action: Record<string, unknown>) => Promise<void>;
  speaking: boolean;
  onSpeak: () => void;
  onStop: () => void;
  listening?: ReactNode;
  recordsViewingTime: boolean;
}) {
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<{ mode: "map" | "review"; section: number } | null>(null);
  const question = data.questions[position];
  const title = useRef<HTMLHeadingElement>(null);
  const previousQuestion = useRef(question.id);
  const section = data.sections[data.sectionIndex];
  const answered = data.questions.filter(item => data.answers[item.id] !== undefined).length;
  const blank = data.questions.length - answered;
  const isLastSection = data.sectionIndex === data.sections.length - 1;
  const dialogMode = dialog?.section === data.sectionIndex ? dialog.mode : undefined;
  const disabled = busy || !online;
  const reading = question.section === "reading" && question.kind !== "audio" && !!question.stimulus;
  const open = (mode: "map" | "review") => setDialog({ mode, section: data.sectionIndex });

  function focusQuestion() {
    title.current?.focus({ preventScroll: true });
    title.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }

  useEffect(() => {
    if (previousQuestion.current === question.id) return;
    previousQuestion.current = question.id;
    const frame = requestAnimationFrame(focusQuestion);
    return () => cancelAnimationFrame(frame);
  }, [question.id]);

  function jump(next: number) {
    setDialog(null);
    onJump(next);
    if (next === position) requestAnimationFrame(focusQuestion);
  }

  async function advance() {
    await onAction({ action: "advance", sectionIndex: data.sectionIndex });
    setDialog(null);
  }

  const mapProps = { data, position, flagged, busy, onJump: jump };
  return <div className="assessment-wrap assessment-workspace">
    <section className="assessment-section-summary" aria-labelledby="assessment-section-title">
      <div>
        <p className="assessment-kicker">Bagian {data.sectionIndex + 1} dari {data.sections.length}</p>
        <h1 id="assessment-section-title">{section.title}</h1>
      </div>
      {data.sections.length > 1 && <ol className="assessment-section-steps" aria-label="Urutan bagian">
        {data.sections.map((item, index) => <li key={item.key}
          aria-current={index === data.sectionIndex ? "step" : undefined}
          className={index < data.sectionIndex ? "is-complete" : undefined}>
          <span aria-hidden="true">{index < data.sectionIndex ? "✓" : index + 1}</span>
          <span>{item.title}</span>
          {index < data.sectionIndex && <span className="sr-only">Selesai</span>}
        </li>)}
      </ol>}
    </section>
    {data.listening ? <div className="assessment-workspace-grid assessment-listening-grid">
      {listening}
      <aside className="assessment-surface assessment-overview" aria-label="Progres Listening">
        <h2>Progres Listening</h2>
        <p className="assessment-count"><span>Posisi soal</span><strong>{data.listening.position} / {data.listening.total}</strong></p>
        <progress aria-label="Posisi Listening" value={data.listening.position} max={data.listening.total} />
        <p className="assessment-help">Dengarkan setiap klip, lalu pilih jawaban atau lewati soal. Soal sebelumnya dikunci saat kamu lanjut.</p>
      </aside>
    </div> : <div className="assessment-workspace-grid">
      <section className="assessment-surface assessment-question-panel" aria-labelledby="assessment-prompt">
        <div className="assessment-question-tools">
          <span className="assessment-pill">Soal {position + 1} dari {data.questions.length}</span>
          <div>
            <button className="assessment-control assessment-map-trigger" type="button" disabled={busy}
              aria-label={`Daftar soal, ${answered} dari ${data.questions.length} terjawab`} onClick={() => open("map")}>
              Daftar soal <span>{answered}/{data.questions.length}</span>
            </button>
            <button className="assessment-control assessment-flag" type="button" aria-pressed={!!flagged[question.id]}
              onClick={() => setFlagged(current => ({ ...current, [question.id]: !current[question.id] }))}>
              <span aria-hidden="true">{flagged[question.id] ? "★" : "☆"}</span> {flagged[question.id] ? "Ditandai" : "Tandai soal"}
            </button>
          </div>
        </div>
        <div className={`assessment-question-content${reading ? " has-passage" : ""}`}>
          {reading && <div className="assessment-passage-pane" id="assessment-passage" key={question.stimulus} tabIndex={0} role="region" aria-label="Bacaan soal">
            <a className="assessment-control assessment-passage-jump" href="#assessment-prompt">Langsung ke pertanyaan ↓</a>
            <ReadingPassage text={question.stimulus} prompt={question.prompt} headingLevel={3} />
          </div>}
          <div className="assessment-question-main">
            {reading && <a className="assessment-control assessment-passage-jump" href="#assessment-passage">↑ Kembali ke bacaan</a>}
            {question.kind === "audio" ? <div className="assessment-audio-box">
              <div><strong>Naskah Listening</strong><p>Gunakan suara browser untuk mendengarkan soal.</p></div>
              <button className="assessment-control" type="button" onClick={speaking ? onStop : onSpeak}>
                {speaking ? "Hentikan audio" : "Putar audio"}
              </button>
            </div> : !reading && question.stimulus && <p className="assessment-stimulus">{question.stimulus}</p>}
            <h2 className="assessment-prompt" id="assessment-prompt" ref={title} tabIndex={-1}>{question.prompt}</h2>
            <AssessmentChoices question={question} choice={data.answers[question.id]} disabled={disabled}
              onAnswer={choice => void onAction({ action: "answer", questionId: question.id, choice })} />
          </div>
        </div>
        <div className="assessment-question-actions">
          <button className="assessment-control" type="button" disabled={busy || position === 0} onClick={() => jump(position - 1)}>← Sebelumnya</button>
          <button className="assessment-control assessment-control-primary" type="button" disabled={busy}
            onClick={() => position === data.questions.length - 1 ? open("review") : jump(position + 1)}>
            {position === data.questions.length - 1 ? "Tinjau jawaban" : "Berikutnya →"}
          </button>
        </div>
      </section>
      <aside className="assessment-surface assessment-overview" aria-label="Progres bagian">
        <h2>Progres bagian</h2>
        <p className="assessment-count"><span>Terjawab</span><strong>{answered} / {data.questions.length}</strong></p>
        <progress aria-label="Soal terjawab" value={answered} max={data.questions.length} />
        <QuestionMap {...mapProps} />
        <p className="assessment-help">✓ Terjawab · ★ Ditandai</p>
        <button className="assessment-control assessment-overview-action" type="button" disabled={busy} onClick={() => open("review")}>Tinjau jawaban</button>
      </aside>
    </div>}
    {recordsViewingTime && <p className="assessment-viewing-note">Waktu tampilan soal dicatat untuk evaluasi materi.</p>}
    {dialogMode && !data.listening && <UiDialog title={dialogMode === "map" ? "Daftar soal" : "Tinjau jawaban"} wide
      onClose={() => { if (!busy) setDialog(null); }}>
      <div className="assessment-review">
        <p className="assessment-count"><strong>{answered} terjawab</strong><span>{blank} kosong</span></p>
        <p className="assessment-help">Pilih nomor untuk kembali ke soal. ✓ menunjukkan jawaban terisi dan ★ menunjukkan soal ditandai.</p>
        <QuestionMap {...mapProps} />
        {dialogMode === "review" && <p className="assessment-review-note">
          {isLastSection ? "Setelah dikumpulkan, jawaban dikunci dan hasil ditampilkan." : "Setelah lanjut, jawaban bagian ini dikunci."}
          {blank > 0 && ` ${blank} soal akan tetap kosong.`}
        </p>}
        <div className="assessment-question-actions">
          <button className="assessment-control" type="button" disabled={busy} onClick={() => setDialog(null)}>Kembali ke soal</button>
          {dialogMode === "map"
            ? <button className="assessment-control assessment-control-primary" type="button" onClick={() => open("review")}>Tinjau jawaban</button>
            : <button className="assessment-control assessment-control-primary" type="button" disabled={disabled} onClick={() => void advance()}>
                {busy ? "Memproses…" : isLastSection ? "Kumpulkan jawaban" : "Kunci dan lanjutkan"}
              </button>}
        </div>
      </div>
    </UiDialog>}
  </div>;
}
