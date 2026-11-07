"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./ui-dialog";
import { learningCommand } from "./learning-controls";
type Pending = { action: "publish" | "archive" | "access"; visibility: string; expectedVisibility: string; expectedState: string };
export function PackageAction({id,state,visibility,title,admin}:{id:string;state:string;visibility:string;title:string;admin:boolean}) {
  const [pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const router=useRouter(),publish=state==="draft";
  function open(action:Pending["action"]) {
    setError("");setMessage("");
    setPending({action,visibility:visibility==="private"?"public":"private",expectedVisibility:visibility,expectedState:state});
  }
  async function confirm() {
    if(!pending||busy)return;
    const change=pending;setBusy(true);setError("");
    try {
      if(change.action==="access") {
        await learningCommand({action:"setPackageVisibility",id,visibility:change.visibility,expectedVisibility:change.expectedVisibility,expectedState:change.expectedState});
        setMessage(change.visibility==="public"?(change.expectedState==="draft"?"Akses Publik tersimpan. Terbitkan paket setelah pemeriksaan; draf belum tampil di katalog.":"Akses Publik tersimpan. Paket tersedia di katalog selama profil ujiannya aktif."):"Akses Privat tersimpan. Sesi berjalan dan hasil sebelumnya tetap tersedia bagi peserta terkait.");
      } else {
        await learningCommand({action:"transitionPackage",id,transition:change.action});
        setMessage(change.action==="archive"?"Paket diarsipkan.":visibility==="private"?"Paket terbit dengan akses Privat. Ubah ke Publik jika ingin menampilkannya di katalog.":"Paket terbit. Katalog menampilkannya selama profil ujiannya aktif.");
      }
      setPending(null);router.refresh();
    } catch(cause) {setError(cause instanceof Error?cause.message:"Gagal memperbarui paket.");setPending(null);}
    finally {setBusy(false);}
  }
  const access=pending?.action==="access",makePublic=pending?.visibility==="public";
  const heading=access?(makePublic?"Buka akses publik?":"Ubah menjadi privat?"):pending?.action==="publish"?"Terbitkan paket ini?":"Arsipkan paket ini?";
  const explanation=access?(makePublic?`“${title}” akan dapat diakses dari katalog setelah paket terbit dan profil ujian aktif. Seluruh soal dalam paket harus bersifat publik dan revisinya masih terbit. Status draf tidak ikut berubah.`:`“${title}” akan hilang dari daftar latihan gratis. Peserta tetap bisa membuka sesi berjalan dan hasil lama dari riwayat.`):pending?.action==="publish"?`Periksa isi, pembahasan, dan durasi “${title}”. ${visibility==="public"?"Paket akan tersedia di katalog jika profil ujian aktif.":"Akses tetap Privat; paket belum tampil di katalog."}`:`“${title}” tidak menerima sesi baru. Sesi berjalan dan hasil sebelumnya tetap tersedia.`;
  return <div className="package-controls" aria-label={`Kelola ${title}`} aria-busy={busy}>
    <div className="package-control-buttons">
      {state!=="archived"&&admin&&<button type="button" className={`button ${visibility==="private"&&state==="published"?"primary":"ghost"}`} disabled={busy} onClick={()=>open("access")}>{visibility==="private"?"Jadikan publik":"Jadikan privat"}</button>}
      {state!=="archived"&&<button type="button" className={`button ${publish?"primary":"ghost"}`} disabled={busy} onClick={()=>open(publish?"publish":"archive")}>{publish?"Terbitkan paket":"Arsipkan"}</button>}
    </div>
    {message&&<p role="status" className="form-feedback">✓ {message}</p>}
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {pending&&<ConfirmDialog title={heading} description={explanation} confirmLabel={access?(makePublic?"Ya, jadikan publik":"Ya, jadikan privat"):pending.action==="publish"?"Ya, terbitkan":"Arsipkan paket"} danger={pending.action==="archive"} busy={busy} onClose={()=>{if(!busy)setPending(null);}} onConfirm={()=>void confirm()}/>}
  </div>;
}
