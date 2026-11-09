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
const base=`http://127.0.0.1:${port}`,env={...process.env,DATA_DIR:directory,NEXT_TELEMETRY_DISABLED:'1',APP_ORIGIN:base,AUTH_CLIENT_IP_HEADER:'x-test-client-ip',BANK_IMPORT_DAILY_QUESTIONS:'2',BANK_MAX_OWNED_QUESTIONS:'5000'};
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
  connection=new DatabaseSync(join(directory,'app.sqlite'));
  connection.prepare("UPDATE users SET role='instructor' WHERE id=?").run(teacher.data.user.id);
  connection.prepare('INSERT INTO classrooms VALUES(?,?,?,?,?)').run('legacy-class',teacher.data.user.id,'HTTP Pilot','legacy-code',Date.now());
  connection.prepare('INSERT INTO enrollments VALUES(?,?,?)').run('legacy-class',student.data.user.id,Date.now());
  connection.prepare('INSERT INTO assignments VALUES(?,?,?,?,?,?)').run('legacy-assignment','legacy-class','HTTP Structure','structure',1,Date.now());
  const operator=spawnSync(process.execPath,['--conditions=react-server','--import=tsx','scripts/grant-role.mjs','smoke_admin','admin'],{env,encoding:'utf8'});
  assert.equal(operator.status,0,operator.stderr);
  assert.equal(connection.prepare('SELECT role FROM users WHERE id=?').get(teacher.data.user.id).role,'student');
  assert.equal(connection.prepare('SELECT owner_id FROM classrooms WHERE id=?').get('legacy-class').owner_id,teacher.data.user.id);
  for(const action of ['createClass','joinClass','createAssignment','requestInstructor','reviewInstructor']){
    assert.equal((await post('/api/platform',{action},student.cookie)).status,410);
  }
  assert.equal((await post('/api/attempts',{assignmentId:'legacy-assignment'},student.cookie)).status,410);
  assert.equal((await post('/api/assessments',{taskId:'legacy-assessment'},student.cookie)).status,410);
  assert.equal((await post('/api/learning',{action:'createAssessmentTask'},admin.cookie)).status,410);
  const attempt=await post('/api/attempts',{mode:'practice',section:'structure'},student.cookie);
  assert.equal(attempt.status,201);
  connection.prepare('UPDATE attempts SET assignment_id=? WHERE id=?').run('legacy-assignment',attempt.data.id);
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
  for(const [path,cookie,content] of [['/admin',admin.cookie,'Pantau produk'],['/admin/experiments',admin.cookie,'HTTP experiment'],['/paket',student.cookie,'Temukan latihan']]){
    const response=await fetch(base+path,{headers:{cookie}});assert.equal(response.status,200);assert.ok((await response.text()).includes(content));
  }
  const authored={action:'saveQuestion',examId:'casn-tiu',section:'numerik',kind:'text',skill:'penjumlahan',stimulus:'',prompt:'Berapa 2 + 3?',options:['1','2','3','4','5'],answer:4,explanation:'Dua ditambah tiga sama dengan lima.'};
  assert.equal((await post('/api/learning',authored,student.cookie)).status,403);
  const bankItem=await post('/api/learning',authored,admin.cookie);assert.equal(bankItem.status,200);
  assert.equal((await post('/api/learning',{action:'transitionQuestions',ids:[bankItem.data.id],transition:'review'},admin.cookie)).status,200);
  assert.equal((await post('/api/learning',{action:'transitionQuestions',ids:[bankItem.data.id],transition:'publish',note:'Kunci, pilihan, dan pembahasan sudah diperiksa.'},teacher.cookie)).status,403);
  assert.equal((await post('/api/learning',{action:'transitionQuestions',ids:[bankItem.data.id],transition:'publish',note:'Kunci, pilihan, dan pembahasan sudah diperiksa.'},admin.cookie)).status,200);
  const pack=await post('/api/learning',{action:'createPackage',examId:'casn-tiu',title:'Paket numerik premium',revisionIds:[bankItem.data.id],durations:{numerik:0},visibility:'private'},admin.cookie);assert.equal(pack.status,200);
  const previewPath=`/manage/packages/${pack.data.id}/preview`;
  const materialsHtml=async path=>(await (await fetch(base+path,{headers:{cookie:admin.cookie}})).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const draftList=await materialsHtml('/manage/packages?q=numerik+premium&status=draft&access=private');
  assert.ok(draftList.includes('Paket numerik premium')&&draftList.includes('href="'+previewPath+'"'));
  assert.match(draftList,/aria-current="page"[^>]*>Draf/);
  assert.match(await materialsHtml('/manage/packages?q=numerik+premium&status=published'),/Paket tidak ditemukan/);
  const copyMaterial=connection.prepare(`INSERT INTO assessment_packages(id,owner_id,exam_id,title,visibility,state,snapshot_json,created_at)
    SELECT ?,owner_id,exam_id,?,'private','draft',snapshot_json,? FROM assessment_packages WHERE id=?`);
  for(let i=0;i<11;i++) copyMaterial.run('materials-page-'+i,'Uji pagination '+i,Date.now()+i,pack.data.id);
  const toeflRevision=connection.prepare("SELECT id FROM question_revisions WHERE exam_id='toefl-itp' AND section_key='structure' AND state='draft' LIMIT 1").get();
  connection.prepare("UPDATE question_revisions SET state='published' WHERE id=?").run(toeflRevision.id);
  const toeflMaterial=await post('/api/learning',{action:'createPackage',examId:'toefl-itp',title:'Uji pagination lintas format',revisionIds:[toeflRevision.id],visibility:'private'},admin.cookie);
  assert.equal(toeflMaterial.status,200);
  const materialsQuery='/manage/packages?q=Uji+pagination&status=draft&access=private';
  const tiuQuery=materialsQuery+'&exam=casn-tiu';
  const firstPage=await materialsHtml(tiuQuery);
  const secondPage=await materialsHtml(tiuQuery+'&page=2');
  assert.equal([...firstPage.matchAll(/class="materials-card"/g)].length,10);
  assert.equal([...secondPage.matchAll(/class="materials-card"/g)].length,1);
  assert.match(firstPage,/q=Uji\+pagination&amp;status=draft&amp;access=private&amp;exam=casn-tiu&amp;page=2/);
  const toeflList=await materialsHtml(materialsQuery+'&exam=toefl-itp');
  assert.match(toeflList,/aria-labelledby="materials-group-toefl-itp"/);
  assert.doesNotMatch(toeflList,/aria-labelledby="materials-group-casn-tiu"/);
  assert.ok(toeflList.includes('Uji pagination lintas format'));
  assert.match(toeflList,/status=published&amp;access=private&amp;exam=toefl-itp/);
  const mixedGroups=await materialsHtml(materialsQuery+'&page=2');
  assert.match(mixedGroups,/aria-labelledby="materials-group-casn-tiu"/);
  assert.match(mixedGroups,/aria-labelledby="materials-group-toefl-itp"/);
  connection.prepare("DELETE FROM assessment_packages WHERE id=? OR id LIKE 'materials-page-%'").run(toeflMaterial.data.id);
  connection.prepare("UPDATE question_revisions SET state='draft' WHERE id=?").run(toeflRevision.id);
  const previewAudio=`/api/admin/package-preview/${pack.data.id}/audio?questionId=${bankItem.data.id}`;
  const savedAttempts=()=>connection.prepare('SELECT (SELECT COUNT(*) FROM assessment_attempts) AS attempts,(SELECT COUNT(*) FROM assessment_responses) AS responses').get();
  const beforePreview=savedAttempts();
  assert.equal((await fetch(base+previewPath,{redirect:'manual'})).status,307);
  assert.equal((await fetch(base+previewPath,{headers:{cookie:student.cookie},redirect:'manual'})).status,307);
  assert.equal((await fetch(base+previewAudio)).status,401);
  assert.equal((await fetch(base+previewAudio,{headers:{cookie:student.cookie}})).status,403);
  const preview=await fetch(base+previewPath,{headers:{cookie:admin.cookie}});
  assert.equal(preview.status,200);
  assert.match(await preview.text(),/Pratinjau simulasi/);
  assert.equal(connection.prepare('SELECT state FROM assessment_packages WHERE id=?').get(pack.data.id).state,'draft');
  assert.deepEqual(savedAttempts(),beforePreview);
  assert.equal((await post('/api/learning',{action:'transitionPackage',id:pack.data.id,transition:'publish'},admin.cookie)).status,200);
  const productData={action:'createProduct',slug:'numerik-premium',title:'Numerik Premium',description:'Latihan numerik mandiri.',kind:'preparation',access:'paid',packageIds:[pack.data.id]};
  assert.equal((await post('/api/learning',productData,student.cookie)).status,403);
  const product=await post('/api/learning',productData,admin.cookie);assert.equal(product.status,200);
  const productPath='/paket/numerik-premium';
  assert.equal((await fetch(base+productPath)).status,404);
  assert.equal((await post('/api/learning',{action:'publishProduct',id:product.data.id},admin.cookie)).status,200);
  const productMarkup=await (await fetch(base+productPath)).text();
  assert.match(productMarkup,/Pembelian belum dibuka/);
  assert.match(productMarkup,/href="\/login\?next=\/paket\/numerik-premium"/);
  assert.match(productMarkup,/href="\/paket#open-practice"/);
  assert.equal((await post('/api/learning',{action:'transitionPackage',id:pack.data.id,transition:'archive'},admin.cookie)).status,409);
  assert.equal((await post('/api/assessments',{packageId:pack.data.id},student.cookie)).status,404);
  assert.equal((await post('/api/assessments',{packageId:pack.data.id},outsider.cookie)).status,404);
  const grant={action:'grantProductAccess',id:product.data.id,username:student.data.user.username};
  assert.equal((await post('/api/learning',grant,student.cookie)).status,403);
  connection.prepare("UPDATE exam_profiles SET active=0 WHERE id='casn-tiu'").run();
  assert.equal((await post('/api/learning',grant,admin.cookie)).status,409);
  connection.prepare("UPDATE exam_profiles SET active=1 WHERE id='casn-tiu'").run();
  assert.equal((await post('/api/learning',grant,admin.cookie)).status,200);
  assert.equal((await post('/api/learning',grant,admin.cookie)).status,200);
  assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM practice_product_access WHERE product_id=?').get(product.data.id).n,1);
  assert.match(await (await fetch(base+'/paket-saya',{headers:{cookie:student.cookie}})).text(),/Numerik Premium/);
  const session=await post('/api/assessments',{packageId:pack.data.id},student.cookie);assert.equal(session.status,201);
  connection.prepare('INSERT INTO assessment_tasks VALUES(?,?,?,?,?,?)').run('legacy-assessment','legacy-class',pack.data.id,'Tugas numerik lama',1,Date.now());
  connection.prepare('UPDATE assessment_attempts SET task_id=? WHERE id=?').run('legacy-assessment',session.data.id);
  const current=await (await fetch(base+`/api/assessments/${session.data.id}`,{headers:{cookie:student.cookie}})).json();assert.ok(!('answer' in current.questions[0])&&!('scores' in current.questions[0])&&!('explanation' in current.questions[0]));
  assert.equal((await fetch(base+`/api/assessments/${session.data.id}`,{headers:{cookie:outsider.cookie}})).status,404);
  assert.equal((await post(`/api/assessments/${session.data.id}`,{action:'view',questionId:bankItem.data.id,visible:true},student.cookie)).status,200);
  assert.equal((await post(`/api/assessments/${session.data.id}`,{action:'answer',questionId:bankItem.data.id,choice:4},student.cookie)).status,200);
  const completed=await post(`/api/assessments/${session.data.id}`,{action:'advance',sectionIndex:0},student.cookie);assert.equal(completed.data.result.correct,1);
  const questionReport={attemptId:session.data.id,revisionId:bankItem.data.id,note:'Tolong periksa kembali pengecoh ini.'};
  assert.equal((await post('/api/question-issues',questionReport,outsider.cookie)).status,404);
  assert.equal((await post('/api/question-issues',questionReport,student.cookie)).status,201);
  assert.equal((await post('/api/question-issues',questionReport,student.cookie)).status,409);
  const issuePage=await (await fetch(base+'/manage/products',{headers:{cookie:admin.cookie}})).text();
  assert.match(issuePage,/Berapa 2 \+ 3\?/);
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
  const catalogCards=async()=>(await (await fetch(base+'/paket')).text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
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
  assert.equal((await fetch(base+'/api/learning/export',{headers:{cookie:teacher.cookie}})).status,403);
  const report=await fetch(base+'/api/learning/export',{headers:{cookie:admin.cookie}});assert.equal(report.status,200);assert.match(await report.text(),/smoke_student/);
  for(const [path,cookie,content] of [['/manage/questions',admin.cookie,'Bank soal'],['/admin/exams',admin.cookie,'Atur format latihan.'],['/manage/packages',admin.cookie,'Paket numerik premium'],['/manage/analytics',admin.cookie,'Berapa 2'],['/paket',student.cookie,'Numerik Premium'],[`/assessment/${session.data.id}`,student.cookie,'Memuat sesi']]){
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
  const rawLearning=(headers,body)=>fetch(base+'/api/learning',{method:'POST',headers:{cookie:admin.cookie,...headers},body});
  assert.equal((await rawLearning({'Content-Type':'application/json'},JSON.stringify(importBody))).status,403);
  assert.equal((await rawLearning({'Content-Type':'application/json',origin:'https://foreign.invalid'},JSON.stringify(importBody))).status,403);
  assert.equal((await rawLearning({'Content-Type':'text/plain',origin:base},JSON.stringify(importBody))).status,415);
  assert.equal((await rawLearning({'Content-Type':'application/json',origin:base},new Uint8Array([255]))).status,400);
  assert.equal((await rawLearning({'Content-Type':'application/json',origin:base},JSON.stringify({x:'x'.repeat(513000)}))).status,413);
  let nested=0;for(let i=0;i<14;i++)nested=[nested];
  assert.equal((await rawLearning({'Content-Type':'application/json',origin:base},JSON.stringify({action:'importQuestions',items:nested}))).status,400);
  assert.equal((await post('/api/learning',importBody,student.cookie)).status,403);
  assert.equal((await post('/api/learning',{...authored,answer:false},admin.cookie)).status,400);
  const beforeImport=connection.prepare('SELECT COUNT(*) AS n FROM bank_questions WHERE owner_id=?').get(admin.data.user.id).n;
  assert.equal((await post('/api/learning',{action:'importQuestions',items:[{...importItem,state:'published'}]},admin.cookie)).status,400);
  assert.equal((await post('/api/learning',{action:'importQuestions',items:[{...importItem,answer:null}]},admin.cookie)).status,400);
  assert.equal((await post('/api/learning',{action:'importQuestions',items:[importItem,{...importItem,answer:100}]},admin.cookie)).status,400);
  assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM bank_questions WHERE owner_id=?').get(admin.data.user.id).n,beforeImport);
  const accepted=await post('/api/learning',{action:'importQuestions',items:[{...importItem,prompt:'<img src=x onerror=alert(1)>'},{...importItem,prompt:"'); DROP TABLE users; --"}]},admin.cookie);
  assert.equal(accepted.status,200);assert.equal(accepted.data.count,2);
  assert.equal((await post('/api/learning',{...importBody,visibility:'public'},admin.cookie)).status,400);
  assert.equal((await post('/api/learning',importBody,admin.cookie)).status,429);
  assert.equal(connection.prepare('SELECT COUNT(*) AS n FROM bank_questions WHERE owner_id=?').get(admin.data.user.id).n,beforeImport+2);
  assert.equal(connection.prepare('SELECT SUM(item_count) AS n FROM bank_import_events WHERE user_id=?').get(admin.data.user.id).n,2);
  assert.ok(connection.prepare('SELECT COUNT(*) AS n FROM users').get().n>=4);
  assert.equal(connection.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE actor_id=? AND action='questions.import.rejected'").get(admin.data.user.id).n,4);
  const escapedBank=await (await fetch(base+'/manage/questions',{headers:{cookie:admin.cookie}})).text();
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

  for(const [path, target] of [['/instructor','/'],['/catalog','/paket']]){
    const redirect=await fetch(base+path,{redirect:'manual',headers:{cookie:student.cookie}});
    assert.equal(redirect.status,307);
    assert.equal(new URL(redirect.headers.get('location'),base).pathname,target);
  }
  assert.equal((await getSession('/api/attempts/'+attempt.data.id)).status,'finished');
  assert.equal((await getSession('/api/assessments/'+session.data.id)).status,'finished');
  assert.equal((await post('/api/attempts',{assignmentId:{invalid:true}},student.cookie)).status,410);
  const repeated=await fetch(base+`/manage/analytics?package=${pack.data.id}&package=other`,{headers:{cookie:admin.cookie}});
  assert.equal(repeated.status,200);
  assert.match(await repeated.text(),new RegExp('/api/learning/export\\?package='+pack.data.id));
  assert.equal((await post('/api/learning',{action:'archiveProduct',id:product.data.id},admin.cookie)).status,200);
  assert.equal((await fetch(base+productPath)).status,404);
  assert.equal((await post('/api/learning',{action:'transitionPackage',id:pack.data.id,transition:'archive'},admin.cookie)).status,409);
  const packageStarted=await post('/api/assessments',{packageId:pack.data.id},student.cookie);
  assert.equal(packageStarted.status,201);
  assert.equal((await post('/api/assessments',{packageId:pack.data.id},outsider.cookie)).status,404);

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

  const sections=['listening','structure','reading'];
  const revisionIds=sections.flatMap(section=>connection.prepare("SELECT id FROM question_revisions WHERE exam_id='toefl-itp' AND section_key=? LIMIT 5").all(section).map(row=>row.id));
  assert.equal(revisionIds.length,15);
  for(const id of revisionIds) connection.prepare("UPDATE question_revisions SET state='published' WHERE id=?").run(id);
  const diagnosticMaterial=await post('/api/learning',{action:'createPackage',examId:'toefl-itp',title:'Diagnostik 15 soal',revisionIds,visibility:'private',durations:{listening:0,structure:0,reading:0}},admin.cookie);
  assert.equal(diagnosticMaterial.status,200);
  assert.equal((await post('/api/learning',{action:'transitionPackage',id:diagnosticMaterial.data.id,transition:'publish'},admin.cookie)).status,200);
  const diagnostic=await post('/api/learning',{action:'createProduct',slug:'cek-kesiapan',title:'Cek Kesiapan',description:'Diagnostik TOEFL singkat.',kind:'diagnostic',access:'free',packageIds:[diagnosticMaterial.data.id]},admin.cookie);
  assert.equal(diagnostic.status,200);
  assert.equal((await post('/api/learning',{action:'publishProduct',id:diagnostic.data.id},admin.cookie)).status,200);
  const diagnosticRoot=await (await fetch(base+'/',{headers:{cookie:outsider.cookie}})).text();
  assert.match(diagnosticRoot,/Cek kesiapan gratis/);
  connection.prepare("UPDATE question_revisions SET state='retired' WHERE id=?").run(revisionIds[0]);
  const unavailableRoot=await (await fetch(base+'/',{headers:{cookie:outsider.cookie}})).text();
  assert.doesNotMatch(unavailableRoot,/Cek kesiapan gratis/);
  connection.prepare("UPDATE question_revisions SET state='published' WHERE id=?").run(revisionIds[0]);
  const diagnosticStart=await post('/api/assessments',{packageId:diagnosticMaterial.data.id},outsider.cookie);
  assert.equal(diagnosticStart.status,201);
  for(const [sectionIndex,section] of sections.entries()){
    const response=await fetch(base+`/api/assessments/${diagnosticStart.data.id}`,{headers:{cookie:outsider.cookie}});
    const current=await response.json();
    assert.equal(current.questions.length,5);
    assert.ok(current.questions.every(question=>question.section===section));
    const advance=await post(`/api/assessments/${diagnosticStart.data.id}`,{action:'advance',sectionIndex},outsider.cookie);
    assert.equal(advance.status,200);
    if(sectionIndex===2) assert.equal(advance.data.result.total,15);
  }
  console.log('HTTP smoke passed: legacy history, answer concurrency, deadlines, product access, diagnostics, reports, authorization, and bank regressions.');

} catch(error) {console.error(logs);throw error;}
finally {connection?.close();server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));rmSync(directory,{recursive:true,force:true});}
