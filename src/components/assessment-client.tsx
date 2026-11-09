"use client";
import Link from "next/link";
import { useEffect,useState,useRef,type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PackageSnapshot, PublicAssessment } from "@/lib/learning-types";
import { createAssessmentPreview } from "@/lib/assessment-preview";
import { AssessmentWorkspace } from "./assessment-workspace";
import { AssessmentResults } from "./assessment-results";
import { ItpListening } from "./itp-listening";
import { availableVoices,selectSpeechVoices,splitSpeechLines } from "@/lib/listening-speech";
import { StudentRoomBara } from "./student-room-bara";

export function AssessmentClient({ id, renderFollowUp, onFinished, preview }: {
  id: string;
  renderFollowUp?: (data: PublicAssessment) => ReactNode;
  onFinished?: (data: PublicAssessment) => void;
  preview?: PackageSnapshot;
}) {
  const [previewSession] = useState(() => preview ? createAssessmentPreview(id, preview) : null);
  const backHref = previewSession ? "/manage/packages#package-list" : "/paket";
  const [data,setData]=useState<PublicAssessment|null>(null),[navigation,setNavigation]=useState({ section: 0, position: 0 }),[error,setError]=useState(""),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now());
  useEffect(() => {
    if (data?.status === "finished") onFinished?.(data);
  }, [data, onFinished]);
  const [saveState,setSaveState]=useState("idle"),[online,setOnline]=useState(true),[speaking,setSpeaking]=useState(false);
  const router=useRouter(),mounted=useRef(true),speechSequence=useRef(0),requestSequence=useRef(0),saving=useRef(false);
  async function refresh(){if(saving.current)return;
    if (previewSession) { setData(previewSession.load()); return; }
    const sequence=++requestSequence.current;const r=await fetch(`/api/assessments/${id}`,{cache:"no-store"});if(r.status===401){router.replace("/login");return;}const result=await r.json();if(!r.ok)throw Error(result.error);if(mounted.current&&sequence===requestSequence.current&&!saving.current)setData(result);}
  useEffect(()=>{mounted.current=true;void refresh().catch(e=>setError(e.message));const poll=previewSession ? undefined : setInterval(()=>{void refresh().catch(()=>{});},15000),clock=setInterval(()=>setNow(Date.now()),1000);return()=>{mounted.current=false;clearInterval(poll);clearInterval(clock);};},[id]);
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);update();window.addEventListener("online",update);window.addEventListener("offline",update);return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);};},[]);
  const index = data?.sectionIndex === navigation.section ? navigation.position : 0;
  const question = data?.questions[Math.min(index, Math.max(0, data.questions.length - 1))];
  useEffect(() => { setSpeaking(false); }, [question?.id]);
  useEffect(()=>{if(data?.status==="active"&&data.deadline!==null&&now>=data.deadline)void refresh().catch(e=>setError(e.message));},[Math.floor(now/5000),data?.deadline,data?.status]);
  useEffect(()=>{
    if(!question||data?.status!=="active")return;
    if (previewSession) return () => { speechSequence.current++; window.speechSynthesis?.cancel(); };
    const tick=(visible:boolean)=>void fetch(`/api/assessments/${id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"view",questionId:question.id,visible}),keepalive:true}).catch(()=>{});
    const report=()=>tick(document.visibilityState==="visible"&&document.hasFocus());report();
    const interval=setInterval(report,10000);document.addEventListener("visibilitychange",report);window.addEventListener("focus",report);window.addEventListener("blur",report);
    return()=>{clearInterval(interval);document.removeEventListener("visibilitychange",report);window.removeEventListener("focus",report);window.removeEventListener("blur",report);tick(false);speechSequence.current++;window.speechSynthesis?.cancel();};
  },[id,question?.id,data?.status,previewSession]);
  const loadPreviewAudio = previewSession ? async (questionId: string, signal: AbortSignal) => {
    previewSession.listen(questionId);
    const response = await fetch(`/api/admin/package-preview/${encodeURIComponent(id)}/audio?questionId=${encodeURIComponent(questionId)}`,
      { cache: "no-store", signal });
    if (!response.ok) throw Error((await response.json()).error);
    const audio = await response.blob();
    if (!signal.aborted) previewSession.listen(questionId, true);
    return audio;
  } : undefined;

  async function act(payload:Record<string,unknown>){
    if (previewSession) {
      setError("");
      try { setData(previewSession.act(payload)); }
      catch (error) {
        setData(previewSession.load());
        setError(error instanceof Error ? error.message : "Tindakan pratinjau gagal.");
      }
      return;
    }
    setSaveState("saving");saving.current=true;const sequence=++requestSequence.current;setBusy(true);setError("");try{const r=await fetch(`/api/assessments/${id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await r.json();if(!r.ok){saving.current=false;await refresh().catch(()=>{});throw Error(result.error);}if(mounted.current&&sequence===requestSequence.current){setData(result);setSaveState("saved");}}catch(e){setSaveState("error");setError(e instanceof Error?e.message:"Jawaban belum tersimpan. Periksa koneksi, lalu pilih ulang jawabanmu.");}finally{saving.current=false;setBusy(false);}
  }
  function stopSpeech() {
    speechSequence.current++;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  async function speak() {
    if (!question || !("speechSynthesis" in window)) {
      setError("Suara browser tidak tersedia. Gunakan perangkat yang mendukung.");
      return;
    }
    stopSpeech();
    setError("");
    setSpeaking(true);
    const sequence = speechSequence.current;
    const voices = selectSpeechVoices(await availableVoices(window.speechSynthesis));
    for (const line of splitSpeechLines(question.stimulus)) {
      if (sequence !== speechSequence.current) return;
      await new Promise<void>(resolve => {
        const speech = new SpeechSynthesisUtterance(line.text);
        speech.lang = "en-US";
        speech.voice = voices[line.speaker] ?? null;
        speech.onend = speech.onerror = () => resolve();
        window.speechSynthesis.speak(speech);
      });
    }
    if (sequence === speechSequence.current) setSpeaking(false);
  }

  if (!data) return <main className="shell assessment-loading">
    {!error && <div className="loading-skeleton" aria-hidden="true" />}
    <h1>{error ? "Sesi belum bisa dibuka." : previewSession ? "Pratinjau simulasi" : "Menyiapkan ruang latihan."}</h1>
    <p role={error ? "alert" : "status"}>{error || "Memuat sesi…"}</p>
    <Link className="button ghost" href={backHref}>{previewSession ? "Kembali ke Materi latihan" : "Kembali ke paket latihan"}</Link>
  </main>;

  const remaining = data.deadline === null ? null : Math.ceil(Math.max(0, data.deadline - now) / 1000);
  const minutes = remaining === null ? 0 : Math.floor(remaining / 60);
  const clock = remaining === null ? null : minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const position = Math.min(index, data.questions.length - 1);
  const status = !online ? "Offline" : previewSession ? "Pratinjau admin" : saveState === "saving" ? "Menyimpan…"
    : saveState === "error" ? "Jawaban belum tersimpan" : data.status === "finished" ? "Sesi selesai"
      : saveState === "saved" ? "Jawaban tersimpan" : "Sesi aktif";

  return <main className="assessment-app">
    <header className="assessment-bar">
      <div className="assessment-wrap assessment-bar-inner">
        <Link className="assessment-control assessment-back-link" href={backHref} aria-label={previewSession ? "Kembali ke Materi latihan" : "Kembali ke paket latihan"}
          aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>
          <span aria-hidden="true">←</span><span>Kembali</span>
        </Link>
        <div className="assessment-session">
          <p>{data.title}</p>
          <span className={`assessment-session-status${saveState === "error" || !online ? " is-error" : ""}`} role="status">{status}</span>
        </div>
        {data.status === "active" && <div className={`assessment-clock${remaining !== null && remaining < 120 ? " is-urgent" : ""}`}
          role={clock === null ? undefined : "timer"} aria-label={clock === null ? undefined : "Waktu tersisa"} aria-live="off">
          {clock === null ? <span><span className="student-room-bara-status"><StudentRoomBara /><span className="student-room-bara-time">Tanpa timer</span></span></span> : <><span>Sisa waktu</span><strong>{clock}</strong></>}
        </div>}
      </div>
    </header>
    {(previewSession || error || !online) && <div className="assessment-wrap assessment-notices">
      {previewSession && <p className="assessment-preview-note">Pratinjau admin · Jawaban dan hasil hanya ada di tab ini.</p>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {!online && <p className="error-banner" role="alert">Koneksi terputus. Sambungkan kembali sebelum melanjutkan.</p>}
    </div>}
    {data.status === "finished" && data.result
      ? <div className="shell assessment-shell"><AssessmentResults data={data} followUp={renderFollowUp?.(data)} preview={!!previewSession} /></div>
      : question ? <AssessmentWorkspace data={data} position={position} onJump={position => setNavigation({ section: data.sectionIndex, position })} busy={busy} online={online} onAction={act}
        speaking={speaking} onSpeak={() => void speak()} onStop={stopSpeech} recordsViewingTime={!previewSession}
        listening={data.listening && <ItpListening key={question.id} id={id} data={{ ...data, listening: data.listening }}
          now={now} busy={busy} online={online} act={act} sync={refresh} loadPreviewAudio={loadPreviewAudio} />} />
      : <p className="assessment-wrap">Tidak ada soal pada bagian ini.</p>}
  </main>;
}
