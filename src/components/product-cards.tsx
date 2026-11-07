import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/lib/auth";
import type { Product, productMaterials } from "@/lib/products";
import { durationLabel } from "@/lib/ui-format";
import { PlatformShell } from "./platform-shell";
import { AssessmentStart } from "./learning-controls";

export function ProductShell({ user, active, children, signInHref = "/login?next=/paket" }: { user: User | null; active: string; children: ReactNode; signInHref?: string }) {
  if (user) return <PlatformShell user={user} active={active}>{children}</PlatformShell>;
  return <main className="shell">
    <header className="topbar">
      <Link href="/paket" className="brand"><span className="brand-mark" aria-hidden="true">I.</span> ITP Practice Lab</Link>
      <Link className="nav-link" href={signInHref}>Masuk</Link>
    </header>
    {children}
  </main>;
}

export function ProductCard({ product, owned = false }: { product: Product; owned?: boolean }) {
  return <article className="workspace-card">
    <span className="eyebrow">{product.kind === "diagnostic" ? "CEK KESIAPAN" : "PERSIAPAN MANDIRI"}</span>
    <h3>{product.title}</h3>
    <p>{product.description}</p>
    <div className="inline-actions">
      <span className="status-badge neutral">{owned ? "Akses aktif" : product.access === "free" ? "Gratis" : "Paket berbayar"}</span>
      <Link className="button ghost" href={`/paket/${product.slug}`}>{owned ? "Buka paket" : "Lihat isi paket"} →</Link>
    </div>
  </article>;
}

type Material = ReturnType<typeof productMaterials>[number];

export function MaterialCard({ material, user, signInHref }: { material: Material; user: User | null; signInHref?: string }) {
  const duration = durationLabel(material.sections.reduce((sum, section) => sum + section.durationSeconds, 0));
  return <article className="workspace-card">
    <h3>{material.title}</h3>
    <p>{material.count} soal · {duration} · {material.sections.map(section => section.title).join(", ")}</p>
    {!material.available ? <span className="status-badge warning">Materi belum tersedia</span>
      : user?.role === "student" && material.canStart ? <AssessmentStart packageId={material.id} details={{
        title: material.title, count: material.count, duration, hasUntimed: material.sections.some(section => !section.durationSeconds),
      }} />
      : !user && signInHref ? <Link className="button ghost" href={signInHref}>Masuk untuk mulai</Link>
      : null}
  </article>;
}
