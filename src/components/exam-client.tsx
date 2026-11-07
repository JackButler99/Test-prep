"use client";
import { ExamRoom } from "./exam-room";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AttemptData } from "@/lib/client-types";
import { SECTION_NAMES } from "@/lib/client-types";
import { availableVoices, selectSpeechVoices, splitSpeechLines } from "@/lib/listening-speech";

export function ExamClient({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<AttemptData | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [reviewSection, setReviewSection] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [speaking, setSpeaking] = useState(false);
  const speechRun = useRef(0);
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/attempts/${id}`, { cache: "no-store" });
    if (response.status === 401) { router.push("/login"); return; }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Gagal memuat sesi.");
    if (result.status === "finished") { router.replace(`/result/${id}`); return; }
    setData(result); setIndex(0);
  }, [id, router]);
  useEffect(() => { refresh().catch(cause => setError(String(cause))); }, [refresh]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (data?.deadline && now >= data.deadline) refresh().catch(cause => setError(String(cause)));
  }, [data?.deadline, now, refresh]);
  useEffect(() => () => {
    speechRun.current += 1;
    window.speechSynthesis?.cancel();
  }, []);

  const section = data?.mode === "full" ? (["listening", "structure", "reading"] as const)[data.sectionIndex] : data?.section;
  const questions = useMemo(() => data?.questions.filter(q => q.section === section) || [], [data, section]);
  const current = questions[index];
  useEffect(() => {
    speechRun.current += 1;
    window.speechSynthesis?.cancel();
    activeUtterance.current = null;
    setSpeaking(false);
  }, [current?.id]);
  const remaining = Math.max(0, (data?.deadline || 0) - now);
  const clock = `${Math.floor(remaining / 60000).toString().padStart(2, "0")}:${Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0")}`;
  async function choose(choice: number) {
    if (!data || !current || busy || (data.deadline && Date.now() >= data.deadline)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/attempts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: current.id, choice }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) await refresh(); throw new Error(result.error); }
      setData(previous => previous ? { ...previous, answers: { ...previous.answers, [current.id]: choice } } : previous);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal menyimpan jawaban."); }
    finally { setBusy(false); }
  }
  function stopSpeech() {
    speechRun.current += 1;
    window.speechSynthesis?.cancel();
    activeUtterance.current = null;
    setSpeaking(false);
  }
  async function advance() {
    if (!data || busy) return;
    stopSpeech(); setBusy(true); setError("");
    try {
      const response = await fetch(`/api/attempts/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionIndex: data.sectionIndex }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal berpindah bagian.");
      if (result.status === "finished") router.replace(`/result/${id}`);
      else { setData(result); setIndex(0); }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal berpindah bagian."); }
    finally { setBusy(false); }
  }
  async function play() {
    if (!current || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      setError("Browser ini tidak mendukung pembacaan audio. Coba browser lain."); return;
    }
    stopSpeech();
    const run = speechRun.current;
    const synthesis = window.speechSynthesis;
    const lines = splitSpeechLines(current.stimulus);
    setError(""); setSpeaking(true);
    try {
      const voices = selectSpeechVoices(await availableVoices(synthesis));
      if (run !== speechRun.current) return;

      function speakLine(index: number) {
        if (run !== speechRun.current) return;
        if (index === lines.length) { activeUtterance.current = null; setSpeaking(false); return; }
        const line = lines[index];
        const utterance = new SpeechSynthesisUtterance(line.text);
        utterance.lang = "en-US";
        utterance.voice = voices[line.speaker] ?? null;
        utterance.rate = 0.9;
        utterance.pitch = line.speaker === "man" ? 0.85 : line.speaker === "woman" ? 1.15 : 1;
        utterance.onend = () => speakLine(index + 1);
        utterance.onerror = () => {
          if (run !== speechRun.current) return;
          stopSpeech();
          setError("Gagal memutar audio dengan suara browser ini. Coba browser lain.");
        };
        activeUtterance.current = utterance;
        synthesis.speak(utterance);
      }
      speakLine(0);
    } catch {
      if (run !== speechRun.current) return;
      stopSpeech();
      setError("Gagal memulai audio dengan suara browser ini. Coba browser lain.");
    }
  }
  if (!data) return <main className="state-screen"><Link href="/" className="brand"><span className="brand-mark">I.</span> ITP Practice Lab</Link><div className="state-box">{error ? <><h2>Belum bisa membuka sesi.</h2><p>{error}</p><button className="button dark" onClick={() => refresh().catch(cause => setError(String(cause)))}>Coba lagi</button></> : <p>Memuat sesi latihan...</p>}</div></main>;
  if (!current || !section) return <main className="state-screen">Tidak ada soal di bagian ini. <Link href="/">Kembali</Link></main>;
  return <ExamRoom key={section} questions={questions} answers={data.answers} index={index}
    sectionTitle={SECTION_NAMES[section]}
    sessionLabel={data.mode === "full" ? `Simulasi penuh · Bagian ${data.sectionIndex + 1} dari 3` : "Latihan singkat"}
    clock={data.deadline ? clock : null} urgent={remaining < 60_000}
    lastSection={data.mode === "practice" || data.sectionIndex === 2}
    busy={busy} speaking={speaking} error={error}
    reviewOpen={reviewSection === data.sectionIndex}
    onReview={open => setReviewSection(open ? data.sectionIndex : null)}
    onJump={position => { stopSpeech(); setIndex(position); }}
    onChoose={choice => void choose(choice)} onPlay={() => void play()}
    onSubmit={async () => { if (await advance()) setReviewSection(null); }}
  />;
}
