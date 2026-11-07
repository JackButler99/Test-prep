import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync,writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { db } from "../src/lib/db";
import { register,type User } from "../src/lib/auth";
import { HttpError } from "../src/lib/http";
import { saveQuestion,listBank,transitionQuestions,createPackage,listPackages,transitionPackage,setPackageVisibility } from "../src/lib/learning-bank";
import { startAssessment,loadAssessment,mutateAssessment,publicAssessment } from "../src/lib/assessments";

const directory=mkdtempSync(join(tmpdir(),"itp-package-access-"));process.env.DATA_DIR=directory;
test.after(()=>{db().close();rmSync(directory,{recursive:true,force:true});});
function account(name:string,role:User["role"]="student") {const u=register(name,"test-password-12345");db().prepare("UPDATE users SET role=? WHERE id=?").run(role,u.id);return {...u,role};}
const admin=account("access_admin","admin"),teacher=account("access_teacher","instructor"),student=account("access_student"),outsider=account("access_outsider");
const content={examId:"casn-tiu",section:"numerik",kind:"text",skill:"addition",stimulus:"",prompt:"What is two plus three?",options:["5","6"],answer:0,explanation:"Two plus three is five."};
function publish(owner=admin,input:Record<string,unknown>={}) {const id=saveQuestion(owner,{...content,...input});transitionQuestions(owner,[id],"review","");transitionQuestions(admin,[id],"publish","Content and answer have been checked.");return id;}
function pack(ids=[publish()],owner=admin,title="Access package") {return createPackage(owner,{examId:"casn-tiu",title,revisionIds:ids,durations:{numerik:0},visibility:"private"});}
function row(id:string) {return db().prepare("SELECT * FROM assessment_packages WHERE id=?").get(id)!;}
function change(id:string,visibility:string,extra:Record<string,unknown>={}) {const p=row(id);return {id,visibility,expectedVisibility:p.visibility,expectedState:p.state,...extra};}
function status(fn:()=>unknown,expected:number) {assert.throws(fn,(e:unknown)=>e instanceof HttpError&&e.status===expected);}
function auditCount(id:string) {return (db().prepare("SELECT COUNT(*) AS n FROM audit_log WHERE target_id=? AND action LIKE 'package.visibility.%'").get(id) as {n:number}).n;}

test("admin changes access without publishing or replacing the snapshot; existing attempts survive privatizing",()=>{
  const id=pack(),before=row(id);
  setPackageVisibility(admin,change(id,"public"));
  assert.equal(row(id).state,"draft");assert.equal(row(id).visibility,"public");
  assert.ok(!listPackages(student).some(p=>p.id===id));status(()=>startAssessment(student,{packageId:id}),404);
  transitionPackage(admin,id,"publish");
  assert.ok(listPackages(student).some(p=>p.id===id));
  const attempt=startAssessment(student,{packageId:id});
  setPackageVisibility(admin,change(id,"private"));
  assert.ok(!listPackages(outsider).some(p=>p.id===id));status(()=>startAssessment(outsider,{packageId:id}),404);
  const current=loadAssessment(attempt,student.id);assert.equal(current.status,"active");
  const q=JSON.parse(current.snapshot_json).questions[0];mutateAssessment(attempt,student.id,{action:"answer",questionId:q.id,choice:0});
  assert.equal(publicAssessment(mutateAssessment(attempt,student.id,{action:"advance",sectionIndex:0})).result?.correct,1);
  assert.equal(row(id).snapshot_json,before.snapshot_json);assert.equal(row(id).owner_id,before.owner_id);assert.equal(auditCount(id),2);
});
test("instructors and students cannot change access, even for their own package",()=>{
  const id=pack([publish(teacher)],teacher),before=row(id);
  for(const user of [teacher,student])status(()=>setPackageVisibility(user,change(id,"public")),403);
  assert.deepEqual(row(id),before);assert.equal(auditCount(id),0);
});
test("public access rejects a mixed package containing even one private source",()=>{
  const id=pack([publish(),publish(teacher)]),before=row(id);
  status(()=>setPackageVisibility(admin,change(id,"public")),409);
  assert.deepEqual(row(id),before);assert.equal(auditCount(id),0);
});
test("stale visibility/state is rejected and an unchanged request is a no-op",()=>{
  const id=pack(),old=change(id,"public");transitionPackage(admin,id,"publish");
  status(()=>setPackageVisibility(admin,old),409);
  const fresh=change(id,"public");setPackageVisibility(admin,fresh);
  status(()=>setPackageVisibility(admin,fresh),409);
  setPackageVisibility(admin,change(id,"public"));assert.equal(auditCount(id),1);
});
test("validation uses exact snapshot revisions rather than a newer published revision",()=>{
  const old=publish(),source=listBank(admin).find(q=>q.id===old)!,id=pack([old]);
  publish(admin,{questionId:source.questionId,expectedRevision:source.revision,prompt:"A newer version?"});
  transitionQuestions(admin,[old],"retire","");
  status(()=>setPackageVisibility(admin,change(id,"public")),409);assert.equal(row(id).visibility,"private");
});
test("public draft publication rechecks source privacy and state",()=>{
  const q=publish(),source=listBank(admin).find(item=>item.id===q)!,id=pack([q]);setPackageVisibility(admin,change(id,"public"));
  db().prepare("UPDATE bank_questions SET visibility='private' WHERE id=?").run(source.questionId);
  status(()=>transitionPackage(admin,id,"publish"),409);assert.equal(row(id).state,"draft");
  db().prepare("UPDATE bank_questions SET visibility='public' WHERE id=?").run(source.questionId);
  transitionQuestions(admin,[q],"retire","");status(()=>transitionPackage(admin,id,"publish"),409);assert.equal(row(id).state,"draft");
});
test("archived/missing packages and invalid payloads cannot be changed",()=>{
  const id=pack();transitionPackage(admin,id,"publish");transitionPackage(admin,id,"archive");
  status(()=>setPackageVisibility(admin,{id,visibility:"public",expectedState:"published",expectedVisibility:"private"}),409);
  status(()=>setPackageVisibility(admin,{id:"missing",visibility:"public",expectedState:"draft",expectedVisibility:"private"}),404);
  const fresh=pack();
  for(const invalid of [{visibility:"unlisted"},{visibility:true},{expectedVisibility:null},{expectedState:"archived"},{id:null}])status(()=>setPackageVisibility(admin,change(fresh,"public",invalid)),400);
});
test("visibility write and audit are atomic",()=>{
  const id=pack(),before=row(id);
  db().exec("CREATE TRIGGER fail_access_audit BEFORE INSERT ON audit_log WHEN NEW.action='package.visibility.public' BEGIN SELECT RAISE(ABORT,'fixture audit failure'); END");
  try {assert.throws(()=>setPackageVisibility(admin,change(id,"public")),/fixture audit failure/);assert.deepEqual(row(id),before);assert.equal(auditCount(id),0);}
  finally {db().exec("DROP TRIGGER fail_access_audit");}
});
test("v2 installer skips an existing public package without changing it, but rejects content conflicts and ambiguous titles",()=>{
  const tq=publish(admin,{examId:"toefl-itp",section:"structure"}),ts=listBank(admin).find(item=>item.id===tq)!;
  const title="Installer TOEFL compatible package",pid=createPackage(admin,{examId:"toefl-itp",title,revisionIds:[tq],durations:{structure:0},visibility:"private"});
  transitionPackage(admin,pid,"publish");setPackageVisibility(admin,change(pid,"public"));
  const manifest={format:"learn-toefl.package-plan",schemaVersion:1,heldQuestionIds:{},packages:[{planId:"P01",mode:"practice",title,count:1,durationsSeconds:{structure:0},orderedItems:[{questionId:ts.questionId,revisionId:tq,revision:ts.revision,section:"structure"}]}]};
  const filename=join(directory,"plan.json");writeFileSync(filename,JSON.stringify(manifest));
  const run=()=>spawnSync(process.execPath,["--conditions=react-server","--import=tsx","scripts/apply-package-plan-v2.mjs",admin.username,filename,"--apply"],{encoding:"utf8",env:{...process.env,DATA_DIR:directory}});
  const before=row(pid),count=()=>Number(db().prepare("SELECT COUNT(*) AS n FROM assessment_packages").get()!.n),initial=count();
  const result=run();assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/SKIP P01/);assert.equal(count(),initial);assert.deepEqual(row(pid),before);
  manifest.packages[0].durationsSeconds={structure:1};writeFileSync(filename,JSON.stringify(manifest));assert.notEqual(run().status,0);assert.equal(count(),initial);
  manifest.packages[0].durationsSeconds={structure:0};writeFileSync(filename,JSON.stringify(manifest));
  createPackage(admin,{examId:"toefl-itp",title,revisionIds:[tq],durations:{structure:0},visibility:"private"});const ambiguousCount=count();
  assert.notEqual(run().status,0);assert.equal(count(),ambiguousCount);assert.deepEqual(row(pid),before);
});
