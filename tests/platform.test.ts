import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migratePlatform } from "../src/lib/schema";
import { db } from "../src/lib/db";
import { register, authenticate, type User } from "../src/lib/auth";
import { createClassroom,joinClassroom,createAssignment,assignmentForStudent,instructorClasses,requestInstructor,reviewInstructor } from "../src/lib/classrooms";
import { createExperiment,transitionExperiment,getPrompt,expose,experimentReports } from "../src/lib/experiments";
import { createAttempt,loadAttempt,saveAnswer,advanceAttempt,serializeAttempt } from "../src/lib/attempts";
import { getQuestions } from "../src/lib/questions";
import { checkOrigin,readBody,rateLimit } from "../src/lib/http";

const directory=mkdtempSync(join(tmpdir(),"itp-platform-"));
process.env.DATA_DIR=directory;
test.after(()=>{db().close();rmSync(directory,{recursive:true,force:true});});
function role(user:User,value:User['role']):User {db().prepare("UPDATE users SET role=? WHERE id=?").run(value,user.id);return {...user,role:value};}
const password="test-password-12345";

test("additive migration preserves legacy accounts, answers, and student default",()=>{
  const c=new DatabaseSync(":memory:");
  c.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT);CREATE TABLE attempts(id TEXT PRIMARY KEY,user_id TEXT,answers TEXT);
    INSERT INTO users VALUES('legacy','old');INSERT INTO attempts VALUES('old-attempt','legacy','{"a":2}');`);
  migratePlatform(c);migratePlatform(c);
  assert.equal((c.prepare("SELECT role FROM users").get() as {role:string}).role,"student");
  assert.equal((c.prepare("SELECT answers FROM attempts").get() as {answers:string}).answers,'{"a":2}');
  assert.equal(c.prepare("SELECT option_seed FROM attempts").get()?.option_seed,null);
  c.close();
});
test("new TOEFL option order is session-stable while old answers retain their meaning",()=>{
  const user=register("option_order",password);
  const id=createAttempt(user.id,"practice","listening"),secondId=createAttempt(user.id,"practice","listening");
  const setSeed=db().prepare("UPDATE attempts SET option_seed=? WHERE id=?");
  setSeed.run("regression-seed-one",id);
  setSeed.run("regression-seed-two",secondId);
  const display=(attemptId:string)=>serializeAttempt(loadAttempt(attemptId,user.id)!);
  const canonical=getQuestions("practice","listening"),first=display(id);
  assert.notDeepEqual(first.questions.map(q=>q.options),canonical.map(q=>q.options));
  assert.notDeepEqual(first.questions.map(q=>q.options),display(secondId).questions.map(q=>q.options));
  assert.deepEqual(display(id).questions,first.questions);
  const answer=canonical[0].options[canonical[0].answer];
  const choice=first.questions[0].options.indexOf(answer);
  saveAnswer(id,user.id,canonical[0].id,choice);
  assert.equal(display(id).answers[canonical[0].id],choice);
  const result=serializeAttempt(advanceAttempt(id,user.id,0));
  assert.ok("details" in result);
  assert.equal(result.totalCorrect,1);
  assert.equal(result.questions[0].options[result.details[0].correct],answer);

  setSeed.run(null,secondId);
  db().prepare("UPDATE attempts SET answers=? WHERE id=?").run(JSON.stringify({[canonical[0].id]:canonical[0].answer}),secondId);
  const historical=serializeAttempt(advanceAttempt(secondId,user.id,0));
  assert.deepEqual(historical.questions.map(q=>q.options),canonical.map(q=>q.options));
  assert.ok("totalCorrect" in historical);
  assert.equal(historical.totalCorrect,1);
});
test("public accounts are students; instructor requires admin review",()=>{
  const student=register("student_a",password),admin=role(register("admin_a",password),"admin");
  assert.equal(student.role,"student");assert.equal(authenticate(student.username,password)?.role,"student");
  assert.throws(()=>createClassroom(student,"Private class"));
  requestInstructor(student,"Example school");
  assert.throws(()=>reviewInstructor(student,student.id,true));
  reviewInstructor(admin,student.id,true);
  assert.equal(authenticate(student.username,password)?.role,"instructor");
  assert.ok(db().prepare("SELECT 1 FROM audit_log WHERE action='instructor.approved'").get());
});
test("instructors cannot access other classes; personal attempts never enter class reports",()=>{
  const teacher=role(register("teacher_b",password),"instructor"),other=role(register("teacher_c",password),"instructor");
  const student=register("student_b",password),outsider=register("outsider_b",password);
  const classId=createClassroom(teacher,"Pilot group");
  const code=(db().prepare("SELECT join_code FROM classrooms WHERE id=?").get(classId) as {join_code:string}).join_code;
  joinClassroom(student,code);joinClassroom(student,code);
  assert.throws(()=>createAssignment(other,{classroomId:classId,title:"Foreign task",section:"structure"}));
  const task=createAssignment(teacher,{classroomId:classId,title:"Practice one",section:"structure"});
  assert.throws(()=>assignmentForStudent(outsider.id,task));
  assert.equal(assignmentForStudent(student.id,task).section,"structure");
  createAttempt(student.id,"practice","structure");
  const assigned=createAttempt(student.id,"practice","structure",task);
  assert.throws(()=>createAttempt(student.id,"practice","structure",task));
  assert.equal(loadAttempt(assigned,outsider.id),null);
  const row=loadAttempt(assigned,student.id)!;
  const shown = serializeAttempt(row).questions;
  for(const q of getQuestions("practice","structure")) {
    const options = shown.find(item => item.id === q.id)!.options;
    saveAnswer(row.id,row.user_id,q.id,options.indexOf(q.options[q.answer]));
  }
  assert.ok(!(serializeAttempt(row) as Record<string,unknown>).details);
  advanceAttempt(row.id,row.user_id,0);
  assert.equal(instructorClasses(teacher)[0].results.length,1);
  assert.equal(instructorClasses(teacher)[0].results[0].correct,10);
  assert.equal(instructorClasses(other).length,0);
});
test("assignment deadline is enforced before a new attempt",()=>{
  const teacher=authenticate("teacher_b",password)!,student=authenticate("student_b",password)!;
  const classId=instructorClasses(teacher)[0].id;
  assert.throws(()=>createAssignment(teacher,{classroomId:classId,title:"Expired",section:"structure",dueAt:"2000-01-01T00:00:00Z"}));
  const task=createAssignment(teacher,{classroomId:classId,title:"Timed task",section:"reading"});
  db().prepare("UPDATE assignments SET due_at=1 WHERE id=?").run(task);
  assert.throws(()=>assignmentForStudent(student.id,task));
});
test("experiment allocation is sticky, deduplicated, excludes instructors, and gates privileged actions",()=>{
  const admin=authenticate("admin_a",password)!,student=register("experiment_a",password),teacher=authenticate("teacher_b",password)!;
  const plan={name:"Prompt test",hypothesis:"Benefit wording increases completion",control:"Practice today",treatment:"Learn your mistakes",baseline:.2,mde:.1,minDays:7};
  assert.throws(()=>createExperiment(student,plan));
  const id=createExperiment(admin,plan);transitionExperiment(admin,id,"start");
  const first=getPrompt(student),second=getPrompt(student);assert.deepEqual(first,second);assert.equal(first.experimentId,id);
  assert.equal(getPrompt(teacher).experimentId,null);assert.throws(()=>expose(teacher,id));
  assert.throws(()=>expose(register("unassigned",password),id));
  expose(student,id);expose(student,id);
  const report=experimentReports().find(e=>e.id===id)!;
  assert.equal(report.arms.A.assigned+report.arms.B.assigned,1);
  assert.equal(report.arms.A.exposed+report.arms.B.exposed,1);
  assert.equal(report.analysis.pending,1);
  const secondId=createExperiment(admin,{...plan,name:"Second prompt"});assert.throws(()=>transitionExperiment(admin,secondId,"start"));
  assert.throws(()=>transitionExperiment(student,id,"end"));
  transitionExperiment(admin,id,"end");
  assert.match(experimentReports().find(e=>e.id===id)!.analysis.decision,/Eksploratif/);
  assert.throws(()=>transitionExperiment(admin,secondId,"start"));
  db().prepare("UPDATE experiment_assignments SET exposed_at=? WHERE experiment_id=?").run(Date.now()-8*86400000,id);
});
test("only fully answered personal practice started after exposure can convert; window and dedup enforced",()=>{
  const admin=authenticate("admin_a",password)!,student=register("experiment_b",password);
  const oldAttempt=createAttempt(student.id,"practice","structure");
  const id=createExperiment(admin,{name:"Completion test",hypothesis:"Clear copy improves completion",control:"Ten questions",treatment:"Find mistakes",baseline:.2,mde:.1,minDays:7});transitionExperiment(admin,id,"start");getPrompt(student);expose(student,id);
  db().prepare("UPDATE attempts SET started_at=1 WHERE id=?").run(oldAttempt);
  const old=loadAttempt(oldAttempt,student.id)!;
  for(const q of getQuestions("practice","structure"))saveAnswer(old.id,old.user_id,q.id,q.answer);advanceAttempt(old.id,old.user_id,0);
  const event=()=>db().prepare("SELECT * FROM experiment_assignments WHERE experiment_id=? AND user_id=?").get(id,student.id) as {converted_at:number|null;started_at:number|null};
  assert.equal(event().converted_at,null);
  const partial=loadAttempt(createAttempt(student.id,"practice","structure"),student.id)!;advanceAttempt(partial.id,partial.user_id,0);assert.equal(event().converted_at,null);
  const fresh=loadAttempt(createAttempt(student.id,"practice","structure"),student.id)!;
  for(const q of getQuestions("practice","structure"))saveAnswer(fresh.id,fresh.user_id,q.id,q.answer);advanceAttempt(fresh.id,fresh.user_id,0);
  assert.ok(event().converted_at);assert.ok(event().started_at);
  const converted=event().converted_at;
  const fresh2=loadAttempt(createAttempt(student.id,"practice","structure"),student.id)!;for(const q of getQuestions("practice","structure"))saveAnswer(fresh2.id,fresh2.user_id,q.id,0);advanceAttempt(fresh2.id,fresh2.user_id,0);assert.equal(event().converted_at,converted);
  const stale=register("experiment_stale",password);getPrompt(stale);expose(stale,id);db().prepare("UPDATE experiment_assignments SET exposed_at=? WHERE user_id=?").run(Date.now()-8*86400000,stale.id);
  const late=loadAttempt(createAttempt(stale.id,"practice","structure"),stale.id)!;for(const q of getQuestions("practice","structure"))saveAnswer(late.id,late.user_id,q.id,0);advanceAttempt(late.id,late.user_id,0);
  assert.equal((db().prepare("SELECT converted_at FROM experiment_assignments WHERE user_id=?").get(stale.id) as {converted_at:null}).converted_at,null);
  transitionExperiment(admin,id,"end");
  db().prepare("UPDATE experiment_assignments SET exposed_at=? WHERE experiment_id=?").run(Date.now()-8*86400000,id);
});
test("plan automatically closes on sample plus duration, independently of conversions",()=>{
  const admin=authenticate("admin_a",password)!;
  const id=createExperiment(admin,{name:"Auto stop",hypothesis:"Predeclared test plan",control:"Control",treatment:"Treatment",baseline:.2,mde:.6,minDays:7});
  transitionExperiment(admin,id,"start");
  const plan=db().prepare("SELECT required_per_arm FROM experiments WHERE id=?").get(id) as {required_per_arm:number};
  db().prepare("UPDATE experiments SET started_at=? WHERE id=?").run(Date.now()-10*86400000,id);
  for(const variant of ["A","B"])for(let i=0;i<plan.required_per_arm;i++){
    const uid=`${variant}-${i}`;db().prepare("INSERT INTO users(id,username,salt,password_hash,created_at) VALUES(?,?, 'unused','unused',?)").run(uid,uid,Date.now());
    db().prepare("INSERT INTO experiment_assignments(experiment_id,user_id,variant,assigned_at,exposed_at) VALUES(?,?,?,?,?)").run(id,uid,variant,Date.now()-8*86400000,Date.now()-8*86400000);
  }
  const report=experimentReports().find(e=>e.id===id)!;
  assert.equal(report.status,"ended");assert.equal(report.stopped_by_plan,1);assert.equal(report.analysis.pending,0);
  assert.match(report.analysis.decision,/Belum ada bukti/);
});
test("origin, input size, and rate limits reject invalid requests",async()=>{
  assert.throws(()=>checkOrigin(new Request("http://localhost/api/platform",{headers:{origin:"https://foreign.invalid",host:"localhost"}})));
  await assert.rejects(readBody(new Request("http://localhost",{method:"POST",body:JSON.stringify({text:"x".repeat(25000)})})));
  await assert.rejects(readBody(new Request("http://localhost",{method:"POST",body:"null"})));
  rateLimit("test",2,100,1000);rateLimit("test",2,100,1000);assert.throws(()=>rateLimit("test",2,100,1000));rateLimit("test",2,100,1101);
});
