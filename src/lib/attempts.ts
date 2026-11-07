import "server-only";
import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { getQuestions, publicQuestion, type Section } from "./questions";
import { recordPracticeEvent } from "./experiments";
import { HttpError } from "./http";
import { optionOrder } from "./option-order";

export const SECTIONS: Section[] = ["listening", "structure", "reading"];
export const DURATIONS = { listening: 35 * 60_000, structure: 25 * 60_000, reading: 55 * 60_000 };
export type Mode = "full" | "practice";
type AttemptRow = {
  id: string; user_id: string; mode: Mode; section: Section | null;
  status: "active" | "finished"; section_index: number;
  started_at: number; deadline: number | null; finished_at: number | null; answers: string; assignment_id: string | null; option_seed: string | null;
};

export function createAttempt(userId: string, mode: Mode, section?: Section, assignmentId?: string) {
  if (mode === "practice" && (!section || !SECTIONS.includes(section))) throw new Error("Invalid practice section");
  const id = randomUUID();
  const now = Date.now();
  db().prepare(`INSERT INTO attempts(id, user_id, mode, section, status, section_index, started_at, deadline,assignment_id,option_seed)
    VALUES (?, ?, ?, ?, 'active', 0, ?, ?, ?, ?)`).run(id, userId, mode, mode === "practice" ? section! : null,
    now, mode === "full" ? now + DURATIONS.listening : null,assignmentId ?? null, randomUUID());
  if (mode === "practice" && !assignmentId) recordPracticeEvent(userId,"start",now);
  return id;
}

function finish(row: AttemptRow, when: number) {
  db().prepare("UPDATE attempts SET status = 'finished', finished_at = ?, deadline = NULL WHERE id = ?")
    .run(when, row.id);
  row.status = "finished";
  row.finished_at = when;
  row.deadline = null;
  if (row.mode === "practice" && !row.assignment_id) {
    const questions = getQuestions(row.mode,row.section!);
    const answers = JSON.parse(row.answers) as Record<string,number>;
    if (questions.every(q=>answers[q.id] !== undefined)) recordPracticeEvent(row.user_id,"complete",when,row.started_at);
  }
}

function nextSection(row: AttemptRow, when: number) {
  if (row.section_index >= 2) return finish(row, when);
  row.section_index += 1;
  row.deadline = when + DURATIONS[SECTIONS[row.section_index]];
  db().prepare("UPDATE attempts SET section_index = ?, deadline = ? WHERE id = ?")
    .run(row.section_index, row.deadline, row.id);
}

function settleAttempt(id: string, userId: string, now: number): AttemptRow | null {
  const row = db().prepare("SELECT * FROM attempts WHERE id = ? AND user_id = ?")
    .get(id, userId) as AttemptRow | undefined;
  if (!row) return null;
  while (row.status === "active" && row.mode === "full" && row.deadline !== null && now >= row.deadline) {
    nextSection(row, row.deadline);
  }
  return row;
}

export function loadAttempt(id: string, userId: string) {
  return transaction(() => settleAttempt(id, userId, Date.now()));
}

export function serializeAttempt(row: AttemptRow) {
  const questions = getQuestions(row.mode, row.section || undefined);
  const available = row.status === "active" && row.mode === "full"
    ? questions.filter(q => q.section === SECTIONS[row.section_index])
    : questions;
  const stored = JSON.parse(row.answers) as Record<string, number>;
  const answers: Record<string, number> = {};
  const details: { id: string; selected: number | null; correct: number; explanation: string; section: Section }[] = [];
  const publicQuestions = available.map(question => {
    const order = optionOrder(question.kind === "error" ? null : row.option_seed, question.id, question.options.length);
    const selected = order.indexOf(stored[question.id]);
    if (selected >= 0) answers[question.id] = selected;
    if (row.status === "finished") {
      details.push({ id: question.id, selected: selected < 0 ? null : selected, correct: order.indexOf(question.answer),
        explanation: question.explanation, section: question.section });
    }
    return { ...publicQuestion(question), options: order.map(index => question.options[index]) };
  });
  const base = {
    id: row.id, mode: row.mode, section: row.section, status: row.status,
    sectionIndex: row.section_index, startedAt: row.started_at,
    deadline: row.deadline, finishedAt: row.finished_at, answers, questions: publicQuestions,
  };
  if (row.status !== "finished") return base;
  const summary = SECTIONS.filter(s => row.mode === "full" || s === row.section).map(section => {
    const subset = details.filter(d => d.section === section);
    return { section, correct: subset.filter(d => d.selected === d.correct).length, total: subset.length,
      answered: subset.filter(d => d.selected !== null).length };
  });
  return { ...base, details, summary, totalCorrect: summary.reduce((sum, s) => sum + s.correct, 0) };
}

export function saveAnswer(id: string, userId: string, questionId: string, choice: number | null) {
  const saved = transaction(() => {
    const row = settleAttempt(id, userId, Date.now());
    if (!row) throw new HttpError("Sesi tidak ditemukan.", 404);
    if (row.status !== "active") return false;
    const question = getQuestions(row.mode, row.section || undefined).find(q => q.id === questionId);
    if (!question) throw new HttpError("Soal tidak ditemukan.", 400);
    if (row.mode === "full" && question.section !== SECTIONS[row.section_index]) return false;
    if (choice !== null && (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length)) {
      throw new HttpError("Pilihan jawaban tidak valid.", 400);
    }
    const answers = JSON.parse(row.answers) as Record<string, number>;
    if (choice === null) delete answers[questionId];
    else answers[questionId] = optionOrder(question.kind === "error" ? null : row.option_seed, question.id, question.options.length)[choice];
    db().prepare("UPDATE attempts SET answers = ? WHERE id = ?").run(JSON.stringify(answers), row.id);
    return { deadline: row.deadline };
  });
  if (!saved) throw new HttpError("Bagian telah berubah atau sesi selesai. Jawaban tidak tersimpan.", 409);
  return saved;
}

export function advanceAttempt(id: string, userId: string, expectedSectionIndex: number) {
  return transaction(() => {
    const now = Date.now();
    const row = settleAttempt(id, userId, now);
    if (!row) throw new HttpError("Sesi tidak ditemukan.", 404);
    if (row.status === "active" && row.section_index === expectedSectionIndex) {
      if (row.mode === "practice") finish(row, now); else nextSection(row, now);
    }
    return row;
  });
}

export function recentAttempts(userId: string) {
  const rows = db().prepare("SELECT * FROM attempts WHERE user_id = ? ORDER BY started_at DESC LIMIT 8")
    .all(userId) as AttemptRow[];
  return rows.map(row => {
    const updated = loadAttempt(row.id, userId)!;
    const answers = JSON.parse(updated.answers) as Record<string, number>;
    return { id: row.id, mode: row.mode, section: row.section, status: updated.status,
      startedAt: row.started_at, answered: Object.keys(answers).length,
      total: row.mode === "full" ? 140 : 10 };
  });
}
