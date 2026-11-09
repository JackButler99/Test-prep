import Link from "next/link";
import { Disclosure } from "@/components/disclosure";
import { PackageAction } from "@/components/package-action";
import { PackageBuilder } from "@/components/package-builder";
import { PlatformShell } from "@/components/platform-shell";
import { dashboardUser } from "@/lib/access";
import { db } from "@/lib/db";
import { examProfiles, listBank, listPackages } from "@/lib/learning-bank";
import type { LearningPackage } from "@/lib/learning-types";
import { durationLabel } from "@/lib/ui-format";
import "./materials.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;
const statusOptions = [
  { value: "", label: "Semua" },
  { value: "draft", label: "Draf" },
  { value: "published", label: "Terbit" },
  { value: "archived", label: "Arsip" },
] as const;

type QueryValue = string | string[] | undefined;
type Filters = { q?: QueryValue; status?: QueryValue; access?: QueryValue; exam?: QueryValue; page?: QueryValue };
type ProductLink = { package_id: string; title: string; state: string; has_access: number };

const first = (value: QueryValue) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function Packages({ searchParams }: { searchParams: Promise<Filters> }) {
  const user = await dashboardUser("admin");
  const filters = await searchParams;
  const query = first(filters.q).trim().slice(0, 120);
  const search = query.normalize("NFKC").toLowerCase();
  const status = statusOptions.find(option => option.value === first(filters.status))?.value ?? "";
  const accessValue = first(filters.access);
  const access = accessValue === "private" || accessValue === "public" ? accessValue : "";
  const requestedPage = Number(first(filters.page));
  const packages = listPackages(user);
  const profiles = examProfiles();
  const profileNames = new Map(profiles.map(profile => [profile.id, profile.title]));
  const categoryNames = new Map(packages.map(pack => [pack.examId, profileNames.get(pack.examId) ?? pack.snapshot.examTitle]));
  const categoryOptions = [...categoryNames].sort(([idA, nameA], [idB, nameB]) =>
    nameA.localeCompare(nameB, "id") || idA.localeCompare(idB));
  const examValue = first(filters.exam);
  const exam = categoryNames.has(examValue) ? examValue : "";
  const bank = listBank(user, "published").map(({ id, examId, section, revision, content: { prompt, skill } }) => ({ id, examId, section, revision, prompt, skill }));
  const matching = packages.filter(pack => (!exam || pack.examId === exam) && (!access || pack.visibility === access)
    && (!search || `${pack.title} ${categoryNames.get(pack.examId)} ${pack.snapshot.examTitle}`.normalize("NFKC").toLowerCase().includes(search)));
  const filtered = matching.filter(pack => !status || pack.state === status);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, pageCount) : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const grouped = new Map<string, LearningPackage[]>(categoryOptions.map(([id]) => [id, []]));
  for (const pack of filtered) grouped.get(pack.examId)?.push(pack);

  let groupOffset = 0;
  const visibleGroups = categoryOptions.flatMap(([id, label]) => {
    const items = grouped.get(id) ?? [];
    const start = Math.max(0, offset - groupOffset);
    const end = Math.max(0, offset + PAGE_SIZE - groupOffset);
    groupOffset += items.length;
    const visible = items.slice(start, end);
    return visible.length ? [{ id, label, count: items.length, items: visible }] : [];
  });
  const visibleCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);
  const rows = db().prepare(`SELECT m.package_id, p.title, p.state, EXISTS (
      SELECT 1 FROM practice_product_access a WHERE a.product_id=p.id
    ) AS has_access FROM practice_product_packages m JOIN practice_products p ON p.id=m.product_id`).all() as ProductLink[];
  const products = new Map(rows.map(row => [row.package_id, row]));
  const hasFilter = !!(query || status || access || exam);

  function listHref(nextStatus = status, nextPage = 1) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (nextStatus) params.set("status", nextStatus);
    if (access) params.set("access", access);
    if (exam) params.set("exam", exam);
    if (nextPage > 1) params.set("page", String(nextPage));
    return `/manage/packages${params.size ? `?${params}` : ""}#package-list`;
  }

  return <PlatformShell user={user} active="packages">
    <div className="materials-page">
      <header className="materials-heading">
        <div>
          <span className="eyebrow">BANK SOAL DAN PAKET</span>
          <h1>Materi latihan</h1>
          <p>Susun paket dari soal terbit, coba simulasinya, lalu tentukan akses peserta.</p>
        </div>
        <PackageBuilder profiles={profiles} bank={bank} initialExamId={exam} />
      </header>

      <section id="package-list" aria-labelledby="materials-list-title">
        <div className="materials-list-heading">
          <h2 id="materials-list-title">Daftar paket</h2>
          <span>{filtered.length} dari {packages.length} paket</span>
        </div>
        <div className="materials-toolbar">
          <form className="materials-filters" action="/manage/packages#package-list" method="GET">
            {status && <input type="hidden" name="status" value={status} />}
            <div className="materials-toolbar-row">
              <nav className="materials-status-nav" aria-label="Status paket">
                {statusOptions.map(option => <Link key={option.value} href={listHref(option.value)} prefetch={false}
                  aria-current={status === option.value ? "page" : undefined}>
                  {option.label}<span>{option.value ? matching.filter(pack => pack.state === option.value).length : matching.length}</span>
                </Link>)}
              </nav>
              <div className="materials-search-row">
                <label>Cari paket
                  <input key={query} type="search" name="q" defaultValue={query} maxLength={120} placeholder="Nama paket atau ujian" />
                </label>
                <button className="button ghost" type="submit">Cari</button>
              </div>
            </div>
            <div className="materials-filter-fields">
              <label>Jenis tes
                <select key={exam} name="exam" defaultValue={exam}>
                  <option value="">Semua jenis tes</option>
                  {categoryOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </label>
              <label>Akses
                <select key={access} name="access" defaultValue={access}>
                  <option value="">Semua akses</option><option value="private">Privat</option><option value="public">Publik</option>
                </select>
              </label>
              <button className="button ghost" type="submit">Terapkan</button>
              {hasFilter && <Link className="materials-clear" href="/manage/packages#package-list" prefetch={false}>Hapus filter</Link>}
            </div>
          </form>
        </div>

        {visibleCount ? <div className="materials-groups">
          {visibleGroups.map(group => <section className="materials-group" key={group.id} aria-labelledby={`materials-group-${group.id}`}>
            <header className="materials-group-heading">
              <h3 id={`materials-group-${group.id}`}>{group.label}</h3>
              <span>{group.count} paket</span>
            </header>
            <div className="materials-list">
              {group.items.map(pack => {
                const { sections, questions, examTitle, itpSimulation } = pack.snapshot;
                const product = products.get(pack.id);
                const duration = sections.reduce((total, item) => total + item.durationSeconds, 0);
                const mixedTiming = duration > 0 && sections.some(item => item.durationSeconds === 0);
                const canArchive = !product || (product.state === "archived" && !product.has_access);
                return <article className="materials-card" key={pack.id} aria-labelledby={`material-${pack.id}`}>
                  <div className="materials-card-top">
                    <div className="materials-card-info">
                      <div className="materials-card-badges">
                        <span className={`materials-badge is-${pack.state}`}>{statusOptions.find(item => item.value === pack.state)?.label ?? pack.state}</span>
                        <span className="materials-badge">{pack.visibility === "public" ? "Publik" : "Privat"}</span>
                        {itpSimulation && <span className="materials-badge">Simulasi ITP</span>}
                      </div>
                      <h4 className="materials-card-title" id={`material-${pack.id}`}>{pack.title}</h4>
                      <p className="materials-exam">{examTitle}</p>
                    </div>
                    {pack.state !== "archived" && <PackageAction id={pack.id} state={pack.state} visibility={pack.visibility}
                      title={pack.title} canChangeAccess={!product} canArchive={canArchive} />}
                  </div>
                  <dl className="materials-card-facts">
                    <div><dt>Soal</dt><dd>{questions.length}</dd></div>
                    <div><dt>Bagian</dt><dd>{sections.length}</dd></div>
                    <div><dt>Waktu</dt><dd>{durationLabel(duration)}{mixedTiming && <small> + tanpa timer</small>}</dd></div>
                  </dl>
                  {product && <p className="materials-product-note">
                    Terhubung ke <Link href="/manage/products">{product.title}</Link>. Akses dikelola melalui produk.
                  </p>}
                  <Disclosure className="materials-detail" title="Isi dan durasi paket"
                    meta={<span>{sections.length} bagian</span>}>
                    {sections.map(section => {
                      const items = questions.filter(question => question.section === section.key);
                      return <div className="materials-detail-section" key={section.key}>
                        <h5 className="materials-detail-title">{section.title}</h5>
                        <p>{items.length} soal · {durationLabel(section.durationSeconds)}</p>
                        <ol>{items.map(question => <li key={question.id}>{question.prompt} <small>v{question.revision}</small></li>)}</ol>
                      </div>;
                    })}
                  </Disclosure>
                </article>;
              })}
            </div>
          </section>)}
        </div> : <div className="materials-empty">
          <h3>{hasFilter ? "Paket tidak ditemukan" : "Belum ada paket latihan"}</h3>
          <p>{hasFilter ? "Ubah kata kunci, jenis tes, status, atau akses untuk mencari lagi."
            : "Terbitkan revisi dari Bank soal, lalu gunakan Buat paket untuk menyusun latihan pertama."}</p>
          {hasFilter && <Link className="button ghost" href="/manage/packages#package-list" prefetch={false}>Hapus filter</Link>}
        </div>}

        {pageCount > 1 && <nav className="materials-pagination" aria-label="Halaman daftar paket">
          <p>Menampilkan {offset + 1}–{offset + visibleCount} dari {filtered.length} paket</p>
          <div>
            {page > 1 && <Link className="button ghost" href={listHref(status, page - 1)} prefetch={false}>← Sebelumnya</Link>}
            <span>Halaman {page} dari {pageCount}</span>
            {page < pageCount && <Link className="button ghost" href={listHref(status, page + 1)} prefetch={false}>Berikutnya →</Link>}
          </div>
        </nav>}
      </section>
    </div>
  </PlatformShell>;
}
