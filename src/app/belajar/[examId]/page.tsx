import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardActions } from "@/components/dashboard-actions";
import { PlatformShell } from "@/components/platform-shell";
import { MaterialCard, ProductCard, ProductShell } from "@/components/product-cards";
import { getUser, type User } from "@/lib/auth";
import { examProfiles } from "@/lib/learning-bank";
import { openPracticePackages, ownedProducts, productMaterials, publishedProducts } from "@/lib/products";
import { guideReviewedOn, studyGuide } from "@/lib/study-guides";
import { SKD_EXAM_ID } from "@/lib/skd-format";
import "../study-menu.css";

export const dynamic = "force-dynamic";

const topics = [
  { id: "pengenalan", label: "Pengenalan" },
  { id: "materi", label: "Materi yang diujikan" },
  { id: "strategi", label: "Tips & strategi" },
];

export default async function StudyExamPage({ params, searchParams }: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { examId } = await params;
  const practice = (await searchParams).mode === "latihan";
  const profiles = examProfiles();
  const profile = profiles.find(exam => exam.id === examId && exam.active);
  if (!profile) notFound();

  const user = await getUser();
  const guide = studyGuide(examId);
  const title = guide?.title ?? profile.title;
  const materialHref = `/belajar/${encodeURIComponent(examId)}`;
  const practiceHref = `${materialHref}?mode=latihan`;
  const content = <>
    <section className="workspace-heading study-heading">
      {!user && <Link className="study-back" href="/paket">← Katalog paket</Link>}
      <span className="eyebrow">{guide?.category ?? "Latihan mandiri"}</span>
      <h1>{title}</h1>
      <p>{practice ? "Pilih latihan yang tersedia dan kerjakan sesuai bagian yang ingin kamu pelajari."
        : guide?.summary ?? "Kenali profil latihan dan materi untuk tes ini."}</p>
    </section>
    <nav className="study-mode-links" aria-label="Materi dan latihan">
      <Link href={materialHref} aria-current={practice ? undefined : "page"}>Materi</Link>
      <Link id={practice ? undefined : "latihan"} href={practiceHref} aria-current={practice ? "page" : undefined} prefetch={false}>Latihan soal</Link>
    </nav>
    {practice ? <>
      <StudyPractice examId={examId} user={user} href={practiceHref} />
      {examId === SKD_EXAM_ID && profiles.some(exam => exam.id === "casn-tiu" && exam.active) &&
        <Link className="button ghost" href="/belajar/casn-tiu?mode=latihan">Lihat latihan TIU sebelumnya</Link>}
    </> : <StudyMaterial guide={guide} profile={profile} />}
  </>;

  return user ? <PlatformShell user={user} active="study" context={{
    label: practice ? "Latihan soal" : "Materi tes",
    backHref: "/#jenis-tes",
    backLabel: "Pilih tes di Beranda",
  }}>{content}</PlatformShell>
    : <ProductShell user={null} active="study">{content}</ProductShell>;
}

function StudyMaterial({ guide, profile }: {
  guide: ReturnType<typeof studyGuide>;
  profile: ReturnType<typeof examProfiles>[number];
}) {
  return <>
    <nav className="study-topics" aria-label="Isi panduan">
      {topics.map(topic => <a key={topic.id} href={`#${topic.id}`}>{topic.label}</a>)}
      {profile.id === SKD_EXAM_ID && <a href="#skb">Panduan SKB</a>}
    </nav>

    <section className="workspace-section workspace-card study-copy" id="pengenalan" aria-labelledby="study-intro">
      <h2 id="study-intro">Pengenalan</h2>
      {guide ? <>
        <ul>{guide.format.map(item => <li key={item}>{item}</li>)}</ul>
        <p>{guide.scope}</p>
      </> : <p>Ringkasan format resmi sedang disiapkan.</p>}
    </section>

    <section className="workspace-section" id="materi" aria-labelledby="study-materials">
      <h2 id="study-materials">{guide ? "Materi yang diujikan" : "Bagian dalam profil latihan"}</h2>
      <div className="study-grid">
        {guide ? guide.topics.map(topic => <article className="workspace-card study-card study-copy" key={topic.title}>
          <h3>{topic.title}</h3>
          <p>{topic.content}</p>
          <div className="study-example">
            <strong>Cara mengerjakan</strong>
            <p>{topic.strategy}</p>
          </div>
        </article>) : profile.sections.map(section => <article className="workspace-card" key={section.key}>
          <h3>{section.title}</h3>
        </article>)}
      </div>
    </section>

    <section className="workspace-section workspace-card study-copy" id="strategi" aria-labelledby="study-tips">
      <h2 id="study-tips">Tips & strategi</h2>
      {guide ? <ul>{guide.tips.map(tip => <li key={tip}>{tip}</li>)}</ul>
        : <p>Mulai dari satu bagian. Setelah latihan, bandingkan alasan jawabanmu dengan pembahasan dan catat pola kesalahannya.</p>}
    </section>

    {profile.id === SKD_EXAM_ID && <section className="workspace-section workspace-card study-copy" id="skb" aria-labelledby="skb-guide">
      <h2 id="skb-guide">Panduan SKB per jabatan</h2>
      <p>Mulai dari nama dan jenjang jabatan di pengumuman formasi. Cocokkan dengan materi pokok SKB CAT untuk periode yang sama, lalu cek ketentuan tambahan dari instansi.</p>
      <ul>
        <li>Pranata Komputer Ahli Pertama · antara lain manajemen layanan TI, pengelolaan data, dan infrastruktur TI pada acuan 2024.</li>
        <li>Analis Hukum Ahli Pertama · antara lain hukum pidana, hukum perdata, dan hukum acara pada acuan 2024.</li>
      </ul>
      <a href="https://www.bkn.go.id/storage/2024/11/5457_Materi-Pokok-SKB-dengan-CAT-Pengadaan-CPNS-TA-2024.pdf">Baca materi pokok SKB CAT CPNS 2024 dari BKN ↗</a>
    </section>}

    {guide && <section className="workspace-section workspace-card study-copy" aria-labelledby="study-sources">
      <h2 id="study-sources">Sumber resmi</h2>
      <p>Terakhir ditinjau pada <time dateTime={guideReviewedOn}>8 November 2026</time>.</p>
      <ul className="study-sources">
        {guide.sources.map(source => <li key={source.href}><a href={source.href}>{source.label} ↗</a></li>)}
      </ul>
    </section>}
  </>;
}

function StudyPractice({ examId, user, href }: { examId: string; user: User | null; href: string }) {
  const signInHref = `/login?next=${encodeURIComponent(href)}`;
  const free = openPracticePackages(user?.id).filter(material => material.examId === examId);
  const owned = user ? ownedProducts(user.id) : [];
  const ownedIds = new Set(owned.map(product => product.id));
  const products = [...publishedProducts(), ...owned.filter(product => product.state === "archived")]
    .filter(product => productMaterials(product.id, user?.id)
      .some(material => material.examId === examId && material.available));
  const hasQuickPractice = examId === "toefl-itp" && user?.role !== "admin";

  return <section className="workspace-section" id="latihan" aria-labelledby="study-practice">
    <h2 id="study-practice">Latihan soal</h2>
    {hasQuickPractice || free.length > 0 || products.length > 0 ? <>
      {hasQuickPractice && <article className="workspace-card study-quick-practice">
        <h3>Latihan singkat TOEFL ITP</h3>
        <p>Pilih bagian yang ingin kamu latih. Masing-masing berisi 10 soal tanpa batas waktu.</p>
        {user ? <DashboardActions practiceOnly /> : <Link className="button primary" href={signInHref}>Masuk untuk latihan</Link>}
      </article>}
      {free.length > 0 && <div className="study-product-list">
        <h3>Paket gratis</h3>
        <div className="study-grid">
          {free.map(material => <MaterialCard key={material.id} material={material} user={user} signInHref={signInHref} />)}
        </div>
      </div>}
      {products.length > 0 && <div className="study-product-list">
        <h3>Paket latihan</h3>
        <div className="study-grid">{products.map(product => <ProductCard key={product.id} product={product} owned={ownedIds.has(product.id)} />)}</div>
      </div>}
    </> : <p className="workspace-card">Belum ada paket latihan yang dapat diakses untuk tes ini. Materinya bisa kamu baca di tab Materi.</p>}
  </section>;
}
