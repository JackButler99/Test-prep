import { NextResponse } from "next/server";
import { advanceAttempt, loadAttempt, saveAnswer, serializeAttempt } from "@/lib/attempts";
import { checkOrigin, error, requireUser, respondError, readBody } from "@/lib/http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const row = loadAttempt((await context.params).id, user.id);
    if (!row) return error("Sesi tidak ditemukan.", 404);
    return NextResponse.json(serializeAttempt(row), { headers: { "Cache-Control": "no-store" } });
  } catch (cause) { return respondError(cause); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const body = await readBody(request);
    if (typeof body.questionId !== "string" || (body.choice !== null && typeof body.choice !== "number")) return error("Jawaban tidak valid.");
    const saved = saveAnswer((await context.params).id, user.id, body.questionId, body.choice);
    return NextResponse.json({ ok: true, ...saved });
  } catch (cause) { return respondError(cause); }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const { sectionIndex } = await readBody(request);
    if (typeof sectionIndex !== "number" || !Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex > 2) {
      return error("Bagian sesi tidak valid.");
    }
    const row = advanceAttempt((await context.params).id, user.id, sectionIndex);
    return NextResponse.json(serializeAttempt(row), { headers: { "Cache-Control": "no-store" } });
  } catch (cause) { return respondError(cause); }
}
