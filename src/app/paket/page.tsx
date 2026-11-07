import Link from "next/link";
import { getUser } from "@/lib/auth";
import { openPracticePackages, publishedProducts } from "@/lib/products";
import { assessmentHistory } from "@/lib/assessments";
import { MaterialCard, ProductCard, ProductShell } from "@/components/product-cards";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await getUser();
  const products = publishedProducts();
  const open = openPracticePackages(user?.id);
  const history = user ? assessmentHistory(user.id) : [];
  return <ProductShell user={user} active="catalog">
    <section className="workspace-heading">
      <span className="eyebrow">KATALOG PAKET</span>
      <h1>Temukan latihan yang kamu butuhkan</h1>
      <p>Periksa kesiapanmu, pilih materi, dan pelajari pembahasan setelah selesai.</p>
    </section>
    <section className="workspace-section" aria-labelledby="product-list">
      <div className="section-title"><h2 id="product-list">Paket persiapan</h2>{user && <Link href="/paket-saya">Paket Saya →</Link>}</div>
      {products.length ? <div className="metric-grid">{products.map(product => <ProductCard product={product} key={product.id} />)}</div>
        : <div className="workspace-card empty-state"><p>Paket persiapan sedang disiapkan.</p></div>}
    </section>
    <section className="workspace-section" id="open-practice" aria-labelledby="open-practice-title">
      <h2 id="open-practice-title">Latihan gratis</h2>
      <div className="metric-grid">
        {user?.role !== "admin" && <article className="workspace-card">
          <h3>Latihan singkat TOEFL ITP</h3>
          <p>Pilih Listening, Structure, atau Reading dari dashboard.</p>
          <Link className="button ghost" href={user ? "/#quick-practice" : "/login?next=%2F%23quick-practice"}>{user ? "Buka latihan singkat" : "Masuk untuk mulai"}</Link>
        </article>}
        {open.map(material => <MaterialCard key={material.id} material={material} user={user} signInHref="/login?next=/paket" />)}
      </div>
      {user?.role === "admin" && !open.length && <p className="muted">Belum ada materi tambahan dengan akses Publik.</p>}
    </section>
    {user && <section className="workspace-section" id="history">
      <h2>Riwayat paket</h2>
      {history.length ? <div className="workspace-card activity-card">{history.map(session => <Link className="activity-line" href={`/assessment/${session.id}`} key={session.id}>
        <span className="activity-copy"><strong>{session.title}</strong><small>{session.examTitle}</small></span>
        <span className="status-badge neutral">{session.status === "finished" ? "Lihat hasil" : "Lanjutkan"}</span>
      </Link>)}</div> : <p className="muted">Sesi paket yang kamu kerjakan akan muncul di sini.</p>}
    </section>}
  </ProductShell>;
}
