import { NextResponse } from "next/server";
import { checkOrigin,requireUser,readBody,rateLimit,respondError,HttpError } from "@/lib/http";
import { startAssessment } from "@/lib/assessments";
export const runtime="nodejs";
export async function POST(request:Request) {
  try{
    checkOrigin(request);const user=await requireUser();rateLimit("assessment-start:"+user.id,30,60_000);
    const body=await readBody(request);
    if (Object.hasOwn(body, "taskId")) throw new HttpError("Buka sesi yang sudah berjalan dari riwayat latihan.", 410);
    const id=startAssessment(user,{packageId:typeof body.packageId==="string"?body.packageId:undefined});
    return NextResponse.json({id},{status:201});
  }catch(error){return respondError(error);}
}
