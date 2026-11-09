import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/lib/auth";
import { DashboardActions } from "./dashboard-actions";
import { WorkspaceNav,type NavGroup } from "./workspace-nav";

export function PlatformShell({ user, active, children, context }: {
  user: User;
  active: string;
  children: ReactNode;
  context?: { label: string; backHref: string; backLabel: string };
}) {
  const groups: NavGroup[] = [{ title: "Belajar", links: [
    { href: "/", label: "Beranda", key: "student" },
    { href: "/paket", label: "Katalog paket", key: "catalog" },
    { href: "/paket-saya", label: "Paket Saya", key: "my-products" },
  ] }];
  if (user.role === "admin") groups.push({ title: "Materi & produk", links: [
    { href: "/manage/questions", label: "Bank soal", key: "bank" },
    { href: "/manage/packages", label: "Materi latihan", key: "packages" },
    { href: "/manage/products", label: "Produk & akses", key: "products" },
    { href: "/manage/analytics", label: "Analitik soal", key: "analytics" },
  ] });
  if(user.role==="admin")groups.push({title:"Pengelolaan",links:[{href:"/admin",label:"Ringkasan admin",key:"admin"},{href:"/admin/exams",label:"Format ujian",key:"exams"},{href:"/admin/experiments",label:"Eksperimen A/B",key:"experiments"}]});
  const current = context?.label ?? (active === "about"
    ? "Tentang"
    : groups.flatMap(group => group.links).find(link => link.key === active)?.label ?? "Ruang belajar");
  return <div className="platform">
    <a className="skip-link" href="#workspace-content">Lewati navigasi</a>
    <aside className="platform-sidebar">
      <Link className="brand" href="/" aria-label="ITP Practice Lab · Beranda">
        <span className="brand-mark" aria-hidden="true">I.</span>
        <span>ITP Practice Lab<small>Belajar dengan arah.</small></span>
      </Link>
      <WorkspaceNav groups={groups} active={active}/>
      <div className="sidebar-bottom">
        <div className="account-avatar" aria-hidden="true">{user.username.slice(0,2).toUpperCase()}</div>
        <div><strong>{user.username}</strong><span className="role-label">{user.role === "admin" ? "Administrator" : "Peserta"}</span></div>
        <DashboardActions logout/>
      </div>
    </aside>
    <main id="workspace-content" tabIndex={-1} className="platform-main">
      <header className="workspace-top">
        <span><span className="breadcrumb-root">Ruang belajar</span><span aria-hidden="true"> / </span><strong>{current}</strong></span>
        {active !== "student" && <Link href={context?.backHref ?? "/"}>{context?.backLabel ?? "Kembali ke beranda"}</Link>}
      </header>
      {children}
      <footer>
        <span>ITP Practice Lab</span>
        <span>Latihan independen. Hasil bukan skor atau sertifikat resmi.</span>
        {active !== "about" && <Link href="/tentang">Tentang Practice Lab</Link>}
      </footer>
    </main>
  </div>;
}
