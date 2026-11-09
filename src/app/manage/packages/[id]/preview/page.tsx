import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { AssessmentClient } from "@/components/assessment-client";
import { dashboardUser } from "@/lib/access";
import { validItpSnapshot } from "@/lib/itp-simulation";
import { assessmentOptionOrder } from "@/lib/option-order";
import { adminPreviewSnapshot } from "@/lib/package-preview";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await dashboardUser("admin");
  const { id } = await params;
  const snapshot = adminPreviewSnapshot(admin, id);
  if (!snapshot) notFound();
  if (!snapshot.sections.length || !snapshot.questions.length || (snapshot.itpSimulation && !validItpSnapshot(snapshot))) {
    return <main className="shell assessment-loading">
      <h1>Pratinjau simulasi</h1>
      <p role="alert">Susunan soal atau audio paket belum lengkap.</p>
      <Link className="button ghost" href="/manage/packages#package-list">Kembali ke Materi latihan</Link>
    </main>;
  }
  const seed = randomUUID();
  const preview = {
    ...snapshot,
    questions: snapshot.questions.map(question => {
      const order = assessmentOptionOrder(seed, question);
      return { ...question, options: order.map(index => question.options[index]),
        scores: order.map(index => question.scores[index]), answer: order.indexOf(question.answer) };
    }),
  };
  return <AssessmentClient key={id} id={id} preview={preview} />;
}
