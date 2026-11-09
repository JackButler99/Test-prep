import { NextResponse } from "next/server";
import { createAttempt } from "@/lib/attempts";
import { checkOrigin, error, requireUser, respondError, readBody, rateLimit } from "@/lib/http";
import { type Section } from "@/lib/questions";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    rateLimit("attempts:"+user.id,30,60_000);
    const body = await readBody(request);
    if (Object.hasOwn(body, "assignmentId")) return error("Buka sesi lama melalui riwayat latihan.", 410);
    if (body.mode !== "full" && body.mode !== "practice") return error("Mode tidak valid.");
    if (body.mode === "practice" && (typeof body.section !== "string" || !["listening", "structure", "reading"].includes(body.section))) return error("Bagian tidak valid.");
    const id = createAttempt(user.id, body.mode, body.section as Section | undefined);
    return NextResponse.json({ id }, { status: 201 });
  } catch (cause) { return respondError(cause); }
}
