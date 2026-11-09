import { NextResponse } from "next/server";
import { checkOrigin, requireUser, respondError, HttpError, readBody, rateLimit } from "@/lib/http";
import { createExperiment, transitionExperiment, expose } from "@/lib/experiments";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    rateLimit("platform:"+user.id,120,60_000);
    const body = await readBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError("Permintaan tidak valid.",400);
    let id: string | undefined;
    switch(body.action) {
      case "createClass": case "joinClass": case "createAssignment": case "requestInstructor": case "reviewInstructor":
        throw new HttpError("Fitur kelas dan instruktur sudah dihentikan.", 410);
      case "createExperiment": id=createExperiment(user,body); break;
      case "transitionExperiment": transitionExperiment(user,String(body.id??""),String(body.transition??"")); break;
      case "exposure": expose(user,String(body.id??"")); break;
      default: throw new HttpError("Aksi tidak dikenal.",400);
    }
    return NextResponse.json({ok:true,id});
  } catch(cause) { return respondError(cause); }
}
