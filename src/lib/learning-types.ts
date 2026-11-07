export type ExamSection = { key: string; title: string; durationSeconds: number };
export type ExamProfile = { id: string; title: string; description: string; sections: ExamSection[]; active: boolean };
export type QuestionContent = {
  kind: "text" | "audio"; stimulus: string; prompt: string; options: string[];
  answer: number; explanation: string; skill: string; scores: number[];
};
export type SnapshotQuestion = QuestionContent & { id: string; questionId: string; revision: number; section: string };
export type ItpAudioClip = { sha256: string; durationMs: number; part: "A" | "B" | "C" };
export type PackageSnapshot = { examId: string; examTitle: string; title: string; sections: ExamSection[]; questions: SnapshotQuestion[];
  itpSimulation?: { listening: ItpAudioClip[] } };
export type BankRow = { id: string; questionId: string; revision: number; examId: string; section: string; state: string; visibility: string; ownerId: string | null; reviewNote: string; content: QuestionContent };
export type LearningPackage = { id: string; ownerId: string; examId: string; title: string; visibility: string; state: string; snapshot: PackageSnapshot };
export type PublicAssessment = {
  id: string; title: string; examTitle: string; status: "active" | "finished";
  sections: ExamSection[]; sectionIndex: number; deadline: number | null; startedAt: number; finishedAt: number | null;
  answers: Record<string, number>;
  questions: Omit<SnapshotQuestion,"answer"|"explanation"|"scores">[];
  itpSimulation?: true;
  listening?: { position: number; total: number; part: ItpAudioClip["part"]; audioUntil: number | null };
  result?: { points: number; maxPoints: number; correct: number; total: number;
    details: { id: string; selected: number | null; answer: number; explanation: string; points: number; maxPoints: number; observedMs: number }[] };
};
