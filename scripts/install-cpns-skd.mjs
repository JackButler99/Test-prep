import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { db, dataDirectory, transaction } from "../src/lib/db.ts";
import { createPackage, examProfiles, importQuestions, listBank, saveExamProfile } from "../src/lib/learning-bank.ts";
import { SKD_EXAM_ID, SKD_SECTIONS, validSkdQuestion } from "../src/lib/skd-format.ts";
import { assertQuestionInput } from "../src/lib/question-input.ts";

const sections = SKD_SECTIONS.map(({ key, title }) => ({ key, title, durationSeconds: 0 }));
const receiptKey = index => `starter:cpns-skd:2024-v1:${index}`;
const plans = [
  { title: "Contoh Latihan SKD CPNS — 12 Soal", mode: "practice", visibility: "public",
    indexes: [0, 7, 13, 19, 31, 37, 43, 57, 65, 74, 84, 100] },
  { title: "Simulasi SKD CPNS Lengkap — Acuan 2024", mode: "full", visibility: "private",
    indexes: Array.from({ length: 110 }, (_, i) => i) },
];

let connection;
try {
  const { positionals, values } = parseArgs({ options: { apply: { type: "boolean" }, source: { type: "string" } }, allowPositionals: true });
  const [username, stage] = positionals;
  if (positionals.length !== 2 || !["bank", "paket"].includes(stage)) {
    throw Error("Penggunaan: node --conditions=react-server --import=tsx scripts/install-cpns-skd.mjs USERNAME_ADMIN bank|paket [--apply] [--source PATH]");
  }
  const manifest = JSON.parse(readFileSync(values.source ?? new URL("../data/cpns-skd-2024-starter.json", import.meta.url), "utf8"));
  if (manifest.format !== "bank-soal.cpns-skd-starter" || manifest.edition !== "cpns-2024-v1" ||
      !Array.isArray(manifest.items) || manifest.items.length !== 110 ||
      SKD_SECTIONS.some(section => manifest.items.filter(item => item.section === section.key).length !== section.count)) {
    throw Error("Bank awal harus berisi 30 TWK, 35 TIU, dan 45 TKP.");
  }
  for (const [index, item] of manifest.items.entries()) {
    assertQuestionInput(item);
    if (item.examId !== SKD_EXAM_ID || !validSkdQuestion(item)) throw Error(`Soal ${index + 1} tidak sesuai aturan SKD.`);
  }
  if (!existsSync(join(dataDirectory(), "app.sqlite"))) throw Error("Database aplikasi belum ditemukan. Jalankan dari folder proyek yang benar.");
  connection = db();
  const user = connection.prepare("SELECT id, username, role FROM users WHERE username=? AND role='admin'").get(username.trim().toLowerCase());
  if (!user) throw Error("Akun admin tidak ditemukan.");
  const profile = examProfiles().find(exam => exam.id === SKD_EXAM_ID);
  if (profile && (!profile.active || !isDeepStrictEqual(profile.sections, sections))) {
    throw Error("Profil cpns-skd harus aktif, berurutan TWK, TIU, TKP, dengan durasi bagian 0.");
  }
  const batches = [manifest.items.slice(0, 50), manifest.items.slice(50, 100), manifest.items.slice(100)];
  const receipt = index => {
    const row = connection.prepare("SELECT value FROM learning_meta WHERE key=?").get(receiptKey(index));
    const ids = row ? JSON.parse(row.value) : [];
    if (row && (!Array.isArray(ids) || ids.length !== batches[index].length || ids.some(id => typeof id !== "string"))) {
      throw Error("Catatan instalasi bank awal rusak.");
    }
    return ids;
  };

  if (stage === "bank") {
    const recorded = batches.flatMap((_, i) => receipt(i));
    console.log(`Bank awal CPNS 2024 · 110 soal · ${recorded.length} sudah tercatat.`);
    if (values.apply) {
      if (!profile) saveExamProfile(user, { id: SKD_EXAM_ID, title: "SKD CPNS",
        description: "Latihan independen TWK, TIU, TKP dengan acuan CPNS 2024.", active: true, sections });
      for (const [i, batch] of batches.entries()) importQuestions(user, batch, receiptKey(i));
      console.log("Bank awal tersedia di Bank Soal. Tinjau dan terbitkan revisi sebelum menyiapkan paket.");
    } else console.log("Tambahkan --apply untuk mengimpor soal sebagai draf.");
  } else {
    const revisionIds = batches.flatMap((_, i) => receipt(i));
    if (!profile || revisionIds.length !== 110) throw Error("Impor tahap bank terlebih dahulu.");
    const assemble = () => {
      const latest = new Map(listBank(user).filter(item => item.examId === SKD_EXAM_ID).map(item => [item.questionId, item]));
      const lookup = connection.prepare("SELECT question_id FROM question_revisions WHERE id=?");
      const reviewed = revisionIds.map(id => latest.get(lookup.get(id)?.question_id));
      const missing = reviewed.filter(item => item?.state !== "published").length;
      if (missing) throw Error(`${missing} revisi bank awal belum terbit atau tidak ditemukan. Periksa Bank Soal.`);
      return plans.map(plan => {
        const ids = plan.indexes.map(index => reviewed[index].id);
        const matches = connection.prepare("SELECT id, state, snapshot_json FROM assessment_packages WHERE exam_id=? AND title=?")
          .all(SKD_EXAM_ID, plan.title);
        const existing = matches[0];
        const snapshot = existing ? JSON.parse(existing.snapshot_json) : null;
        if (matches.length > 1 || (snapshot && (snapshot.skd?.mode !== plan.mode ||
            !isDeepStrictEqual(snapshot.questions.map(question => question.id), ids)))) {
          throw Error(`Judul "${plan.title}" sudah digunakan oleh paket dengan isi berbeda.`);
        }
        return { plan, ids, existing };
      });
    };
    const report = values.apply ? transaction(() => assemble().map(({ plan, ids, existing }) => ({
      plan, id: existing?.id ?? createPackage(user, { examId: SKD_EXAM_ID, title: plan.title,
        visibility: plan.visibility, revisionIds: ids, skdMode: plan.mode }),
      state: existing?.state ?? "draft",
    }))) : assemble().map(({ plan, existing }) => ({ plan, id: existing?.id, state: existing?.state ?? "siap dibuat" }));
    for (const { plan, id, state } of report) {
      console.log(`${plan.title} · ${state}`);
      if (id) console.log(`Pratinjau admin: /manage/skd-preview/${id}`);
    }
    if (!values.apply) console.log("Tambahkan --apply untuk membuat draf paket.");
  }
} catch (error) {
  console.error(`Pemasangan gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  connection?.close();
}
