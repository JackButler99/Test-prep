"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { learningCommand } from "./learning-controls";
import { ConfirmDialog } from "./ui-dialog";

export function ProductEditor({ packages }: { packages: { id: string; title: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState("preparation");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(""); setSaved(false);
    try {
      await learningCommand({ ...Object.fromEntries(new FormData(form)), action: "createProduct", packageIds: selected });
      form.reset(); setSelected([]); setKind("preparation"); setSaved(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Draf belum tersimpan."); }
    finally { setBusy(false); }
  }

  return <form className="platform-form" onSubmit={submit} aria-busy={busy}>
    <label>Nama produk<input name="title" required maxLength={140} /></label>
    <label>Alamat produk<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="persiapan-toefl-itp" /></label>
    <label>Deskripsi<textarea name="description" required maxLength={1800} rows={3} /></label>
    <label>Jenis<select name="kind" value={kind} onChange={event => setKind(event.target.value)}>
      <option value="preparation">Paket persiapan</option><option value="diagnostic">Cek kesiapan TOEFL</option>
    </select></label>
    {kind === "diagnostic" ? <input type="hidden" name="access" value="free" />
      : <label>Akses<select name="access"><option value="paid">Berbayar · uji akses manual</option><option value="free">Gratis</option></select></label>}
    <fieldset><legend>Materi terbit dengan akses Privat</legend>
      <p className="muted">Centang sesuai urutan tampil. {kind === "diagnostic" ? "Pilih satu materi dengan 15 soal." : "Pilih sampai 20 materi."}</p>
      {packages.map(material => <label className="question-choice" key={material.id}>
        <input type="checkbox" checked={selected.includes(material.id)} onChange={event => {
          const checked = event.target.checked;
          setSelected(current => checked ? [...current, material.id] : current.filter(id => id !== material.id));
        }} />
        <span>{selected.includes(material.id) ? `${selected.indexOf(material.id) + 1}. ` : ""}{material.title}</span>
      </label>)}
    </fieldset>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {saved && <p className="form-feedback" role="status">Draf produk dibuat.</p>}
    <button className="button primary" disabled={busy || !selected.length}>{busy ? "Menyimpan…" : "Simpan draf produk"}</button>
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
