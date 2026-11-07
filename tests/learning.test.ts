import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { register,type User } from "../src/lib/auth";
import { ensureLearningSeed,examProfiles,listBank,saveQuestion,importQuestions,transitionQuestions,createPackage,transitionPackage,saveExamProfile,listPackages } from "../src/lib/learning-bank";
import { startAssessment,loadAssessment,publicAssessment,mutateAssessment,createAssessmentTask,studentClassTasks } from "../src/lib/assessments";
import { analytics,resultsCsv,csvCell } from "../src/lib/learning-analytics";
import { createClassroom,joinClassroom } from "../src/lib/classrooms";
import { createAttempt,loadAttempt,serializeAttempt } from "../src/lib/attempts";

const directory=mkdtempSync(join(tmpdir(),"itp-learning-"));process.env.DATA_DIR=directory;
test.after(()=>{db().close();rmSync(directory,{recursive:true,force:true});});
function account(name:string,role:User["role"]="student") {const user=register(name,"test-password-12345");db().prepare("UPDATE users SET role=? WHERE id=?").run(role,user.id);return {...user,role};}
const admin=account("learning_admin","admin"),teacher=account("learning_teacher","instructor"),other=account("learning_other","instructor"),student=account("learning_student"),outsider=account("learning_outsider");
const question={examId:"casn-tiu",section:"numerik",kind:"text",skill:"rasio",stimulus:"Sebuah kelas mempunyai 20 peserta.",prompt:"Seperempat peserta hadir. Berapa peserta yang hadir?",options:["5","10","15","20","25"],answer:0,explanation:"Seperempat dari 20 adalah 20/4 = 5."};
function publish(user:User,input:Record<string,unknown>={}){const id=saveQuestion(user,{...question,...input});transitionQuestions(user,[id],"review","");transitionQuestions(admin,[id],"publish","Kunci, pengecoh, dan pembahasan telah diperiksa.");return id;}
function pack(user:User,ids:string[],extra:Record<string,unknown>={}){const id=createPackage(user,{examId:"casn-tiu",title:"Latihan numerik",revisionIds:ids,durations:{numerik:0},visibility:user.role==="admin"?"public":"private",...extra});transitionPackage(user,id,"publish");return id;}

test("seed is idempotent, starts with draft content, preserves old attempts",()=>{
  const legacy=createAttempt(student.id,"practice","structure");ensureLearningSeed();ensureLearningSeed();
  assert.equal(examProfiles().length,5);assert.equal(listBank(admin).length,140);assert.ok(listBank(admin).every(q=>q.state==="draft"));
  assert.equal(serializeAttempt(loadAttempt(legacy,student.id)!).questions.length,10);
});
test("bank validation and workflow enforce permissions and reviewer note",()=>{
  assert.throws(()=>saveQuestion(student,question));assert.throws(()=>listBank(student));
  assert.throws(()=>saveQuestion(admin,{...question,options:["same","same"]}));
  assert.throws(()=>saveQuestion(admin,{...question,answer:5}));
  assert.throws(()=>saveQuestion(admin,{...question,scores:[1,1,0,0,0]}));
  const id=saveQuestion(teacher,question);
  assert.ok(!listBank(other).some(q=>q.id===id));
  assert.throws(()=>transitionQuestions(other,[id],"review",""));
  assert.throws(()=>transitionQuestions(admin,[id],"publish","Reviewed"));
  transitionQuestions(teacher,[id],"review","");assert.throws(()=>transitionQuestions(teacher,[id],"publish","Reviewed thoroughly"));
  assert.throws(()=>transitionQuestions(admin,[id],"publish",""));
  transitionQuestions(admin,[id],"publish","The answer and explanation have been checked.");
  assert.equal(listBank(teacher,"published").find(q=>q.id===id)?.state,"published");
});
test("JSON import is atomic, bounded, and always draft",()=>{
  const before=listBank(admin).length;
  assert.throws(()=>importQuestions(admin,[question,{...question,answer:99}]));assert.equal(listBank(admin).length,before);
  const ids=importQuestions(admin,[question,{...question,prompt:"Berapa 20 dibagi 4?"}]);assert.equal(ids.length,2);
  assert.ok(ids.every(id=>listBank(admin).find(q=>q.id===id)?.state==="draft"));
  assert.throws(()=>importQuestions(admin,Array(51).fill(question)));
});
test("new revisions preserve published source and detect stale edits",()=>{
  const id=publish(admin),source=listBank(admin).find(q=>q.id===id)!;
  const revised=saveQuestion(admin,{...question,questionId:source.questionId,expectedRevision:1,prompt:"Versi baru",answer:1});
  assert.equal(listBank(admin).find(q=>q.id===revised)?.revision,2);
  assert.equal(listBank(admin,"published").find(q=>q.questionId===source.questionId)?.id,id);
  assert.throws(()=>saveQuestion(admin,{...question,questionId:source.questionId,expectedRevision:1}));
  assert.throws(()=>saveQuestion(other,{...question,questionId:source.questionId,expectedRevision:2}));
});
test("admins can delete standalone drafts and remove draft revisions without reusing their numbers", () => {
  const standaloneId = saveQuestion(teacher, question);
  const standalone = listBank(admin).find(q => q.id === standaloneId)!;
  assert.throws(() => transitionQuestions(teacher, [standaloneId], "deleteDraft", ""), { status: 403 });
  transitionQuestions(admin, [standaloneId], "deleteDraft", "");
  assert.equal(db().prepare("SELECT id FROM bank_questions WHERE id=?").get(standalone.questionId), undefined);
  assert.equal(db().prepare("SELECT id FROM question_revisions WHERE id=?").get(standaloneId), undefined);
  assert.ok(db().prepare("SELECT id FROM audit_log WHERE action='question.draft.deleted' AND target_id=?").get(standaloneId));

  const publishedId = publish(admin);
  const original = listBank(admin).find(q => q.id === publishedId)!;
  const draftId = saveQuestion(admin, { ...question, questionId: original.questionId, expectedRevision: 1 });
  transitionQuestions(admin, [draftId], "deleteDraft", "");
  assert.equal(listBank(admin).find(q => q.questionId === original.questionId)?.id, publishedId);
  const replacement = saveQuestion(admin, { ...question, questionId: original.questionId, expectedRevision: 1 });
  assert.equal(listBank(admin).find(q => q.id === replacement)?.revision, 3);
  assert.throws(() => saveQuestion(admin, { ...question, questionId: original.questionId, expectedRevision: 2 }), { status: 409 });
});

test("bulk draft deletion rolls back for a changed state or a reference from a package or attempt", () => {
  const draftId = saveQuestion(admin, question);
  const referencedId = publish(admin);
  const packageId = pack(admin, [referencedId]);
  const attemptId = startAssessment(student, { packageId });
  const ids = [draftId, referencedId];
  assert.throws(() => transitionQuestions(admin, ids, "deleteDraft", ""), { status: 409, message: /berstatus Draf/ });

  // Imported databases may include a draft referenced by a historical snapshot.
  const snapshot = db().prepare("SELECT snapshot_json FROM assessment_packages WHERE id=?").get(packageId)!.snapshot_json;
  const changeSnapshot = db().prepare("UPDATE assessment_packages SET snapshot_json=? WHERE id=?");
  const changeState = db().prepare("UPDATE question_revisions SET state=? WHERE id=?");
  try {
    changeState.run("draft", referencedId);
    const conflict = { status: 409, message: /dirujuk paket atau sesi ujian/ };
    assert.throws(() => transitionQuestions(admin, ids, "deleteDraft", ""), conflict);
    changeSnapshot.run('{"questions":[]}', packageId);
    assert.throws(() => transitionQuestions(admin, ids, "deleteDraft", ""), conflict);
  } finally {
    changeState.run("published", referencedId);
    changeSnapshot.run(snapshot, packageId);
  }
  assert.ok(listBank(admin).some(q => q.id === draftId));
  assert.ok(listBank(admin).some(q => q.id === referencedId));
  assert.ok(db().prepare("SELECT id FROM assessment_attempts WHERE id=?").get(attemptId));
});

test("packages require reviewed accessible revisions and cannot publish private material publicly",()=>{
  const draft=saveQuestion(admin,question);assert.throws(()=>createPackage(admin,{examId:"casn-tiu",title:"Draft selection",revisionIds:[draft]}));
  const privateId=publish(teacher);
  assert.throws(()=>createPackage(other,{examId:"casn-tiu",title:"Foreign private",revisionIds:[privateId]}));
  assert.throws(()=>createPackage(admin,{examId:"casn-tiu",title:"Private leak",revisionIds:[privateId],visibility:"public"}));
  assert.throws(()=>createPackage(admin,{examId:"casn-tiu",title:"Duplicate",revisionIds:[privateId,privateId]}));
  const id=pack(teacher,[privateId]);assert.equal(listPackages(teacher).find(p=>p.id===id)?.visibility,"private");
  assert.throws(()=>startAssessment(student,{packageId:id}));assert.throws(()=>transitionPackage(other,id,"archive"));
});
test("frozen package and attempt keep original key after revision, profile change, and archive",()=>{
  const id=publish(admin),source=listBank(admin).find(q=>q.id===id)!;
  const packageId=pack(admin,[id]),attemptId=startAssessment(student,{packageId}),row=loadAssessment(attemptId,student.id);
  const safe=publicAssessment(row);assert.equal(safe.questions.length,1);assert.ok(!("answer" in safe.questions[0])&&!("scores" in safe.questions[0])&&!("explanation" in safe.questions[0]));
  const revision=saveQuestion(admin,{...question,questionId:source.questionId,expectedRevision:1,answer:1});transitionQuestions(admin,[revision],"review","");transitionQuestions(admin,[revision],"publish","Review new version deliberately changed the key.");
  const profile=examProfiles().find(p=>p.id==="casn-tiu")!;saveExamProfile(admin,{...profile,title:"Profil baru",sections:profile.sections.map(s=>({...s,title:"Updated "+s.title}))});
  transitionPackage(admin,packageId,"archive");assert.throws(()=>startAssessment(student,{packageId}));
  mutateAssessment(attemptId,student.id,{action:"answer",questionId:id,choice:0});
  const finished=publicAssessment(mutateAssessment(attemptId,student.id,{action:"advance",sectionIndex:0}));assert.equal(finished.result?.correct,1);assert.equal(finished.result?.details[0].answer,0);assert.notEqual(finished.examTitle,"Profil baru");
  const retry=publicAssessment(mutateAssessment(attemptId,student.id,{action:"advance",sectionIndex:0}));assert.equal(retry.result?.total,1);
});
test("five choices and weighted raw points work without official score conversion",()=>{
  const id=publish(admin,{scores:[5,3,2,1,0]}),packageId=pack(admin,[id]),attempt=startAssessment(student,{packageId});
  mutateAssessment(attempt,student.id,{action:"answer",questionId:id,choice:4});
  const result=publicAssessment(mutateAssessment(attempt,student.id,{action:"advance",sectionIndex:0})).result!;
  assert.equal(result.points,0);assert.equal(result.maxPoints,5);assert.equal(result.correct,0);
});
test("timers survive refresh, lock previous sections, and auto-finish at server deadline",()=>{
  const first=publish(admin),second=publish(admin,{section:"verbal",prompt:"Pilih sinonim.",options:["A","B"],answer:0});
  const packageId=pack(admin,[first,second],{durations:{numerik:1,verbal:1}}),id=startAssessment(student,{packageId}),row=loadAssessment(id,student.id);
  const next=loadAssessment(id,student.id,row.started_at+1100);assert.equal(next.section_index,1);
  assert.equal(publicAssessment(next).questions[0].id,second);
  assert.throws(()=>mutateAssessment(id,student.id,{action:"answer",questionId:first,choice:0},row.started_at+1200));
  const ended=publicAssessment(loadAssessment(id,student.id,row.started_at+2100));assert.equal(ended.status,"finished");assert.equal(ended.result?.total,2);assert.equal(ended.result?.correct,0);
});
test("stale advance requests and late answers cannot advance or change a newer section",()=>{
  const first=publish(admin),second=publish(admin,{section:"verbal"}),third=publish(admin,{section:"figural"});
  const packageId=pack(admin,[first,second,third],{durations:{numerik:1,verbal:1,figural:1}});
  const id=startAssessment(student,{packageId}),start=loadAssessment(id,student.id).started_at;
  const advance=(sectionIndex:number, at:number)=>mutateAssessment(id,student.id,{action:"advance",sectionIndex},at);
  assert.equal(advance(0,start+1100).section_index,1);
  assert.equal(advance(0,start+1200).section_index,1);
  assert.equal(advance(1,start+1300).section_index,2);
  assert.equal(advance(1,start+1350).section_index,2);
  assert.throws(()=>mutateAssessment(id,student.id,{action:"answer",questionId:third,choice:0},start+2500),{status:409});
  const finished=publicAssessment(loadAssessment(id,student.id,start+2500));
  assert.equal(finished.status,"finished");
  assert.equal(finished.result?.details[2].selected,null);
  assert.equal(finished.finishedAt,start+2300);
});
test("audio questions require a script when saved or when a legacy draft is published",()=>{
  assert.throws(()=>saveQuestion(admin,{...question,kind:"audio",stimulus:" "}),{status:400});
  assert.throws(()=>saveQuestion(admin,{...question,kind:"audio",stimulus:"Speaker:"}),{status:400});
  const id=saveQuestion(admin,{...question,kind:"audio",stimulus:"Speaker: Listen to this example."});
  const row=listBank(admin).find(q=>q.id===id)!;
  db().prepare("UPDATE question_revisions SET content_json=? WHERE id=?").run(JSON.stringify({...row.content,stimulus:""}),id);
  transitionQuestions(admin,[id],"review","");
  assert.throws(()=>transitionQuestions(admin,[id],"publish","Naskah wajib diperiksa sebelum terbit."),{status:409});
  assert.equal(listBank(admin).find(q=>q.id===id)?.state,"review");
});
test("tasks enforce class ownership, enrollment, deadline, and one attempt",()=>{
  const q=publish(teacher),packageId=pack(teacher,[q]),classroomId=createClassroom(teacher,"Learning class");
  const code=(db().prepare("SELECT join_code FROM classrooms WHERE id=?").get(classroomId) as {join_code:string}).join_code;joinClassroom(student,code);
  assert.throws(()=>createAssessmentTask(other,{classroomId,packageId,title:"Foreign task"}));
  assert.throws(()=>createAssessmentTask(teacher,{classroomId,packageId,title:"Expired",dueAt:"2000-01-01T00:00:00Z"}));
  const task=createAssessmentTask(teacher,{classroomId,packageId,title:"Task one"});assert.throws(()=>startAssessment(outsider,{taskId:task}));
  const attempt=startAssessment(student,{taskId:task});assert.equal(startAssessment(student,{taskId:task}),attempt);
  assert.throws(()=>loadAssessment(attempt,outsider.id));assert.throws(()=>mutateAssessment(attempt,outsider.id,{action:"advance",sectionIndex:0}));
  db().prepare("UPDATE assessment_tasks SET due_at=1 WHERE id=?").run(task);assert.equal(startAssessment(student,{taskId:task}),attempt);
  const late=createAssessmentTask(teacher,{classroomId,packageId,title:"Task two"});db().prepare("UPDATE assessment_tasks SET due_at=1 WHERE id=?").run(late);assert.throws(()=>startAssessment(student,{taskId:late}));
  assert.ok(studentClassTasks(student.id).some(t=>t.attempt_id===attempt));
  mutateAssessment(attempt,student.id,{action:"answer",questionId:q,choice:0});mutateAssessment(attempt,student.id,{action:"advance",sectionIndex:0});
  assert.equal(analytics(teacher).attempts.length,1);assert.equal(analytics(other).attempts.length,0);
  assert.ok(analytics(admin).attempts.length>analytics(teacher).attempts.length);
});
test("descriptive analytics count omissions and separate revisions; observed timing is bounded",()=>{
  const first=publish(admin),second=publish(admin,{prompt:"Soal kosong",options:["1","2"],answer:1}),packageId=pack(admin,[first,second]);
  const id=startAssessment(student,{packageId}),initial=loadAssessment(id,student.id),t=initial.started_at;
  mutateAssessment(id,student.id,{action:"view",questionId:first,visible:true},t);
  mutateAssessment(id,student.id,{action:"view",questionId:first,visible:true},t+60000);
  mutateAssessment(id,student.id,{action:"view",questionId:first,visible:false},t+65000);
  mutateAssessment(id,student.id,{action:"answer",questionId:first,choice:0},t+70000);
  mutateAssessment(id,student.id,{action:"advance",sectionIndex:0},t+80000);
  const report=analytics(admin,{packageId}),one=report.items.find(i=>i.revisionId===first)!,two=report.items.find(i=>i.revisionId===second)!;
  assert.equal(one.meanObservedMs,20000);assert.equal(one.choices[0],1);assert.equal(one.correctRate,1);
  assert.equal(two.unanswered,1);assert.equal(two.correctRate,0);assert.equal(two.meanObservedMs,null);
  assert.equal(report.participants,1);assert.throws(()=>analytics(student));assert.throws(()=>resultsCsv(student));
});
test("retired questions prevent new starts but do not destroy active sessions",()=>{
  const q=publish(admin),packageId=pack(admin,[q]),id=startAssessment(student,{packageId});transitionQuestions(admin,[q],"retire","");
  assert.throws(()=>startAssessment(outsider,{packageId}));assert.equal(loadAssessment(id,student.id).status,"active");
});
test("seeded TOEFL options are shuffled in new package sessions with canonical analytics",()=>{
  const seeded=listBank(admin).filter(q=>q.questionId.startsWith("legacy-R-1-")).slice(0,4);
  assert.equal(seeded.length,4);
  transitionQuestions(admin,seeded.map(q=>q.id),"review","");
  transitionQuestions(admin,seeded.map(q=>q.id),"publish","Original reading options have been reviewed.");
  const packageId=createPackage(admin,{examId:"toefl-itp",title:"Seed option order",revisionIds:seeded.map(q=>q.id),durations:{reading:0},visibility:"public"});
  transitionPackage(admin,packageId,"publish");
  const id=startAssessment(student,{packageId});
  db().prepare("UPDATE assessment_attempts SET option_seed=? WHERE id=?").run("package-order-regression",id);
  const shown=publicAssessment(loadAssessment(id,student.id));
  assert.notDeepEqual(shown.questions.map(q=>q.options),seeded.map(q=>q.content.options));
  for(const item of shown.questions) {
    const source=seeded.find(q=>q.id===item.id)!.content;
    const choice=item.options.indexOf(source.options[source.answer]);
    mutateAssessment(id,student.id,{action:"answer",questionId:item.id,choice});
  }
  const finished=publicAssessment(mutateAssessment(id,student.id,{action:"advance",sectionIndex:0}));
  assert.equal(finished.result?.correct,4);
  assert.ok(finished.result?.details.every(q=>q.selected===q.answer));
  const report=analytics(admin,{packageId});
  for(const source of seeded)assert.equal(report.items.find(q=>q.revisionId===source.id)?.choices[source.content.answer],1);

  const old=startAssessment(outsider,{packageId});
  db().prepare("UPDATE assessment_attempts SET option_seed=NULL WHERE id=?").run(old);
  assert.deepEqual(publicAssessment(loadAssessment(old,outsider.id)).questions.map(q=>q.options),seeded.map(q=>q.content.options));
});
test("reports settle expired timed attempts without requiring the participant to return",()=>{
  const q=publish(admin),packageId=pack(admin,[q],{durations:{numerik:1}}),id=startAssessment(student,{packageId});
  db().prepare("UPDATE assessment_attempts SET deadline=? WHERE id=?").run(Date.now()-1000,id);
  const report=analytics(admin,{packageId});assert.equal(report.attempts.length,1);assert.equal(report.items[0].unanswered,1);
});
test("CSV escapes formulas, quotes, and line breaks",()=>{
  assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');assert.equal(csvCell("line\nbreak"),'"line\nbreak"');
  const output=resultsCsv(teacher);assert.ok(output.startsWith("\uFEFF"));assert.ok(output.includes("learning_student"));assert.ok(!output.includes("learning_outsider"));
});
