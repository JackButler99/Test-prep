import type { PackageSnapshot, PublicAssessment } from "./learning-types";

/** Lives in one mounted browser tab. No storage or API calls. */
export function createAssessmentPreview(id: string, snapshot: PackageSnapshot, clock = Date.now) {
  const startedAt = clock();
  const answers: Record<string, number> = {};
  let sectionIndex = 0;
  let deadline = deadlineForSection(startedAt);
  let finishedAt: number | null = null;
  let listeningIndex = 0;
  let audioUntil: number | null = null;

  function deadlineForSection(at: number) {
    const duration = snapshot.sections[sectionIndex].durationSeconds;
    return duration ? at + duration * 1000 : null;
  }

  function advance(at: number) {
    if (sectionIndex === snapshot.sections.length - 1) {
      finishedAt = at;
      deadline = null;
      return;
    }
    sectionIndex++;
    deadline = deadlineForSection(at);
  }

  function sync() {
    const now = clock();
    while (deadline !== null && now >= deadline) advance(deadline);
    return now;
  }

  function currentQuestions() {
    return snapshot.questions.filter(question => question.section === snapshot.sections[sectionIndex].key);
  }

  function listening() {
    if (finishedAt !== null || snapshot.sections[sectionIndex].key !== "listening" || !snapshot.itpSimulation) return;
    const clips = snapshot.itpSimulation.listening;
    return { question: currentQuestions()[listeningIndex], clip: clips[listeningIndex], total: clips.length };
  }

  function view(now: number): PublicAssessment {
    const activeClip = listening();
    const available = activeClip ? [activeClip.question] : finishedAt === null ? currentQuestions() : snapshot.questions;
    const questions = available.map(({ answer: _key, explanation: _explanation, scores: _scores, ...question }) =>
      activeClip ? { ...question, prompt: "", stimulus: "", options: audioUntil !== null && now >= audioUntil ? question.options : [] } : question);
    const data: PublicAssessment = {
      id, title: snapshot.title, examTitle: snapshot.examTitle, sections: snapshot.sections,
      status: finishedAt === null ? "active" : "finished", sectionIndex, deadline, startedAt, finishedAt,
      questions, answers: Object.fromEntries(questions.flatMap(question =>
        answers[question.id] === undefined ? [] : [[question.id, answers[question.id]]])),
    };
    if (snapshot.itpSimulation) data.itpSimulation = true;
    if (activeClip) data.listening = { position: listeningIndex + 1, total: activeClip.total, part: activeClip.clip.part, audioUntil };
    if (finishedAt !== null) {
      const details = snapshot.questions.map(question => {
        const selected = answers[question.id] ?? null;
        return {
          id: question.id, selected, answer: question.answer, explanation: question.explanation,
          points: selected === null ? 0 : question.scores[selected], maxPoints: Math.max(...question.scores), observedMs: 0,
        };
      });
      data.result = {
        details, total: details.length, correct: details.filter(item => item.selected === item.answer).length,
        points: details.reduce((sum, item) => sum + item.points, 0),
        maxPoints: details.reduce((sum, item) => sum + item.maxPoints, 0),
      };
    }
    return data;
  }

  function listen(questionId: string, start = false) {
    const now = sync();
    const activeClip = listening();
    if (!activeClip || activeClip.question.id !== questionId || audioUntil !== null) {
      throw Error("Klip sudah dimulai atau soalnya telah berubah.");
    }
    const until = now + activeClip.clip.durationMs;
    if (deadline !== null && until > deadline) throw Error("Waktu tersisa tidak cukup untuk memutar klip ini.");
    if (start) audioUntil = until;
  }

  return {
    load: () => view(sync()),
    listen,
    act(input: Record<string, unknown>) {
      const now = sync();
      if (finishedAt !== null) return view(now);
      const activeClip = listening();
      if (input.action === "advance") {
        if (input.sectionIndex !== sectionIndex) return view(now);
        if (activeClip) throw Error("Lanjutkan Listening secara berurutan.");
        advance(now);
        return view(now);
      }
      const question = activeClip?.question ?? currentQuestions().find(item => item.id === input.questionId);
      if (!question || question.id !== input.questionId) throw Error("Soal tidak tersedia pada bagian aktif.");
      if (activeClip && (audioUntil === null || now < audioUntil)) throw Error("Tunggu sampai audio selesai.");
      if (input.action === "listeningNext" && activeClip) {
        listeningIndex++;
        audioUntil = null;
        if (listeningIndex === activeClip.total) advance(now);
      } else if (input.action === "answer") {
        const { choice } = input;
        if (choice === null) delete answers[question.id];
        else {
          if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
            throw Error("Pilihan jawaban tidak valid.");
          }
          answers[question.id] = choice;
        }
      } else throw Error("Aksi sesi tidak valid.");
      return view(now);
    },
  };
}
