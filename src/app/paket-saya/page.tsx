import Link from "next/link";
import { dashboardUser } from "@/lib/access";
import { ownedProducts } from "@/lib/products";
import { ProductCard, ProductShell } from "@/components/product-cards";

export const dynamic = "force-dynamic";

export default async function MyProductsPage() {
  const user = await dashboardUser("student", "admin");
  const products = ownedProducts(user.id);
  return <ProductShell user={user} active="my-products">
    <section className="workspace-heading"><span className="eyebrow">AKSES AKUN</span><h1>Paket Saya</h1><p>Paket yang sudah aktif di akunmu.</p></section>
    {products.length ? <div className="metric-grid">{products.map(product => <ProductCard key={product.id} product={product} owned />)}</div>
      : <section className="workspace-card empty-state"><h2>Belum ada paket aktif</h2><p>Temukan paket dan mulai dari latihan gratis.</p><Link className="button primary" href="/paket">Buka katalog paket</Link></section>}
  </ProductShell>;
}
