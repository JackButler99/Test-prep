"use client";
import { useState,type FormEvent,type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UiDialog } from "./ui-dialog";
import { ExamProctor } from "./exam-proctor";

export async function learningCommand(payload:Record<string,unknown>){
  const r=await fetch("/api/learning",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data=await r.json();if(!r.ok)throw Error(data.error??"Gagal menyimpan. Coba lagi.");return data;
}
export function LearningForm({action,values={},children,button="Simpan",jsonFields=[],dateFields=[]}:{action:string;values?:Record<string,unknown>;children?:ReactNode;button?:string;jsonFields?:string[];dateFields?:string[]}){
  const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setMessage("");setError("");const form=e.currentTarget;
    try{const fields:Record<string,unknown>=Object.fromEntries(new FormData(form));for(const key of jsonFields){try{fields[key]=JSON.parse(String(fields[key]));}catch{throw Error("Format JSON belum valid. Periksa tanda kutip, koma, dan kurung sebelum mencoba lagi.");}}for(const key of dateFields)if(fields[key])fields[key]=String(fields[key])+"+07:00";const data=await learningCommand({...fields,...values,action});setMessage(data.count?`${data.count} soal berhasil diimpor sebagai draft.`:"Perubahan berhasil disimpan.");router.refresh();}
    catch(error){setError(error instanceof Error?error.message:"Gagal menyimpan. Isianmu tetap tersimpan di formulir.");}finally{setBusy(false);}
  }
  return <form className="platform-form" onSubmit={submit} aria-busy={busy}>{children}<button disabled={busy} className="button dark">{busy?"Menyimpan…":button}</button>{message&&<p role="status" className="form-feedback">✓ {message}</p>}{error&&<p className="error-banner" role="alert">{error}</p>}</form>;
}
export function AssessmentStart({packageId,taskId,details}:{packageId?:string;taskId?:string;details?:{title:string;count:number;duration:string;hasUntimed:boolean;sharedTimer?:boolean}}){
  const router=useRouter(),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirm,setConfirm]=useState(false);
  async function start(){setBusy(true);setError("");try{const r=await fetch("/api/assessments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({packageId,taskId})});const data=await r.json();if(!r.ok)throw Error(data.error);router.push(`/assessment/${data.id}`);}catch(error){setError(error instanceof Error?error.message:"Gagal memulai. Coba lagi.");setBusy(false);}}
  const timed = details && details.duration !== "Tanpa timer";
  const summary = details && <>
    <h3>{details.title}</h3>
    <div className="start-facts">
      <span><strong>{details.count}</strong> soal</span>
      <span>{details.duration}{details.hasUntimed && timed ? " + bagian tanpa timer" : ""}</span>
    </div>
  </>;
  return <div><button className="button primary" disabled={busy} onClick={()=>details?setConfirm(true):void start()}>{busy?"Menyiapkan…":taskId?"Kerjakan tugas →":"Mulai latihan →"}</button>{error&&!confirm&&<p className="error-banner" role="alert">{error}</p>}{confirm&&details&&<UiDialog title="Siap memulai latihan?" onClose={()=>{if(!busy)setConfirm(false);}}>{timed ? <ExamProctor>{summary}</ExamProctor> : summary}<ul className="start-checklist"><li>Jawaban disimpan setiap kali kamu memilih.</li><li>{details.duration==="Tanpa timer"?"Paket ini tanpa batas waktu. Kamu dapat melanjutkan dari riwayat latihan.":details.sharedTimer?"Timer gabungan berjalan setelah sesi dibuat dan tetap berjalan saat halaman ditutup.":"Timer bagian berjalan setelah sesi dibuat dan tetap berjalan saat halaman ditutup."}</li><li>{details.sharedTimer?"Kamu bisa berpindah soal hingga sesi dikumpulkan atau waktu habis.":"Bagian yang sudah diselesaikan tidak dapat dibuka kembali untuk mengubah jawaban."}</li></ul>{error&&<p className="error-banner" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button ghost" disabled={busy} onClick={()=>setConfirm(false)}>Belum sekarang</button><button className="button primary" disabled={busy} onClick={()=>void start()}>{busy?"Menyiapkan…":"Mulai sekarang"}</button></div></UiDialog>}</div>;
}
