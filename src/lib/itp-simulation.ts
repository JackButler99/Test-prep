import "server-only";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { dataDirectory } from "./db";
import { HttpError } from "./http";
import type { ItpAudioClip, PackageSnapshot } from "./learning-types";

export const ITP_TIMES = { listening: 2100, structure: 1500, reading: 3300 } as const;
export const ITP_COUNTS = { listening: 50, structure: 40, reading: 50 } as const;
const MAX_AUDIO_BYTES = 1_000_000;

export function itpAudioPath(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new HttpError("Identitas audio tidak valid.", 409);
  return join(dataDirectory(), "itp-audio", `${hash}.mp3`);
}

export function validItpClip(clip: ItpAudioClip) {
  return clip && /^[a-f0-9]{64}$/.test(clip.sha256) && ["A", "B", "C"].includes(clip.part)
    && Number.isSafeInteger(clip.durationMs) && clip.durationMs > 0 && clip.durationMs <= 120_000;
}

export function validItpSnapshot(snapshot: PackageSnapshot) {
  const clips = snapshot.itpSimulation?.listening;
  if (snapshot.examId !== "toefl-itp" || !Array.isArray(clips) || clips.length !== ITP_COUNTS.listening ||
    clips.some(clip => !validItpClip(clip)) || clips.reduce((total, clip) => total + clip.durationMs, 0) >= ITP_TIMES.listening * 1000) return false;
  if (clips[0].part !== "A" || !clips.some(clip => clip.part === "B") || clips.at(-1)?.part !== "C" ||
    clips.some((clip, i) => i > 0 && clip.part < clips[i - 1].part)) return false;
  if (snapshot.questions.length !== 140 || snapshot.sections.length !== 3) return false;
  return Object.keys(ITP_COUNTS).every((key, i) => {
    const section = key as keyof typeof ITP_COUNTS;
    const questions = snapshot.questions.filter(q => q.section === section);
    return snapshot.sections[i].key === section && snapshot.sections[i].durationSeconds === ITP_TIMES[section]
      && questions.length === ITP_COUNTS[section] && questions.every(q => q.kind === (section === "listening" ? "audio" : "text")
        && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4
        && q.scores.length === 4 && q.scores.every((score, index) => score === Number(index === q.answer)));
  });
}

export function itpAudioAvailable(snapshot: PackageSnapshot) {
  if (!snapshot.itpSimulation) return true;
  return validItpSnapshot(snapshot) && snapshot.itpSimulation.listening.every(clip => {
    try {
      const file = statSync(itpAudioPath(clip.sha256));
      return file.isFile() && file.size > 0 && file.size <= MAX_AUDIO_BYTES;
    } catch { return false; }
  });
}

export function readItpAudio(clip: ItpAudioClip) {
  try {
    const path = itpAudioPath(clip.sha256);
    if (statSync(path).size > MAX_AUDIO_BYTES) throw Error();
    const audio = readFileSync(path);
    if (audio.length && createHash("sha256").update(audio).digest("hex") === clip.sha256) return audio;
  } catch { /* A missing or damaged clip leaves the listening position unchanged. */ }
  throw new HttpError("Klip Listening tidak tersedia. Hubungi pengelola kelas.", 503);
}
