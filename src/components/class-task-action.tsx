import Link from "next/link";
import type { StudentClassTask } from "@/lib/assessments";
import { AssessmentStart } from "./learning-controls";
import { AssignmentStart } from "./platform-controls";

export function ClassTaskAction({ task, now }: { task: StudentClassTask; now: number }) {
  if (task.attempt_id) {
    const finished = task.attempt_status === "finished";
    const route = task.kind === "package" ? "assessment" : finished ? "result" : "exam";
    return <Link className="button dark" href={`/${route}/${task.attempt_id}`}>
      {finished ? "Hasil & pembahasan" : "Lanjutkan"}
    </Link>;
  }
  if (task.due_at !== null && task.due_at < now) return <span className="status-badge neutral">Tenggat lewat</span>;
  if (!task.available) return <span className="status-badge neutral">Materi tidak tersedia</span>;
  return task.kind === "package" ? <AssessmentStart taskId={task.id}/> : <AssignmentStart id={task.id}/>;
}
