import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage() {
  if (await getUser()) redirect("/");
  return <main className="auth-layout">
    <div className="auth-aside">
      <div className="brand white"><span className="brand-mark" aria-hidden="true">I.</span> ITP Practice Lab</div>
      <div><span className="eyebrow">RUANG BELAJAR</span><h1>Latihan TOEFL dan tugas kelas</h1><p>Kerjakan latihan mandiri, lanjutkan sesi yang tersimpan, atau buka tugas dari instruktur.</p></div>
      <span>Latihan independen dengan pembahasan jawaban.</span>
    </div>
    <div className="auth-main"><AuthForm /></div>
  </main>;
}
