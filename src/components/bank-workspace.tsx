"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { BankRow, ExamProfile } from "@/lib/learning-types";
import { availableBankActions } from "@/lib/bank-view";
import { bankExamMetrics } from "@/lib/bank-metrics";
import { STATE_LABELS } from "@/lib/ui-format";
import { learningCommand } from "./learning-controls";
import { UiDialog, ConfirmDialog } from "./ui-dialog";
import { QuestionEditor } from "./bank-question-editor";
import { BankImportDialog } from "./bank-import-dialog";
import { BankExportDialog } from "./bank-export-dialog";
import { Disclosure } from "./disclosure";
import { ReadingPassage } from "./reading-passage";
import { SKD_EXAM_ID, skdFigure } from "@/lib/skd-format";
import { SkdFigureOrText } from "./skd-figure";

const stateLabel = (state: string) => state === "draft" ? "Draf" : STATE_LABELS[state] ?? state;
const tone = (state: string) => state === "published" ? "success" : state === "review" ? "warning" : "neutral";
const PAGE_SIZE = 20;
const BANK_CONFIRMATIONS: Partial<Record<string, { title: string; description: string; label: string; danger?: boolean }>> = {
  publish: { title: "Terbitkan soal terpilih?", description: "revisi akan tersedia untuk penyusunan paket. Pastikan seluruh materi sudah diperiksa.", label: "Ya, terbitkan" },
  retire: { title: "Tarik soal terpilih?", description: "revisi akan ditarik. Paket terkait tidak dapat menerima sesi baru. Sesi berjalan tetap memakai materi semula.", label: "Tarik soal", danger: true },
  deleteDraft: { title: "Hapus draf terpilih?", description: "draf akan dihapus permanen. Revisi lain dari soal yang sama tetap tersimpan.", label: "Hapus draf", danger: true },
};
const BANK_VIEWS = [
  { id: "draft", label: "Draf", title: "Soal draf", hint: "Lengkapi sebelum diajukan", description: "Materi yang masih disiapkan. Sunting soal, periksa isinya, lalu pilih soal untuk diajukan ke review." },
  { id: "review", label: "Review", title: "Soal dalam review", hint: "Menunggu pemeriksaan", description: "Periksa pertanyaan, kunci, pilihan jawaban, dan pembahasan sebelum menerbitkan soal." },
  { id: "published", label: "Terbit", title: "Soal telah terbit", hint: "Tersedia untuk paket", description: "Revisi yang masih terbit, termasuk yang dipakai paket lama. Susun paket memakai revisi terbit terbaru." },
  { id: "retired", label: "Ditarik", title: "Soal ditarik", hint: "Arsip penerbitan", description: "Revisi yang telah ditarik dari penerbitan. Sesi yang sudah berjalan tetap menggunakan materi semula." },
  { id: "", label: "Semua status", title: "Seluruh soal", hint: "Lintas status", description: "Tampilan gabungan untuk pencarian lintas status. Lihat label status pada setiap soal sebelum memilih tindakan." },
] as const;

export function BankWorkspace({ bank, profiles, admin, userId }: { bank: BankRow[]; profiles: ExamProfile[]; admin: boolean; userId: string }) {
  const [editor, setEditor] = useState<BankRow | "new" | null>(null), [detail, setDetail] = useState<BankRow | null>(null);
  const detailHasFigure = detail?.examId === SKD_EXAM_ID && detail.section === "tiu" && Boolean(skdFigure(detail.content.stimulus));
  const [editorBusy, setEditorBusy] = useState(false), [dirty, setDirty] = useState(false), [discard, setDiscard] = useState(false), [importing, setImporting] = useState(false), [exporting, setExporting] = useState(false);
  const [exam, setExam] = useState(""), [section, setSection] = useState(""), [state, setState] = useState<string>("draft"), [kind, setKind] = useState(""), [scope, setScope] = useState(""), [query, setQuery] = useState(""), [sort, setSort] = useState("default");
  const [selected, setSelected] = useState<string[]>([]), [page, setPage] = useState(0), [actionId, setActionId] = useState(""), [note, setNote] = useState("");
  const [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ ids: string[]; transition: string; note: string } | null>(null);
  const router = useRouter(), selectAll = useRef<HTMLInputElement>(null), feedback = useRef<HTMLDivElement>(null);
  const latestRevision = new Map<string, number>();
  for (const row of bank) latestRevision.set(row.questionId, Math.max(row.revision, latestRevision.get(row.questionId) ?? 0));
  const manageable = (q: BankRow) => admin || q.ownerId === userId;
  const editable = (row: BankRow) => manageable(row) && latestRevision.get(row.questionId) === row.revision;
  const examTitle = (q: BankRow) => profiles.find(p => p.id === q.examId)?.title ?? q.examId;
  const sectionTitle = (q: BankRow) => profiles.find(p => p.id === q.examId)?.sections.find(s => s.key === q.section)?.title ?? q.section;
  const search = query.trim().toLocaleLowerCase("id-ID");
  const matched = bank.filter(q => (!exam || q.examId === exam) && (!section || q.section === section) && (!kind || q.content.kind === kind) && (!scope || (scope === "mine" ? q.ownerId === userId : q.visibility === "public")) && (!search || [q.content.prompt, q.content.skill, q.content.stimulus, q.id, q.questionId].join(" ").toLocaleLowerCase("id-ID").includes(search)));
  const filtered = matched.filter(q => !state || q.state === state);
  const view = BANK_VIEWS.find(v => v.id === state) ?? BANK_VIEWS[0];
  const viewCount = (id: string) => id ? bank.filter(q => q.state === id).length : bank.length;
  if (sort === "title") filtered.sort((a, b) => a.content.prompt.localeCompare(b.content.prompt, "id"));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1), shown = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectable = shown.filter(manageable), chosen = selectable.filter(q => selected.includes(q.id)), actions = availableBankActions(chosen, admin, userId);
  const action = actions.find(a => a.id === actionId) ?? actions[0];
  const confirmation = pending && BANK_CONFIRMATIONS[pending.transition];
  const activeFilters = [exam, section, kind, scope, search].filter(Boolean).length;
  const examMetrics = bankExamMetrics(bank, profiles);
  function showMetric(examId: string, sectionKey = "") {
    setExam(examId); setSection(sectionKey); setState(""); setKind(""); setScope(""); setQuery(""); resetPage();
    requestAnimationFrame(() => { document.getElementById("bank-list-title")?.focus(); document.getElementById("bank-list-title")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });
  }
  const sections = [...new Map(profiles.filter(p => p.id === exam).flatMap(p => p.sections.map(s => [s.key, s] as const))).values()];
  function resetPage() { setPage(0); setSelected([]); setActionId(""); setNote(""); }
  function resetFilters() { setExam(""); setSection(""); setKind(""); setScope(""); setQuery(""); resetPage(); }
  function showState(id: string) { setState(id); resetPage(); }
  function announce(text: string) { setMessage(text); setError(""); setTimeout(() => feedback.current?.focus(), 0); }
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = chosen.length > 0 && chosen.length < selectable.length; }, [chosen.length, selectable.length]);
  useEffect(() => { if (!editor || !dirty) return; const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [editor, dirty]);
  const closeEditor = () => { if (editorBusy) return; if (dirty) setDiscard(true); else setEditor(null); };
  function edit(q?: BankRow) { setDetail(null); setEditor(q ?? "new"); setDirty(false); }
  async function transition(value: { ids: string[]; transition: string; note: string }) {
    setBusy(true); setError(""); setMessage("");
    try {
      await learningCommand({ action: "transitionQuestions", ...value });
      setSelected([]); setPending(null); setNote("");
      const destination = { review: "Review", publish: "Terbit", reopen: "Draf", retire: "Ditarik" }[value.transition];
      if (value.transition === "deleteDraft") announce(`${value.ids.length} draf berhasil dihapus.`);
      else announce(destination ? `${value.ids.length} soal berhasil dipindahkan ke ${destination}. Buka status tersebut untuk melihat hasilnya.` : `${value.ids.length} soal berhasil diperbarui.`);
      router.refresh();
    }
    catch (e) { setError(e instanceof Error ? e.message : "Status belum diperbarui. Coba lagi."); setPending(null); }
    finally { setBusy(false); }
  }
  return <div className="bank-workbench">
    <section className="bank-command-bar" aria-label="Tindakan bank soal"><div><strong>{bank.length} revisi tersedia</strong><p>Jumlah seluruh materi yang dapat kamu akses.</p></div><div className="inline-actions">{admin && <button type="button" className="button ghost" disabled={busy} onClick={() => setExporting(true)}>↓ Ekspor audit</button>}<Link className="button ghost" href="/manage/packages">Susun paket →</Link><button type="button" className="button ghost" disabled={busy} onClick={() => setImporting(true)}>↥ Impor JSON</button><button type="button" className="button primary" disabled={!profiles.length || busy} onClick={() => edit()}>+ Buat soal</button></div></section>
    <section className="bank-library" aria-labelledby="bank-list-title">
      <div className="bank-status-navigation">
        <div className="bank-status-heading"><h2>Kelola berdasarkan status</h2><p>Mulai dari draf, lanjutkan pemeriksaan, lalu terbitkan materi yang siap.</p></div>
        <div className="bank-stage-grid" role="group" aria-label="Status utama soal">{BANK_VIEWS.slice(0, 3).map((s, i) => <button type="button" className={`bank-stage ${s.id}`} aria-pressed={state === s.id} aria-controls="bank-status-results" key={s.id} disabled={busy} onClick={() => showState(s.id)}><span className="bank-stage-label"><span className="bank-stage-number" aria-hidden="true">0{i + 1}</span>{s.label}<span className="bank-stage-check" aria-hidden="true">{state === s.id ? "✓" : ""}</span></span><strong>{viewCount(s.id)}<span className="sr-only"> revisi</span></strong><span className="bank-stage-hint">{s.hint}</span></button>)}</div>
        <div className="bank-status-secondary"><div role="group" aria-label="Status lainnya">{BANK_VIEWS.slice(3).map(s => <button type="button" aria-pressed={state === s.id} aria-controls="bank-status-results" disabled={busy} key={s.id} onClick={() => showState(s.id)}>{s.label}<span>{viewCount(s.id)}</span></button>)}</div><p>Total per status, tidak mengikuti pencarian dan filter.</p></div>
      </div>
      <div id="bank-status-results">
      <header className={`bank-library-heading bank-view-heading ${state || "all"}`}><div><span className={`status-badge ${tone(state)}`}>{view.label}</span><h3 id="bank-list-title" tabIndex={-1}>{view.title}</h3><p>{state === "review" && !admin ? "Materi yang menunggu pemeriksaan admin. Soal milikmu akan tersedia untuk paket setelah diterbitkan." : view.description}</p></div><span className="bank-count" role="status" aria-live="polite" aria-atomic="true">{filtered.length} hasil · {view.label}</span></header>
      <div className="bank-search-row"><label className="bank-search"><span className="sr-only">Cari pertanyaan, kompetensi, bacaan, atau ID</span><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={e => { setQuery(e.target.value); resetPage(); }} placeholder="Cari pertanyaan, kompetensi, bacaan, atau ID…"/></label><label className="bank-sort">Urutan<select value={sort} onChange={e => { setSort(e.target.value); resetPage(); }}><option value="default">Urutan bank</option><option value="title">Pertanyaan A–Z</option></select></label></div>
      <div className="bank-filter-grid"><label>Ujian<select value={exam} onChange={e => { setExam(e.target.value); setSection(""); resetPage(); }}><option value="">Semua ujian</option>{exam && !profiles.some(p => p.id === exam) && <option value={exam}>{exam} (profil tidak tersedia)</option>}{profiles.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Bagian<select disabled={!exam} value={section} onChange={e => { setSection(e.target.value); resetPage(); }}><option value="">{exam ? "Semua bagian" : "Pilih ujian terlebih dahulu"}</option>{section && !sections.some(s => s.key === section) && <option value={section}>{section} (di luar profil saat ini)</option>}{sections.map(s => <option key={s.key} value={s.key}>{s.title}</option>)}</select></label><label>Format<select value={kind} onChange={e => { setKind(e.target.value); resetPage(); }}><option value="">Semua format</option><option value="text">Teks / bacaan</option><option value="audio">Listening dari naskah</option></select></label><label>Kepemilikan<select value={scope} onChange={e => { setScope(e.target.value); resetPage(); }}><option value="">Semua yang dapat diakses</option><option value="mine">Milik saya</option><option value="public">Materi publik</option></select></label></div>
      <div className="bank-filter-summary"><span>{activeFilters ? `${activeFilters} filter aktif` : "Tanpa filter tambahan"} · {view.label}</span>{activeFilters > 0 && <button type="button" className="text-button" onClick={resetFilters}>Reset pencarian & filter</button>}</div>
      <div ref={feedback} tabIndex={-1} className="bank-feedback">{message && <p className="form-feedback" role="status">✓ {message}</p>}{error && <p className="error-banner" role="alert">{error}</p>}</div>
      <div className="bank-selection-row"><label className="check-label"><input ref={selectAll} type="checkbox" disabled={!selectable.length || busy} checked={!!selectable.length && chosen.length === selectable.length} onChange={e => setSelected(e.target.checked ? selectable.map(q => q.id) : [])}/>Pilih halaman ini</label><span>{chosen.length ? `${chosen.length} soal dipilih` : "Pilihan berlaku pada halaman ini"}</span></div>
      {chosen.length > 0 && <form className="bank-bulk-panel" onSubmit={e => { e.preventDefault(); if (!action) return; setError(""); setMessage(""); if (action.id === "publish" && note.trim().length < 10) { setError("Tambahkan catatan review minimal 10 karakter untuk menerbitkan."); return; } const value = { ids: chosen.map(q => q.id), transition: action.id, note: action.id === "publish" ? note : "" }; if (BANK_CONFIRMATIONS[action.id]) setPending(value); else void transition(value); }}>
        <div className="bank-bulk-caption"><strong>{chosen.length} soal terpilih</strong><button type="button" className="text-button" disabled={busy} onClick={() => setSelected([])}>Batalkan pilihan</button></div>
        {actions.length ? <><label>Tindakan<select value={action?.id} disabled={busy} onChange={e => setActionId(e.target.value)}>{actions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>{action?.id === "publish" && <label className="bank-review-note">Catatan pemeriksaan<input value={note} onChange={e => setNote(e.target.value)} minLength={10} maxLength={1000} required disabled={busy} placeholder="Kunci, pengecoh, dan pembahasan telah diperiksa…"/></label>}<button className="button dark" disabled={busy}>{busy ? "Memproses…" : action?.label}</button></> : <p role="status">{new Set(chosen.map(q => q.state)).size > 1 ? "Pilih soal dengan status yang sama agar tindakan sesuai alur review tersedia." : "Tidak ada tindakan massal untuk status dan peran ini. Gunakan Sunting untuk membuat draf revisi baru bila materi milikmu."}</p>}
      </form>}
      <div className="bank-question-list">{shown.map((q, i) => <article className={`bank-question-row ${chosen.some(v => v.id === q.id) ? "is-selected" : ""}`} key={q.id} aria-label={`Soal ${currentPage * PAGE_SIZE + i + 1}`}>
        <label className="bank-row-select"><span className="sr-only">Pilih soal {currentPage * PAGE_SIZE + i + 1}: {q.content.prompt}</span><input type="checkbox" disabled={!manageable(q) || busy} checked={chosen.some(v => v.id === q.id)} onChange={e => setSelected(v => e.target.checked ? [...new Set([...v, q.id])] : v.filter(id => id !== q.id))}/></label>
        <span className={`bank-kind-mark ${q.content.kind}`} aria-hidden="true">{q.content.kind === "audio" ? "♫" : "T"}</span>
        <div className="bank-row-content"><div className="bank-row-context"><span>{examTitle(q)}</span><span aria-hidden="true">/</span><span>{sectionTitle(q)}</span></div><button type="button" className="bank-question-title" onClick={() => setDetail(q)}>{q.content.prompt}</button><div className="bank-row-tags"><span>{q.content.skill}</span><span>{q.content.options.length} pilihan</span><span>{q.content.kind === "audio" ? "Listening · suara browser" : "Teks / bacaan"}</span><span>{q.ownerId === userId ? "Milik saya" : STATE_LABELS[q.visibility] ?? q.visibility}</span></div></div>
        <div className="bank-row-status"><span className={`status-badge ${tone(q.state)}`}>{stateLabel(q.state)}</span><small>Revisi {q.revision}</small></div><div className="bank-row-actions"><button type="button" className="button ghost" onClick={() => setDetail(q)}>Tinjau</button>{editable(q) && <button type="button" className="text-button" disabled={busy} onClick={() => edit(q)}>Sunting</button>}</div>
      </article>)}</div>
      {!filtered.length && <div className="bank-empty"><span aria-hidden="true">{activeFilters ? "⌕" : "◇"}</span><h3>{activeFilters ? `Tidak ada hasil di ${view.label.toLocaleLowerCase("id-ID")}.` : state ? `Belum ada soal ${view.label.toLocaleLowerCase("id-ID")}.` : "Mulai koleksi soal pertamamu."}</h3><p>{activeFilters ? "Ubah pencarian atau reset filter. Status yang sedang dibuka akan tetap dipertahankan." : state === "draft" ? "Buat soal baru atau impor batch JSON yang sudah diperiksa untuk mulai menyiapkan materi." : state === "review" ? "Pilih soal pada Draf, lalu gunakan Ajukan review untuk memulai pemeriksaan." : state === "published" ? "Soal akan tampil di sini setelah admin menyelesaikan pemeriksaan dan menerbitkannya dari Review." : state === "retired" ? "Soal yang ditarik dari penerbitan akan tersimpan di sini." : "Tulis soal secara manual atau impor file JSON dari batch yang sudah kamu periksa."}</p>{activeFilters ? <button type="button" className="button ghost" onClick={resetFilters}>Reset pencarian & filter</button> : state === "draft" || !state ? <button type="button" className="button ghost" disabled={busy} onClick={() => setImporting(true)}>Impor soal</button> : state !== "retired" && <button type="button" className="button ghost" onClick={() => showState(state === "published" ? "review" : "draft")}>Buka {state === "published" ? "Review" : "Draf"} →</button>}</div>}
      <footer className="bank-pagination"><span>{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)}` : "0"} dari {filtered.length} revisi</span><div><button type="button" className="button ghost" disabled={currentPage === 0 || busy} onClick={() => { setPage(currentPage - 1); setSelected([]); }}>← Sebelumnya</button><span>Halaman {currentPage + 1} / {pages}</span><button type="button" className="button ghost" disabled={currentPage + 1 >= pages || busy} onClick={() => { setPage(currentPage + 1); setSelected([]); }}>Berikutnya →</button></div></footer>
      </div>
    </section>
    <section className="bank-exam-metrics" aria-labelledby="bank-exam-metrics-title">
      <div className="bank-exam-metrics-heading"><div><h2 id="bank-exam-metrics-title">Sebaran revisi per ujian</h2><p>Jumlah revisi yang dapat kamu akses, termasuk draf dan arsip. Pilih angka untuk melihat revisinya.</p></div><span className="bank-count">{examMetrics.length} ujian · {bank.length} revisi</span></div>
      <div className="bank-exam-grid">{examMetrics.map(metric => <article className={`bank-exam-card ${exam === metric.id ? "is-active" : ""}`} key={metric.id}>
        <header><div><h3>{metric.title}</h3>{!metric.active && <span className="status-badge neutral">Profil nonaktif / tidak tersedia</span>}</div><button type="button" className="bank-exam-total" disabled={busy} aria-label={`Lihat semua ${metric.total} revisi ${metric.title}`} aria-pressed={exam === metric.id && !section && !state && !kind && !scope && !search} onClick={() => showMetric(metric.id)}><strong>{metric.total}</strong><span>total revisi</span></button></header>
        <ul>{metric.sections.map(part => <li key={part.key}><button type="button" disabled={busy} aria-label={`Lihat ${part.count} revisi ${part.title}, ${metric.title}`} aria-pressed={exam === metric.id && section === part.key && !state && !kind && !scope && !search} onClick={() => showMetric(metric.id, part.key)}><span>{part.title}</span><span className={`bank-section-count ${part.count ? "" : "empty"}`}>{part.count}<span className="sr-only"> revisi</span></span></button></li>)}</ul>
        {!metric.sections.length && <p className="bank-help">Belum ada bagian pada profil ujian ini.</p>}
      </article>)}</div>
      {!examMetrics.length && <p className="bank-help">Belum ada profil ujian. Tambahkan profil untuk mulai mengelompokkan materi.</p>}
    </section>
    <Disclosure title="Alur pengelolaan soal" description="Draf → review → terbit. Materi yang ditarik tidak dipakai untuk sesi baru."><p>{admin ? "Periksa isi, kunci, pengecoh dan pembahasan saat status review. Catatan pemeriksaan wajib untuk menerbitkan. Soal terbit dapat disusun menjadi paket." : "Soal milikmu dapat diajukan dari draf ke review. Admin memeriksa dan menerbitkan materi sebelum dipakai dalam paket."}</p><p>Menyunting soal membuat revisi baru. Materi terbit serta hasil sesi sebelumnya tetap memakai versi semula. Materi publik milik pihak lain hanya dapat kamu tinjau.</p></Disclosure>
    {detail && <UiDialog title="Tinjau soal" wide onClose={() => setDetail(null)}>
      <div className="bank-detail">
        <div className="bank-detail-meta">
          <span className={`status-badge ${tone(detail.state)}`}>{stateLabel(detail.state)}</span>
          <span>Revisi {detail.revision}</span><span>{STATE_LABELS[detail.visibility]}</span>
        </div>
        <p className="bank-detail-context">{examTitle(detail)} / {sectionTitle(detail)} · {detail.content.skill}</p>
        {detail.content.stimulus && <section>
          <h3>{detail.content.kind === "audio" ? "Naskah Listening" : detailHasFigure ? "Gambar soal" : "Bacaan / konteks"}</h3>
          {detail.content.kind === "audio" && <p className="bank-help">Naskah ini dibacakan suara browser pada sesi latihan. Ini bukan rekaman sumber.</p>}
          {detailHasFigure ? <SkdFigureOrText value={detail.content.stimulus} />
            : detail.section === "reading" && detail.content.kind !== "audio"
              ? <ReadingPassage text={detail.content.stimulus} prompt={detail.content.prompt} headingLevel={3} />
              : <div className="bank-stimulus preserve-text">{detail.content.stimulus}</div>}
        </section>}
        <section>
          <h3>Pertanyaan</h3>
          <p className="bank-detail-prompt preserve-text">{detail.content.prompt}</p>
          <ol className={`bank-answer-list${detailHasFigure ? " skd-bank-options" : ""}`}>
            {detail.content.options.map((option, i) => <li className={i === detail.content.answer ? "correct" : ""} key={i}>
              <span className="bank-answer-letter">{String.fromCharCode(65 + i)}</span>
              <span><SkdFigureOrText value={option} enabled={detailHasFigure} /></span>
              <span className="bank-answer-score">{i === detail.content.answer && <strong>✓ Kunci</strong>}{detail.content.scores[i]} poin</span>
            </li>)}
          </ol>
        </section>
        <section className="bank-explanation"><h3>Pembahasan</h3><p className="preserve-text">{detail.content.explanation}</p></section>
        {detail.reviewNote && <section><h3>Catatan review</h3><p className="preserve-text">{detail.reviewNote}</p></section>}
        <Disclosure className="bank-reference" title="Identitas revisi"><code>{detail.id}</code><p>ID soal: <code>{detail.questionId}</code></p></Disclosure>
        <div className="dialog-actions">
          <button type="button" className="button ghost" onClick={() => setDetail(null)}>Tutup</button>
          {editable(detail) && <button type="button" className="button primary" onClick={() => edit(detail)}>Sunting sebagai revisi baru</button>}
        </div>
      </div>
    </UiDialog>}
    {editor && <UiDialog title={editor === "new" ? "Buat soal baru" : "Sunting soal"} wide onClose={closeEditor}><QuestionEditor profiles={profiles} initial={editor === "new" ? undefined : editor} onBusyChange={setEditorBusy} onDirty={() => setDirty(true)} onSaved={() => { setEditor(null); setDirty(false); resetFilters(); showState("draft"); announce("Draf soal tersimpan. Ajukan review setelah materi siap diperiksa."); router.refresh(); }}/></UiDialog>}
    {exporting && <BankExportDialog count={bank.length} onClose={() => setExporting(false)} onSuccess={count => { setExporting(false); announce(`File audit ${count} soal telah disiapkan untuk diunduh. Periksa folder unduhan browser.`); }}/>}
    {importing && <BankImportDialog profiles={profiles} admin={admin} onClose={() => setImporting(false)} onSuccess={count => { setImporting(false); resetFilters(); showState("draft"); announce(`${count} soal berhasil diimpor sebagai draf. File yang sama tidak perlu diimpor ulang.`); router.refresh(); }}/>}
    {discard && <ConfirmDialog title="Tinggalkan perubahan?" description="Isian soal yang belum disimpan akan hilang." confirmLabel="Tinggalkan" danger onClose={() => setDiscard(false)} onConfirm={() => { setDiscard(false); setEditor(null); setDirty(false); }}/>}
    {pending && confirmation && <ConfirmDialog title={confirmation.title} description={`${pending.ids.length} ${confirmation.description}`} confirmLabel={confirmation.label} danger={confirmation.danger} busy={busy} onClose={() => setPending(null)} onConfirm={() => void transition(pending)}/>}
  </div>;
}
