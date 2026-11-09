"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { learningCommand } from "./learning-controls";
import { ConfirmDialog } from "./ui-dialog";

type MaterialOption = { id: string; title: string; available: boolean; diagnostic: boolean };

export function ProductEditor({ packages }: { packages: MaterialOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState("preparation");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const isDiagnostic = kind === "diagnostic";
  const limit = isDiagnostic ? 1 : 20;
  const eligible = (material: MaterialOption) => material.available && (!isDiagnostic || material.diagnostic);
  const chosen = selected.filter(id => packages.some(material => material.id === id && eligible(material)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(""); setSaved(false);
    try {
      await learningCommand({ ...Object.fromEntries(new FormData(form)), action: "createProduct", packageIds: chosen });
      form.reset(); setSelected([]); setKind("preparation"); setSaved(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Draf belum tersimpan."); }
    finally { setBusy(false); }
  }

  return <form className="platform-form" onSubmit={submit} aria-busy={busy}>
    <label>Nama produk<input name="title" required maxLength={140} />
      <small>Alamat katalog dibuat otomatis saat draf disimpan.</small>
    </label>
    <label>Deskripsi<textarea name="description" required maxLength={1800} rows={3} /></label>
    <label>Jenis<select name="kind" value={kind} onChange={event => {
      const nextKind = event.target.value;
      setKind(nextKind);
      if (nextKind === "diagnostic") {
        setSelected(chosen.filter(id => packages.some(material => material.id === id && material.diagnostic)).slice(0, 1));
      }
    }}>
      <option value="preparation">Paket persiapan</option><option value="diagnostic">Cek kesiapan TOEFL</option>
    </select></label>
    {isDiagnostic ? <input type="hidden" name="access" value="free" />
      : <label>Akses<select name="access"><option value="paid">Berbayar · uji akses manual</option><option value="free">Gratis</option></select></label>}
    <fieldset className="full-width" disabled={busy}><legend>Materi terbit dengan akses Privat</legend>
      <p className="muted">{isDiagnostic ? "Pilih satu materi TOEFL dengan 5 Listening, 5 Structure, dan 5 Reading." : "Centang hingga 20 materi sesuai urutan tampil."}</p>
      {packages.map(material => {
        const index = chosen.indexOf(material.id);
        return <label className="question-choice" key={material.id}>
          <input type={isDiagnostic ? "radio" : "checkbox"} name={isDiagnostic ? "diagnosticPackage" : undefined}
            checked={index >= 0} disabled={!eligible(material) || (!isDiagnostic && index < 0 && chosen.length >= limit)} onChange={event => {
              if (isDiagnostic) setSelected([material.id]);
              else setSelected(event.target.checked ? [...chosen, material.id] : chosen.filter(id => id !== material.id));
            }} />
          <span>{!isDiagnostic && index >= 0 ? `${index + 1}. ` : ""}{material.title}
            {!eligible(material) && <small className="muted">{material.available
              ? "Format materi belum sesuai untuk diagnostik."
              : "Materi belum siap. Periksa profil ujian, revisi soal, dan audio."}</small>}
          </span>
        </label>;
      })}
    </fieldset>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {saved && <p className="form-feedback" role="status">Draf produk dibuat.</p>}
    <button className="button primary" disabled={busy || !chosen.length}>{busy ? "Menyimpan…" : "Simpan draf produk"}</button>
  </form>;
}

const actions = {
  publishProduct: { label: "Terbitkan produk", detail: "Produk akan tampil di katalog publik." },
  archiveProduct: { label: "Arsipkan produk", detail: "Produk disembunyikan dari katalog. Akses yang sudah diberikan tetap berlaku." },
  discardDraftProduct: { label: "Buang draf produk", detail: "Pilihan materi dilepaskan sehingga bisa dipakai produk lain." },
};

export function ProductStateButton({ id, action }: { id: string; action: keyof typeof actions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { label, detail } = actions[action];
  async function change() {
    setBusy(true); setError("");
    try { await learningCommand({ action, id }); setOpen(false); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Status produk belum berubah."); setOpen(false); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="button ghost" disabled={busy} onClick={() => setOpen(true)}>{label}</button>
    {open && <ConfirmDialog title={`${label}?`} description={detail} confirmLabel={label} busy={busy}
      danger={action === "discardDraftProduct"} onClose={() => setOpen(false)} onConfirm={() => void change()} />}
    {error && <p className="error-banner" role="alert">{error}</p>}
  </>;
}
