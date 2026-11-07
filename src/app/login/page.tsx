import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { storeReturnPath } from "@/lib/store-navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const returnTo = storeReturnPath((await searchParams).next);
  if (await getUser()) redirect(returnTo);
  return <main className="auth-layout">
    <div className="auth-aside">
      <div className="brand white"><span className="brand-mark" aria-hidden="true">I.</span> ITP Practice Lab</div>
      <div><span className="eyebrow">RUANG BELAJAR</span><h1>Latihan TOEFL mandiri</h1><p>Cek kesiapan, buka paket latihan, dan pelajari pembahasan dari setiap sesi.</p></div>
      <span>Latihan independen dengan pembahasan jawaban.</span>
    </div>
    <div className="auth-main"><AuthForm returnTo={returnTo} /></div>
  </main>;
}
