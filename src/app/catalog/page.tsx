import Link from "next/link";
import { dashboardUser } from "@/lib/access";
import { examProfiles,listPackages,packageMaterialsAvailable } from "@/lib/learning-bank";
import { studentClassTasks,assessmentHistory } from "@/lib/assessments";
import { PlatformShell } from "@/components/platform-shell";
import { ClassTaskAction } from "@/components/class-task-action";
import { CatalogExplorer } from "@/components/catalog-explorer";
export const dynamic="force-dynamic";
export default async function Catalog(){
  const user=await dashboardUser("student","instructor","admin");
  const profiles=examProfiles().filter(p=>p.active),history=assessmentHistory(user.id),now=Date.now();
  const tasks=user.role==="student"?studentClassTasks(user.id):[];
  const packages=listPackages(user).filter(p=>p.visibility==="public"&&p.state==="published"
    &&profiles.some(e=>e.id===p.examId)&&packageMaterialsAvailable(p.snapshot));
  const cards=packages.map(p=>({id:p.id,title:p.title,examId:p.examId,examTitle:p.snapshot.examTitle,count:p.snapshot.questions.length,durationSeconds:p.snapshot.sections.reduce((n,s)=>n+s.durationSeconds,0),hasUntimed:p.snapshot.sections.some(s=>!s.durationSeconds),sections:p.snapshot.sections.map(s=>s.title)}));
  return <PlatformShell user={user} active="catalog"><section className="workspace-heading"><span className="eyebrow">PAKET LATIHAN</span><h1>Latihan sesuai tujuanmu.</h1><p>Pilih tujuan, temukan paket, lalu pelajari setiap jawaban. Hasil latihan bukan skor resmi atau jaminan kelulusan.</p></section><CatalogExplorer profiles={profiles.map(p=>({id:p.id,title:p.title}))} packages={cards} student={user.role==="student"}/>
    {user.role==="student"&&<section id="class-tasks" className="workspace-section"><div className="section-title"><h2>Tugas kelas</h2><Link href="/dashboard">Gabung kelas →</Link></div><p className="muted">Instruktur melihat hasil tugas ini. Latihan mandiri tetap terpisah.</p>{tasks.map(task=><article className="workspace-card task-row" key={`${task.kind}:${task.id}`}><div><span className="eyebrow">{task.classroom_name}</span><h3>{task.title}</h3><p>{task.subtitle}</p><p className="muted">{task.due_at?"Tenggat "+new Date(task.due_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})+" WIB":"Tanpa tenggat"}</p></div><ClassTaskAction task={task} now={now}/></article>)}{!tasks.length&&<div className="workspace-card empty-state"><h3>Belum ada tugas kelas.</h3><p>Bergabunglah menggunakan kode dari instruktur. Tugasmu akan muncul di sini.</p></div>}</section>}
    <section id="history" className="workspace-section"><div className="section-title"><h2>Riwayat paket</h2><span className="muted">30 sesi terbaru</span></div>{history.map(a=><Link className="workspace-card activity-line" key={a.id} href={`/assessment/${a.id}`}><span className="activity-symbol" aria-hidden="true">{a.status==="finished"?"✓":"→"}</span><span className="activity-copy"><strong>{a.title}</strong><small>{a.examTitle}</small></span><span className={`status-badge ${a.status==="finished"?"success":"info"}`}>{a.status==="finished"?"Lihat hasil":"Lanjutkan"}</span></Link>)}{!history.length&&<div className="workspace-card empty-state"><h3>Belum ada sesi paket.</h3><p>Setelah mulai latihan, kamu bisa kembali melanjutkan atau membaca pembahasan dari halaman ini.</p></div>}</section>
  </PlatformShell>;
}
