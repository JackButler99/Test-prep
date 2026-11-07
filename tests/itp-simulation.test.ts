import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { register, type User } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { createClassroom, joinClassroom } from "../src/lib/classrooms";
import { createPackage, ensureLearningSeed, listBank, transitionPackage } from "../src/lib/learning-bank";
import { claimListeningAudio, createAssessmentTask, loadAssessment, mutateAssessment, publicAssessment, startAssessment } from "../src/lib/assessments";
import { ITP_TIMES, itpAudioPath } from "../src/lib/itp-simulation";

const directory = mkdtempSync(join(tmpdir(), "itp-simulation-"));
process.env.DATA_DIR = directory;
test.after(() => { db().close(); rmSync(directory, { recursive: true, force: true }); });

function account(username: string, role: User["role"]) {
  const user = register(username, "simulation-test-password");
  db().prepare("UPDATE users SET role=? WHERE id=?").run(role, user.id);
  return { ...user, role };
}

test("ITP listening locks transcript, audio replay, choices and sequence while keeping raw scores", () => {
  const teacher = account("pilot_teacher", "instructor"), student = account("pilot_student", "student");
  const other = account("pilot_outsider", "student");
  ensureLearningSeed();
  db().exec("UPDATE question_revisions SET state='published'");
  const bank = listBank(teacher, "published");
  const packageId = createPackage(teacher, { examId: "toefl-itp", title: "Pilot", revisionIds: bank.map(q => q.id), durations: ITP_TIMES });
  const bytes = Buffer.from("test audio asset");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const listening = Array.from({ length: 50 }, (_, i) => ({ sha256, durationMs: 1000, part: i < 31 ? "A" : i < 40 ? "B" : "C" }));
  db().prepare("UPDATE assessment_packages SET snapshot_json=json_set(snapshot_json,'$.itpSimulation',json(?)) WHERE id=?")
    .run(JSON.stringify({ listening }), packageId);
  assert.throws(() => transitionPackage(teacher, packageId, "publish"), { status: 409 });
  const path = itpAudioPath(sha256);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  transitionPackage(teacher, packageId, "publish");
  const classroomId = createClassroom(teacher, "Kelas pilot");
  const code = db().prepare("SELECT join_code FROM classrooms WHERE id=?").get(classroomId)!.join_code as string;
  joinClassroom(student, code);
  const taskId = createAssessmentTask(teacher, { classroomId, packageId, title: "Tugas pilot" });
  const id = startAssessment(student, { taskId });
  const row = loadAssessment(id, student.id), now = row.started_at;
  const state = (at: number) => publicAssessment(loadAssessment(id, student.id, at), at);
  const act = (body: Record<string, unknown>, at: number) => publicAssessment(mutateAssessment(id, student.id, body, at), at);
  const first = state(now).questions[0];
  assert.equal(first.stimulus, "");
  assert.equal(first.prompt, "");
  assert.deepEqual(first.options, []);
  assert.equal(state(now).questions.length, 1);
  assert.throws(() => claimListeningAudio(id, other.id, first.id, now), { status: 404 });
  assert.throws(() => act({ action: "advance", sectionIndex: 0 }, now), { status: 409 });
  assert.throws(() => act({ action: "listeningNext", questionId: first.id }, now), { status: 409 });
  rmSync(path);
  assert.throws(() => claimListeningAudio(id, student.id, first.id, now), { status: 503 });
  assert.equal(state(now).listening?.audioUntil, null);
  writeFileSync(path, bytes);
  assert.deepEqual(claimListeningAudio(id, student.id, first.id, now), bytes);
  assert.throws(() => claimListeningAudio(id, student.id, first.id, now + 1), { status: 409 });
  assert.deepEqual(state(now + 999).questions[0].options, []);
  assert.throws(() => act({ action: "answer", questionId: first.id, choice: 0 }, now + 999), { status: 409 });
  const canonical = bank.find(q => q.id === first.id)!.content;
  const choice = state(now + 1000).questions[0].options.indexOf(canonical.options[canonical.answer]);
  assert.ok(choice >= 0);
  act({ action: "answer", questionId: first.id, choice }, now + 1000);
  const next = { action: "listeningNext", questionId: first.id };
  assert.equal(act(next, now + 1000).listening?.position, 2);
  assert.equal(act(next, now + 1000).listening?.position, 2);
  assert.throws(() => claimListeningAudio(id, student.id, first.id, now + 1000), { status: 409 });

  for (let i = 1; i < 50; i++) {
    const at = now + i * 1000;
    const q = state(at).questions[0];
    claimListeningAudio(id, student.id, q.id, at);
    act({ action: "listeningNext", questionId: q.id }, at + 1000);
  }
  const structure = state(now + 50_000);
  assert.equal(structure.listening, undefined);
  assert.equal(structure.questions.length, 40);
  assert.equal(structure.deadline, now + 50_000 + ITP_TIMES.structure * 1000);
  const reading = act({ action: "advance", sectionIndex: 1 }, now + 51_000);
  assert.equal(reading.questions.length, 50);
  assert.equal(reading.deadline, now + 51_000 + ITP_TIMES.reading * 1000);
  const result = act({ action: "advance", sectionIndex: 2 }, now + 52_000);
  assert.equal(result.result?.correct, 1);
  assert.equal(result.result?.total, 140);
  assert.equal(result.questions.length, 140);
});
