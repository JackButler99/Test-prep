export const SKD_EXAM_ID = "cpns-skd";
export const SKD_YEAR = 2024;
export const SKD_SECONDS = 100 * 60;
export const SKD_SECTIONS = [
  { key: "twk", title: "TWK", count: 30, generalThreshold: 65 },
  { key: "tiu", title: "TIU", count: 35, generalThreshold: 80 },
  { key: "tkp", title: "TKP", count: 45, generalThreshold: 166 },
] as const;

export type SkdMode = "practice" | "full";

const diagram = /^FIG:([.oxtudlr]{3})\/([.oxtudlr]{3})\/([.oxtudlr]{3})$/;

export function skdFigure(value: string) {
  const match = diagram.exec(value);
  return match ? match.slice(1).flatMap(row => [...row]) : null;
}

export function validSkdQuestion(question: {
  section: string; kind: string; stimulus: string; options: string[]; scores: number[]; answer: number;
}) {
  const { section, kind, stimulus, options, scores, answer } = question;
  if (kind !== "text" || typeof stimulus !== "string" || !Array.isArray(options) || options.length !== 5 ||
      options.some(option => typeof option !== "string") || !Array.isArray(scores) || scores.length !== 5 ||
      !SKD_SECTIONS.some(part => part.key === section) || scores[answer] !== 5) return false;
  if ([stimulus, ...options].some(value => value.startsWith("FIG:")) &&
      (section !== "tiu" || !skdFigure(stimulus) || options.some(option => !skdFigure(option)))) return false;
  return section === "tkp"
    ? new Set(scores).size === 5 && scores.every(score => Number.isInteger(score) && score >= 1 && score <= 5)
    : scores.every((score, index) => score === (index === answer ? 5 : 0));
}
