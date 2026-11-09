"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Disclosure } from "./disclosure";
import { learningCommand } from "./learning-controls";
import { ConfirmDialog, UiDialog } from "./ui-dialog";
import type { ExamProfile } from "@/lib/learning-types";
import { durationLabel, minutesToSeconds } from "@/lib/ui-format";
import { useState as useSkdPackageModeState } from "react";
import * as skdPackageFormat from "@/lib/skd-format";

type BuilderQuestion = { id: string; examId: string; section: string; revision: number; prompt: string; skill: string };
const LIMIT = 200;
const PAGE_SIZE = 30;
const steps = [
  { label: "Informasi", title: "Identitas paket", description: "Beri nama, pilih format ujian, dan tentukan akses peserta." },
  { label: "Pilih soal", title: "Pilih soal terbit", description: "Pilihan tetap tersimpan saat kamu mengganti filter atau halaman." },
  { label: "Atur waktu", title: "Durasi setiap bagian", description: "Isi dalam menit. Gunakan 0 untuk bagian tanpa timer." },
  { label: "Periksa", title: "Periksa susunan paket", description: "Setelah disimpan sebagai draf, kamu bisa mencoba simulasinya." },
];

export function PackageBuilder({ profiles, bank, initialExamId }: {
  profiles: ExamProfile[]; bank: BuilderQuestion[]; initialExamId?: string;
}) {
  const defaultExam = profiles.find(profile => profile.active && profile.id === initialExamId)?.id
    ?? profiles.find(profile => profile.active)?.id ?? "";
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [exam, setExam] = useState(defaultExam);
  const [visibility, setVisibility] = useState("private");
  const [chosen, setChosen] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [questionPage, setQuestionPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; title: string; examId: string } | null>(null);
  const [discard, setDiscard] = useState(false);
  const [switchExam, setSwitchExam] = useState<string | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const questionList = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const profile = profiles.find(item => item.id === exam && item.active);
  const bankById = useMemo(() => new Map(bank.map(question => [question.id, question])), [bank]);
  const selectedIds = new Set(chosen);
  const picked = chosen.map(id => bankById.get(id)).filter((question): question is BuilderQuestion => !!question);
  const selectedSections = profile?.sections.filter(item => picked.some(question => question.section === item.key)) ?? [];
  const dirty = !!title || exam !== defaultExam || visibility !== "private" || chosen.length > 0 || Object.keys(minutes).length > 0;
  const search = query.trim().toLowerCase();
  const filtered = open && step === 1 ? bank.filter(question => question.examId === exam && (!section || question.section === section)
    && (!search || `${question.prompt} ${question.skill}`.toLowerCase().includes(search))) : [];
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(questionPage, pageCount);
  const offset = (page - 1) * PAGE_SIZE;
  const current = filtered.slice(offset, offset + PAGE_SIZE);

  useEffect(() => {
    if (!open || !dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [open, dirty]);

  useEffect(() => {
    if (open) stepHeading.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (questionList.current) questionList.current.scrollTop = 0;
  }, [page, query, section]);

  function close() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else setOpen(false);
  }

  function changeExam(id: string) {setSkdPackageMode("practice");
    setExam(id);
    setChosen([]);
    setMinutes({});
    setSection("");
    setQuery("");
    setQuestionPage(1);
    setSwitchExam(null);
  }

  function reset() {setSkdPackageMode("practice");
    changeExam(defaultExam);
    setTitle("");
    setVisibility("private");
    setStep(0);
    setError("");
  }

  function duration(key: string, seconds: number) {
    return minutesToSeconds(minutes[key] ?? String(seconds / 60));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if ((step === 1 || step === 3) && isFullSkdPackage && skdPackageParts.some(part => part.selected !== part.count)) {
        throw Error("Sesuaikan jumlah soal untuk simulasi penuh. " + skdPackageQuota + ".");
      }
      
      if (!profile) throw Error("Pilih format ujian yang aktif terlebih dahulu.");
      if (title.trim().length < 3) throw Error("Nama paket minimal 3 karakter.");
      if (step >= 1 && !chosen.length) throw Error("Pilih setidaknya satu soal terbit.");
      if (step >= 1 && picked.length !== chosen.length) throw Error("Ada soal yang sudah berubah. Periksa pilihanmu.");
      if (step === 2) selectedSections.forEach(item => duration(item.key, item.durationSeconds));
      if (step < 3) {
        setStep(current => current + 1);
        return;
      }
      setBusy(true);
      const result = await learningCommand({
        ...(isSkdPackage ? { skdMode: skdPackageMode } : {}), action: "createPackage", examId: exam, title, visibility, revisionIds: chosen,
        durations: isSkdPackage
          ? Object.fromEntries(skdPackageFormat.SKD_SECTIONS.map(part => [part.key, 0]))
          : Object.fromEntries(selectedSections.map(item => [item.key, duration(item.key, item.durationSeconds)])),
      });
      setCreated({ id: result.id, title: title.trim(), examId: exam });
      setOpen(false);
      reset();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Draf belum tersimpan. Pilihanmu tetap ada.");
    } finally {
      setBusy(false);
    }
  }

  const [skdPackageMode, setSkdPackageMode] = useSkdPackageModeState<skdPackageFormat.SkdMode>("practice");
  const isSkdPackage = exam === skdPackageFormat.SKD_EXAM_ID;
  const isFullSkdPackage = isSkdPackage && skdPackageMode === "full";
  const skdPackageSelection = new Set(chosen);
  const skdPackageParts = skdPackageFormat.SKD_SECTIONS.map(part => ({
    ...part, selected: bank.filter(question => question.section === part.key && skdPackageSelection.has(question.id)).length,
  }));
  const skdPackageQuota = skdPackageParts.map(part => `${part.title} ${part.selected}/${part.count}`).join(" · ");
  const skdPackageTime = isFullSkdPackage ? `${skdPackageFormat.SKD_SECONDS / 60} menit gabungan` : "Tanpa timer";
  return <div className="materials-builder">
    <button className="button primary materials-create" type="button" onClick={() => { reset(); setOpen(true); setCreated(null); }}>
      <span aria-hidden="true">＋</span> Buat paket
    </button>
    {created && <div className="materials-created">
      <p role="status">Draf “{created.title}” berhasil dibuat.</p>
      <div>
        <Link href={`/manage/packages/${created.id}/preview`} prefetch={false}>Pratinjau draf</Link>
        <Link href={`/manage/packages?status=draft&exam=${encodeURIComponent(created.examId)}#package-list`} prefetch={false}>Lihat daftar draf</Link>
      </div>
    </div>}
    {open && <UiDialog title="Buat paket latihan" onClose={close} wide>
      <div className="materials-wizard">
        <ol className="wizard-steps" aria-label="Tahapan penyusunan paket">
          {steps.map((item, index) => <li key={item.label} aria-current={step === index ? "step" : undefined}>
            <button type="button" disabled={index > step || busy} onClick={() => { setStep(index); setError(""); }}>
              <span aria-hidden="true">{index < step ? "✓" : index + 1}</span>{item.label}
            </button>
          </li>)}
        </ol>
        <form className="platform-form package-builder" onSubmit={submit} aria-busy={busy}>
          <div className="wizard-description">
            <h3 ref={stepHeading} tabIndex={-1}>{steps[step].title}</h3>
            <p>{steps[step].description}</p>
          </div>

          {step === 0 && <>
            <label>Nama paket
              <input name="title" required minLength={3} maxLength={160} value={title}
                onChange={event => setTitle(event.target.value)} placeholder="Contoh: TOEFL ITP Level 1 — Pilot 02" />
            </label>
            <div className="form-columns">
              <label>Format ujian
                <select required value={exam} onChange={event => chosen.length ? setSwitchExam(event.target.value) : changeExam(event.target.value)}>
                  {!defaultExam && <option value="">Belum ada format aktif</option>}
                  {profiles.filter(item => item.active).map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
                </select>
              </label>
      {isSkdPackage && <label>Mode SKD
        <select value={skdPackageMode} onChange={event => setSkdPackageMode(event.target.value === "full" ? "full" : "practice")}>
          <option value="practice">Latihan · tanpa timer</option>
          <option value="full">Simulasi penuh SKD · Acuan {skdPackageFormat.SKD_YEAR}</option>
        </select>
      </label>}
      
              <label>Akses setelah terbit
                <select value={visibility} onChange={event => setVisibility(event.target.value)}>
                  <option value="private">Privat — untuk produk</option>
                  <option value="public">Publik — untuk katalog gratis</option>
                </select>
              </label>
            </div>
            <p className="materials-wizard-note">Akses Privat memungkinkan paket dimasukkan ke produk. Paket Publik tampil di katalog gratis setelah terbit.</p>
          </>}

          {step === 1 && <>
      {isFullSkdPackage && <p className="info-panel">{skdPackageQuota}</p>}
      
            <div className="form-columns">
              <label>Cari soal
                <input type="search" value={query} onChange={event => { setQuery(event.target.value); setQuestionPage(1); }}
                  placeholder="Pertanyaan atau kompetensi" />
              </label>
              <label>Bagian
                <select value={section} onChange={event => { setSection(event.target.value); setQuestionPage(1); }}>
                  <option value="">Semua bagian</option>
                  {profile?.sections.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}
                </select>
              </label>
            </div>
            <p className="materials-selection" role="status"><strong>{chosen.length}/{LIMIT} soal dipilih</strong><span>{filtered.length} cocok</span></p>
            <div className="wizard-question-list" ref={questionList}>
              {current.map(question => <label className="question-choice" key={question.id}>
                <input type="checkbox" checked={selectedIds.has(question.id)} disabled={chosen.length >= LIMIT && !selectedIds.has(question.id)}
                  onChange={event => {
                    const checked = event.target.checked;
                    setChosen(ids => checked ? [...ids, question.id] : ids.filter(id => id !== question.id));
                  }} />
                <span>{question.prompt}<small>{question.skill} · {profile?.sections.find(item => item.key === question.section)?.title} · v{question.revision}</small></span>
              </label>)}
              {!filtered.length && <div className="empty-state"><h3>Soal terbit tidak ditemukan</h3><p>Ubah pencarian atau terbitkan soal dari Bank soal.</p></div>}
            </div>
            {pageCount > 1 && <div className="materials-wizard-pagination" aria-label="Halaman pemilihan soal">
              <button className="button ghost" type="button" disabled={page === 1} onClick={() => setQuestionPage(page - 1)}>← Sebelumnya</button>
              <span>Halaman {page} dari {pageCount}</span>
              <button className="button ghost" type="button" disabled={page === pageCount} onClick={() => setQuestionPage(page + 1)}>Berikutnya →</button>
            </div>}
          </>}

          {step === 2 && (isSkdPackage
      ? <div className="wizard-description">
          <h3>{skdPackageTime}</h3>
          <p>{isFullSkdPackage ? "Satu timer berlaku untuk TWK, TIU, dan TKP." : "Kerjakan sesuai ritme belajar."}</p>
        </div>
      : selectedSections.map(item => <div className="duration-row" key={item.key}>
            <div><strong>{item.title}</strong><small>{picked.filter(question => question.section === item.key).length} soal</small></div>
            <label>Menit
              <input type="number" min={0} max={240} step="any" required aria-label={`Durasi ${item.title} dalam menit`}
                value={minutes[item.key] ?? item.durationSeconds / 60}
                onChange={event => setMinutes(current => ({ ...current, [item.key]: event.target.value }))} />
            </label>
          </div>))}

          {step === 3 && <>
      {isSkdPackage && <p className="info-panel">{isFullSkdPackage ? "Simulasi penuh SKD" : "Latihan SKD"} · {skdPackageTime}</p>}
      
            <div className="package-review">
              <span className="eyebrow">{profile?.title}</span>
              <h3>{title}</h3><p>{chosen.length} soal · {visibility === "public" ? "Publik setelah terbit" : "Privat"}</p>
              {selectedSections.map(item => <div key={item.key}>
                <strong>{item.title}</strong><span>{picked.filter(question => question.section === item.key).length} soal{!isSkdPackage && <> · {durationLabel(duration(item.key, item.durationSeconds))}</>}</span>
              </div>)}
            </div>
            <Disclosure className="full-width" title={`Periksa daftar soal (${chosen.length})`}>
              <ol>{picked.map(question => <li key={question.id}>{question.prompt}</li>)}</ol>
            </Disclosure>
          </>}

          {error && <p className="error-banner" role="alert">{error}</p>}
          <div className="dialog-actions full-width">
            {step > 0 && <button type="button" className="button ghost" disabled={busy} onClick={() => { setStep(current => current - 1); setError(""); }}>← Kembali</button>}
            <button type="submit" className="button primary" disabled={busy || !profile || (step === 1 && !chosen.length)}>
              {busy ? "Menyimpan…" : step === 3 ? "Simpan draf" : "Lanjutkan →"}
            </button>
          </div>
        </form>
      </div>
    </UiDialog>}
    {discard && <ConfirmDialog title="Tinggalkan paket ini?" description="Isian yang belum disimpan akan hilang."
      confirmLabel="Tinggalkan" danger onClose={() => setDiscard(false)}
      onConfirm={() => { setDiscard(false); setOpen(false); reset(); }} />}
    {switchExam && <ConfirmDialog title="Ganti format ujian?" description="Pilihan soal dan durasi akan dikosongkan untuk format baru."
      confirmLabel="Ganti format" onClose={() => setSwitchExam(null)} onConfirm={() => changeExam(switchExam)} />}
  </div>;
}
