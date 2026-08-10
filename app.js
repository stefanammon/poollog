
const APP_VERSION = "1.6";
const HEADERS = ["Kürzel", "Datum", "Uhrzeit", "Aktion", "Reinigungsart", "Wasserlinie", "Wassertemperatur", "Außentemperatur", "Innendach", "fCl", "fCl_Status", "CYA", "TA", "pH", "Wasseroptik", "Dach_Offen_h", "Badebetrieb_h", "Chlorschwimmer_h", "Pumpe_h", "CHC_g", "Notiz"];
const SEED_DATA = [];
const DB_NAME = "PoolLogDB";
const STORE = "records";
const SETTINGS_STORE = "settings";
const DB_VERSION = 2;
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

function parseLocalDateTime(dateStr,timeStr){
  if(!dateStr) return null;
  const rawDate=String(dateStr).trim();
  let y,m,d;

  if(/^\d{4}-\d{2}-\d{2}$/.test(rawDate)){
    [y,m,d]=rawDate.split("-").map(Number);
  }else if(/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(rawDate)){
    [d,m,y]=rawDate.split(".").map(Number);
  }else{
    return null;
  }

  const rawTime=String(timeStr || "00:00").trim();
  const tm=rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(!tm) return null;
  const hh=Number(tm[1]), mm=Number(tm[2]), ss=Number(tm[3]||0);
  if(hh>23 || mm>59 || ss>59) return null;

  const dt=new Date(y,m-1,d,hh,mm,ss,0);
  if(dt.getFullYear()!==y || dt.getMonth()!==m-1 || dt.getDate()!==d) return null;
  return dt;
}

function formatHours(hours){
  if(!Number.isFinite(hours)) return "–";
  if(hours < 0) return "aktuelle Zeit liegt davor";
  if(hours < 24) return `${hours.toLocaleString("de-DE",{minimumFractionDigits:1,maximumFractionDigits:1})} h`;
  const days=Math.floor(hours/24);
  const rem=hours-(days*24);
  return `${days} T ${rem.toLocaleString("de-DE",{minimumFractionDigits:1,maximumFractionDigits:1})} h`;
}

let currentInterval = {
  hours:null,
  type:"",
  previous:null,
  dayHours:0,
  nightHours:0
};

function minutesOfDay(timeStr){
  const m=String(timeStr||"").match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  return Number(m[1])*60+Number(m[2]);
}

function isDayMinute(minute, dayStart, nightStart){
  if(dayStart < nightStart){
    return minute>=dayStart && minute<nightStart;
  }
  return minute>=dayStart || minute<nightStart;
}

function classifyInterval(start,end,dayStartStr,nightStartStr){
  const dayStart=minutesOfDay(dayStartStr);
  const nightStart=minutesOfDay(nightStartStr);
  if(!start || !end || dayStart===null || nightStart===null || end<=start){
    return {type:"",dayHours:0,nightHours:0,totalHours:0};
  }

  let cursor=new Date(start.getTime());
  let dayMinutes=0, nightMinutes=0;
  while(cursor < end){
    const next=new Date(Math.min(end.getTime(),cursor.getTime()+60000));
    const minute=cursor.getHours()*60+cursor.getMinutes();
    const diff=(next-cursor)/60000;
    if(isDayMinute(minute,dayStart,nightStart)) dayMinutes+=diff;
    else nightMinutes+=diff;
    cursor=next;
  }

  const total=dayMinutes+nightMinutes;
  let type="";
  // Very long intervals intentionally stay "gemischt": they are poor candidates
  // for automatic day/night defaults even if one side is mathematically longer.
  if(total >= 20*60) type="mixed";
  else if(Math.abs(dayMinutes-nightMinutes) < 1) type="mixed";
  else type=dayMinutes>nightMinutes ? "day" : "night";

  return {
    type,
    dayHours:dayMinutes/60,
    nightHours:nightMinutes/60,
    totalHours:total/60
  };
}

function stateIds(){
  return [
    ["Dach_Offen","Roof"],
    ["Badebetrieb","Bath"],
    ["Pumpe","Pump"],
    ["Chlorschwimmer","Float"]
  ];
}

function setStateUI(prefix,state,asSuggestion=false){
  const select=$(prefix+"_state");
  const wrap=$(prefix+"_partialWrap");
  if(!select || !wrap) return;
  select.value=state ?? "";
  wrap.classList.toggle("hidden",state!=="partial");
  const container=select.closest(".interval-control");
  if(container) container.classList.toggle("suggested",!!asSuggestion && !!state);
  if(state!=="partial" && $(prefix+"_h")) $(prefix+"_h").value="";
}

function intervalValueFromState(prefix){
  const state=valueOf(prefix+"_state");
  if(state==="") return "";
  if(state==="zero") return "0";
  if(state==="full"){
    if(!Number.isFinite(currentInterval.hours)) return "";
    return String(Math.round(currentInterval.hours*100)/100);
  }
  if(state==="partial") return numericValueOf(prefix+"_h");
  return "";
}

async function getMasterData(){
  const saved=await getSetting("masterData");
  return {...MASTER_DEFAULTS,...(saved||{})};
}

async function applyIntervalDefaults(force=false){
  if(editingId!==null && !force) return;
  const md=await getMasterData();
  const type=currentInterval.type;

  for(const [prefix,key] of stateIds()){
    const select=$(prefix+"_state");
    if(!select) continue;

    // Preserve a user's manual choice unless explicitly refreshing.
    if(!force && select.dataset.touched==="1") continue;

    let suggested="";
    if(type==="night") suggested=md["night"+key] ?? "";
    else if(type==="day") suggested=md["day"+key] ?? "";
    else suggested="";

    setStateUI(prefix,suggested,!!suggested);
    select.dataset.touched="0";
  }
}

async function updateElapsedSinceMeasurement(){
  const target=$("elapsedSinceMeasurement");
  const badge=$("intervalTypeBadge");
  const context=$("intervalContextText");
  if(!target || !db) return;

  const current=parseLocalDateTime(valueOf("Datum"),valueOf("Uhrzeit"));
  if(!current){
    target.textContent="–";
    badge.textContent="–";
    badge.className="interval-badge neutral";
    currentInterval={hours:null,type:"",previous:null,dayHours:0,nightHours:0};
    return;
  }

  const rows=await getAllRecords();
  const candidates=rows
    .filter(r=>String(r.Aktion ?? "").trim().toLocaleLowerCase("de-DE")==="messung")
    .map(r=>({r,dt:parseLocalDateTime(String(r.Datum??"").trim(),String(r.Uhrzeit??"").trim())}))
    .filter(x=>x.dt && x.dt.getTime() < current.getTime() && x.r._id!==editingId)
    .sort((a,b)=>b.dt.getTime()-a.dt.getTime());

  if(!candidates.length){
    target.textContent="keine frühere Messung";
    badge.textContent="–";
    badge.className="interval-badge neutral";
    context.textContent="Für die Intervall-Eingabe fehlt eine frühere gespeicherte Messung.";
    currentInterval={hours:null,type:"",previous:null,dayHours:0,nightHours:0};
    return;
  }

  const last=candidates[0];
  const minutes=Math.round((current.getTime()-last.dt.getTime())/60000);
  const hours=minutes/60;
  const md=await getMasterData();
  const cls=classifyInterval(last.dt,current,md.dayStart,md.nightStart);

  currentInterval={
    hours,
    type:cls.type,
    previous:last,
    dayHours:cls.dayHours,
    nightHours:cls.nightHours
  };

  target.textContent=formatHours(hours);

  if(cls.type==="day"){
    badge.textContent="☀ Tag";
    badge.className="interval-badge day";
  }else if(cls.type==="night"){
    badge.textContent="🌙 Nacht";
    badge.className="interval-badge night";
  }else{
    badge.textContent="◐ Gemischt";
    badge.className="interval-badge mixed";
  }

  context.textContent=`Letzte Messung: ${last.r.Datum} ${last.r.Uhrzeit || "00:00"} · Taganteil ${cls.dayHours.toLocaleString("de-DE",{maximumFractionDigits:1})} h · Nachtanteil ${cls.nightHours.toLocaleString("de-DE",{maximumFractionDigits:1})} h`;

  await applyIntervalDefaults(false);
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
      if(!database.objectStoreNames.contains(SETTINGS_STORE)){
        database.createObjectStore(SETTINGS_STORE,{keyPath:"key"});
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

function settingsTx(mode="readonly"){
  return db.transaction(SETTINGS_STORE,mode).objectStore(SETTINGS_STORE);
}
function getSetting(key){
  return new Promise((resolve,reject)=>{
    const r=settingsTx().get(key);
    r.onsuccess=()=>resolve(r.result ? r.result.value : null);
    r.onerror=()=>reject(r.error);
  });
}
function setSetting(key,value){
  return new Promise((resolve,reject)=>{
    const r=settingsTx("readwrite").put({key,value});
    r.onsuccess=()=>resolve();
    r.onerror=()=>reject(r.error);
  });
}

const MASTER_DEFAULTS = {
  poolName:"Mein Pool",
  poolVolume:"17.5",
  dayStart:"07:00",
  nightStart:"21:00",
  nightRoof:"zero",
  nightBath:"zero",
  nightPump:"",
  nightFloat:"",
  dayRoof:"",
  dayBath:"",
  dayPump:"",
  dayFloat:""
};

async function loadMasterData(){
  const saved=await getSetting("masterData");
  const md={...MASTER_DEFAULTS,...(saved||{})};
  $("mdPoolName").value=md.poolName ?? "";
  $("mdPoolVolume").value=md.poolVolume ?? "";
  $("mdDayStart").value=md.dayStart ?? "";
  $("mdNightStart").value=md.nightStart ?? "";
  $("mdNightRoof").value=md.nightRoof ?? "";
  $("mdNightBath").value=md.nightBath ?? "";
  $("mdNightPump").value=md.nightPump ?? "";
  $("mdNightFloat").value=md.nightFloat ?? "";
  $("mdDayRoof").value=md.dayRoof ?? "";
  $("mdDayBath").value=md.dayBath ?? "";
  $("mdDayPump").value=md.dayPump ?? "";
  $("mdDayFloat").value=md.dayFloat ?? "";
}

async function saveMasterData(){
  const md={
    poolName:valueOf("mdPoolName"),
    poolVolume:valueOf("mdPoolVolume").replace(",","."),
    dayStart:valueOf("mdDayStart"),
    nightStart:valueOf("mdNightStart"),
    nightRoof:valueOf("mdNightRoof"),
    nightBath:valueOf("mdNightBath"),
    nightPump:valueOf("mdNightPump"),
    nightFloat:valueOf("mdNightFloat"),
    dayRoof:valueOf("mdDayRoof"),
    dayBath:valueOf("mdDayBath"),
    dayPump:valueOf("mdDayPump"),
    dayFloat:valueOf("mdDayFloat")
  };
  await setSetting("masterData",md);
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
  for(const [prefix] of stateIds()){
    const s=$(prefix+"_state");
    if(s){ s.dataset.touched="0"; setStateUI(prefix,"",false); }
  }
  updateActionUI();
  updateElapsedSinceMeasurement();
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
function numericValueOf(id){
  const raw=valueOf(id);
  if(raw==="") return "";
  return raw.replaceAll("−","-").replace(",",".");
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
    for(const h of ["Innendach","fCl_Status","Wasseroptik"]) rec[h]=valueOf(h);
    for(const h of ["Wasserlinie","Wassertemperatur","Außentemperatur","fCl","CYA","TA","pH"]) rec[h]=numericValueOf(h);
    rec["Dach_Offen_h"]=intervalValueFromState("Dach_Offen");
    rec["Badebetrieb_h"]=intervalValueFromState("Badebetrieb");
    rec["Chlorschwimmer_h"]=intervalValueFromState("Chlorschwimmer");
    rec["Pumpe_h"]=intervalValueFromState("Pumpe");
  } else if(action==="Chlorung"){
    rec["CHC_g"]=numericValueOf("CHC_g");
  } else if(action==="Reinigung"){
    rec["Reinigungsart"]=valueOf("Reinigungsart");
  } else if(action==="Wasserfüllung"){
    rec["Wasserlinie"]=numericValueOf("WasserlinieOther");
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
  if(rec.Aktion==="Messung" && Number.isFinite(currentInterval.hours)){
    for(const k of ["Dach_Offen_h","Badebetrieb_h","Chlorschwimmer_h","Pumpe_h"]){
      if(rec[k]!=="" && Number(rec[k])>currentInterval.hours+0.05) return `${k} kann nicht länger als das Messintervall sein.`;
    }
  }
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
    Wasseroptik:"Wasseroptik",Notiz:"Notiz"
  };
  for(const [k,id2] of Object.entries(mapping)) if($(id2)) $(id2).value=r[k]??"";
  if(r.Aktion==="Wasserfüllung") $("WasserlinieOther").value=r.Wasserlinie??"";
  await updateElapsedSinceMeasurement();

  for(const [prefix] of stateIds()){
    const raw=r[prefix+"_h"];
    let state="";
    if(raw!==null && raw!==undefined && String(raw)!==""){
      const n=Number(raw);
      if(Number.isFinite(n)){
        if(Math.abs(n)<0.001) state="zero";
        else if(Number.isFinite(currentInterval.hours) && Math.abs(n-currentInterval.hours)<=0.08) state="full";
        else state="partial";
      }
    }
    setStateUI(prefix,state,false);
    const s=$(prefix+"_state");
    if(s) s.dataset.touched="1";
    if(state==="partial" && $(prefix+"_h")) $(prefix+"_h").value=raw;
  }

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

async function exportRangeCSV(){
  const from=valueOf("exportFrom");
  const to=valueOf("exportTo");
  if(!from || !to){ toast("Bitte Von- und Bis-Datum wählen."); return; }
  if(from>to){ toast("Von-Datum liegt nach Bis-Datum."); return; }

  let rows=await getAllRecords();
  rows=rows.filter(r=>r.Datum && r.Datum>=from && r.Datum<=to);
  rows.sort((a,b)=>a._id-b._id);

  $("rangeExportInfo").textContent=`${rows.length} Ereignis${rows.length===1?"":"se"} im gewählten Zeitraum`;
  if(!rows.length){ toast("Keine Ereignisse in diesem Zeitraum."); return; }

  const lines=[HEADERS.map(csvEscape).join(";")];
  for(const r of rows) lines.push(HEADERS.map(h=>csvEscape(r[h])).join(";"));
  const suffix=from===to ? from : `${from}_bis_${to}`;
  download("\\ufeff"+lines.join("\\r\\n"),`Pool_Masterdaten_${suffix}.csv`,"text/csv;charset=utf-8");
}

async function exportJSON(){
  const rows=await getAllRecords();
  rows.sort((a,b)=>a._id-b._id);
  const masterData=await getSetting("masterData");
  download(
    JSON.stringify({
      version:2,
      appVersion:APP_VERSION,
      exportedAt:new Date().toISOString(),
      headers:HEADERS,
      masterData:masterData || null,
      records:rows
    },null,2),
    `PoolLog_Backup_${localDateString()}.json`,
    "application/json"
  );
}

function download(content,filename,type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function updateRangeExportInfo(){
  const info=$("rangeExportInfo");
  if(!info || !db) return;
  const from=valueOf("exportFrom"), to=valueOf("exportTo");
  if(!from || !to){ info.textContent=""; return; }
  if(from>to){ info.textContent="Von-Datum liegt nach Bis-Datum."; return; }
  const rows=await getAllRecords();
  const n=rows.filter(r=>r.Datum && r.Datum>=from && r.Datum<=to).length;
  info.textContent=`${n} Ereignis${n===1?"":"se"} im gewählten Zeitraum`;
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
    const r={};
    HEADERS.forEach(h=>r[h]=old[h]??"");
    store.add(r);
  }
  await new Promise((resolve,reject)=>{
    transaction.oncomplete=resolve;
    transaction.onerror=()=>reject(transaction.error);
  });

  if(obj.masterData){
    await setSetting("masterData",{...MASTER_DEFAULTS,...obj.masterData});
  }
}


document.querySelectorAll(".step-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const el=$(btn.dataset.target);
    const step=Number(btn.dataset.step);
    const raw=(el.value||"").replaceAll("−","-").replace(",",".").trim();
    const current=raw==="" ? 0 : Number(raw);
    el.value=String((Number.isFinite(current)?current:0)+step);
    el.dispatchEvent(new Event("input",{bubbles:true}));
  });
});

for(const id of ["Wasserlinie","WasserlinieOther","Wassertemperatur","Außentemperatur"]){
  $(id).addEventListener("input",e=>{
    e.target.value=e.target.value.replaceAll("−","-");
  });
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

$("Aktion").addEventListener("change",async()=>{
  updateActionUI();
  if(valueOf("Aktion")==="Messung") await updateElapsedSinceMeasurement();
});
$("Datum").addEventListener("change",updateElapsedSinceMeasurement);
$("Uhrzeit").addEventListener("change",updateElapsedSinceMeasurement);
for(const [prefix] of stateIds()){
  const select=$(prefix+"_state");
  if(!select) continue;
  select.addEventListener("change",()=>{
    select.dataset.touched="1";
    setStateUI(prefix,select.value,false);
  });
}
$("fCl").addEventListener("input",()=>{ if(valueOf("fCl")!=="") $("fCl_Status").value=""; });
$("fCl_Status").addEventListener("change",()=>{ if(valueOf("fCl_Status")!=="") $("fCl").value=""; });
$("cancelEditBtn").addEventListener("click",setDefaults);
$("showDataBtn").addEventListener("click",()=>switchView("dataView"));
$("backBtn").addEventListener("click",()=>switchView("entryView"));
$("menuBtn").addEventListener("click",()=>switchView("menuView"));
$("masterDataBtn").addEventListener("click",async()=>{
  await loadMasterData();
  switchView("masterDataView");
});
$("closeMasterDataBtn").addEventListener("click",()=>switchView("menuView"));
$("masterDataForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const day=valueOf("mdDayStart");
  const night=valueOf("mdNightStart");
  if(!day || !night){ toast("Tag- und Nachtbeginn bitte festlegen."); return; }
  if(day===night){ toast("Tag- und Nachtbeginn dürfen nicht identisch sein."); return; }
  const vol=valueOf("mdPoolVolume").replace(",",".");
  if(vol!=="" && (!Number.isFinite(Number(vol)) || Number(vol)<=0)){
    toast("Poolvolumen bitte prüfen."); return;
  }
  await saveMasterData();
  toast("Stammdaten gespeichert");
});
$("closeMenuBtn").addEventListener("click",()=>switchView("entryView"));
$("searchInput").addEventListener("input",()=>renderAllList());
$("exportCsvBtn").addEventListener("click",exportCSV);
$("exportRangeCsvBtn").addEventListener("click",exportRangeCSV);
$("exportFrom").addEventListener("change",updateRangeExportInfo);
$("exportTo").addEventListener("change",updateRangeExportInfo);
$("exportJsonBtn").addEventListener("click",exportJSON);

$("importCsvInput").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file) return;
  try{ await importCSV(file); await renderLists(); toast("CSV importiert"); }
  catch(err){ alert(err.message); }
  e.target.value="";
});
$("importJsonInput").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file) return;
  try{ await restoreJSON(file); await renderLists(); await updateElapsedSinceMeasurement(); toast("Backup wiederhergestellt"); }
  catch(err){ alert(err.message); }
  e.target.value="";
});

(async()=>{
  db=await openDB();
  $("appVersion").textContent="Version "+APP_VERSION;
  await seedIfEmpty();
  if(await getSetting("masterData")===null){
    await setSetting("masterData",MASTER_DEFAULTS);
  }
  setDefaults();
  $("exportFrom").value=localDateString();
  $("exportTo").value=localDateString();
  await renderLists();
  await updateElapsedSinceMeasurement();
  await updateRangeExportInfo();
  if("serviceWorker" in navigator && location.protocol!=="file:"){
    navigator.serviceWorker.register("service-worker.js").catch(()=>{});
  }
})();
