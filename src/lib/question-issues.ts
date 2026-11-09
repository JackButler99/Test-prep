import "server-only";
import { randomUUID } from "node:crypto";
import { assertRole } from "./access";
import type { User } from "./auth";
import { db, transaction } from "./db";
import { audit } from "./experiments";
import { HttpError } from "./http";

export function reportQuestion(user: User, input: Record<string, unknown>) {
  assertRole(user, "student");
  const { attemptId, revisionId } = input;
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (typeof attemptId !== "string" || typeof revisionId !== "string" || note.length < 10 || note.length > 1000) {
    throw new HttpError("Pilih soal dan tulis penjelasan 10–1.000 karakter.", 400);
  }
  transaction(() => {
    const connection = db();
    const response = connection.prepare(`SELECT 1 FROM assessment_attempts a
      JOIN assessment_responses r ON r.attempt_id=a.id WHERE a.id=? AND a.user_id=? AND a.status='finished' AND r.revision_id=?`)
      .get(attemptId, user.id, revisionId);
    if (!response) throw new HttpError("Soal tidak ditemukan dalam sesi yang sudah selesai.", 404);
    const inserted = connection.prepare(`INSERT INTO question_issue_reports (id,user_id,attempt_id,revision_id,note,created_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,attempt_id,revision_id) DO NOTHING`).run(randomUUID(), user.id, attemptId, revisionId, note, Date.now());
    if (!inserted.changes) throw new HttpError("Soal ini sudah dilaporkan dari sesi tersebut.", 409);
  });
}

export function openQuestionIssues(user: User) {
  assertRole(user, "admin");
  return db().prepare(`SELECT id, revision_id, note, created_at FROM question_issue_reports
    WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 100`).all() as { id: string; revision_id: string; note: string; created_at: number }[];
}

export function resolveQuestionIssue(user: User, id: unknown) {
  assertRole(user, "admin");
  if (typeof id !== "string") throw new HttpError("Laporan tidak valid.", 400);
  transaction(() => {
    const changed = db().prepare("UPDATE question_issue_reports SET resolved_at=? WHERE id=? AND resolved_at IS NULL").run(Date.now(), id);
    if (!changed.changes) throw new HttpError("Laporan sudah selesai atau tidak ditemukan.", 409);
    audit(user.id, "question.issue.resolved", id);
  });
}
