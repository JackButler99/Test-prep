import { requireUser,respondError } from "@/lib/http";
import { assertRole } from "@/lib/access";
import { resultsCsv } from "@/lib/learning-analytics";
export const runtime="nodejs";
export async function GET(request:Request){
  try{
    const user=await requireUser(),params=new URL(request.url).searchParams;
    assertRole(user,"admin");
    return new Response(resultsCsv(user,{examId:params.get("exam")??undefined,packageId:params.get("package")??undefined,classroomId:params.get("classroom")??undefined}),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="hasil-peserta.csv"',"Cache-Control":"no-store"}});
  }catch(error){return respondError(error);}
}
