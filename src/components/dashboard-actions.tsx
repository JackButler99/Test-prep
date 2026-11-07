"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WorkspaceIcon } from "./workspace-icon";

export function DashboardActions({ logout = false }: { logout?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function start(mode: "full" | "practice", section?: string) {
    setBusy(section || mode); setError("");
    try {
      const response = await fetch("/api/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, section }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal memulai.");
      router.push(`/exam/${data.id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal memulai."); setBusy(""); }
  }
  async function signOut() {
    setBusy("logout");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error("Gagal keluar.");
      router.replace("/login");
      router.refresh();
    } catch { setBusy(""); }
  }
  if (logout) return <button className="nav-link logout" onClick={signOut} disabled={!!busy}><WorkspaceIcon name="logout"/><span>Keluar</span></button>;
  return <><div className="action-grid"><article className="action-feature"><span className="eyebrow">SIMULASI / 115 MENIT</span><h3>Rasakan alur<br />tes lengkap.</h3><p>140 soal dalam tiga bagian dengan waktu yang berjalan per bagian. Jawaban tersimpan otomatis.</p><button className="button light" onClick={() => start("full")} disabled={!!busy}>{busy === "full" ? "Menyiapkan..." : "Mulai simulasi"} <span>↗</span></button></article>
    <div className="practice-stack">{(["listening", "structure", "reading"] as const).map((section, index) => <button className="practice-card" key={section} onClick={() => start("practice", section)} disabled={!!busy}>
      <span className="practice-index">0{index + 1}</span><span><strong>{section === "structure" ? "Structure & Written Expression" : section === "listening" ? "Listening Comprehension" : "Reading Comprehension"}</strong><small>10 soal · tanpa batas waktu</small></span><span className="round-arrow">↗</span>
    </button>)}</div></div>{error && <p className="error-banner" role="alert">{error}</p>}</>;
}
