import "server-only";
import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { assertRole } from "./access";
import type { User } from "./auth";
import { HttpError } from "./http";
import { audit } from "./experiments";
import { studentAssignments } from "./classrooms";
import { SECTION_NAMES } from "./client-types";
import { listPackages, ensureLearningSeed, packageMaterialsAvailable } from "./learning-bank";
import { optionOrder } from "./option-order";
import { readItpAudio } from "./itp-simulation";
import type { PackageSnapshot, PublicAssessment, SnapshotQuestion } from "./learning-types";

export type AssessmentRow={id:string;user_id:string;package_id:string;task_id:string|null;status:"active"|"finished";snapshot_json:string;answers_json:string;timing_json:string;section_index:number;deadline:number|null;started_at:number;finished_at:number|null;timing_question_id:string|null;last_tick_at:number|null;option_seed:string|null;listening_index:number;listening_audio_until:number|null};
export function createAssessmentTask(user:User,input:Record<string,unknown>) {
  assertRole(user,"instructor");ensureLearningSeed();
  const classId=String(input.classroomId??""),title=String(input.title??"").trim();
  const classroom=db().prepare("SELECT id FROM classrooms WHERE id=? AND owner_id=?").get(classId,user.id);
  if(!classroom)throw new HttpError("Kelas tidak ditemukan.",404);
  const pack=listPackages(user).find(p=>p.id===input.packageId&&p.state==="published");
  if(!pack)throw new HttpError("Paket terbit tidak ditemukan.",404);
  if(title.length<3||title.length>160)throw new HttpError("Judul tugas harus 3–160 karakter.",400);
  const due=input.dueAt?Date.parse(String(input.dueAt)):null;
  if(due!==null&&(!Number.isFinite(due)||due<=Date.now()))throw new HttpError("Tenggat tidak valid.",400);
  const id=randomUUID();db().prepare("INSERT INTO assessment_tasks VALUES(?,?,?,?,?,?)").run(id,classId,pack.id,title,due,Date.now());audit(user.id,"assessment-task.created",id);return id;
}
export function studentClassTasks(userId: string) {
  const packages = db().prepare(`SELECT t.*, c.name AS classroom_name, p.title AS package_title, p.state AS package_state,
      p.snapshot_json, x.active, a.id AS attempt_id, a.status AS attempt_status
    FROM assessment_tasks t JOIN classrooms c ON c.id=t.classroom_id JOIN assessment_packages p ON p.id=t.package_id
    JOIN exam_profiles x ON x.id=p.exam_id JOIN enrollments e ON e.classroom_id=t.classroom_id
    LEFT JOIN assessment_attempts a ON a.task_id=t.id AND a.user_id=e.user_id
    WHERE e.user_id=?`).all(userId) as {
      id:string; title:string; classroom_name:string; package_title:string; package_state:string;
      snapshot_json:string; active:number; due_at:number|null; attempt_id:string|null; attempt_status:string|null; created_at:number;
    }[];
  const packageTasks = packages.map(({ snapshot_json, active, package_state, package_title, ...task }) => ({
    ...task, kind: "package" as const, subtitle: package_title,
    available: !!task.attempt_id || (!!active && package_state === "published" && packageMaterialsAvailable(JSON.parse(snapshot_json) as PackageSnapshot)),
  }));
  const legacyTasks = studentAssignments(userId).map(task => ({
    ...task, kind: "toefl" as const, subtitle: SECTION_NAMES[task.section], available: true,
  }));
  return [...packageTasks, ...legacyTasks].sort((a,b) => b.created_at-a.created_at);
}
export type StudentClassTask = ReturnType<typeof studentClassTasks>[number];

export function startAssessment(user:User,input:{packageId?:string;taskId?:string}) {
  assertRole(user,"student");ensureLearningSeed();
  return transaction(()=>{
    let packageId=input.packageId;
    if(input.taskId){
      const task=db().prepare(`SELECT t.* FROM assessment_tasks t JOIN enrollments e ON e.classroom_id=t.classroom_id WHERE t.id=? AND e.user_id=?`).get(input.taskId,user.id) as {package_id:string;due_at:number|null}|undefined;
      if(!task)throw new HttpError("Tugas tidak ditemukan.",404);
      const existing=db().prepare("SELECT id FROM assessment_attempts WHERE user_id=? AND task_id=?").get(user.id,input.taskId) as {id:string}|undefined;
      if(existing)return existing.id;
      if(task.due_at!==null&&task.due_at<Date.now())throw new HttpError("Tenggat tugas sudah lewat.",409);
      packageId=task.package_id;
    }
    const pack=db().prepare("SELECT * FROM assessment_packages WHERE id=? AND state='published'").get(packageId??"") as {snapshot_json:string;visibility:string;id:string;exam_id:string}|undefined;
    if(!pack||(!input.taskId&&pack.visibility!=="public"))throw new HttpError("Paket tidak tersedia.",404);
    const profile=db().prepare("SELECT active FROM exam_profiles WHERE id=?").get(pack.exam_id) as {active:number}|undefined;
    if(!profile?.active)throw new HttpError("Ujian sedang dinonaktifkan.",409);
    const snapshot=JSON.parse(pack.snapshot_json) as PackageSnapshot;
    if(!packageMaterialsAvailable(snapshot))throw new HttpError("Materi paket tidak tersedia. Hubungi pengelola.",409);
    const id=randomUUID(),now=Date.now(),duration=snapshot.sections[0].durationSeconds;
    db().prepare(`INSERT INTO assessment_attempts(id,user_id,package_id,task_id,status,snapshot_json,started_at,deadline,option_seed)
      VALUES(?,?,?,?,'active',?,?,?,?)`).run(id,user.id,pack.id,input.taskId??null,JSON.stringify(snapshot),now,duration?now+duration*1000:null,randomUUID());
    return id;
  });
}
function assessmentOptionOrder(row: AssessmentRow, question: Pick<SnapshotQuestion,"revision"|"questionId"|"id"|"options">) {
  // First-generation TOEFL seed content has predictable keys. Preserve the authored
  // order for other bank questions, including questions that refer to option labels.
  const seeded = question.revision === 1 && /^legacy-(?:L|LT|S|R)-/.test(question.questionId);
  return optionOrder(seeded ? row.option_seed : null, question.id, question.options.length);
}

/** Counts only server-observed, recently heartbeated visible intervals, capped at 15 s. */
function flushTiming(row:AssessmentRow,now:number) {
  if(row.timing_question_id&&row.last_tick_at!==null){
    const timing=JSON.parse(row.timing_json) as Record<string,number>;
    const until=row.deadline===null?now:Math.min(now,row.deadline);
    timing[row.timing_question_id]=(timing[row.timing_question_id]??0)+Math.max(0,Math.min(15000,until-row.last_tick_at));
    row.timing_json=JSON.stringify(timing);
  }
  row.last_tick_at=now;
  db().prepare("UPDATE assessment_attempts SET timing_json=?,last_tick_at=? WHERE id=?").run(row.timing_json,now,row.id);
}
function finish(row:AssessmentRow,when:number) {
  flushTiming(row,when);
  const snapshot=JSON.parse(row.snapshot_json) as PackageSnapshot,answers=JSON.parse(row.answers_json) as Record<string,number>,timing=JSON.parse(row.timing_json) as Record<string,number>;
  for(const q of snapshot.questions){
    const selected=answers[q.id]??null;
    db().prepare("INSERT INTO assessment_responses VALUES(?,?,?,?,?,?,?)").run(row.id,q.id,selected,Number(selected===q.answer),selected===null?0:q.scores[selected],Math.max(...q.scores),timing[q.id]??0);
  }
  row.status="finished";row.finished_at=when;row.deadline=null;row.timing_question_id=null;
  db().prepare("UPDATE assessment_attempts SET status='finished',finished_at=?,deadline=NULL,timing_question_id=NULL WHERE id=?").run(when,row.id);
}
function advance(row:AssessmentRow,when:number) {
  const snapshot=JSON.parse(row.snapshot_json) as PackageSnapshot;
  if(row.section_index>=snapshot.sections.length-1){finish(row,when);return;}
  flushTiming(row,when);row.section_index++;
  const duration=snapshot.sections[row.section_index].durationSeconds;
  row.deadline=duration?when+duration*1000:null;row.timing_question_id=null;row.last_tick_at=null;
  db().prepare("UPDATE assessment_attempts SET section_index=?,deadline=?,timing_question_id=NULL,last_tick_at=NULL WHERE id=?").run(row.section_index,row.deadline,row.id);
}
function findAssessment(id:string,userId:string,now:number) {
  const row=db().prepare("SELECT * FROM assessment_attempts WHERE id=? AND user_id=?").get(id,userId) as AssessmentRow|undefined;
  if(!row)throw new HttpError("Sesi tidak ditemukan.",404);
  while(row.status==="active"&&row.deadline!==null&&now>=row.deadline)advance(row,row.deadline);
  return row;
}
export function loadAssessment(id:string,userId:string,now?:number) {return transaction(()=>findAssessment(id,userId,now??Date.now()));}

function activeListening(row: AssessmentRow, snapshot: PackageSnapshot) {
  if (row.status !== "active" || snapshot.sections[row.section_index].key !== "listening" || !snapshot.itpSimulation) return;
  const clips = snapshot.itpSimulation.listening;
  const questions = snapshot.questions.filter(q => q.section === "listening");
  return { question: questions[row.listening_index], clip: clips[row.listening_index], total: clips.length };
}

export function claimListeningAudio(id: string, userId: string, questionId: unknown, now = Date.now()) {
  if (typeof questionId !== "string") throw new HttpError("Soal Listening tidak valid.", 400);
  const audio = transaction(() => {
    const row = findAssessment(id, userId, now);
    const current = activeListening(row, JSON.parse(row.snapshot_json));
    if (!current || current.question.id !== questionId || row.listening_audio_until !== null) return null;
    const until = now + current.clip.durationMs;
    if (row.deadline !== null && until > row.deadline) throw new HttpError("Waktu tersisa tidak cukup untuk memutar klip ini.", 409);
    const bytes = readItpAudio(current.clip);
    db().prepare("UPDATE assessment_attempts SET listening_audio_until=? WHERE id=?").run(until, row.id);
    return bytes;
  });
  if (!audio) throw new HttpError("Klip sudah dimulai atau soalnya telah berubah.", 409);
  return audio;
}

export function mutateAssessment(id:string,userId:string,input:Record<string,unknown>,at?:number) {
  if(input.action==="advance"&&(typeof input.sectionIndex!=="number"||!Number.isInteger(input.sectionIndex)||input.sectionIndex<0||input.sectionIndex>7)){
    throw new HttpError("Bagian sesi tidak valid.",400);
  }
  const result=transaction(()=>{
    const now=at??Date.now();
    const row=findAssessment(id,userId,now);
    if(row.status!=="active")return input.action==="answer"?null:row;
    const snapshot=JSON.parse(row.snapshot_json) as PackageSnapshot;
    const listening=activeListening(row,snapshot);
    if(input.action==="advance"){
      if(input.sectionIndex===row.section_index){
        if (listening) throw new HttpError("Lanjutkan Listening secara berurutan.", 409);
        advance(row,now);
      }
      return row;
    }
    if (input.action === "listeningNext") {
      if (!snapshot.itpSimulation) throw new HttpError("Aksi sesi tidak valid.", 400);
      if (!listening || input.questionId !== listening.question.id) return row;
      if (row.listening_audio_until === null || now < row.listening_audio_until) throw new HttpError("Tunggu sampai audio selesai.", 409);
      if (row.listening_index + 1 === listening.total) advance(row, now);
      else {
        flushTiming(row, now);
        row.listening_index++;
        row.listening_audio_until = row.timing_question_id = row.last_tick_at = null;
        db().prepare(`UPDATE assessment_attempts SET listening_index=?, listening_audio_until=NULL,
          timing_question_id=NULL, last_tick_at=NULL WHERE id=?`).run(row.listening_index, row.id);
      }
      return row;
    }
    const q=snapshot.questions.find(q=>q.id===input.questionId);
    if(!q)throw new HttpError("Soal tidak ditemukan.",400);
    if(q.section!==snapshot.sections[row.section_index].key){
      if(input.action==="answer")return null;
      throw new HttpError("Soal tidak tersedia pada bagian aktif.",400);
    }
    if (listening && q.id !== listening.question.id) throw new HttpError("Soal Listening sudah berubah.", 409);
    if(input.action==="answer"){
      if (listening && (row.listening_audio_until === null || now < row.listening_audio_until)) throw new HttpError("Tunggu sampai audio selesai.", 409);
      const choice=input.choice;
      if(choice!==null&&(typeof choice!=="number"||!Number.isInteger(choice)||choice<0||choice>=q.options.length))throw new HttpError("Pilihan jawaban tidak valid.",400);
      const answers=JSON.parse(row.answers_json) as Record<string,number>;
      if(choice===null)delete answers[q.id];else answers[q.id]=assessmentOptionOrder(row,q)[choice];
      row.answers_json=JSON.stringify(answers);db().prepare("UPDATE assessment_attempts SET answers_json=? WHERE id=?").run(row.answers_json,row.id);
    } else if(input.action==="view"){
      if(typeof input.visible!=="boolean")throw new HttpError("Status visibilitas tidak valid.",400);
      flushTiming(row,now);row.timing_question_id=input.visible?q.id:null;row.last_tick_at=input.visible?now:null;
      db().prepare("UPDATE assessment_attempts SET timing_question_id=?,last_tick_at=? WHERE id=?").run(row.timing_question_id,row.last_tick_at,row.id);
    } else throw new HttpError("Aksi sesi tidak valid.",400);
    return row;
  });
  if(!result)throw new HttpError("Bagian telah berubah atau sesi selesai. Jawaban tidak tersimpan.",409);
  return result;
}
export function publicAssessment(row:AssessmentRow, now=Date.now()):PublicAssessment {
  const snap=JSON.parse(row.snapshot_json) as PackageSnapshot;
  const listening=activeListening(row,snap);
  const available=listening?[listening.question]:row.status==="finished"?snap.questions:snap.questions.filter(q=>q.section===snap.sections[row.section_index].key);
  const stored=JSON.parse(row.answers_json) as Record<string,number>;
  const answers:PublicAssessment["answers"]={};
  const orders=new Map<string,number[]>();
  const questions=available.map(({answer:_,explanation:__,scores:___,...q})=>{
    const order=assessmentOptionOrder(row,q);
    orders.set(q.id,order);
    if(stored[q.id]!==undefined)answers[q.id]=order.indexOf(stored[q.id]);
    const options=order.map(index=>q.options[index]);
    if (listening) return {...q,prompt:"",stimulus:"",options:row.listening_audio_until!==null&&now>=row.listening_audio_until?options:[]};
    return {...q,options};
  });
  const safe:PublicAssessment={id:row.id,title:snap.title,examTitle:snap.examTitle,status:row.status,sections:snap.sections,sectionIndex:row.section_index,deadline:row.deadline,startedAt:row.started_at,finishedAt:row.finished_at,answers,questions};
  if (snap.itpSimulation) safe.itpSimulation = true;
  if (listening) safe.listening = { position: row.listening_index + 1, total: listening.total, part: listening.clip.part, audioUntil: row.listening_audio_until };
  if(row.status==="finished"){
    const responses=db().prepare("SELECT * FROM assessment_responses WHERE attempt_id=?").all(row.id) as {revision_id:string;selected:number|null;points:number;max_points:number;correct:number;observed_ms:number}[];
    safe.result={points:responses.reduce((n,r)=>n+r.points,0),maxPoints:responses.reduce((n,r)=>n+r.max_points,0),correct:responses.reduce((n,r)=>n+r.correct,0),total:snap.questions.length,details:snap.questions.map(q=>{
      const r=responses.find(r=>r.revision_id===q.id)!,order=orders.get(q.id)!;
      return {id:q.id,selected:r.selected===null?null:order.indexOf(r.selected),answer:order.indexOf(q.answer),explanation:q.explanation,points:r.points,maxPoints:r.max_points,observedMs:r.observed_ms};
    })};
  }
  return safe;
}
export function assessmentHistory(userId:string) {
  const rows=db().prepare("SELECT id FROM assessment_attempts WHERE user_id=? ORDER BY started_at DESC LIMIT 30").all(userId) as {id:string}[];
  return rows.map(r=>{const a=loadAssessment(r.id,userId),s=JSON.parse(a.snapshot_json) as PackageSnapshot;return {id:a.id,title:s.title,examTitle:s.examTitle,status:a.status,startedAt:a.started_at};});
}

export function settleExpiredForReport(user:User,now=Date.now()) {
  assertRole(user,"admin","instructor");
  const rows=db().prepare(`SELECT a.id,a.user_id FROM assessment_attempts a
    LEFT JOIN assessment_tasks t ON t.id=a.task_id LEFT JOIN classrooms c ON c.id=t.classroom_id
    WHERE a.status='active' AND a.deadline IS NOT NULL AND a.deadline<=? AND (?='admin' OR c.owner_id=?)`)
    .all(now,user.role,user.id) as {id:string;user_id:string}[];
  for(const row of rows)loadAssessment(row.id,row.user_id,now);
}
