import "server-only";
import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { assertRole } from "./access";
import type { User } from "./auth";
import { HttpError } from "./http";
import { audit } from "./experiments";
import { getQuestions } from "./questions";
import { splitSpeechLines } from "./listening-speech";
import { assertQuestionInput } from "./question-input";
import { assertDailyImportCapacity, assertQuestionCapacity } from "./import-quota";
import { itpAudioAvailable } from "./itp-simulation";
import { SKD_EXAM_ID, SKD_SECONDS, SKD_SECTIONS, SKD_YEAR, validSkdQuestion } from "./skd-format";
import type { BankRow, ExamProfile, ExamSection, LearningPackage, PackageSnapshot, QuestionContent } from "./learning-types";

export { transaction } from "./db";

export function ensureLearningSeed() {
  if(db().prepare("SELECT 1 FROM learning_meta WHERE key='seed-v1'").get())return;
  transaction(()=>{
    const profiles:ExamProfile[]=[
      {id:"toefl-itp",title:"TOEFL ITP — latihan independen",description:"Bank awal perlu review. Tidak menghasilkan skor atau sertifikat ETS.",active:true,sections:[{key:"listening",title:"Listening",durationSeconds:2100},{key:"structure",title:"Structure",durationSeconds:1500},{key:"reading",title:"Reading",durationSeconds:3300}]},
      {id:"casn-tiu",title:"TIU / persiapan CASN",description:"Kerangka latihan yang dapat dikonfigurasi, bukan simulasi resmi SKD. Konten belum tersedia.",active:true,sections:[{key:"numerik",title:"Penalaran numerik",durationSeconds:1200},{key:"verbal",title:"Penalaran verbal",durationSeconds:1200},{key:"figural",title:"Penalaran figural",durationSeconds:1200}]},
      {id:"utbk",title:"Persiapan UTBK",description:"Kerangka latihan; sesuaikan materi, cakupan, dan waktu dengan acuan tahun yang dituju.",active:true,sections:[{key:"penalaran",title:"Penalaran matematika",durationSeconds:1200},{key:"literasi",title:"Literasi",durationSeconds:1200}]},
      {id:"tpa",title:"Latihan TPA",description:"Tentukan penyelenggara dan cakupan sasaran sebelum menerbitkan paket.",active:true,sections:[{key:"numerik",title:"Numerik",durationSeconds:1200},{key:"verbal",title:"Verbal",durationSeconds:1200},{key:"logika",title:"Logika",durationSeconds:1200}]},
      {id:"ielts",title:"IELTS — latihan objektif",description:"MVP mendukung pilihan ganda saja. Belum mendukung penilaian Writing/Speaking atau prediksi band.",active:true,sections:[{key:"reading",title:"Reading practice",durationSeconds:1200},{key:"listening",title:"Listening practice",durationSeconds:1200}]}
    ];
    for(const p of profiles)db().prepare("INSERT OR IGNORE INTO exam_profiles VALUES(?,?,?,?,1,?)").run(p.id,p.title,p.description,JSON.stringify(p.sections),Date.now());
    for(const q of getQuestions("full")){
      const id="legacy-"+q.id;
      db().prepare("INSERT OR IGNORE INTO bank_questions VALUES(?,NULL,'public',?)").run(id,Date.now());
      const content:QuestionContent={kind:q.kind==="audio"?"audio":"text",stimulus:q.stimulus,prompt:q.prompt,options:q.options,answer:q.answer,explanation:q.explanation,skill:q.section,scores:q.options.map((_,i)=>i===q.answer?1:0)};
      db().prepare("INSERT OR IGNORE INTO question_revisions(id,question_id,revision,exam_id,section_key,content_json,state,created_at) VALUES(?,?,1,'toefl-itp',?,?,'draft',?)")
        .run(id+"-v1",id,q.section,JSON.stringify(content),Date.now());
    }
    db().prepare("INSERT INTO learning_meta VALUES('seed-v1','1')").run();
  });
}
export function examProfiles():ExamProfile[] {
  ensureLearningSeed();
  return (db().prepare("SELECT * FROM exam_profiles ORDER BY title").all() as {id:string;title:string;description:string;sections_json:string;active:number}[])
    .map(p=>({id:p.id,title:p.title,description:p.description,sections:JSON.parse(p.sections_json),active:!!p.active}));
}
function text(input:unknown,label:string,max:number,min=1) {
  if(typeof input!=="string"||input.trim().length<min||input.length>max)throw new HttpError(`${label}: panjang harus ${min}–${max} karakter.`,400);
  return input.trim();
}
export function saveExamProfile(user:User,input:Record<string,unknown>) {
  assertRole(user,"admin");ensureLearningSeed();
  const id=text(input.id,"ID ujian",50);if(!/^[a-z][a-z0-9-]*$/.test(id))throw new HttpError("ID ujian harus berupa slug.",400);
  const title=text(input.title,"Judul",120),description=text(input.description,"Deskripsi",1000);
  const sections=input.sections;
  if(!Array.isArray(sections)||!sections.length||sections.length>8)throw new HttpError("Ujian memerlukan 1–8 bagian.",400);
  const keys=new Set<string>();
  const normalized=sections.map((s:Record<string,unknown>)=>{
    if(!s||typeof s!=="object")throw new HttpError("Bagian tidak valid.",400);
    const key=text(s.key,"Kode bagian",40),title=text(s.title,"Nama bagian",100),durationSeconds=Number(s.durationSeconds);
    if(!/^[a-z][a-z0-9-]*$/.test(key)||keys.has(key)||!Number.isInteger(durationSeconds)||durationSeconds<0||durationSeconds>14400)throw new HttpError("Kode bagian harus unik; durasi 0–14400 detik.",400);
    keys.add(key);return {key,title,durationSeconds};
  });
  if(typeof input.active!=="boolean")throw new HttpError("Status ujian tidak valid.",400);
  db().prepare(`INSERT INTO exam_profiles VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,sections_json=excluded.sections_json,active=excluded.active,updated_at=excluded.updated_at`)
    .run(id,title,description,JSON.stringify(normalized),Number(input.active),Date.now());
  audit(user.id,"exam.saved",id);return id;
}
type RevisionRow={id:string;question_id:string;revision:number;exam_id:string;section_key:string;content_json:string;state:string;visibility:string;owner_id:string|null;review_note:string};
function bankRow(r:RevisionRow):BankRow {return {id:r.id,questionId:r.question_id,revision:r.revision,examId:r.exam_id,section:r.section_key,state:r.state,visibility:r.visibility,ownerId:r.owner_id,reviewNote:r.review_note,content:JSON.parse(r.content_json)};}
export function listBank(user:User, view:"latest"|"published"|"history"="latest"):BankRow[] {
  assertRole(user,"admin","instructor");ensureLearningSeed();
  const rows=db().prepare(`SELECT r.*,q.visibility,q.owner_id FROM question_revisions r JOIN bank_questions q ON q.id=r.question_id
    WHERE (?='admin' OR q.visibility='public' OR q.owner_id=?)
    AND ${view==="history"?"1":view==="published"?"r.state='published' AND r.revision=(SELECT MAX(x.revision) FROM question_revisions x WHERE x.question_id=r.question_id AND x.state='published')":"r.revision=(SELECT MAX(x.revision) FROM question_revisions x WHERE x.question_id=r.question_id)"}
    ORDER BY r.created_at DESC,r.id`).all(user.role,user.id) as RevisionRow[];
  return rows.map(bankRow);
}
function hasUsableStimulus(question: Pick<QuestionContent, "kind" | "stimulus">) {
  return question.kind !== "audio" || splitSpeechLines(question.stimulus).some(line => line.text.trim());
}

function normalizeQuestion(input:Record<string,unknown>) {
  const examId=text(input.examId,"Ujian",50),section=text(input.section,"Bagian",40);
  const profile=examProfiles().find(p=>p.id===examId);
  if(!profile||!profile.sections.some(s=>s.key===section))throw new HttpError("Ujian atau bagian tidak tersedia.",400);
  const kind=input.kind;if(kind!=="text"&&kind!=="audio")throw new HttpError("Jenis soal harus text atau audio.",400);
  const stimulus=text(input.stimulus??"","Stimulus",12000,0),prompt=text(input.prompt,"Pertanyaan",2000),explanation=text(input.explanation,"Pembahasan",8000),skill=text(input.skill,"Kompetensi",100);
  if(!hasUsableStimulus({kind,stimulus}))throw new HttpError("Soal audio memerlukan naskah yang dapat dibacakan.",400);
  if(!Array.isArray(input.options)||input.options.length<2||input.options.length>5)throw new HttpError("Soal memerlukan 2–5 pilihan.",400);
  const options=input.options.map(v=>text(v,"Pilihan",2000));
  if(new Set(options).size!==options.length)throw new HttpError("Pilihan jawaban harus berbeda.",400);
  const answer=input.answer;if(typeof answer!=="number"||!Number.isInteger(answer)||answer<0||answer>=options.length)throw new HttpError("Indeks kunci tidak valid (mulai dari 0).",400);
  let scores=input.scores;
  if(scores===undefined)scores=options.map((_,i)=>i===answer?(examId===SKD_EXAM_ID?5:1):0);
  if(!Array.isArray(scores)||scores.length!==options.length||scores.some(n=>typeof n!=="number"||!Number.isFinite(n)||n<0||n>10)||Math.max(...scores)<=0||scores[answer]!==Math.max(...scores)||scores.filter(n=>n===scores[answer]).length!==1)throw new HttpError("Bobot 0–10 harus memiliki satu nilai tertinggi pada kunci.",400);
  const content: QuestionContent = { kind, stimulus, prompt, options, answer, explanation, skill, scores };
  if (examId === SKD_EXAM_ID && !validSkdQuestion({ ...content, section })) {
    throw new HttpError("SKD memerlukan lima opsi. Pakai bobot 5/0 untuk TWK dan TIU serta 1–5 untuk TKP. Periksa pola FIG pada soal gambar.", 400);
  }
  return {examId,section,content};
}
const revisionFloorKey = (questionId: string) => `question-revision-floor:${questionId}`;

function insertQuestion(user:User,input:Record<string,unknown>) {
  const {examId,section,content}=normalizeQuestion(input);
  const questionId=input.questionId?String(input.questionId):randomUUID();
  const old=db().prepare("SELECT * FROM bank_questions WHERE id=?").get(questionId) as {owner_id:string|null}|undefined;
  let revision=1;
  if(input.questionId){
    if(!old||(user.role!=="admin"&&old.owner_id!==user.id))throw new HttpError("Soal tidak ditemukan.",404);
    const latest=db().prepare("SELECT MAX(revision) AS revision FROM question_revisions WHERE question_id=?").get(questionId) as {revision:number};
    if(Number(input.expectedRevision)!==latest.revision)throw new HttpError("Soal berubah. Muat ulang sebelum menyimpan.",409);
    const floor = db().prepare("SELECT value FROM learning_meta WHERE key=?").get(revisionFloorKey(questionId));
    revision = Math.max(latest.revision, Number(floor?.value ?? 0)) + 1;
    db().prepare("UPDATE question_revisions SET state='retired' WHERE question_id=? AND state IN ('draft','review')").run(questionId);
  } else { assertQuestionCapacity(user.id,1); db().prepare("INSERT INTO bank_questions VALUES(?,?,?,?)").run(questionId,user.id,user.role==="admin"?"public":"private",Date.now()); }
  const id=randomUUID();
  db().prepare("INSERT INTO question_revisions(id,question_id,revision,exam_id,section_key,content_json,state,created_at) VALUES(?,?,?,?,?,?,'draft',?)")
    .run(id,questionId,revision,examId,section,JSON.stringify(content),Date.now());
  audit(user.id,"question.draft",id);return id;
}
export function saveQuestion(user:User,input:Record<string,unknown>) {
  assertRole(user,"admin","instructor");assertQuestionInput(input,true);ensureLearningSeed();return transaction(()=>insertQuestion(user,input));
}
export function importQuestions(user:User,items:unknown, receiptKey?: string) {
  assertRole(user,"admin","instructor");ensureLearningSeed();
  if(!Array.isArray(items)||!items.length||items.length>50)throw new HttpError("Impor harus berisi 1–50 soal.",400);
  return transaction(()=>{
    if (receiptKey) {
      const receipt = db().prepare("SELECT value FROM learning_meta WHERE key=?").get(receiptKey);
      if (receipt) return JSON.parse(String(receipt.value)) as string[];
    }
    assertDailyImportCapacity(user.id,items.length);assertQuestionCapacity(user.id,items.length);
    const ids=items.map((item,index)=>{
      try { assertQuestionInput(item);return insertQuestion(user,item); }
      catch(error) { if(error instanceof HttpError)throw new HttpError(`Soal ${index+1}: ${error.message}`,error.status);throw error; }
    });
    const eventId=randomUUID();
    db().prepare("INSERT INTO bank_import_events VALUES(?,?,?,?)").run(eventId,user.id,ids.length,Date.now());
    if (receiptKey) db().prepare("INSERT INTO learning_meta VALUES(?,?)").run(receiptKey, JSON.stringify(ids));
    audit(user.id,"questions.import.success",eventId);
    return ids;
  });
}
function deleteDraftRevisions(user: User, ids: string[]) {
  assertRole(user, "admin");
  transaction(() => {
    const connection = db();
    const placeholders = ids.map(() => "?").join(",");
    const drafts = connection.prepare(`SELECT id,question_id,revision,state FROM question_revisions WHERE id IN (${placeholders})`)
      .all(...ids) as { id: string; question_id: string; revision: number; state: string }[];
    if (drafts.length !== ids.length) throw new HttpError("Soal tidak ditemukan. Muat ulang daftar soal.", 404);
    if (drafts.some(row => row.state !== "draft")) throw new HttpError("Hanya soal berstatus Draf yang dapat dihapus.", 409);

    const inUse = connection.prepare(`
      SELECT 1 FROM assessment_responses WHERE revision_id IN (${placeholders})
      UNION ALL
      SELECT 1 FROM (
        SELECT snapshot_json FROM assessment_packages
        UNION ALL SELECT snapshot_json FROM assessment_attempts
      ) AS snapshots, json_each(snapshots.snapshot_json, '$.questions') AS question
      WHERE (question.value ->> 'id') IN (${placeholders})
      LIMIT 1`).get(...ids, ...ids);
    if (inUse) throw new HttpError("Draf yang dirujuk paket atau sesi ujian tidak dapat dihapus.", 409);

    const removeRevision = connection.prepare("DELETE FROM question_revisions WHERE id=?");
    const removeEmptyQuestion = connection.prepare(`DELETE FROM bank_questions WHERE id=?
      AND NOT EXISTS (SELECT 1 FROM question_revisions WHERE question_id=?)`);
    const removeFloor = connection.prepare("DELETE FROM learning_meta WHERE key=?");
    const setFloor = connection.prepare(`INSERT INTO learning_meta (key,value) VALUES (?,?)
      ON CONFLICT(key) DO UPDATE SET value=MAX(CAST(value AS INTEGER),CAST(excluded.value AS INTEGER))`);
    for (const draft of drafts) {
      removeRevision.run(draft.id);
      const key = revisionFloorKey(draft.question_id);
      // Keep revision numbers unique even after deleting the latest revision.
      if (removeEmptyQuestion.run(draft.question_id, draft.question_id).changes) removeFloor.run(key);
      else setFloor.run(key, draft.revision);
      audit(user.id, "question.draft.deleted", draft.id);
    }
  });
}

export function transitionQuestions(user:User,ids:unknown,action:string,note:unknown) {
  assertRole(user,"admin","instructor");ensureLearningSeed();
  if(!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=="string")||new Set(ids).size!==ids.length)throw new HttpError("Pilih 1–50 revisi unik.",400);
  if (action === "deleteDraft") return deleteDraftRevisions(user, ids);
  const next:Record<string,string>={review:"review",publish:"published",reopen:"draft",retire:"retired"};
  if(!next[action])throw new HttpError("Aksi review tidak valid.",400);
  if(action!=="review")assertRole(user,"admin");
  const reviewNote=action==="publish"?text(note,"Catatan review",1000,10):String(note??"").slice(0,1000);
  transaction(()=>{for(const id of ids){
    const row=db().prepare("SELECT r.*,q.owner_id FROM question_revisions r JOIN bank_questions q ON q.id=r.question_id WHERE r.id=?").get(id) as RevisionRow|undefined;
    if(!row||(user.role!=="admin"&&row.owner_id!==user.id))throw new HttpError("Soal tidak ditemukan.",404);
    const permitted:Record<string,string[]>={review:["draft"],publish:["review"],reopen:["review"],retire:["published"]};
    if(!permitted[action].includes(row.state))throw new HttpError("Transisi status soal tidak valid.",409);
    if(action==="publish"&&!hasUsableStimulus(JSON.parse(row.content_json)))throw new HttpError("Soal audio memerlukan naskah yang dapat dibacakan sebelum terbit.",409);
    db().prepare("UPDATE question_revisions SET state=?,review_note=?,reviewed_by=? WHERE id=?").run(next[action],reviewNote,action==="publish"?user.id:null,id);
    audit(user.id,"question."+action,id);
  }});
}
export function listPackages(user:User):LearningPackage[] {
  ensureLearningSeed();
  const rows=db().prepare(`SELECT * FROM assessment_packages WHERE ?='admin' OR owner_id=? OR (visibility='public' AND state='published') ORDER BY created_at DESC`).all(user.role,user.id) as {id:string;owner_id:string;exam_id:string;title:string;visibility:string;state:string;snapshot_json:string}[];
  return rows.map(r=>({id:r.id,ownerId:r.owner_id,examId:r.exam_id,title:r.title,visibility:r.visibility,state:r.state,snapshot:JSON.parse(r.snapshot_json)}));
}
export function createPackage(user:User,input:Record<string,unknown>) {
  assertRole(user,"admin","instructor");ensureLearningSeed();
  const profile=examProfiles().find(p=>p.id===input.examId&&p.active);
  if(!profile)throw new HttpError("Ujian aktif tidak ditemukan.",404);
  const title=text(input.title,"Judul paket",160),ids=input.revisionIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>200||new Set(ids).size!==ids.length)throw new HttpError("Pilih 1–200 revisi unik.",400);
  const bank=listBank(user,"published"),questions=ids.map(id=>bank.find(q=>q.id===id));
  if(questions.some(q=>!q||q.examId!==profile.id)||new Set(questions.map(q=>q!.questionId)).size!==questions.length)throw new HttpError("Paket hanya boleh memakai revisi terbit yang dapat diakses dari satu ujian.",400);
  const durations=input.durations as Record<string,unknown>|undefined;
  const sections:ExamSection[]=profile.sections.filter(s=>questions.some(q=>q!.section===s.key)).map(s=>{
    const durationSeconds=durations?.[s.key]===undefined?s.durationSeconds:Number(durations[s.key]);
    if(!Number.isInteger(durationSeconds)||durationSeconds<0||durationSeconds>14400)throw new HttpError("Durasi bagian harus 0–14400 detik.",400);
    return {...s,durationSeconds};
  });
  if(questions.some(q=>!sections.some(s=>s.key===q!.section)))throw new HttpError("Bagian soal tidak lagi sesuai profil ujian.",409);
  const snapshot:PackageSnapshot={examId:profile.id,examTitle:profile.title,title,sections,questions:sections.flatMap(s=>questions.filter(q=>q!.section===s.key).map(q=>({...q!.content,id:q!.id,questionId:q!.questionId,revision:q!.revision,section:q!.section})))};
  if (profile.id === SKD_EXAM_ID) {
    const full = input.skdMode === "full";
    if (snapshot.questions.some(question => !validSkdQuestion(question))) throw new HttpError("Ada soal SKD dengan bobot atau gambar yang tidak valid.", 409);
    if (full && SKD_SECTIONS.some((part, index) => sections[index]?.key !== part.key ||
      snapshot.questions.filter(question => question.section === part.key).length !== part.count)) {
      throw new HttpError("Simulasi SKD 2024 memerlukan 30 TWK, 35 TIU, dan 45 TKP.", 400);
    }
    if (sections.some(section => section.durationSeconds !== 0)) {
      throw new HttpError("Durasi tiap bagian SKD harus 0. Simulasi penuh memakai timer gabungan.", 400);
    }
    snapshot.skd = { year: SKD_YEAR, mode: full ? "full" : "practice" };
    sections[0].durationSeconds = full ? SKD_SECONDS : 0;
  }
  const visibility=user.role==="admin"&&input.visibility==="public"?"public":"private";
  if(visibility==="public"&&questions.some(q=>q!.visibility!=="public"))throw new HttpError("Paket publik tidak boleh membocorkan soal privat instruktur.",400);
  const id=randomUUID();db().prepare("INSERT INTO assessment_packages VALUES(?,?,?,?,?,'draft',?,?)").run(id,user.id,profile.id,title,visibility,JSON.stringify(snapshot),Date.now());audit(user.id,"package.created",id);return id;
}
export function packageMaterialsAvailable(snapshot: PackageSnapshot) {
  const published = db().prepare("SELECT 1 FROM question_revisions WHERE id=? AND state='published'");
  return itpAudioAvailable(snapshot) && snapshot.questions.length > 0 && snapshot.questions.every(q => hasUsableStimulus(q) && published.get(q.id));
}

function assertPublicPackageSources(snapshot:PackageSnapshot) {
  const lookup=db().prepare("SELECT r.state,q.visibility FROM question_revisions r JOIN bank_questions q ON q.id=r.question_id WHERE r.id=? AND q.id=?");
  if(!snapshot.questions.length)throw new HttpError("Paket kosong tidak dapat dibuka untuk publik.",409);
  for(const q of snapshot.questions){
    const source=lookup.get(q.id,q.questionId) as {state:string;visibility:string}|undefined;
    if(!source||source.visibility!=="public")throw new HttpError("Paket memuat soal privat atau sumber yang tidak tersedia. Susun paket dari soal publik sebelum membuka akses.",409);
    if(source.state!=="published"||!hasUsableStimulus(q))throw new HttpError("Ada revisi yang tidak lagi terbit. Susun paket baru dari revisi terbit.",409);
  }
}
export function setPackageVisibility(user:User,input:Record<string,unknown>) {
  assertRole(user,"admin");
  const id=text(input.id,"ID paket",100);
  if(input.visibility!=="public"&&input.visibility!=="private")throw new HttpError("Akses harus public atau private.",400);
  if(input.expectedVisibility!=="public"&&input.expectedVisibility!=="private")throw new HttpError("Status akses awal diperlukan. Muat ulang halaman.",400);
  if(input.expectedState!=="draft"&&input.expectedState!=="published")throw new HttpError("Status paket awal tidak valid. Muat ulang halaman.",400);
  const visibility=input.visibility;
  return transaction(()=>{
    const pack=db().prepare("SELECT state,visibility,snapshot_json FROM assessment_packages WHERE id=?").get(id) as {state:string;visibility:string;snapshot_json:string}|undefined;
    if(!pack)throw new HttpError("Paket tidak ditemukan.",404);
    if(pack.state==="archived")throw new HttpError("Akses paket arsip tidak dapat diubah.",409);
    if(pack.state!==input.expectedState||pack.visibility!==input.expectedVisibility)throw new HttpError("Paket telah berubah. Muat ulang halaman sebelum mengubah akses.",409);
    if(pack.visibility===visibility)return;
    if(visibility==="public") {
      if (db().prepare("SELECT 1 FROM practice_product_packages WHERE package_id=?").get(id)) {
        throw new HttpError("Akses materi ini ditentukan oleh produk.", 409);
      }
      assertPublicPackageSources(JSON.parse(pack.snapshot_json));
    }
    db().prepare("UPDATE assessment_packages SET visibility=? WHERE id=?").run(visibility,id);
    audit(user.id,"package.visibility."+visibility,id);
  });
}
export function transitionPackage(user:User,id:string,action:string) {
  assertRole(user,"admin","instructor");ensureLearningSeed();
  return transaction(()=>{
    const pack=listPackages(user).find(p=>p.id===id);
    if(!pack||(user.role!=="admin"&&pack.ownerId!==user.id))throw new HttpError("Paket tidak ditemukan.",404);
    if(action==="publish"&&pack.state==="draft"){
      if (!itpAudioAvailable(pack.snapshot)) throw new HttpError("Materi atau audio simulasi belum lengkap.", 409);
      if(pack.visibility==="public")assertPublicPackageSources(pack.snapshot);
      else for(const q of pack.snapshot.questions){const row=db().prepare("SELECT state FROM question_revisions WHERE id=?").get(q.id) as {state:string}|undefined;if(row?.state!=="published")throw new HttpError("Ada revisi yang tidak lagi terbit. Susun paket baru.",409);}
      db().prepare("UPDATE assessment_packages SET state='published' WHERE id=?").run(id);
    } else if(action==="archive"&&pack.state==="published")db().prepare("UPDATE assessment_packages SET state='archived' WHERE id=?").run(id);
    else throw new HttpError("Transisi paket tidak valid.",409);
    audit(user.id,"package."+action,id);
  });
}
