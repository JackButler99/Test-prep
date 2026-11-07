import test from "node:test";
import assert from "node:assert/strict";
import type { BankRow } from "../src/lib/learning-types";
import { availableBankActions, parseBankImport } from "../src/lib/bank-view";
const question = { examId: "toefl-itp", section: "reading", kind: "text", prompt: "A question", options: ["One", "Two"], answer: 0, explanation: "Reason", skill: "Detail" };
const row = (state: string, ownerId = "instructor") => ({ id: state, state, ownerId } as BankRow);
test("bulk actions follow state and role, including mixed/foreign selections", () => {
  assert.deepEqual(availableBankActions([row("draft")], false, "instructor").map(a => a.id), ["review"]);
  assert.deepEqual(availableBankActions([row("draft")], true, "admin").map(a => a.id), ["review", "deleteDraft"]);
  assert.deepEqual(availableBankActions([row("review")], true, "admin").map(a => a.id), ["publish", "reopen"]);
  assert.deepEqual(availableBankActions([row("published")], true, "admin").map(a => a.id), ["retire"]);
  for (const rows of [[], [row("retired")], [row("draft"), row("review")], [row("draft", "other")]]) assert.deepEqual(availableBankActions(rows, false, "instructor"), []);
  assert.deepEqual(availableBankActions([row("draft"), row("review")], true, "admin"), []);
});
test("import preview accepts the 50 item boundary and preserves source content", () => {
  const items = Array.from({ length: 50 }, () => ({ ...question, stimulus: "Woman: Hello\nSpeaker: What?" }));
  assert.deepEqual(parseBankImport(JSON.stringify(items)), items);
  assert.throws(() => parseBankImport(JSON.stringify([...items, question])), /1–50/);
});
test("import preview rejects review envelopes, source maps, malformed JSON and empty arrays", () => {
  for (const data of [{ candidates: [{ item: question }] }, [{ importIndex: 0, sourceId: "source" }], [], [null], [[question]]]) assert.throws(() => parseBankImport(JSON.stringify(data)));
  assert.throws(() => parseBankImport('[{"prompt":]'), /JSON belum valid/);
});
test("import size uses UTF-8 bytes and leaves detailed scoring validation to server", () => {
  assert.throws(() => parseBankImport(JSON.stringify([{ ...question, stimulus: "字".repeat(180_000) }])), /500 KB/);
  const incomplete = { ...question, answer: 100 }; // shape preview is not a promise that keys are valid
  assert.equal(parseBankImport(JSON.stringify([incomplete]))[0].answer, 100);
});
