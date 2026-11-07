import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual, parseArgs } from "node:util";

const columns = {
  exam_profiles: "id title description sections_json active updated_at",
  bank_questions: "id owner_id visibility created_at",
  question_revisions: "id question_id revision exam_id section_key content_json state review_note reviewed_by created_at",
  assessment_packages: "id owner_id exam_id title visibility state snapshot_json created_at",
};

function readTables(db) {
  return Object.fromEntries(Object.entries(columns).map(([table, fields]) => {
    const rows = db.prepare(`SELECT ${fields.replaceAll(" ", ", ")} FROM ${table} ORDER BY id`).all();
    return [table, new Map(rows.map(row => [row.id, row]))];
  }));
}

function same(left, right, fields) {
  return fields.split(" ").every(field => field.endsWith("_json")
    ? isDeepStrictEqual(JSON.parse(left[field]), JSON.parse(right[field]))
    : left[field] === right[field]);
}

function alternateId(table, id, prefixLength = 55) {
  const suffix = createHash("sha256").update(`${table}\0${id}`).digest("hex").slice(0, 16);
  return `${id.slice(0, prefixLength)}-migrasi-${suffix}`;
}

function openDatabase(path, readOnly) {
  const db = new DatabaseSync(path, { readOnly });
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  return db;
}

function existingDatabase(path) {
  const realPath = realpathSync.native(path);
  const stats = statSync(realPath, { bigint: true });
  if (!stats.isFile()) throw Error(`Gunakan path file SQLite: ${path}`);
  return { path: realPath, stats };
}

function planMigration(source, target, adminId) {
  const additions = Object.fromEntries(Object.keys(columns).map(table => [table, []]));
  const remapped = [];
  const packageNotes = [];
  const examIds = new Map();
  const revisionIds = new Map();

  function add(table, row) {
    target[table].set(row.id, row);
    additions[table].push(row);
  }

  function reuseOrAdd(table, row, fields, prefixLength) {
    let prior = target[table].get(row.id);
    if (prior && !same(prior, row, fields)) {
      const id = alternateId(table, row.id, prefixLength);
      remapped.push(`${table}: ${row.id} → ${id}`);
      row = { ...row, id };
      prior = target[table].get(id);
      if (prior && !same(prior, row, fields)) throw Error(`Konflik data pada ${table}: ${id}`);
    }
    if (!prior) add(table, row);
    return row.id;
  }

  function examId(id) {
    if (!examIds.has(id)) {
      const row = source.exam_profiles.get(id);
      if (!row) throw Error(`Profil ujian sumber tidak ditemukan: ${id}`);
      examIds.set(id, reuseOrAdd("exam_profiles", row, "title description sections_json active", 25));
    }
    return examIds.get(id);
  }

  const revisionsByQuestion = new Map();
  for (const row of source.question_revisions.values()) {
    if (!source.bank_questions.has(row.question_id)) throw Error(`Soal untuk revisi ${row.id} tidak ditemukan.`);
    const revisions = revisionsByQuestion.get(row.question_id) ?? [];
    revisions.push({ ...row, exam_id: examId(row.exam_id), reviewed_by: null });
    revisionsByQuestion.set(row.question_id, revisions);
  }

  const targetRevisionsByQuestion = new Map();
  for (const row of target.question_revisions.values()) {
    const revisions = targetRevisionsByQuestion.get(row.question_id) ?? new Map();
    revisions.set(row.revision, row.id);
    targetRevisionsByQuestion.set(row.question_id, revisions);
  }

  function questionFits(question, revisions, originalOwner) {
    const prior = target.bank_questions.get(question.id);
    if (prior && (prior.visibility !== question.visibility ||
      (prior.owner_id !== originalOwner && prior.owner_id !== question.owner_id))) return false;

    const revisionNumbers = targetRevisionsByQuestion.get(question.id);
    return revisions.every(row => {
      const existingId = revisionNumbers?.get(row.revision);
      if (existingId && existingId !== row.id) return false;
      const existing = target.question_revisions.get(row.id);
      return !existing || same(existing, row, "question_id revision exam_id section_key content_json state review_note");
    });
  }

  for (const row of source.bank_questions.values()) {
    let question = { ...row, owner_id: row.owner_id === null ? null : adminId };
    let revisions = revisionsByQuestion.get(row.id) ?? [];
    if (!questionFits(question, revisions, row.owner_id)) {
      const id = alternateId("bank_questions", row.id);
      question = { ...question, id };
      revisions = revisions.map(revision => ({ ...revision, id: `${id}-v${revision.revision}`, question_id: id }));
      if (!questionFits(question, revisions, row.owner_id)) throw Error(`Konflik data pada soal: ${id}`);
      remapped.push(`bank_questions: ${row.id} → ${id}`);
    }
    if (!target.bank_questions.has(question.id)) add("bank_questions", question);
    const original = revisionsByQuestion.get(row.id) ?? [];
    for (const [index, revision] of revisions.entries()) {
      revisionIds.set(original[index].id, revision);
      if (!target.question_revisions.has(revision.id)) {
        add("question_revisions", revision);
        const numbers = targetRevisionsByQuestion.get(question.id) ?? new Map();
        numbers.set(revision.revision, revision.id);
        targetRevisionsByQuestion.set(question.id, numbers);
      }
    }
  }

  for (const row of source.assessment_packages.values()) {
    const snapshot = JSON.parse(row.snapshot_json);
    if (snapshot?.examId !== row.exam_id || !Array.isArray(snapshot.sections) || !snapshot.sections.length ||
      !Array.isArray(snapshot.questions) || !snapshot.questions.length) throw Error(`Format snapshot paket tidak valid: ${row.id}`);

    const targetExamId = examId(row.exam_id);
    let hasPrivateQuestion = false;
    let hasUnavailableRevision = false;
    const questions = snapshot.questions.map(question => {
      const original = source.question_revisions.get(question?.id);
      const revision = revisionIds.get(question?.id);
      if (!original || !revision || original.question_id !== question.questionId || original.revision !== question.revision ||
        original.exam_id !== row.exam_id || original.section_key !== question.section ||
        !snapshot.sections.some(section => section?.key === question.section)) {
        throw Error(`Referensi soal/revisi tidak valid di paket ${row.id}: ${question?.id ?? "tanpa ID"}`);
      }
      if (target.bank_questions.get(revision.question_id).visibility === "private") hasPrivateQuestion = true;
      if (revision.state !== "published") hasUnavailableRevision = true;
      return { ...question, id: revision.id, questionId: revision.question_id };
    });

    const visibility = hasPrivateQuestion ? "private" : row.visibility;
    const packageCount = additions.assessment_packages.length;
    reuseOrAdd("assessment_packages", {
      ...row, owner_id: adminId, exam_id: targetExamId, visibility,
      snapshot_json: JSON.stringify({ ...snapshot, examId: targetExamId, questions }),
    }, "owner_id exam_id title visibility state snapshot_json");

    const notes = [];
    if (visibility !== row.visibility) notes.push("dijadikan privat karena memuat soal privat");
    if (row.state === "published" && hasUnavailableRevision) notes.push("ada revisi yang tidak terbit");
    if (row.state === "published" && !target.exam_profiles.get(targetExamId).active) notes.push("profil ujian nonaktif");
    packageNotes.push({ title: row.title, count: questions.length, added: additions.assessment_packages.length > packageCount, notes });
  }

  return { additions, remapped, packageNotes, profiles: examIds.size };
}

async function backupTarget(targetPath) {
  const directory = mkdtempSync(join(dirname(targetPath), "backup-data-bank-"));
  const path = join(directory, "app.sqlite");
  let reader;
  try {
    // A separate reader can snapshot the pre-migration database while the write lock is held.
    reader = openDatabase(targetPath, true);
    await backup(reader, path);
    return path;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally {
    reader?.close();
  }
}

async function main() {
  const { positionals, values } = parseArgs({ options: { apply: { type: "boolean" } }, allowPositionals: true });
  if (positionals.length !== 3) throw Error("Penggunaan: node scripts/migrate-bank.mjs DB_LAMA DB_BARU USER_ADMIN [--apply]");
  const [sourcePath, targetPath, username] = positionals;
  const source = existingDatabase(sourcePath);
  const target = existingDatabase(targetPath);
  if (source.path === target.path || (source.stats.ino !== 0n && source.stats.ino === target.stats.ino && source.stats.dev === target.stats.dev)) {
    throw Error("Database lama dan baru harus berupa file berbeda.");
  }

  let oldDb, newDb;
  try {
    oldDb = openDatabase(source.path, true);
    newDb = openDatabase(target.path, !values.apply);
    oldDb.exec("BEGIN");
    newDb.exec(values.apply ? "BEGIN IMMEDIATE" : "BEGIN");
    const admin = newDb.prepare("SELECT id FROM users WHERE username=? AND role='admin'").get(username.toLowerCase());
    if (!admin) throw Error(`Akun admin '${username}' belum ada di database baru.`);

    const sourceRows = readTables(oldDb);
    if (!sourceRows.bank_questions.size) throw Error("Bank Soal sumber kosong. Periksa lokasi DATA_DIR aplikasi lama.");
    const { additions, remapped, packageNotes, profiles } = planMigration(sourceRows, readTables(newDb), admin.id);

    console.log(`Sumber: ${source.path}\nTujuan: ${target.path}\nAdmin tujuan: ${username.toLowerCase()}`);
    for (const [table, rows] of Object.entries(additions)) {
      const total = table === "exam_profiles" ? profiles : sourceRows[table].size;
      console.log(`${table}: ${rows.length} baru, ${total - rows.length} sudah ada`);
    }
    for (const item of remapped) console.log(`ID bentrok: ${item}`);
    for (const { title, count, added, notes } of packageNotes) {
      console.log(`${added ? "BARU" : "SUDAH ADA"} — ${title} (${count} soal)${notes.length ? ` — ${notes.join(", ")}` : ""}`);
    }

    if (!values.apply) {
      console.log("Simulasi selesai. Jalankan ulang dengan --apply untuk menyimpan.");
      return;
    }
    if (Object.values(additions).every(rows => rows.length === 0)) {
      console.log("Semua data sumber sudah ada.");
      return;
    }

    console.log(`Cadangan database tujuan: ${await backupTarget(target.path)}`);
    for (const [table, rows] of Object.entries(additions)) {
      const fields = columns[table].split(" ");
      const insert = newDb.prepare(`INSERT INTO ${table} (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`);
      for (const row of rows) insert.run(...fields.map(field => row[field]));
    }
    newDb.exec("COMMIT");
    console.log("Migrasi selesai.");
  } finally {
    newDb?.close();
    oldDb?.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`Migrasi gagal: ${error.message}`);
  process.exitCode = 1;
}
