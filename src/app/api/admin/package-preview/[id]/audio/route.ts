import { HttpError, requireUser, respondError } from "@/lib/http";
import { readItpAudio, validItpSnapshot } from "@/lib/itp-simulation";
import { adminPreviewSnapshot } from "@/lib/package-preview";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const snapshot = adminPreviewSnapshot(user, (await params).id);
    if (!snapshot?.itpSimulation || !validItpSnapshot(snapshot)) throw new HttpError("Audio pratinjau tidak ditemukan.", 404);
    const questionId = new URL(request.url).searchParams.get("questionId");
    const position = snapshot.questions.filter(question => question.section === "listening").findIndex(question => question.id === questionId);
    const clip = snapshot.itpSimulation.listening[position];
    if (!clip) throw new HttpError("Audio pratinjau tidak ditemukan.", 404);
    return new Response(new Uint8Array(readItpAudio(clip)), { headers: {
      "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return respondError(error); }
}
