// End-to-end HTTP check against a fresh, temporary local database only.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

const directory=mkdtempSync(join(tmpdir(),'itp-http-smoke-'));
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));
const port=probe.address().port;await new Promise(r=>probe.close(r));
const base=`http://127.0.0.1:${port}`,env={...process.env,DATA_DIR:directory,NEXT_TELEMETRY_DISABLED:'1',APP_ORIGIN:base,AUTH_CLIENT_IP_HEADER:'x-test-client-ip',BANK_IMPORT_DAILY_QUESTIONS:'500',BANK_MAX_OWNED_QUESTIONS:'5000'};
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env,stdio:['ignore','pipe','pipe']});
let logs='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{logs=(logs+String(chunk)).slice(-12000);});
let connection;
async function post(path,body,cookie='',clientIp='192.0.2.10') {
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',origin:base,'x-test-client-ip':clientIp,...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  return {status:response.status,data:await response.json(),cookie:response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ')};
}
async function account(username) {
  const result=await post('/api/auth',{action:'register',username,password:'local-smoke-password-123',role:'admin'});
  assert.equal(result.status,201);assert.equal(result.data.user.role,'student');return result;
}
try {
  let ready=false;
  for(let i=0;i<80;i++){try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}await delay(250);}
  assert.ok(ready,'Production server did not become ready');
  assert.equal((await fetch(base+'/admin',{redirect:'manual'})).status,307);
  const admin=await account('smoke_admin'),teacher=await account('smoke_teacher'),student=await account('smoke_student'),outsider=await account('smoke_outsider');
  const operator=spawnSync(process.execPath,['--conditions=react-server','--import=tsx','scripts/grant-role.mjs','smoke_admin','admin'],{env,encoding:'utf8'});
  assert.equal(operator.status,0,operator.stderr);
  assert.equal((await post('/api/platform',{action:'createClass',name:'Denied class'},student.cookie)).status,403);
  assert.equal((await post('/api/platform',{action:'requestInstructor',organization:'Pilot School'},teacher.cookie)).status,200);
  assert.equal((await post('/api/platform',{action:'reviewInstructor',userId:teacher.data.user.id,approve:true},student.cookie)).status,403);
  assert.equal((await post('/api/platform',{action:'reviewInstructor',userId:teacher.data.user.id,approve:true},admin.cookie)).status,200);
  const classroom=await post('/api/platform',{action:'createClass',name:'HTTP Pilot'},teacher.cookie);assert.equal(classroom.status,200);
  connection=new DatabaseSync(join(directory,'app.sqlite'));
  const code=connection.prepare('SELECT join_code FROM classrooms WHERE id=?').get(classroom.data.id).join_code;
  assert.equal((await post('/api/platform',{action:'joinClass',code},student.cookie)).status,200);
  const assignment=await post('/api/platform',{action:'createAssignment',classroomId:classroom.data.id,title:'HTTP Structure',section:'structure'},teacher.cookie);assert.equal(assignment.status,200);
  assert.equal((await post('/api/attempts',{assignmentId:assignment.data.id},outsider.cookie)).status,404);
  const attempt=await post('/api/attempts',{assignmentId:assignment.data.id},student.cookie);assert.equal(attempt.status,201);
  assert.equal((await fetch(base+`/api/attempts/${attempt.data.id}`,{headers:{cookie:outsider.cookie}})).status,404);
  const questions=await (await fetch(base+`/api/attempts/${attempt.data.id}`,{headers:{cookie:student.cookie}})).json();
  assert.ok(questions.questions.every(q=>!('answer' in q)&&!('explanation' in q)));
  for(const q of questions.questions){const r=await fetch(base+`/api/attempts/${attempt.data.id}`,{method:'PATCH',headers:{cookie:student.cookie,origin:base,'Content-Type':'application/json'},body:JSON.stringify({questionId:q.id,choice:0})});assert.equal(r.status,200);}
  assert.equal((await post(`/api/attempts/${attempt.data.id}`,{sectionIndex:0},student.cookie)).data.status,'finished');
  const experiment=await post('/api/platform',{action:'createExperiment',name:'HTTP experiment',hypothesis:'Benefit wording increases completion',control:'Practice today',treatment:'Learn your mistakes',baseline:.2,mde:.1,minDays:7},admin.cookie);assert.equal(experiment.status,200);
  assert.equal((await post('/api/platform',{action:'transitionExperiment',id:experiment.data.id,transition:'start'},admin.cookie)).status,200);
  const html=await (await fetch(base+'/dashboard',{headers:{cookie:student.cookie}})).text();assert.ok(html.includes('Halo,')&&html.includes('smoke_student'));
  assert.equal((await post('/api/platform',{action:'exposure',id:experiment.data.id},student.cookie)).status,200);
  assert.equal((await fetch(base+`/api/admin/experiments/${experiment.data.id}/export`,{headers:{cookie:student.cookie}})).status,403);
  const csv=await fetch(base+`/api/admin/experiments/${experiment.data.id}/export`,{headers:{cookie:admin.cookie}});assert.equal(csv.status,200);assert.ok((await csv.text()).startsWith('variant,assigned'));
  for(const [path,cookie,content] of [['/admin',admin.cookie,'Pantau produk'],['/admin/experiments',admin.cookie,'HTTP experiment'],['/instructor',teacher.cookie,'HTTP Pilot']]){
    const response=await fetch(base+path,{headers:{cookie}});assert.equal(response.status,200);assert.ok((await response.text()).includes(content));
  }
  const authored={action:'saveQuestion',examId:'casn-tiu',section:'numerik',kind:'text',skill:'penjumlahan',stimulus:'',prompt:'Berapa 2 + 3?',options:['1','2','3','4','5'],answer:4,explanation:'Dua ditambah tiga sama dengan lima.'};
  assert.equal((await post('/api/learning',authored,student.cookie)).status,403);
  const bankItem=await post('/api/learning',authored,admin.cookie);assert.equal(bankItem.status,200);
  assert.equal((await post('/api/learning',{action:'transitionQuestions',ids:[bankItem.data.id],transition:'review'},admin.cookie)).status,200);
  assert.equal((await post('/api/learning',{action:'transitionQuestions',ids:[bankItem.data.id],transition:'publish',note:'Kunci, pilihan, dan pembahasan sudah diperiksa.'},teacher.cookie)).status,403);
  assert.equal((await post('/api/learning',{action:'transitionQuestions',ids:[bankItem.data.id],transition:'publish',note:'Kunci, pilihan, dan pembahasan sudah diperiksa.'},admin.cookie)).status,200);
  const pack=await post('/api/learning',{action:'createPackage',examId:'casn-tiu',title:'Paket numerik kelas',revisionIds:[bankItem.data.id],durations:{numerik:0}},teacher.cookie);assert.equal(pack.status,200);
  assert.equal((await post('/api/learning',{action:'transitionPackage',id:pack.data.id,transition:'publish'},teacher.cookie)).status,200);
  const task=await post('/api/learning',{action:'createAssessmentTask',classroomId:classroom.data.id,packageId:pack.data.id,title:'Tugas numerik'},teacher.cookie);assert.equal(task.status,200);
  assert.equal((await post('/api/assessments',{packageId:pack.data.id},outsider.cookie)).status,404);
  assert.equal((await post('/api/assessments',{taskId:task.data.id},outsider.cookie)).status,404);
  const session=await post('/api/assessments',{taskId:task.data.id},student.cookie);assert.equal(session.status,201);
  const current=await (await fetch(base+`/api/assessments/${session.data.id}`,{headers:{cookie:student.cookie}})).json();assert.ok(!('answer' in current.questions[0])&&!('scores' in current.questions[0])&&!('explanation' in current.questions[0]));
  assert.equal((await fetch(base+`/api/assessments/${session.data.id}`,{headers:{cookie:outsider.cookie}})).status,404);
  assert.equal((await post(`/api/assessments/${session.data.id}`,{action:'view',questionId:bankItem.data.id,visible:true},student.cookie)).status,200);
  assert.equal((await post(`/api/assessments/${session.data.id}`,{action:'answer',questionId:bankItem.data.id,choice:4},student.cookie)).status,200);
  const completed=await post(`/api/assessments/${session.data.id}`,{action:'advance',sectionIndex:0},student.cookie);assert.equal(completed.data.result.correct,1);
  const publicPack=await post('/api/learning',{action:'createPackage',examId:'casn-tiu',title:'Paket numerik publik',revisionIds:[bankItem.data.id],durations:{numerik:0},visibility:'public'},admin.cookie);assert.equal(publicPack.status,200);
  assert.equal((await post('/api/learning',{action:'transitionPackage',id:publicPack.data.id,transition:'publish'},admin.cookie)).status,200);
  const personal=await post('/api/assessments',{packageId:publicPack.data.id},outsider.cookie);assert.equal(personal.status,201);await post(`/api/assessments/${personal.data.id}`,{action:'advance',sectionIndex:0},outsider.cookie);
  // Existing package access: role gates, catalog visibility, stale state, and running sessions.
  const accessPayload={action:'setPackageVisibility',id:publicPack.data.id,visibility:'private',expectedVisibility:'public',expectedState:'published'};
  assert.equal((await post('/api/learning',accessPayload)).status,401);
  assert.equal((await post('/api/learning',accessPayload,student.cookie)).status,403);
  assert.equal((await post('/api/learning',{...accessPayload,id:pack.data.id,visibility:'public',expectedVisibility:'private'},teacher.cookie)).status,403);
  assert.equal((await fetch(base+'/api/learning',{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:JSON.stringify(accessPayload)})).status,403);
  const activePublic=await post('/api/assessments',{packageId:publicPack.data.id},student.cookie);assert.equal(activePublic.status,201);
  assert.equal((await post('/api/learning',accessPayload,admin.cookie)).status,200);
  assert.equal((await post('/api/learning',accessPayload,admin.cookie)).status,409);
  assert.equal((await post('/api/assessments',{packageId:publicPack.data.id},outsider.cookie)).status,404);
  assert.equal((await fetch(base+`/api/assessments/${activePublic.data.id}`,{headers:{cookie:student.cookie}})).status,200);
  const catalogCards=async()=>[...(await (await fetch(base+'/catalog',{headers:{cookie:student.cookie}})).text()).matchAll(/<article class="workspace-card course-card"[\s\S]*?<\/article>/g)].map(m=>m[0]).join('');
  assert.ok(!(await catalogCards()).includes('Paket numerik publik'));
  assert.equal((await post('/api/learning',{...accessPayload,visibility:'public',expectedVisibility:'private'},admin.cookie)).status,200);
  assert.ok((await catalogCards()).includes('Paket numerik publik'));
  const accessDraft=await post('/api/learning',{action:'createPackage',examId:'casn-tiu',title:'Access smoke draft',revisionIds:[bankItem.data.id],durations:{numerik:0},visibility:'private'},admin.cookie);assert.equal(accessDraft.status,200);
  assert.equal((await post('/api/learning',{action:'setPackageVisibility',id:accessDraft.data.id,visibility:'public',expectedVisibility:'private',expectedState:'draft'},admin.cookie)).status,200);
  assert.equal(connection.prepare('SELECT state FROM assessment_packages WHERE id=?').get(accessDraft.data.id).state,'draft');assert.ok(!(await catalogCards()).includes('Access smoke draft'));
  assert.equal((await post('/api/learning',{action:'transitionPackage',id:accessDraft.data.id,transition:'publish'},admin.cookie)).status,200);assert.ok((await catalogCards()).includes('Access smoke draft'));
  const adminPackageHtml=await (await fetch(base+'/manage/packages',{headers:{cookie:admin.cookie}})).text(),teacherPackageHtml=await (await fetch(base+'/manage/packages',{headers:{cookie:teacher.cookie}})).text();
  assert.ok(adminPackageHtml.includes('Jadikan publik')||adminPackageHtml.includes('Jadikan privat'));assert.ok(!teacherPackageHtml.includes('Jadikan publik')&&!teacherPackageHtml.includes('Jadikan privat'));
  assert.equal((await fetch(base+'/api/learning/export',{headers:{cookie:student.cookie}})).status,403);
  const report=await fetch(base+'/api/learning/export',{headers:{cookie:teacher.cookie}});assert.equal(report.status,200);const reportText=await report.text();assert.ok(reportText.includes('smoke_student'));assert.ok(!reportText.includes('smoke_outsider'));
  for(const [path,cookie,content] of [['/manage/questions',admin.cookie,'Bank soal'],['/admin/exams',admin.cookie,'Atur format latihan.'],['/manage/packages',teacher.cookie,'Paket numerik kelas'],['/manage/analytics',teacher.cookie,'Berapa 2'],['/catalog',student.cookie,'Tugas numerik'],[`/assessment/${session.data.id}`,student.cookie,'Memuat sesi']]){
    const response=await fetch(base+path,{headers:{cookie}});assert.equal(response.status,200);const text=await response.text();assert.ok(text.length>500,`Empty page: ${path}`);assert.ok(text.includes(content),`Missing content: ${path}`);
    if(path==='/manage/questions'){
      const rows=[...text.matchAll(/<article class="bank-question-row[^\"]*"[^>]*>[\s\S]*?<\/article>/g)].map(m=>m[0]);
      assert.ok(rows.length>0,'Default draft view must show seeded drafts');
      for(const row of rows){assert.match(row,/>Draf<\/span>/);assert.ok(!row.includes('>Terbit</span>'));assert.ok(!row.includes('Berapa 2 + 2?'),'Published fixture must not appear in the draft list');}
      assert.ok(text.includes('aria-pressed="true" aria-controls="bank-status-results"'),'Active status control must identify its results');
    }
  }
  assert.equal((await fetch(base+'/manage/questions',{headers:{cookie:student.cookie},redirect:'manual'})).status,307);
  // Import security: real HTTP requests against this temporary production server.
  const {action:ignoredAction,...importItem}=authored;
  const importBody={action:'importQuestions',items:[importItem]};
  const rawLearning=(headers,body)=>fetch(base+'/api/learning',{method:'POST',headers:{cookie:teacher.cookie,...headers},body});
  assert.equal((await rawLearning({'Content-Type':'application/json'},JSON.stringify(importBody))).status,403);
  assert.equal((await rawLearning({'Content-Type':'application/json',origin:'https://foreign.invalid'},JSON.stringify(importBody))).status,403);
  assert.equal((await rawLearning({'Content-Type':'text/plain',origin:base},JSON.stringify(importBody))).status,415);
  assert.equal((await rawLearning({'Content-Type':'application/json',origin:base},new Uint8Array([255]))).status,400);
  assert.equal((await rawLearning({'Content-Type':'application/json',origin:base},JSON.stringify({x:'x'.repeat(513000)}))).status,413);
  let nested=0;for(let i=0;i<14;i++)nested=[nested];
  assert.equal((await rawLearning({'Content-Type':'application/json',origin:base},JSON.stringify({action:'importQuestions',items:nested}))).status,400);
  assert.equal((await post('/api/learning',importBody,student.cookie)).status,403);
  assert.equal((await post('/api/learning',{...authored,answer:false},admin.cookie)).status,400);
  const beforeImport=connection.prepare('SELECT COUNT(*) AS n FROM bank_questions WHERE owner_id=?').get(teacher.data.user.id).n;
  assert.equal((await post('/api/learning',{action:'importQuestions',items:[{...importItem,state:'published'}]},teacher.cookie)).status,400);
  assert.equal((await post('/api/learning',{action:'importQuestions',items:[{...importItem,answer:null}]},teacher.cookie)).status,400);
  assert.equal((await post('/api/learning',{action:'importQuestions',items:[importItem,{...importItem,answer:100}]},teacher.cookie)).status,400);
  assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM bank_questions WHERE owner_id=?').get(teacher.data.user.id).n,beforeImport);
  const accepted=await post('/api/learning',{action:'importQuestions',items:[{...importItem,prompt:'<img src=x onerror=alert(1)>'},{...importItem,prompt:"'); DROP TABLE users; --"}]},teacher.cookie);
  assert.equal(accepted.status,200);assert.equal(accepted.data.count,2);
  assert.equal((await post('/api/learning',{...importBody,visibility:'public'},teacher.cookie)).status,400);
  assert.equal((await post('/api/learning',importBody,teacher.cookie)).status,429);
  assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM bank_questions WHERE owner_id=?').get(teacher.data.user.id).n,beforeImport+2);
  assert.equal(connection.prepare('SELECT SUM(item_count) AS n FROM bank_import_events WHERE user_id=?').get(teacher.data.user.id).n,2);
  assert.ok(connection.prepare('SELECT COUNT(*) AS n FROM users').get().n>=4);
  assert.equal(connection.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor_id=? AND action='questions.import.rejected'").get(teacher.data.user.id).n,4);
  const escapedBank=await (await fetch(base+'/manage/questions',{headers:{cookie:teacher.cookie}})).text();
  assert.ok(escapedBank.includes('&lt;img'));assert.ok(!escapedBank.includes('<img src=x onerror='));
  // Admin-only bank audit download; this endpoint has a separate limit from import.
  const exportBody={scope:'all'},exportPath='/api/learning/bank-export';
  assert.equal((await post(exportPath,exportBody)).status,401);
  assert.equal((await post(exportPath,exportBody,student.cookie)).status,403);
  assert.equal((await post(exportPath,exportBody,teacher.cookie)).status,403);
  assert.equal((await fetch(base+exportPath,{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:JSON.stringify(exportBody)})).status,403);
  assert.equal((await post(exportPath,{scope:'filtered'},admin.cookie)).status,400);
  const exported=await fetch(base+exportPath,{method:'POST',headers:{cookie:admin.cookie,origin:base,'Content-Type':'application/json'},body:JSON.stringify(exportBody)});
  assert.equal(exported.status,200);assert.ok(exported.headers.get('content-disposition').includes('bank-soal-audit.json'));assert.ok(exported.headers.get('cache-control').includes('no-store'));assert.equal(exported.headers.get('x-content-type-options'),'nosniff');
  const document=await exported.json();assert.equal(document.format,'learn-toefl.bank-audit');assert.equal(document.scope.revisions,'latest-per-question');assert.equal(document.count,document.items.length);
  assert.equal(new Set(document.items.map(q=>q.questionId)).size,document.count);
  assert.equal(document.count,connection.prepare('SELECT COUNT(*) AS n FROM bank_questions').get().n);
  assert.equal(Number(exported.headers.get('x-question-count')),document.count);
  assert.ok(document.items.some(q=>q.prompt==='<img src=x onerror=alert(1)>'));
  for(const item of document.items)for(const field of ['ownerId','reviewedBy','username','responses','sessions'])assert.ok(!(field in item));
  assert.equal((await post(exportPath,exportBody,admin.cookie)).status,200);
  assert.equal((await post(exportPath,exportBody,admin.cookie)).status,429);
  assert.equal(connection.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor_id=? AND action='questions.export'").get(admin.data.user.id).n,2);
  assert.ok(!(await (await fetch(base+'/manage/questions',{headers:{cookie:teacher.cookie}})).text()).includes('Ekspor audit'));
  assert.ok((await (await fetch(base+'/manage/questions',{headers:{cookie:admin.cookie}})).text()).includes('Ekspor audit'));
  // Authentication budgets are independent across trusted clients.
  const login={action:'login',username:student.data.user.username,password:'local-smoke-password-123'};
  const attackerIp='192.0.2.20';
  for(let i=0;i<60;i++) {
    assert.equal((await post('/api/auth',{...login,password:'incorrect'},'',attackerIp)).status,401);
  }
  assert.equal((await post('/api/auth',login,'',attackerIp)).status,429);
  assert.equal((await post('/api/auth',login,'','192.0.2.30')).status,200);

  const getSession=async path=>(await fetch(base+path,{headers:{cookie:student.cookie}})).json();
  const answerHeaders={cookie:student.cookie,origin:base,'Content-Type':'application/json'};
  const answer=(path,questionId,choice)=>fetch(base+path,{method:'PATCH',headers:answerHeaders,body:JSON.stringify({questionId,choice})});
  function slowAnswer(path,questionId,choice){
    const encoder=new TextEncoder();
    let upload;
    const body=new ReadableStream({start(controller){upload=controller;upload.enqueue(encoder.encode('{"questionId":'));}});
    const response=fetch(base+path,{method:'PATCH',headers:answerHeaders,body,duplex:'half'});
    return {response,finish(){upload.enqueue(encoder.encode(JSON.stringify(questionId)+',"choice":'+choice+'}'));upload.close();}};
  }
  const practice=await post('/api/attempts',{mode:'practice',section:'structure'},student.cookie);
  const practicePath='/api/attempts/'+practice.data.id,practiceData=await getSession(practicePath);
  const [firstAnswer,secondAnswer]=practiceData.questions;
  const inFlight=slowAnswer(practicePath,firstAnswer.id,1);
  await delay(300);
  assert.equal((await answer(practicePath,secondAnswer.id,2)).status,200);
  inFlight.finish();
  assert.equal((await inFlight.response).status,200);
  assert.deepEqual((await getSession(practicePath)).answers,{[firstAnswer.id]:1,[secondAnswer.id]:2});

  const full=await post('/api/attempts',{mode:'full'},student.cookie);
  const fullPath='/api/attempts/'+full.data.id,fullData=await getSession(fullPath);
  assert.equal(fullData.questions.length,50);
  assert.ok(fullData.questions.every(q=>q.section==='listening'&&!('answer' in q)));
  const late=slowAnswer(fullPath,fullData.questions[0].id,0);
  await delay(300);
  connection.prepare('UPDATE attempts SET deadline=? WHERE id=?').run(Date.now()-100,full.data.id);
  const rollover=await post(fullPath,{sectionIndex:0},student.cookie);
  assert.equal(rollover.data.sectionIndex,1);
  assert.equal(rollover.data.questions.length,40);
  late.finish();
  assert.equal((await late.response).status,409);
  assert.deepEqual(JSON.parse(connection.prepare('SELECT answers FROM attempts WHERE id=?').get(full.data.id).answers),{});
  assert.equal((await post(fullPath,{sectionIndex:0},student.cookie)).data.sectionIndex,1);
  assert.equal((await post(fullPath,{sectionIndex:1},student.cookie)).data.sectionIndex,2);

  // Active assignments remain resumable after their start deadline.
  const legacyOpen=await post('/api/platform',{action:'createAssignment',classroomId:classroom.data.id,title:'Deadline legacy task',section:'reading'},teacher.cookie);
  const packageOpen=await post('/api/learning',{action:'createAssessmentTask',classroomId:classroom.data.id,packageId:pack.data.id,title:'Deadline package task'},teacher.cookie);
  const [legacyStarted,packageStarted]=await Promise.all([
    post('/api/attempts',{assignmentId:legacyOpen.data.id},student.cookie),
    post('/api/assessments',{taskId:packageOpen.data.id},student.cookie),
  ]);
  assert.equal(legacyStarted.status,201);
  assert.equal(packageStarted.status,201);
  connection.prepare('UPDATE assignments SET due_at=1 WHERE id=?').run(legacyOpen.data.id);
  connection.prepare('UPDATE assessment_tasks SET due_at=1 WHERE id=?').run(packageOpen.data.id);
  assert.equal((await post('/api/attempts',{assignmentId:legacyOpen.data.id},student.cookie)).data.id,legacyStarted.data.id);
  for(const page of ['/dashboard','/catalog']){
    const markup=(await (await fetch(base+page,{headers:{cookie:student.cookie}})).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
    assert.match(markup,/<h3>Deadline legacy task<\/h3>/);
    assert.match(markup,/<h3>Deadline package task<\/h3>/);
  }

  assert.equal((await post('/api/attempts',{assignmentId:{invalid:true}},student.cookie)).status,400);
  const repeated=await fetch(base+`/manage/analytics?package=${pack.data.id}&package=other`,{headers:{cookie:teacher.cookie}});
  assert.equal(repeated.status,200);
  assert.match(await repeated.text(),new RegExp('/api/learning/export\\?package='+pack.data.id));

  assert.equal((await post('/api/learning',{...authored,kind:'audio',stimulus:'Speaker:'},admin.cookie)).status,400);
  const source=connection.prepare('SELECT question_id FROM question_revisions WHERE id=?').get(bankItem.data.id);
  const newer=await post('/api/learning',{...authored,questionId:source.question_id,expectedRevision:1,prompt:'New draft for revision history'},admin.cookie);
  assert.equal(newer.status,200);
  const revisionPage=await (await fetch(base+'/manage/questions',{headers:{cookie:admin.cookie}})).text();
  assert.ok(revisionPage.includes(bankItem.data.id)&&revisionPage.includes(newer.data.id));
  assert.equal((await post('/api/learning',{action:'transitionQuestions',ids:[bankItem.data.id],transition:'retire'},admin.cookie)).status,200);
  assert.ok(!(await catalogCards()).includes('Paket numerik publik'));
  assert.equal((await post('/api/assessments',{packageId:publicPack.data.id},student.cookie)).status,409);
  assert.equal((await getSession('/api/assessments/'+packageStarted.data.id)).status,'active');
  console.log('HTTP smoke passed: MVP flows, answer concurrency, deadlines, class resume, authorization, catalog, and bank regressions.');

} catch(error) {console.error(logs);throw error;}
finally {connection?.close();server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));rmSync(directory,{recursive:true,force:true});}
