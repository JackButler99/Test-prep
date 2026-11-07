import { Disclosure } from "@/components/disclosure";
import { dashboardUser } from "@/lib/access";
import { examProfiles,listBank,listPackages } from "@/lib/learning-bank";
import { PlatformShell } from "@/components/platform-shell";
import { PackageBuilder } from "@/components/package-builder";
import { PackageAction } from "@/components/package-action";
import { STATE_LABELS,durationLabel } from "@/lib/ui-format";
export const dynamic="force-dynamic";
export default async function Packages(){
  const user=await dashboardUser("admin"),packages=listPackages(user);
  return <PlatformShell user={user} active="packages"><section className="workspace-heading"><span className="eyebrow">MATERI LATIHAN</span><h1>Susun latihan yang terarah.</h1><p>Pilih revisi terbit, atur durasi per bagian, lalu terbitkan paket. Gunakan akses Privat untuk materi yang akan dimasukkan ke produk.</p></section><section className="workspace-card package-workspace"><PackageBuilder profiles={examProfiles()} bank={listBank(user,"published")} admin={user.role==="admin"}/></section>
    <section id="package-list" className="workspace-section"><div className="section-title"><h2>Daftar paket</h2><span className="muted">{packages.length} paket</span></div>{!packages.length&&<p className="workspace-empty">Belum ada paket. Terbitkan soal setelah review, lalu susun paket pertama.</p>}{packages.map(p=><article className="workspace-card package-list-card" key={p.id}><div className="task-row"><div><span className="eyebrow">{STATE_LABELS[p.state]} · {STATE_LABELS[p.visibility]}</span><h3>{p.title}</h3><p>{p.snapshot.examTitle} · {p.snapshot.questions.length} soal</p><p className="package-access-hint">{p.state==="archived"?"Paket diarsipkan; sesi baru ditutup.":p.visibility==="public"?(p.state==="draft"?"Publik · Draf: terbitkan setelah pemeriksaan agar tersedia di katalog.":"Publik · Terbit: tersedia di katalog selama profil ujian aktif."):"Privat · bisa disusun ke dalam produk."}</p></div>{(p.state!=="archived"&&(p.ownerId===user.id||user.role==="admin"))&&<PackageAction id={p.id} state={p.state} visibility={p.visibility} title={p.title} admin={user.role==="admin"}/>}</div><Disclosure title={<>Isi dan durasi paket</>} description="Lihat bagian, alokasi waktu, dan soal dalam paket.">{p.snapshot.sections.map(s=><div key={s.key}><h4>{s.title} · {durationLabel(s.durationSeconds)}</h4><ol>{p.snapshot.questions.filter(q=>q.section===s.key).map(q=><li key={q.id}>{q.prompt} <small>v{q.revision}</small></li>)}</ol></div>)}</Disclosure></article>)}</section>
  </PlatformShell>;
}
