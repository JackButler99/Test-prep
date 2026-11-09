import Link from "next/link";
import { dashboardUser } from "@/lib/access";
import { productPackageOptions, productsForAdmin } from "@/lib/products";
import { openQuestionIssues } from "@/lib/question-issues";
import { PlatformShell } from "@/components/platform-shell";
import { LearningForm } from "@/components/learning-controls";
import { ProductEditor, ProductStateButton } from "@/components/product-editor";

export const dynamic = "force-dynamic";
const state = { draft: "Draf", published: "Terbit", archived: "Diarsipkan" };

export default async function ProductsPage() {
  const user = await dashboardUser("admin");
  const products = productsForAdmin(user);
  const issues = openQuestionIssues(user);
  const packages = productPackageOptions(user);
  return <PlatformShell user={user} active="products">
    <section className="workspace-heading"><span className="eyebrow">KATALOG & AKSES</span><h1>Produk dan akses paket</h1>
      <p>Susun produk dari materi terbit. Satu akses membuka semua latihan di dalam produk.</p></section>
    <section className="workspace-section workspace-card">
      <div className="section-title"><h2>Buat produk</h2><Link href="/manage/packages">Kelola materi →</Link></div>
      {packages.length ? <ProductEditor packages={packages} /> : <p>Siapkan materi terbit berakses Privat yang belum digunakan produk lain.</p>}
    </section>
    <section className="workspace-section">
      <h2>Daftar produk</h2>
      {products.map(product => {
        const materialsReady = product.packages.length > 0 && product.packages.every(material => material.available);
        const canPublish = materialsReady && (product.kind !== "diagnostic" ||
          (product.packages.length === 1 && product.packages[0].diagnostic));
        return <article className="workspace-card package-list-card" key={product.id}>
          <span className="status-badge neutral">{state[product.state]} · {product.access === "free" ? "Gratis" : "Berbayar"}</span>
          <h3>{product.title}</h3><p>{product.description}</p>
          <ol>{product.packages.map(material => <li key={material.id}>{material.title} · {material.available ? "Siap dikerjakan" : "Materi belum tersedia"}</li>)}</ol>
          <div className="inline-actions">
            {product.state === "draft" && <>{canPublish && <ProductStateButton id={product.id} action="publishProduct" />}<ProductStateButton id={product.id} action="discardDraftProduct" /></>}
            {product.state === "published" && <><Link className="button ghost" href={`/paket/${product.slug}`}>Lihat halaman produk</Link><ProductStateButton id={product.id} action="archiveProduct" /></>}
          </div>
          {product.state === "draft" && !canPublish && <p className="muted">{materialsReady
            ? "Produk diagnostik membutuhkan satu materi TOEFL dengan 5 Listening, 5 Structure, dan 5 Reading."
            : "Draf belum bisa diterbitkan. Periksa profil ujian, revisi soal, dan audio materi."}</p>}
          {product.access === "paid" && product.state === "published" && (
            materialsReady
              ? <LearningForm action="grantProductAccess" values={{ id: product.id }} button="Aktifkan akses uji">
                  <label>Username peserta<input name="username" required maxLength={30} /></label>
                </LearningForm>
              : <p className="muted">Lengkapi materi sebelum memberikan akses baru.</p>
          )}
        </article>;
      })}
      {!products.length && <p className="muted">Belum ada produk.</p>}
    </section>
    <section className="workspace-section" id="laporan-soal">
      <div className="section-title"><h2>Laporan soal</h2><Link href="/manage/questions">Buka Bank Soal →</Link></div>
      {issues.map(issue => <article className="workspace-card package-list-card" key={issue.id}>
        <p className="muted">Revisi <code>{issue.revision_id}</code> · {new Date(issue.created_at).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
        <p className="preserve-text">{issue.note}</p>
        <LearningForm action="resolveQuestionIssue" values={{ id: issue.id }} button="Tandai sudah ditinjau" />
      </article>)}
      {!issues.length && <p className="muted">Belum ada laporan yang menunggu.</p>}
    </section>
  </PlatformShell>;
}
