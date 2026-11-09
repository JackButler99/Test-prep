import Link from "next/link";
import { examProfiles } from "@/lib/learning-bank";
import { studyGuide, studyGuides } from "@/lib/study-guides";
import { SKD_EXAM_ID } from "@/lib/skd-format";
import "@/app/belajar/study-menu.css";

export function DashboardTestPicker() {
  const active = examProfiles().filter(profile => profile.active);
  const profiles = active.some(profile => profile.id === SKD_EXAM_ID) ? active.filter(profile => profile.id !== "casn-tiu") : active;
  const exams = [
    ...studyGuides.flatMap(guide => profiles.filter(profile => profile.id === guide.id)),
    ...profiles.filter(profile => !studyGuide(profile.id)),
  ];

  return <section className="workspace-section dashboard-tests" id="jenis-tes" aria-labelledby="dashboard-tests-title">
    <h2 id="dashboard-tests-title">Pilih jenis tes</h2>
    {exams.length ? <div className="study-grid">
      {exams.map(exam => {
        const guide = studyGuide(exam.id);
        const title = guide?.title ?? exam.title;
        const href = `/belajar/${encodeURIComponent(exam.id)}`;
        return <article className="workspace-card study-card" key={exam.id}>
          <span className="eyebrow">{guide?.category ?? "Latihan mandiri"}</span>
          <h3>{title}</h3>
          <div className="dashboard-test-actions">
            <Link className="button ghost" href={href} aria-label={`Materi ${title}`}>Materi</Link>
            <Link className="button primary" href={`${href}?mode=latihan`} aria-label={`Latihan soal ${title}`} prefetch={false}>Latihan soal</Link>
          </div>
        </article>;
      })}
    </div> : <p className="workspace-card">Jenis tes akan muncul saat profil diaktifkan.</p>}
  </section>;
}
