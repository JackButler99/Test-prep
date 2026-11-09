import { notFound } from "next/navigation";
import { SkdAssessment } from "@/components/skd-assessment";
import { dashboardUser } from "@/lib/access";
import { db } from "@/lib/db";
import type { PackageSnapshot, PublicAssessment } from "@/lib/learning-types";

export const dynamic = "force-dynamic";

export default async function SkdPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await dashboardUser("admin");
  const { id } = await params;
  const row = db().prepare("SELECT snapshot_json FROM assessment_packages WHERE id=? AND state IN ('draft','published')")
    .get(id) as { snapshot_json: string } | undefined;
  if (!row) notFound();
  const snapshot = JSON.parse(row.snapshot_json) as PackageSnapshot;
  if (!snapshot.skd) notFound();
  const startedAt = Date.now();
  const duration = snapshot.sections[0].durationSeconds;
  const initial: PublicAssessment = {
    id, title: snapshot.title, examTitle: snapshot.examTitle, skd: snapshot.skd,
    status: "active", sections: snapshot.sections, sectionIndex: 0,
    startedAt, finishedAt: null, deadline: duration ? startedAt + duration * 1000 : null, answers: {},
    questions: snapshot.questions.map(({ answer: _answer, explanation: _explanation, scores: _scores, ...question }) => question),
  };
  return <SkdAssessment initial={initial} preview={snapshot} />;
}
