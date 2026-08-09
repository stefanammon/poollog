
const HEADERS = ["Kürzel", "Datum", "Uhrzeit", "Aktion", "Reinigungsart", "Wasserlinie", "Wassertemperatur", "Außentemperatur", "Innendach", "fCl", "fCl_Status", "CYA", "TA", "pH", "Wasseroptik", "Dach_Offen_h", "Badebetrieb_h", "Chlorschwimmer_h", "Pumpe_h", "CHC_g", "Notiz"];
const SEED_DATA = [];
const DB_NAME = "PoolLogDB";
const STORE = "records";
const DB_VERSION = 1;
let db;
let editingId = null;

const $ = id => document.getElementById(id);
const form = $("entryForm");

function localDateString(d=new Date()){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function localTimeString(d=new Date()){
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const database=e.target.result;
      if(!database.objectStoreNames.contains(STORE)){
        const store=database.createObjectStore(STORE,{keyPath:"_id",autoIncrement:true});
        store.createIndex("date","Datum",{unique:false});
      }
    };
    req.onsuccess=e=>resolve(e.target.result);
    req.onerror=e=>reject(e.target.error);
  });
}

function tx(mode="readonly"){ return db.transaction(STORE,mode).objectStore(STORE); }

function countRecords(){
  return new Promise((resolve,reject)=>{
    const r=tx().count(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}

function addRecord(record){
  return new Promise((resolve,reject)=>{
    const r=tx("readwrite").add(record); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
function putRecord(record){
  return new Promise((resolve,reject)=>{
    const r=tx("readwrite").put(record); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
function deleteRecord(id){
  return new Promise((resolve,reject)=>{
    const r=tx("readwrite").delete(id); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error);
  });
}
function clearRecords(){
  return new Promise((resolve,reject)=>{
    const r=tx("readwrite").clear(); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error);
  });
}
function getAllRecords(){
  return new Promise((resolve,reject)=>{
    const r=tx().getAll(); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
function getRecord(id){
  return new Promise((resolve,reject)=>{
    const r=tx().get(id); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}

async function seedIfEmpty(){
  if(await countRecords()!==0) return;
  const transaction=db.transaction(STORE,"readwrite");
  const store=transaction.objectStore(STORE);
  for(const row of SEED_DATA) store.add(row);
  await new Promise((resolve,reject)=>{
    transaction.oncomplete=resolve; transaction.onerror=()=>reject(transaction.error);
  });
}

function setDefaults(){
  form.reset();
  $("Aktion").value="Messung";
  $("Kürzel").value="sam";
  $("Datum").value=localDateString();
  $("Uhrzeit").value=localTimeString();
  editingId=null;
  $("saveBtn").textContent="Speichern";
  $("cancelEditBtn").classList.add("hidden");
  updateActionUI();
}

function updateActionUI(){
  const action=$("Aktion").value;
  $("measurementBlock").classList.toggle("hidden", action!=="Messung");
  $("chlorBlock").classList.toggle("hidden", action!=="Chlorung");
  $("cleaningBlock").classList.toggle("hidden", action!=="Reinigung");
  $("otherBlock").classList.toggle("hidden", action!=="Wasserfüllung");
}

function valueOf(id){
  const el=$(id);
  if(!el) return "";
  return (el.value ?? "").trim();
}
function buildRecord(){
  const action=valueOf("Aktion");
  const rec={};
  HEADERS.forEach(h=>rec[h]="");
  rec["Kürzel"]=valueOf("Kürzel");
  rec["Datum"]=valueOf("Datum");
  rec["Uhrzeit"]=valueOf("Uhrzeit");
  rec["Aktion"]=action;
  rec["Notiz"]=valueOf("Notiz");

  if(action==="Messung"){
    for(const h of ["Wasserlinie","Wassertemperatur","Außentemperatur","Innendach","fCl","fCl_Status","CYA","TA","pH","Wasseroptik","Dach_Offen_h","Badebetrieb_h","Chlorschwimmer_h","Pumpe_h"]) rec[h]=valueOf(h);
  } else if(action==="Chlorung"){
    rec["CHC_g"]=valueOf("CHC_g");
  } else if(action==="Reinigung"){
    rec["Reinigungsart"]=valueOf("Reinigungsart");
  } else if(action==="Wasserfüllung"){
    rec["Wasserlinie"]=valueOf("WasserlinieOther");
  }
  if(editingId!==null) rec._id=editingId;
  return rec;
}

function validateRecord(rec){
  if(!rec.Datum) return "Datum fehlt.";
  if(!rec.Aktion) return "Aktion fehlt.";
  if(rec.Aktion==="Chlorung" && rec.CHC_g!=="" && Number(rec.CHC_g)<0) return "CHC_g darf nicht negativ sein.";
  const nonNegative=["fCl","CYA","TA","Dach_Offen_h","Badebetrieb_h","Chlorschwimmer_h","Pumpe_h","CHC_g"];
  for(const k of nonNegative) if(rec[k]!=="" && Number(rec[k])<0) return `${k} darf nicht negativ sein.`;
  if(rec.pH!=="" && (Number(rec.pH)<0 || Number(rec.pH)>14)) return "pH muss zwischen 0 und 14 liegen.";
  return "";
}

function toast(msg){
  const t=$("toast"); t.textContent=msg; t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer=setTimeout(()=>t.classList.remove("show"),2200);
}

function humanSummary(r){
  const bits=[];
  if(r.Wasserlinie!=="") bits.push(`Wasserlinie ${r.Wasserlinie} mm`);
  if(r.Wassertemperatur!=="") bits.push(`Wasser ${r.Wassertemperatur} °C`);
  if(r.fCl!=="") bits.push(`fCl ${r.fCl}`);
  if(r.fCl_Status) bits.push(`fCl ${r.fCl_Status}`);
  if(r.pH!=="") bits.push(`pH ${r.pH}`);
  if(r.CHC_g!=="") bits.push(`${r.CHC_g} g CHC`);
  if(r.Reinigungsart) bits.push(r.Reinigungsart);
  if(r.Notiz) bits.push(r.Notiz);
  return bits.slice(0,3).join(" · ") || "Keine weiteren Angaben";
}

function recordCard(r){
  const el=document.createElement("article");
  el.className="record";
  const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  el.innerHTML=`
    <div class="record-head">
      <div class="record-title">${safe(r.Aktion || "Ereignis")}</div>
      <div class="record-time">${safe(r.Datum)}${r.Uhrzeit ? " · "+safe(r.Uhrzeit) : ""}</div>
    </div>
    <div class="record-summary">${safe(humanSummary(r))}</div>
    <div class="record-actions">
      <button data-edit="${r._id}" type="button">Bearbeiten</button>
      <button data-delete="${r._id}" class="delete" type="button">Löschen</button>
    </div>`;
  el.querySelector("[data-edit]").addEventListener("click",()=>editRecord(r._id));
  el.querySelector("[data-delete]").addEventListener("click",()=>removeRecord(r._id));
  return el;
}

async function renderLists(){
  let rows=await getAllRecords();
  rows.sort((a,b)=>b._id-a._id);
  $("recentList").replaceChildren(...rows.slice(0,7).map(recordCard));
  $("recordCount").textContent=rows.length.toLocaleString("de-DE");
  renderAllList(rows);
}

function renderAllList(rowsOverride=null){
  const render = async()=>{
    let rows=rowsOverride || await getAllRecords();
    rows.sort((a,b)=>b._id-a._id);
    const q=valueOf("searchInput").toLowerCase();
    if(q) rows=rows.filter(r=>HEADERS.some(h=>String(r[h]??"").toLowerCase().includes(q)));
    $("allList").replaceChildren(...rows.map(recordCard));
  };
  render();
}

async function editRecord(id){
  const r=await getRecord(id); if(!r) return;
  switchView("entryView");
  setDefaults();
  editingId=id;
  $("saveBtn").textContent="Änderung speichern";
  $("cancelEditBtn").classList.remove("hidden");
  $("Aktion").value=r.Aktion || "Messung";
  $("Datum").value=r.Datum || localDateString();
  $("Uhrzeit").value=r.Uhrzeit || "";
  if([...$("Kürzel").options].some(o=>o.value===r.Kürzel)) $("Kürzel").value=r.Kürzel;
  updateActionUI();
  const mapping={
    Reinigungsart:"Reinigungsart",CHC_g:"CHC_g",Wasserlinie:"Wasserlinie",
    Wassertemperatur:"Wassertemperatur",Außentemperatur:"Außentemperatur",
    Innendach:"Innendach",fCl:"fCl",fCl_Status:"fCl_Status",CYA:"CYA",TA:"TA",pH:"pH",
    Wasseroptik:"Wasseroptik",Dach_Offen_h:"Dach_Offen_h",Badebetrieb_h:"Badebetrieb_h",
    Chlorschwimmer_h:"Chlorschwimmer_h",Pumpe_h:"Pumpe_h",Notiz:"Notiz"
  };
  for(const [k,id2] of Object.entries(mapping)) if($(id2)) $(id2).value=r[k]??"";
  if(r.Aktion==="Wasserfüllung") $("WasserlinieOther").value=r.Wasserlinie??"";
  window.scrollTo({top:0,behavior:"smooth"});
}

async function removeRecord(id){
  if(!confirm("Diesen Datensatz wirklich löschen?")) return;
  await deleteRecord(id); await renderLists(); toast("Datensatz gelöscht");
}

function switchView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
  window.scrollTo(0,0);
}

function csvEscape(value){
  const s=String(value??"");
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;
}
async function exportCSV(){
  const rows=await getAllRecords();
  rows.sort((a,b)=>a._id-b._id);
  const lines=[HEADERS.map(csvEscape).join(";")];
  for(const r of rows) lines.push(HEADERS.map(h=>csvEscape(r[h])).join(";"));
  download("\ufeff"+lines.join("\r\n"),`Pool_Masterdaten_${localDateString()}.csv`,"text/csv;charset=utf-8");
}

async function exportJSON(){
  const rows=await getAllRecords();
  rows.sort((a,b)=>a._id-b._id);
  download(JSON.stringify({version:1,exportedAt:new Date().toISOString(),headers:HEADERS,records:rows},null,2),
           `PoolLog_Backup_${localDateString()}.json`,"application/json");
}

function download(content,filename,type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function parseCSV(text,delimiter=";"){
  if(text.charCodeAt(0)===0xFEFF) text=text.slice(1);
  const rows=[]; let row=[]; let field=""; let quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){
      if(c==='"' && text[i+1]==='"'){ field+='"'; i++; }
      else if(c==='"') quoted=false;
      else field+=c;
    } else {
      if(c==='"') quoted=true;
      else if(c===delimiter){ row.push(field); field=""; }
      else if(c==="\n"){ row.push(field.replace(/\r$/,"")); rows.push(row); row=[]; field=""; }
      else field+=c;
    }
  }
  if(field!=="" || row.length){ row.push(field.replace(/\r$/,"")); rows.push(row); }
  return rows;
}

async function importCSV(file){
  const text=await file.text();
  const parsed=parseCSV(text);
  if(parsed.length<2) throw new Error("CSV enthält keine Datensätze.");
  const hdr=parsed[0];
  if(HEADERS.some((h,i)=>hdr[i]!==h)) throw new Error("CSV-Kopfzeile entspricht nicht der Pooldaten-Struktur.");
  const transaction=db.transaction(STORE,"readwrite");
  const store=transaction.objectStore(STORE);
  for(const cells of parsed.slice(1)){
    if(cells.every(v=>v==="")) continue;
    const r={}; HEADERS.forEach((h,i)=>r[h]=cells[i]??""); store.add(r);
  }
  await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});
}

async function restoreJSON(file){
  const obj=JSON.parse(await file.text());
  if(!obj || !Array.isArray(obj.records)) throw new Error("Ungültiges Backup.");
  if(!confirm(`Aktuellen Bestand ersetzen durch ${obj.records.length} Datensätze aus dem Backup?`)) return;
  await clearRecords();
  const transaction=db.transaction(STORE,"readwrite");
  const store=transaction.objectStore(STORE);
  for(const old of obj.records){
    const r={}; HEADERS.forEach(h=>r[h]=old[h]??""); store.add(r);
  }
  await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});
}

form.addEventListener("submit",async e=>{
  e.preventDefault();
  const rec=buildRecord();
  const err=validateRecord(rec);
  if(err){ toast(err); return; }
  if(editingId===null) await addRecord(rec); else await putRecord(rec);
  const msg=editingId===null ? "Gespeichert" : "Änderung gespeichert";
  setDefaults(); await renderLists(); toast(msg);
  window.scrollTo({top:0,behavior:"smooth"});
});

$("Aktion").addEventListener("change",updateActionUI);
$("fCl").addEventListener("input",()=>{ if(valueOf("fCl")!=="") $("fCl_Status").value=""; });
$("fCl_Status").addEventListener("change",()=>{ if(valueOf("fCl_Status")!=="") $("fCl").value=""; });
$("cancelEditBtn").addEventListener("click",setDefaults);
$("showDataBtn").addEventListener("click",()=>switchView("dataView"));
$("backBtn").addEventListener("click",()=>switchView("entryView"));
$("menuBtn").addEventListener("click",()=>switchView("menuView"));
$("closeMenuBtn").addEventListener("click",()=>switchView("entryView"));
$("searchInput").addEventListener("input",()=>renderAllList());
$("exportCsvBtn").addEventListener("click",exportCSV);
$("exportJsonBtn").addEventListener("click",exportJSON);

$("importCsvInput").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file) return;
  try{ await importCSV(file); await renderLists(); toast("CSV importiert"); }
  catch(err){ alert(err.message); }
  e.target.value="";
});
$("importJsonInput").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file) return;
  try{ await restoreJSON(file); await renderLists(); toast("Backup wiederhergestellt"); }
  catch(err){ alert(err.message); }
  e.target.value="";
});

(async()=>{
  db=await openDB();
  await seedIfEmpty();
  setDefaults();
  await renderLists();
  if("serviceWorker" in navigator && location.protocol!=="file:"){
    navigator.serviceWorker.register("service-worker.js").catch(()=>{});
  }
})();
