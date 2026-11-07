import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { db, transaction } from "../src/lib/db.ts";
import { createPackage, ensureLearningSeed, examProfiles, listBank, listPackages } from "../src/lib/learning-bank.ts";
import { ITP_TIMES, itpAudioPath, validItpClip, validItpSnapshot } from "../src/lib/itp-simulation.ts";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const fields = ["kind", "stimulus", "prompt", "options", "answer", "explanation", "skill", "scores"];
const fingerprint = content => sha256(JSON.stringify(fields.map(key => content[key])));
const json = path => JSON.parse(readFileSync(path, "utf8"));

function validateAudio(plan, directory) {
  return plan.listening.map(row => {
    const { sha256: hash, durationMs, part } = row;
    const clip = { sha256: hash, durationMs, part };
    if (!validItpClip(clip)) throw Error(`Metadata audio tidak valid: ${row.revisionId}`);
    const path = join(directory, "audio", `${hash}.mp3`);
    const bytes = readFileSync(path);
    if (!bytes.length || bytes.length > 1_000_000 || sha256(bytes) !== hash) throw Error(`Isi klip audio berbeda dari manifest: ${hash}`);
    return { clip, path };
  });
}

function resolveQuestions(user, plan, newReading) {
  const bank = listBank(user, "published").filter(row => row.examId === "toefl-itp");
  const index = new Map(bank.map(row => [row.id, row]));
  const resolveRows = (rows, section) => rows.map(({ revisionId, contentSha256 }) => {
    const row = index.get(revisionId);
    if (!row || row.section !== section || fingerprint(row.content) !== contentSha256) {
      throw Error(`Revisi ${revisionId} (${section}) sudah berubah, belum terbit, atau tidak dapat diakses.`);
    }
    return row;
  });
  const reading = newReading ? newReading.map((item, i) => {
    const matches = bank.filter(row => row.section === "reading" && fingerprint(row.content) === fingerprint(item));
    if (item.examId !== "toefl-itp" || item.section !== "reading" || matches.length !== 1) {
      throw Error(`Reading baru nomor ${i + 1} harus cocok dengan tepat satu revisi terbit.`);
    }
    return matches[0];
  }) : resolveRows(plan.reading, "reading");
  return [...resolveRows(plan.listening, "listening"), ...resolveRows(plan.structure, "structure"), ...reading];
}

let connection;
try {
  const { positionals, values } = parseArgs({ options: { apply: { type: "boolean" }, reading: { type: "string" } }, allowPositionals: true });
  if (positionals.length !== 2) throw Error("Penggunaan: node --conditions=react-server --import=tsx scripts/install-itp-simulation.mjs ADMIN MANIFEST.JSON [--reading BACAAN.JSON] [--apply]");
  const [username, manifest] = positionals;
  const plan = json(manifest);
  if (plan.format !== "learn-toefl.itp-simulation" || plan.schemaVersion !== 1 || typeof plan.title !== "string"
    || !Array.isArray(plan.listening) || plan.listening.length !== 50 || !Array.isArray(plan.structure) || plan.structure.length !== 40
    || !Array.isArray(plan.reading) || plan.reading.length !== 50) throw Error("Manifest harus berisi 50 Listening, 40 Structure, dan 50 Reading.");
  const newReading = values.reading ? json(values.reading) : null;
  if (values.reading && (!Array.isArray(newReading) || newReading.length !== 50)) throw Error("File Reading baru harus berisi 50 soal.");
  const audio = validateAudio(plan, dirname(resolve(manifest)));
  const itpSimulation = { listening: audio.map(item => item.clip) };
  const title = newReading ? `${plan.title} — Reading baru` : plan.title;

  connection = db();
  const user = connection.prepare("SELECT id, username, role FROM users WHERE username=? AND role='admin'").get(username.trim().toLowerCase());
  if (!user) throw Error("Pakai username admin pengelola materi.");
  ensureLearningSeed();

  function inspect() {
    const rows = resolveQuestions(user, plan, newReading);
    const ids = rows.map(row => row.id);
    if (new Set(rows.map(row => row.questionId)).size !== 140) throw Error("Paket harus memuat 140 soal unik.");
    const profile = examProfiles().find(exam => exam.id === "toefl-itp" && exam.active);
    if (!profile) throw Error("Profil TOEFL ITP harus aktif.");
    const snapshot = {
      examId: "toefl-itp", itpSimulation,
      sections: profile.sections.filter(section => Object.hasOwn(ITP_TIMES, section.key))
        .map(section => ({ ...section, durationSeconds: ITP_TIMES[section.key] })),
      questions: rows.map(row => ({ ...row.content, section: row.section })),
    };
    if (!validItpSnapshot(snapshot)) throw Error("Materi paket tidak sesuai format simulasi Level 1.");
    const matches = listPackages(user).filter(pack => pack.title === title);
    const existing = matches[0];
    if (matches.length > 1 || existing && (!isDeepStrictEqual(existing.snapshot.questions.map(q => q.id), ids)
      || !isDeepStrictEqual(existing.snapshot.itpSimulation, itpSimulation))) throw Error("Judul sudah dipakai paket dengan isi berbeda.");
    return { ids, existing };
  }

  const { existing } = inspect();
  const seconds = Math.ceil(audio.reduce((total, item) => total + item.clip.durationMs, 0) / 1000);
  console.log(`${title} — 140 soal, 115 menit, ${audio.length} klip (${seconds} detik audio).`);
  if (!values.apply) console.log(existing ? `Paket sudah ada (${existing.state}).` : "Simulasi pemasangan lulus. Tambahkan --apply untuk membuat paket privat sebagai draf.");
  else {
    const id = transaction(() => {
      const { ids, existing: prior } = inspect();
      for (const { clip, path } of audio) {
        const target = itpAudioPath(clip.sha256);
        mkdirSync(dirname(target), { recursive: true });
        if (!existsSync(target)) copyFileSync(path, target, constants.COPYFILE_EXCL);
        if (sha256(readFileSync(target)) !== clip.sha256) throw Error(`Audio terpasang rusak: ${target}`);
      }
      if (prior) return prior.id;
      const id = createPackage(user, { examId: "toefl-itp", title, revisionIds: ids, visibility: "private", durations: ITP_TIMES });
      const row = connection.prepare("SELECT snapshot_json FROM assessment_packages WHERE id=?").get(id);
      const snapshot = { ...JSON.parse(row.snapshot_json), itpSimulation };
      if (!validItpSnapshot(snapshot) || !isDeepStrictEqual(snapshot.questions.map(q => q.id), ids)) throw Error("Urutan paket berbeda dari manifest.");
      connection.prepare("UPDATE assessment_packages SET snapshot_json=? WHERE id=?").run(JSON.stringify(snapshot), id);
      return id;
    });
    console.log(`Materi tersedia: ${id}. Buka Materi latihan sebagai admin untuk memeriksa status dan aksesnya.`);
  }
} catch (error) {
  console.error(`Pemasangan gagal: ${error.message}`);
  process.exitCode = 1;
} finally { connection?.close(); }
