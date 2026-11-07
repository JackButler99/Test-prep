import type { BankRow } from "./learning-types";

export const BANK_STATES = ["draft", "review", "published", "retired"] as const;
export const BANK_ACTIONS = [
  { id: "review", label: "Ajukan review", from: "draft", admin: false },
  { id: "deleteDraft", label: "Hapus draf", from: "draft", admin: true },
  { id: "publish", label: "Terbitkan", from: "review", admin: true },
  { id: "reopen", label: "Kembalikan ke draft", from: "review", admin: true },
  { id: "retire", label: "Tarik dari penerbitan", from: "published", admin: true },
];
export function availableBankActions(rows: BankRow[], admin: boolean, userId: string) {
  if (!rows.length || rows.some(q => !admin && q.ownerId !== userId)) return [];
  return BANK_ACTIONS.filter(a => (!a.admin || admin) && rows.every(q => q.state === a.from));
}
/** Cheap preview only; authoritative item validation stays on the server. */
export function parseBankImport(raw: string): Record<string, unknown>[] {
  if (new TextEncoder().encode(raw).length > 500_000) throw Error("File terlalu besar. Batasi isi JSON hingga 500 KB.");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw Error("JSON belum valid. Periksa tanda kutip, koma, dan kurung."); }
  if (!Array.isArray(data) || !data.length || data.length > 50) throw Error("Pilih file impor berisi array 1–50 soal, bukan file review atau source map.");
  if (data.some(q => !q || typeof q !== "object" || Array.isArray(q) || typeof q.prompt !== "string" || !Array.isArray(q.options) || typeof q.examId !== "string" || typeof q.section !== "string" || !["text", "audio"].includes(q.kind))) {
    throw Error("Struktur soal belum sesuai. Gunakan file *-import-*.json dengan prompt, options, examId, section, dan kind.");
  }
  return data;
}
