import { NextResponse } from "next/server";
import { createAttempt } from "@/lib/attempts";
import { checkOrigin, error, requireUser, respondError, readBody, rateLimit } from "@/lib/http";
import { type Section } from "@/lib/questions";
import { assignmentForStudent } from "@/lib/classrooms";
import { transaction } from "@/lib/db";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    rateLimit("attempts:"+user.id,30,60_000);
    const body = await readBody(request);
    if (body.assignmentId !== undefined) {
      if (typeof body.assignmentId !== "string" || !body.assignmentId.trim()) return error("ID tugas tidak valid.");
      const assignmentId = body.assignmentId;
      if (user.role !== "student") return error("Hanya peserta dapat mengerjakan tugas.",403);
      return transaction(() => {
        const task = assignmentForStudent(user.id, assignmentId);
        if (task.attempt_id) return NextResponse.json({ id: task.attempt_id });
        const id = createAttempt(user.id, "practice", task.section, task.id);
        return NextResponse.json({ id }, { status: 201 });
      });
    }
    if (body.mode !== "full" && body.mode !== "practice") return error("Mode tidak valid.");
    if (body.mode === "practice" && (typeof body.section !== "string" || !["listening", "structure", "reading"].includes(body.section))) return error("Bagian tidak valid.");
    const id = createAttempt(user.id, body.mode, body.section as Section | undefined);
    return NextResponse.json({ id }, { status: 201 });
  } catch (cause) { return respondError(cause); }
}
