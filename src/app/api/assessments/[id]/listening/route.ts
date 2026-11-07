import { readBody, requireUser, rateLimit, respondError } from "@/lib/http";
import { checkLearningRequest } from "@/lib/learning-security";
import { claimListeningAudio } from "@/lib/assessments";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkLearningRequest(request);
    const user = await requireUser();
    rateLimit(`assessment-audio:${user.id}`, 90, 60_000);
    const body = await readBody(request, 2048, { timeoutMs: 10_000 });
    const audio = claimListeningAudio((await params).id, user.id, body.questionId);
    return new Response(new Uint8Array(audio), { headers: {
      "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return respondError(error); }
}
