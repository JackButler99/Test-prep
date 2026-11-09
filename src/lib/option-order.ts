import "server-only";
import { createHash } from "node:crypto";
import type { SnapshotQuestion } from "./learning-types";

/** Stable for a session. Answers in SQLite always use the original option indices. */
export function optionOrder(seed: string | null, questionId: string, optionCount: number) {
  const order = Array.from({ length: optionCount }, (_, index) => index);
  if (!seed) return order;
  const hash = createHash("sha256").update(`${seed}:${questionId}`).digest();
  for (let i = order.length - 1; i > 0; i--) {
    const j = hash.readUInt32BE(i * 4) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function assessmentOptionOrder(seed: string | null, question: Pick<SnapshotQuestion, "revision" | "questionId" | "id" | "options">) {
  // Shuffle only first-generation TOEFL seed content to preserve authored option references.
  const seeded = question.revision === 1 && /^legacy-(?:L|LT|S|R)-/.test(question.questionId);
  return optionOrder(seeded ? seed : null, question.id, question.options.length);
}
