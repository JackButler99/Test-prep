import Link from "next/link";
import { PlatformShell } from "@/components/platform-shell";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const user = await getUser();
  const content = <>
    <section className="workspace-heading">
      <span className="eyebrow">INFORMASI</span>
      <h1>Tentang ITP Practice Lab</h1>
      <p>Ruang belajar untuk latihan TOEFL, paket persiapan, dan simulasi mandiri.</p>
    </section>
    <section className="workspace-section workspace-card" aria-labelledby="practice-options">
      <h2 id="practice-options">Cara belajar</h2>
      <ul>
        <li><strong>Latihan singkat.</strong> Pilih Listening, Structure, atau Reading dari beranda.</li>
        <li><strong>Paket dan simulasi.</strong> Lihat materi yang tersedia dan baca pembahasannya setelah sesi selesai.</li>
        <li><strong>Cek kesiapan.</strong> Lihat bagian yang perlu dilatih dan pilih latihan berikutnya.</li>
      </ul>
      <p className="muted">Hasil digunakan untuk latihan mandiri. Aplikasi ini tidak menerbitkan skor atau sertifikat resmi.</p>
      <Link className="button primary" href={user ? "/" : "/login"}>{user ? "Kembali ke beranda" : "Masuk atau daftar"}</Link>
    </section>
  </>;

  if (user) return <PlatformShell user={user} active="about">{content}</PlatformShell>;

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true">I.</span> ITP Practice Lab</div></header>
    {content}
  </main>;
}
