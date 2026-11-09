"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicAssessment } from "@/lib/learning-types";
import { AssessmentClient } from "./assessment-client";
import { AssessmentStart } from "./learning-controls";
import { AssessmentReviewTools } from "./assessment-review-tools";

type Recommendation = { section: string; packageId: string; title: string; count: number; duration: string; hasUntimed: boolean; skills: string[] };

export function ProductAssessment({ id, diagnostic = false, recommendations = [], preparationHref = "/paket", allowReport }: {
  id: string; diagnostic?: boolean; recommendations?: Recommendation[]; preparationHref?: string; allowReport: boolean;
}) {
  const [finished, setFinished] = useState<PublicAssessment | null>(null);
  const report = useRef<HTMLElement>(null);
  const completed = diagnostic && !!finished?.result;
  useEffect(() => {
    if (completed) report.current?.focus();
  }, [completed]);

  let next;
  if (diagnostic && finished?.result) {
    const details = new Map(finished.result.details.map(detail => [detail.id, detail] as const));
    const sections = finished.sections.map(section => {
      const questions = finished.questions.filter(question => question.section === section.key);
      const missed = questions.filter(question => {
        const detail = details.get(question.id);
        return !detail || detail.selected !== detail.answer;
      });
      return { ...section, total: questions.length, missed };
    });
    const priority = [...sections].filter(section => section.missed.length > 0)
      .sort((a, b) => b.missed.length / b.total - a.missed.length / a.total)[0];
    const skills = new Set(priority?.missed.map(question => question.skill));
    const overlap = (item: Recommendation) => item.skills.filter(skill => skills.has(skill)).length;
    const target = recommendations.filter(item => item.section === priority?.key).sort((a, b) => overlap(b) - overlap(a))[0];
    next = <section className="shell workspace-section" ref={report} tabIndex={-1} aria-labelledby="diagnostic-result-title">
      <div className="workspace-card">
        <span className="eyebrow">HASIL CEK KESIAPAN</span><h2 id="diagnostic-result-title">{priority ? `Mulai dari ${priority.title}` : "Lanjutkan dengan latihan lebih panjang"}</h2>
        <p>{sections.map(section => `${section.title} ${section.total - section.missed.length}/${section.total}`).join(" · ")}</p>
        {priority && <p>Topik yang muncul pada jawaban kosong atau keliru: {[...new Set(priority.missed.map(question => question.skill))].slice(0, 3).join(", ")}.</p>}
        <p className="muted">Ini indikasi awal dari 15 soal latihan.</p>
        <div className="inline-actions">
          {target ? <AssessmentStart packageId={target.packageId} details={target} />
            : <Link className="button primary" href={preparationHref}>Lihat paket persiapan →</Link>}
          <Link className="button ghost" href="/#quick-practice">Latihan singkat</Link>
        </div>
      </div>
    </section>;
  }
  return <>{next}{finished?.result && <AssessmentReviewTools key={finished.id} data={finished} allowReport={allowReport} />}
    <AssessmentClient id={id} onFinished={setFinished} /></>;
}
