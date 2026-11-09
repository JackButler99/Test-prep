import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";
import { ownedProducts, productBySlug, productMaterials, publishedProducts } from "@/lib/products";
import { MaterialCard, ProductShell } from "@/components/product-cards";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getUser();
  const product = productBySlug((await params).slug, user?.id);
  if (!product) notFound();
  const own = user ? ownedProducts(user.id).some(item => item.id === product.id) : false;
  const materials = productMaterials(product.id, user?.id);
  const diagnostic = publishedProducts().find(item => item.kind === "diagnostic");
  const signInHref = `/login?next=/paket/${product.slug}`;
  return <ProductShell user={user} active="catalog">
    <section className="workspace-heading">
      <span className="eyebrow">{product.kind === "diagnostic" ? "DIAGNOSTIK GRATIS" : "PAKET PERSIAPAN"}</span>
      <h1>{product.title}</h1>
      <p>{product.description}</p>
      <div className="inline-actions">
        <span className="status-badge neutral">{own ? "Akses aktif" : product.access === "free" ? "Gratis" : "Paket berbayar"}</span>
        <span>{materials.length} latihan · {materials.reduce((sum, row) => sum + row.count, 0)} soal dalam paket</span>
      </div>
    </section>
    {product.kind === "diagnostic" && <p className="workspace-card">Hasil singkat memberi indikasi awal dan arah latihan. Pembahasan tersedia setelah sesi selesai.</p>}
    {product.access === "paid" && !own && <section className="workspace-card" aria-label="Status pembelian">
      <h2>Pembelian belum dibuka</h2>
      <p>Lihat isi paket di bawah. Kamu bisa mulai dari latihan gratis selama akses penjualan disiapkan.</p>
      <Link className="button primary" href={diagnostic ? `/paket/${diagnostic.slug}` : "/paket"}>{diagnostic ? "Coba diagnostik gratis" : "Lihat latihan gratis"}</Link>
    </section>}
    <section className="workspace-section" aria-labelledby="product-materials">
      <h2 id="product-materials">Isi paket</h2>
      <div className="metric-grid">{materials.map(material => <MaterialCard material={material} key={material.id} user={user}
        signInHref={product.access === "free" ? signInHref : undefined} />)}</div>
    </section>
  </ProductShell>;
}
