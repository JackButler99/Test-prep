import "server-only";
import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import type { User } from "./auth";
import { assertRole } from "./access";
import { HttpError } from "./http";
import { audit } from "./experiments";
import { packageMaterialsAvailable } from "./learning-bank";
import { canStartProductPackage } from "./store-access";
import type { PackageSnapshot } from "./learning-types";
import { safeSlug } from "./ui-format";

export type Product = {
  id: string; slug: string; title: string; description: string;
  kind: "diagnostic" | "preparation"; access: "free" | "paid";
  state: "draft" | "published" | "archived";
};

type MaterialRow = {
  id: string; title: string; state: string; visibility: string; active: number; snapshot_json: string;
};

const selectProducts = `SELECT id, slug, title, description, kind, access, state FROM practice_products`;

export function publishedProducts() {
  return db().prepare(`${selectProducts} WHERE state='published' ORDER BY kind, created_at DESC`).all() as Product[];
}

export function ownedProducts(userId: string) {
  return db().prepare(`SELECT p.id, p.slug, p.title, p.description, p.kind, p.access, p.state FROM practice_products p
    JOIN practice_product_access g ON g.product_id=p.id WHERE g.user_id=? ORDER BY g.granted_at DESC`).all(userId) as Product[];
}

export function productBySlug(slug: string, userId: string | undefined) {
  return db().prepare(`${selectProducts} WHERE slug=? AND (state='published' OR
    (state='archived' AND EXISTS (SELECT 1 FROM practice_product_access g WHERE g.product_id=practice_products.id AND g.user_id=?)))`)
    .get(slug, userId ?? "") as Product | undefined;
}

function materials(productId: string) {
  return db().prepare(`SELECT a.id, a.title, a.state, a.visibility, e.active, a.snapshot_json
    FROM practice_product_packages m JOIN assessment_packages a ON a.id=m.package_id
    JOIN exam_profiles e ON e.id=a.exam_id WHERE m.product_id=? ORDER BY m.position`).all(productId) as MaterialRow[];
}

function readMaterialSnapshot(row: MaterialRow): PackageSnapshot | null {
  let snapshot: PackageSnapshot | null;
  try {
    snapshot = JSON.parse(row.snapshot_json);
  } catch {
    return null;
  }
  // Imported snapshots can predate the fields required by the current exam runner.
  if (!snapshot || typeof snapshot.examId !== "string" ||
    !Array.isArray(snapshot.sections) || !snapshot.sections.length ||
    snapshot.sections.some(section => !section || typeof section.key !== "string" ||
      typeof section.title !== "string" || !Number.isFinite(section.durationSeconds)) ||
    !Array.isArray(snapshot.questions) || !snapshot.questions.length ||
    snapshot.questions.some(question => !question || typeof question.id !== "string" ||
      typeof question.section !== "string" || !Array.isArray(question.options) || !Array.isArray(question.scores) ||
      (question.kind === "audio" && typeof question.stimulus !== "string"))) return null;
  return snapshot;
}

function ready(row: MaterialRow, snapshot: PackageSnapshot | null): snapshot is PackageSnapshot {
  return row.state === "published" && !!row.active && snapshot !== null && packageMaterialsAvailable(snapshot);
}

function diagnosticMaterial(snapshot: PackageSnapshot) {
  return snapshot.examId === "toefl-itp" && !("itpSimulation" in snapshot) && snapshot.questions.length === 15 &&
    ["listening", "structure", "reading"].every(key => snapshot.questions.filter(question => question.section === key).length === 5);
}

export function availableDiagnostic() {
  return publishedProducts().find(product => product.kind === "diagnostic" && materials(product.id).some(row => {
    const snapshot = readMaterialSnapshot(row);
    return ready(row, snapshot) && diagnosticMaterial(snapshot);
  }));
}

function materialCard(row: MaterialRow, userId?: string) {
  const snapshot = readMaterialSnapshot(row);
  const available = ready(row, snapshot);
  return { id: row.id, title: row.title, examId: snapshot?.examId, count: snapshot?.questions.length ?? 0,
    sections: snapshot?.sections.map(section => ({
      ...section,
      skills: [...new Set(snapshot.questions.filter(question => question.section === section.key).map(question => question.skill))],
    })) ?? [], available,
    canStart: !!userId && available && canStartProductPackage(userId, row.id, row.visibility) };
}

export function productMaterials(productId: string, userId?: string) {
  return materials(productId).map(row => materialCard(row, userId));
}

export function openPracticePackages(userId?: string) {
  const rows = db().prepare(`SELECT a.id, a.title, a.state, a.visibility, e.active, a.snapshot_json
    FROM assessment_packages a JOIN exam_profiles e ON e.id=a.exam_id
    WHERE a.state='published' AND a.visibility='public' AND e.active=1
    AND NOT EXISTS (SELECT 1 FROM practice_product_packages m WHERE m.package_id=a.id)
    ORDER BY a.created_at DESC`).all() as MaterialRow[];
  return rows.map(row => materialCard(row, userId)).filter(row => row.available);
}

export function diagnosticProductForAttempt(attemptId: string, userId: string) {
  return db().prepare(`SELECT p.id FROM assessment_attempts a
    JOIN practice_product_packages m ON m.package_id=a.package_id
    JOIN practice_products p ON p.id=m.product_id
    WHERE a.id=? AND a.user_id=? AND p.kind='diagnostic'`).get(attemptId, userId);
}

export function productsForAdmin(user: User) {
  assertRole(user, "admin");
  return (db().prepare(`${selectProducts} ORDER BY created_at DESC`).all() as Product[]).map(product => ({
    ...product, packages: materials(product.id).map(productMaterialOption),
  }));
}

function productMaterialOption(row: MaterialRow) {
  const snapshot = readMaterialSnapshot(row);
  const available = ready(row, snapshot);
  return { id: row.id, title: row.title, available, diagnostic: available && diagnosticMaterial(snapshot) };
}

export function productPackageOptions(user: User) {
  assertRole(user, "admin");
  const rows = db().prepare(`SELECT a.id, a.title, a.state, a.visibility, e.active, a.snapshot_json
    FROM assessment_packages a JOIN exam_profiles e ON e.id=a.exam_id
    WHERE a.state='published' AND a.visibility='private'
    AND NOT EXISTS (SELECT 1 FROM practice_product_packages m WHERE m.package_id=a.id)
    ORDER BY a.title`).all() as MaterialRow[];
  return rows.map(productMaterialOption);
}

export function createProduct(user: User, input: Record<string, unknown>) {
  assertRole(user, "admin");
  const requestedSlug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const { kind, access, packageIds } = input;
  if (!title || title.length > 140 || !description || description.length > 1800) {
    throw new HttpError("Isi nama dan deskripsi produk yang valid.", 400);
  }
  if (input.slug !== undefined && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedSlug) || requestedSlug.length > 80)) {
    throw new HttpError("Alamat produk tidak valid.", 400);
  }
  if ((kind !== "diagnostic" && kind !== "preparation") || (access !== "free" && access !== "paid") || (kind === "diagnostic" && access !== "free")) {
    throw new HttpError("Diagnostik harus gratis. Pilih jenis dan akses produk yang valid.", 400);
  }
  if (!Array.isArray(packageIds) || packageIds.length < 1 || packageIds.length > 20 || packageIds.some(id => typeof id !== "string") || new Set(packageIds).size !== packageIds.length) {
    throw new HttpError("Pilih 1–20 materi yang berbeda.", 400);
  }
  if (kind === "diagnostic" && packageIds.length !== 1) throw new HttpError("Produk diagnostik berisi tepat satu paket.", 400);
  return transaction(() => {
    const connection = db();
    const slugTaken = connection.prepare("SELECT 1 FROM practice_products WHERE slug=?");
    const baseSlug = requestedSlug || safeSlug(title);
    let slug = baseSlug;
    for (let suffix = 2; slugTaken.get(slug); suffix++) {
      if (requestedSlug) throw new HttpError("Alamat produk sudah dipakai.", 409);
      slug = `${baseSlug}-${suffix}`;
    }
    const id = randomUUID();
    const lookup = connection.prepare(`SELECT a.id, a.title, a.state, a.visibility, e.active, a.snapshot_json
      FROM assessment_packages a JOIN exam_profiles e ON e.id=a.exam_id WHERE a.id=? AND a.state='published'
      AND NOT EXISTS (SELECT 1 FROM practice_product_packages m WHERE m.package_id=a.id)`);
    for (const packageId of packageIds) {
      const row = lookup.get(packageId) as MaterialRow | undefined;
      if (!row) throw new HttpError("Materi belum terbit atau sudah dipakai produk lain.", 409);
      if (row.visibility !== "private") throw new HttpError("Atur akses materi menjadi Privat sebelum memasukkannya ke produk.", 409);
      const snapshot = readMaterialSnapshot(row);
      if (!ready(row, snapshot)) throw new HttpError("Materi belum siap. Periksa profil ujian, revisi soal, dan audio paket.", 409);
      if (kind === "diagnostic" && !diagnosticMaterial(snapshot)) {
        throw new HttpError("Diagnostik TOEFL berisi 5 Listening, 5 Structure, dan 5 Reading.", 409);
      }
    }
    connection.prepare(`INSERT INTO practice_products VALUES (?,?,?,?,?,?,'draft',?)`).run(id, slug, title, description, kind, access, Date.now());
    const add = connection.prepare("INSERT INTO practice_product_packages VALUES (?,?,?)");
    packageIds.forEach((packageId, index) => add.run(id, packageId, index));
    audit(user.id, "product.created", id);
    return id;
  });
}

export function changeProductState(user: User, productId: unknown, action: "publish" | "archive") {
  assertRole(user, "admin");
  if (typeof productId !== "string") throw new HttpError("Produk tidak valid.", 400);
  transaction(() => {
    const connection = db();
    const product = connection.prepare(`${selectProducts} WHERE id=?`).get(productId) as Product | undefined;
    if (!product) throw new HttpError("Produk tidak ditemukan.", 404);
    if (action === "publish" && product.state === "draft") {
      const rows = materials(productId);
      const snapshots = rows.map(readMaterialSnapshot);
      if (!rows.length || rows.some((row, i) => !ready(row, snapshots[i]))) throw new HttpError("Periksa status terbit, profil, dan ketersediaan materi paket.", 409);
      if (product.kind === "diagnostic") {
        const [snapshot] = snapshots;
        if (rows.length !== 1 || !snapshot || !diagnosticMaterial(snapshot)) {
          throw new HttpError("Diagnostik TOEFL berisi 5 Listening, 5 Structure, dan 5 Reading.", 409);
        }
      }
    } else if (action !== "archive" || product.state !== "published") {
      throw new HttpError("Status produk sudah berubah. Muat ulang daftar.", 409);
    }
    connection.prepare("UPDATE practice_products SET state=? WHERE id=?").run(action === "publish" ? "published" : "archived", productId);
    audit(user.id, `product.${action}`, productId);
  });
}

export function discardDraftProduct(user: User, productId: unknown) {
  assertRole(user, "admin");
  if (typeof productId !== "string") throw new HttpError("Produk tidak valid.", 400);
  transaction(() => {
    const connection = db();
    if (!connection.prepare("SELECT 1 FROM practice_products WHERE id=? AND state='draft'").get(productId)) {
      throw new HttpError("Hanya draf produk yang dapat dibuang.", 409);
    }
    connection.prepare("DELETE FROM practice_product_packages WHERE product_id=?").run(productId);
    connection.prepare("DELETE FROM practice_products WHERE id=?").run(productId);
    audit(user.id, "product.draft.discarded", productId);
  });
}

export function grantProductAccess(user: User, productId: unknown, username: unknown) {
  assertRole(user, "admin");
  if (typeof productId !== "string" || typeof username !== "string") throw new HttpError("Produk dan username wajib diisi.", 400);
  transaction(() => {
    const connection = db();
    if (!connection.prepare("SELECT 1 FROM practice_products WHERE id=? AND access='paid' AND state='published'").get(productId)) {
      throw new HttpError("Pilih produk berbayar yang sudah terbit.", 409);
    }
    const rows = materials(productId);
    if (!rows.length || rows.some(row => !ready(row, readMaterialSnapshot(row)))) {
      throw new HttpError("Lengkapi materi produk yang belum tersedia sebelum memberikan akses.", 409);
    }
    const participant = connection.prepare("SELECT id FROM users WHERE username=? AND role='student'").get(username.trim().toLowerCase()) as { id: string } | undefined;
    if (!participant) throw new HttpError("Akun peserta tidak ditemukan.", 404);
    const inserted = connection.prepare("INSERT INTO practice_product_access VALUES (?,?,?,?) ON CONFLICT(user_id,product_id) DO NOTHING")
      .run(participant.id, productId, user.id, Date.now());
    if (inserted.changes) audit(user.id, "product.access.granted", `${productId}:${participant.id}`);
  });
}
