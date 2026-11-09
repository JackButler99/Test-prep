import Link from "next/link";
import type { ReactNode } from "react";
import { MaterialCard, ProductShell } from "@/components/product-cards";
import { getUser } from "@/lib/auth";
import { ownedProducts, productBySlug, productMaterials } from "@/lib/products";
import { SKD_EXAM_ID } from "@/lib/skd-format";

export default async function ProductLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const orderUrl = URL.parse(process.env.CPNS_SKD_ORDER_URL ?? "");
  if (!orderUrl || orderUrl.protocol !== "https:" || orderUrl.username || orderUrl.password) return children;

  const user = await getUser();
  const { slug } = await params;
  const product = productBySlug(slug, user?.id);
  if (!product || product.access !== "paid" || product.state !== "published") return children;

  const materials = productMaterials(product.id, user?.id);
  const material = materials[0];
  if (materials.length !== 1 || !material.available || material.examId !== SKD_EXAM_ID) return children;
  if (user && ownedProducts(user.id).some(item => item.id === product.id)) return children;

  const signInHref = `/login?next=/paket/${product.slug}`;
  return <ProductShell user={user} active="catalog" signInHref={signInHref}>
    <section className="workspace-heading">
      <span className="eyebrow">PAKET PERSIAPAN</span>
      <h1>{product.title}</h1>
      <p>{product.description}</p>
      <span className="status-badge neutral">Paket berbayar</span>
    </section>
    <section className="workspace-card" aria-labelledby="skd-order-heading">
      <h2 id="skd-order-heading">Pesan akses simulasi</h2>
      <p>Sertakan username akunmu saat memesan. Tim kami mengaktifkan akses di Paket Saya setelah pembayaran dikonfirmasi.</p>
      <div className="inline-actions">
        <a className="button primary" href={orderUrl.href}>Pesan akses</a>
        <Link className="button ghost" href="/belajar/cpns-skd?mode=latihan">Coba latihan gratis</Link>
        {!user && <Link className="button ghost" href={signInHref}>Masuk untuk melihat akses akun</Link>}
      </div>
    </section>
    <section className="workspace-section" aria-labelledby="skd-material-heading">
      <h2 id="skd-material-heading">Isi paket</h2>
      <div className="metric-grid"><MaterialCard material={material} user={user} /></div>
    </section>
  </ProductShell>;
}
