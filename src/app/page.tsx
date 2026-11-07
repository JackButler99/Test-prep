import Link from "next/link";
import { dashboardUser } from "@/lib/access";
import { recentAttempts } from "@/lib/attempts";
import { assessmentHistory } from "@/lib/assessments";
import { getPrompt } from "@/lib/experiments";
import { availableDiagnostic, ownedProducts } from "@/lib/products";
import { PlatformShell } from "@/components/platform-shell";
import { Disclosure } from "@/components/disclosure";
import { DashboardActions } from "@/components/dashboard-actions";
import { ProductCard } from "@/components/product-cards";
import { PracticePrompt } from "@/components/platform-controls";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await dashboardUser("student", "admin");
  const diagnostic = availableDiagnostic();
  const owned = ownedProducts(user.id);
  const legacy = recentAttempts(user.id).map(session => ({
    ...session, title: session.mode === "full" ? "Simulasi TOEFL ITP" : `Latihan ${session.section}`,
    href: session.status === "finished" ? `/result/${session.id}` : `/exam/${session.id}`,
  }));
  const packageSessions = assessmentHistory(user.id).map(session => ({ ...session, href: `/assessment/${session.id}` }));
  const history = [...legacy, ...packageSessions].sort((a, b) => b.startedAt - a.startedAt);
  const active = history.find(session => session.status === "active");
  const prompt = user.role === "student" ? getPrompt(user) : null;
  const next = user.role === "admin" ? { href: "/manage/products", label: "Kelola produk" }
    : active ? { href: active.href, label: "Lanjutkan latihan" }
    : diagnostic ? { href: `/paket/${diagnostic.slug}`, label: "Cek kesiapan gratis" }
    : { href: "/paket", label: "Lihat katalog paket" };

  return <PlatformShell user={user} active="student">
    <section className="workspace-heading"><span className="eyebrow">BERANDA</span><h1>Halo, {user.username}.</h1>
      <p>{user.role === "admin" ? "Siapkan materi, terbitkan produk, dan kelola akses akun peserta." : "Mulai dari cek kesiapan atau lanjutkan latihan terakhirmu."}</p></section>
    <section className="learning-hero">
      <div><span className="eyebrow">LANGKAH BERIKUTNYA</span>
        <h2>{user.role === "admin" ? "Siapkan paket untuk peserta" : active?.title ?? "Kenali bagian yang perlu kamu latih"}</h2>
        <Link className="button light" href={next.href}>{next.label} →</Link>
      </div>
    </section>
    <section className="workspace-section">
      <div className="section-title"><h2>Paket Saya</h2><Link href="/paket-saya">Lihat semua →</Link></div>
      {owned.length ? <div className="metric-grid">{owned.slice(0, 3).map(product => <ProductCard product={product} key={product.id} owned />)}</div>
        : <div className="workspace-card"><p>Produk yang aktif di akunmu akan muncul di sini.</p><Link className="button ghost" href="/paket">Buka katalog paket</Link></div>}
    </section>
    {prompt && <section className="workspace-section" id="quick-practice">
      <h2>Latihan singkat</h2>
      <PracticePrompt key={prompt.experimentId ?? "default"} {...prompt} />
      <Disclosure title="Pilih bagian atau simulasi bawaan" description="Mulai latihan mandiri TOEFL ITP."><DashboardActions /></Disclosure>
    </section>}
    <section className="workspace-section" id="riwayat">
      <h2>Aktivitas terbaru</h2>
      {history.length ? <div className="workspace-card activity-card">{history.slice(0, 12).map(session => <Link className="activity-line" href={session.href} key={session.id}>
        <span className="activity-copy"><strong>{session.title}</strong><small>{new Date(session.startedAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</small></span>
        <span className="status-badge neutral">{session.status === "finished" ? "Lihat hasil" : "Lanjutkan"}</span>
      </Link>)}</div> : <p className="muted">Sesi dan hasilmu akan muncul setelah kamu mulai latihan.</p>}
    </section>
  </PlatformShell>;
}
