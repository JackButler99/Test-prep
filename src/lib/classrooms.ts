import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";
import type { User } from "./auth";
import { assertRole } from "./access";
import { HttpError } from "./http";
import { audit } from "./experiments";
import { getQuestions, type Section } from "./questions";

export function createClassroom(user: User, name: string) {
  assertRole(user,"instructor");
  name = name.trim();
  if (name.length < 3 || name.length > 100) throw new HttpError("Nama kelas harus 3–100 karakter.",400);
  const id = randomUUID(), code = randomBytes(8).toString("hex").toUpperCase();
  db().prepare("INSERT INTO classrooms VALUES(?,?,?,?,?)").run(id,user.id,name,code,Date.now());
  audit(user.id,"classroom.created",id);
  return id;
}
export function joinClassroom(user: User, code: string) {
  assertRole(user,"student");
  const classroom = db().prepare("SELECT id FROM classrooms WHERE join_code=?").get(code.trim().toUpperCase()) as {id:string}|undefined;
  if (!classroom) throw new HttpError("Kode kelas tidak ditemukan.",404);
  db().prepare("INSERT OR IGNORE INTO enrollments VALUES(?,?,?)").run(classroom.id,user.id,Date.now());
}
export function createAssignment(user: User, input: Record<string,unknown>) {
  assertRole(user,"instructor");
  const classroomId = String(input.classroomId ?? ""), title = String(input.title ?? "").trim();
  const section = String(input.section ?? ""), due = input.dueAt ? Date.parse(String(input.dueAt)) : null;
  if (title.length < 3 || title.length > 160 || !["listening","structure","reading"].includes(section) || (due !== null && (!Number.isFinite(due) || due <= Date.now()))) throw new HttpError("Periksa judul, bagian, dan tenggat tugas.",400);
  const classroom = db().prepare("SELECT id FROM classrooms WHERE id=? AND owner_id=?").get(classroomId,user.id);
  if (!classroom) throw new HttpError("Kelas tidak ditemukan.",404);
  const id = randomUUID();
  db().prepare("INSERT INTO assignments VALUES(?,?,?,?,?,?)").run(id,classroomId,title,section,due,Date.now());
  audit(user.id,"assignment.created",id);
  return id;
}
export function assignmentForStudent(userId: string, assignmentId: string) {
  const task = db().prepare(`SELECT a.*, t.id AS attempt_id FROM assignments a JOIN enrollments e ON e.classroom_id=a.classroom_id
    LEFT JOIN attempts t ON t.assignment_id=a.id AND t.user_id=e.user_id
    WHERE a.id=? AND e.user_id=?`).get(assignmentId,userId) as {id:string;section:Section;due_at:number|null;attempt_id:string|null}|undefined;
  if (!task) throw new HttpError("Tugas tidak ditemukan.",404);
  if (!task.attempt_id && task.due_at !== null && task.due_at < Date.now()) throw new HttpError("Tenggat tugas sudah lewat.",409);
  return task;
}
export function studentAssignments(userId: string) {
  return db().prepare(`SELECT a.*, c.name AS classroom_name, t.id AS attempt_id, t.status AS attempt_status FROM assignments a
    JOIN classrooms c ON c.id=a.classroom_id JOIN enrollments e ON e.classroom_id=a.classroom_id
    LEFT JOIN attempts t ON t.assignment_id=a.id AND t.user_id=e.user_id
    WHERE e.user_id=? ORDER BY a.created_at DESC`).all(userId) as {id:string;title:string;section:Section;due_at:number|null;classroom_name:string;attempt_id:string|null;attempt_status:string|null;created_at:number}[];
}
export function instructorClasses(user: User) {
  assertRole(user,"instructor");
  const list = db().prepare("SELECT * FROM classrooms WHERE owner_id=? ORDER BY created_at DESC").all(user.id) as {id:string;name:string;join_code:string}[];
  return list.map(c => {
    const students = db().prepare(`SELECT u.id,u.username FROM users u JOIN enrollments e ON e.user_id=u.id WHERE e.classroom_id=?`).all(c.id) as {id:string;username:string}[];
    const assignments = db().prepare("SELECT * FROM assignments WHERE classroom_id=? ORDER BY created_at DESC").all(c.id) as {id:string;title:string;section:Section;due_at:number|null}[];
    const results = db().prepare(`SELECT t.*,u.username FROM attempts t JOIN assignments a ON a.id=t.assignment_id
      JOIN users u ON u.id=t.user_id WHERE a.classroom_id=?`).all(c.id) as {id:string;user_id:string;assignment_id:string;status:string;answers:string;username:string}[];
    return { ...c,students,assignments,results:results.map(r=>{
      const task = assignments.find(a=>a.id===r.assignment_id)!;
      const questions = getQuestions("practice",task.section), answers = JSON.parse(r.answers) as Record<string,number>;
      const answered = questions.filter(q=>answers[q.id] !== undefined).length;
      return {...r,answered,total:questions.length,correct:r.status === "finished" ? questions.filter(q=>answers[q.id]===q.answer).length : null};
    }) };
  });
}
export function requestInstructor(user: User, organization: string) {
  assertRole(user,"student");
  organization=organization.trim();
  if (organization.length<3 || organization.length>120) throw new HttpError("Nama lembaga harus 3–120 karakter.",400);
  db().prepare(`INSERT INTO instructor_requests VALUES(?,?,'pending',?)
    ON CONFLICT(user_id) DO UPDATE SET organization=excluded.organization,status='pending',created_at=excluded.created_at`)
    .run(user.id,organization,Date.now());
}
export function reviewInstructor(admin: User, userId: string, approve: boolean) {
  assertRole(admin,"admin");
  const request = db().prepare("SELECT user_id FROM instructor_requests WHERE user_id=? AND status='pending'").get(userId);
  if (!request) throw new HttpError("Permintaan tidak ditemukan.",404);
  db().exec("BEGIN IMMEDIATE");
  try {
    if (approve) db().prepare("UPDATE users SET role='instructor' WHERE id=? AND role='student'").run(userId);
    db().prepare("UPDATE instructor_requests SET status=? WHERE user_id=?").run(approve?"approved":"rejected",userId);
    audit(admin.id,approve?"instructor.approved":"instructor.rejected",userId);
    db().exec("COMMIT");
  } catch(cause) { db().exec("ROLLBACK"); throw cause; }
}
