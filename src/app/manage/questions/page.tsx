import { dashboardUser } from "@/lib/access";
import { examProfiles,listBank } from "@/lib/learning-bank";
import { PlatformShell } from "@/components/platform-shell";
import { BankWorkspace } from "@/components/bank-workspace";
export const dynamic="force-dynamic";
export default async function Questions(){
  const user=await dashboardUser("admin","instructor");
  return <PlatformShell user={user} active="bank"><section className="workspace-heading"><span className="eyebrow">MATERI & EVALUASI</span><h1>Bank soal</h1><p>Bangun koleksi materi yang terstruktur. Periksa isi dan kunci, ajukan review, lalu siapkan soal untuk paket latihan.</p></section><BankWorkspace bank={listBank(user,user.role==="admin"?"history":"latest")} profiles={examProfiles()} admin={user.role==="admin"} userId={user.id}/></PlatformShell>;
}
