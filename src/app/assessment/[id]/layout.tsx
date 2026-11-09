import type { ReactNode } from "react";
import { SkdAssessment } from "@/components/skd-assessment";
import { loadAssessment, publicAssessment } from "@/lib/assessments";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SKD_YEAR } from "@/lib/skd-format";

export default async function AssessmentLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await getUser();
  if (!user || (user.role !== "student" && user.role !== "admin")) return children;
  const { id } = await params;
  const skd = db().prepare(`SELECT 1 FROM assessment_attempts
    WHERE id=? AND user_id=? AND json_extract(snapshot_json, '$.skd.year')=?`).get(id, user.id, SKD_YEAR);
  if (!skd) return children;
  return <SkdAssessment key={id} initial={publicAssessment(loadAssessment(id, user.id))} />;
}
