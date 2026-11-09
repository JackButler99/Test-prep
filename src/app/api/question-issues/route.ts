import { NextResponse } from "next/server";
import { rateLimit, readBody, requireUser, respondError } from "@/lib/http";
import { checkLearningRequest } from "@/lib/learning-security";
import { reportQuestion } from "@/lib/question-issues";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkLearningRequest(request);
    const user = await requireUser();
    rateLimit(`question-issues:${user.id}`, 20, 60_000);
    reportQuestion(user, await readBody(request, 8192, { timeoutMs: 10_000 }));
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (cause) { return respondError(cause); }
}
