import { NextResponse } from "next/server";
import { requireUser,readBody,rateLimit,respondError,HttpError } from "@/lib/http";
import { assertRole } from "@/lib/access";
import { checkLearningRequest,checkJsonDepth } from "@/lib/learning-security";
import { assertImportEnvelope } from "@/lib/question-input";
import { audit } from "@/lib/experiments";
import { saveQuestion,importQuestions,transitionQuestions,saveExamProfile,createPackage,transitionPackage,setPackageVisibility } from "@/lib/learning-bank";
import { createProduct, changeProductState, discardDraftProduct, grantProductAccess } from "@/lib/products";
import { resolveQuestionIssue } from "@/lib/question-issues";

export const runtime="nodejs";
export async function POST(request:Request) {
  let actor:string|undefined, importing=false;
  try {
    checkLearningRequest(request);const user=await requireUser();assertRole(user,"admin");actor=user.id;rateLimit("learning:"+user.id,90,60_000);
    const body=await readBody(request,512_000,{timeoutMs:10_000,strictUtf8:true,beforeParse:checkJsonDepth});let id:string|undefined,count:number|undefined;
    switch(body.action){
      case "saveQuestion": id=saveQuestion(user,body);break;
      case "importQuestions": rateLimit("question-import:"+user.id,5,60_000);importing=true;assertImportEnvelope(body);count=importQuestions(user,body.items).length;break;
      case "transitionQuestions": transitionQuestions(user,body.ids,String(body.transition),body.note);break;
      case "saveExam": id=saveExamProfile(user,body);break;
      case "createPackage": id=createPackage(user,body);break;
      case "transitionPackage": transitionPackage(user,String(body.id),String(body.transition));break;
      case "setPackageVisibility": setPackageVisibility(user,body);break;
      case "createAssessmentTask": throw new HttpError("Tugas kelas sudah dihentikan.", 410);
      case "createProduct": id=createProduct(user,body);break;
      case "publishProduct": changeProductState(user,body.id,"publish");break;
      case "archiveProduct": changeProductState(user,body.id,"archive");break;
      case "discardDraftProduct": discardDraftProduct(user,body.id);break;
      case "grantProductAccess": grantProductAccess(user,body.id,body.username);break;
      case "resolveQuestionIssue": resolveQuestionIssue(user,body.id);break;
      default:throw new HttpError("Aksi tidak dikenal.",400);
    }
    return NextResponse.json({ok:true,id,count},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    if(actor&&importing){try{audit(actor,"questions.import.rejected",`status:${error instanceof HttpError?error.status:500}`);}catch{console.error("Import rejection audit could not be recorded.");}}
    return respondError(error);
  }
}
