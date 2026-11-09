import assert from "node:assert/strict";
import test from "node:test";
import { createAssessmentPreview } from "../src/lib/assessment-preview";
import type { PackageSnapshot, SnapshotQuestion } from "../src/lib/learning-types";

function question(id: string, section: string): SnapshotQuestion {
  return {
    id, questionId: id, section, revision: 1, kind: "text", prompt: "Practice item", stimulus: "",
    options: ["A", "B", "C", "D"], answer: 1, scores: [0, 4, 2, 0], skill: "Example", explanation: "Review note",
  };
}

const snapshot: PackageSnapshot = {
  examId: "toefl-itp", title: "Draft", examTitle: "TOEFL",
  sections: [
    { key: "structure", title: "Structure", durationSeconds: 10 },
    { key: "reading", title: "Reading", durationSeconds: 0 },
  ],
  questions: [question("s1", "structure"), question("r1", "reading")],
};

test("preview keeps an independent tab state and shows scores only at completion", () => {
  const preview = createAssessmentPreview("pkg", snapshot, () => 1000);
  const otherTab = createAssessmentPreview("pkg", snapshot, () => 1000);
  assert.ok(!("answer" in preview.load().questions[0]));
  assert.equal(preview.load().result, undefined);
  assert.throws(() => preview.act({ action: "answer", questionId: "r1", choice: 1 }), /bagian aktif/);
  assert.deepEqual(preview.act({ action: "answer", questionId: "s1", choice: 2 }).answers, { s1: 2 });
  assert.deepEqual(otherTab.load().answers, {});
  assert.equal(preview.act({ action: "advance", sectionIndex: 0 }).deadline, null);
  assert.equal(preview.act({ action: "advance", sectionIndex: 0 }).status, "active");
  assert.throws(() => preview.act({ action: "answer", questionId: "s1", choice: 1 }), /bagian aktif/);
  const finished = preview.act({ action: "advance", sectionIndex: 1 });
  assert.equal(finished.status, "finished");
  assert.equal(finished.result?.points, 2);
  assert.equal(finished.result?.maxPoints, 8);
  assert.deepEqual(finished.result?.details.map(item => [item.selected, item.answer]), [[2, 1], [null, 1]]);
  assert.equal(createAssessmentPreview("pkg", snapshot, () => 1000).load().status, "active");
});

test("preview expires timed sections and leaves untimed sections open", () => {
  let now = 1000;
  const preview = createAssessmentPreview("pkg", snapshot, () => now);
  assert.equal(preview.load().deadline, 11_000);
  now = 11_000;
  const current = preview.load();
  assert.equal(current.sectionIndex, 1);
  assert.equal(current.status, "active");
  assert.equal(current.deadline, null);
});

test("preview Listening reveals choices after playback time and keeps clips in order", () => {
  let now = 1000;
  const preview = createAssessmentPreview("pkg", {
    ...snapshot,
    sections: [{ key: "listening", title: "Listening", durationSeconds: 10 }, ...snapshot.sections],
    questions: [question("l1", "listening"), question("l2", "listening"), ...snapshot.questions],
    itpSimulation: { listening: [
      { sha256: "a".repeat(64), durationMs: 500, part: "A" },
      { sha256: "b".repeat(64), durationMs: 750, part: "B" },
    ] },
  }, () => now);

  assert.deepEqual(preview.load().questions[0].options, []);
  assert.throws(() => preview.listen("l2"), /soalnya telah berubah/);
  assert.throws(() => preview.act({ action: "advance", sectionIndex: 0 }), /berurutan/);
  preview.listen("l1");
  assert.equal(preview.load().listening?.audioUntil, null);
  preview.listen("l1", true);
  assert.throws(() => preview.listen("l1", true), /sudah dimulai/);
  assert.throws(() => preview.act({ action: "answer", questionId: "l1", choice: 1 }), /audio selesai/);
  now = 1500;
  assert.equal(preview.load().questions[0].options.length, 4);
  assert.equal(preview.act({ action: "listeningNext", questionId: "l1" }).listening?.position, 2);
  now = 10_800;
  assert.throws(() => preview.listen("l2", true), /Waktu tersisa/);
  now = 11_000;
  assert.equal(preview.load().listening, undefined);
  assert.equal(preview.load().sectionIndex, 1);
});
