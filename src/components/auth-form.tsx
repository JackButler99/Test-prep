"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AuthForm({ returnTo = "/" }: { returnTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, username: form.get("username"), password: form.get("password") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Tidak dapat masuk.");
      router.replace(returnTo);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Tidak dapat masuk."); setBusy(false); }
  }
  return <div className="auth-card">
    <Link href="/tentang" className="back-link">Tentang Practice Lab <span aria-hidden="true">↗</span></Link>
    <span className="eyebrow">AKUN BELAJAR</span>
    <h2>{mode === "register" ? "Buat akun baru" : "Masuk ke akunmu"}</h2>
    <p>{mode === "register" ? "Buat akun untuk menyimpan progres dan melihat pembahasan." : "Masuk untuk membuka paket dan melanjutkan latihan."}</p>
    <div className="segmented" role="group" aria-label="Pilihan akun">
      <button type="button" aria-pressed={mode === "login"} className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); }}>Masuk</button>
      <button type="button" aria-pressed={mode === "register"} className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); }}>Daftar</button>
    </div>
    <form onSubmit={submit}><label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" placeholder="nama_pengguna" /></label><label>Kata sandi<input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 10 : 1} placeholder={mode === "register" ? "Minimal 10 karakter" : "Kata sandi akunmu"} /></label>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy}>{busy ? "Memproses..." : mode === "register" ? "Buat akun" : "Masuk"} <span>→</span></button></form>
    <small>Simulasi ini untuk latihan pribadi dan tidak menerbitkan skor resmi.</small></div>;
}
