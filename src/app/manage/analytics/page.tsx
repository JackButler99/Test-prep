import { Disclosure } from "@/components/disclosure";
import { dashboardUser } from "@/lib/access";
import { analytics } from "@/lib/learning-analytics";
import { examProfiles,listPackages } from "@/lib/learning-bank";
import { PlatformShell } from "@/components/platform-shell";
export const dynamic="force-dynamic";
export default async function Analytics({searchParams}:{searchParams:Promise<{exam?:string|string[];package?:string|string[];classroom?:string|string[]}>}){
  const user=await dashboardUser("admin","instructor"),params=await searchParams;
  const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
  const exam=first(params.exam),pack=first(params.package),classroom=first(params.classroom);
  const report=analytics(user,{examId:exam,packageId:pack,classroomId:classroom}),packages=listPackages(user);
  const query=new URLSearchParams();
  if(exam)query.set("exam",exam);
  if(pack)query.set("package",pack);
  if(classroom)query.set("classroom",classroom);
  return <PlatformShell user={user} active="analytics"><section className="workspace-heading"><span className="eyebrow">ANALITIK / BUTIR SOAL</span><h1>Lihat pola, lalu periksa soalnya.</h1><p>{user.role==="admin"?"Agregat sesi paket yang selesai.":"Hanya sesi tugas di kelas yang kamu miliki. Latihan mandiri dan kelas instruktur lain tidak disertakan."}</p></section><Disclosure  title={<>Cara membaca analitik ini</>} description="Pahami cakupan data dan batas interpretasi hasil."><p>Statistik dipisahkan per revisi soal dan hanya mencakup sesi selesai pada paket latihan. Persentase benar memasukkan jawaban kosong. Ini statistik deskriptif, bukan kalibrasi kesulitan resmi atau bukti peningkatan belajar. Waktu adalah interval layar teramati, bukan waktu berpikir yang pasti.</p></Disclosure>
    <form className="platform-form analytics-filter" method="GET"><label>Ujian<select name="exam" defaultValue={exam??""}><option value="">Semua</option>{examProfiles().map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select></label><label>Paket<select name="package" defaultValue={pack??""}><option value="">Semua</option>{packages.map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select></label><button className="button dark">Terapkan filter</button><a className="button ghost" href={"/api/learning/export?"+query}>Ekspor hasil peserta CSV ↓</a></form>
    <div className="metric-grid"><article><small>SESI SELESAI</small><strong>{report.attempts.length}</strong></article><article><small>PESERTA UNIK</small><strong>{report.participants}</strong></article><article><small>REVISI TERAMATI</small><strong>{report.items.length}</strong></article></div>
    {!report.items.length&&<p className="workspace-empty">Belum ada hasil paket selesai dalam cakupan ini.</p>}{report.items.map(item=><section className="workspace-card" key={item.revisionId}><div className="task-row"><div><span className="eyebrow">{item.exam} · {item.section} · v{item.revision}</span><h3>{item.prompt}</h3><p>{item.skill}</p></div><span className="status-badge info">{(item.correctRate*100).toFixed(1)}% benar</span></div><p className="muted">{item.correct}/{item.responses} benar · {item.participants} peserta unik · {item.unanswered} kosong. Rata-rata waktu teramati: {item.meanObservedMs===null?"belum terukur":(item.meanObservedMs/1000).toFixed(1)+" detik"} ({item.measured} respons terukur).</p><div className="choice-distribution">{item.options.map((option,i)=><div key={i}><div className="task-row"><span>{String.fromCharCode(65+i)}. {option}{i===item.answer?" · kunci":""}</span><strong>{item.choices[i]}</strong></div><div className="progress-track"><span style={{width:`${item.choices[i]/item.responses*100}%`}}/></div></div>)}</div>{item.responses<30&&<p className="muted">Sampel kecil. Periksa soal dan pembahasan sebelum menyimpulkan masalah kesulitan atau pengecoh.</p>}</section>)}
    <section className="workspace-section workspace-card"><h2>Hasil peserta</h2><div className="table-scroll"><table><thead><tr><th>Peserta</th><th>Kelas</th><th>Paket</th><th>Benar</th><th>Poin</th></tr></thead><tbody>{report.attempts.map(a=><tr key={a.attemptId}><td>{a.username}</td><td>{a.classroom}</td><td>{a.title}</td><td>{a.correct}/{a.total}</td><td>{a.points}/{a.maxPoints}</td></tr>)}</tbody></table></div></section>
  </PlatformShell>;
}
