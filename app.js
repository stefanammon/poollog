import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const APP_VERSION = "1.0.0-beta.1";
const APP_LABEL = "FreePoolLog4U Mini";
const SUPABASE_URL = "https://yxuobeqkxewznneqcpbz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77QwPv7tJrTenyrHGZHjWg_2UTuzVgk";
const SITE_URL = "https://stefanammon.github.io/poollog/";
const HEADERS = ["Kürzel", "Datum", "Uhrzeit", "Aktion", "Reinigungsart", "Wasserlinie", "Wassertemperatur", "Außentemperatur", "Innendach", "fCl", "fCl_Status", "CYA", "TA", "pH", "Wasseroptik", "Dach_Offen_h", "Badebetrieb_h", "Chlorschwimmer_h", "Pumpe_h", "CHC_g", "Notiz"];

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let currentUser = null;
let currentPool = null;
let editingId = null;
let authBusy = false;

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
  if(!currentPool) return {...MASTER_DEFAULTS};
  return poolToMasterData(currentPool);
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

function formatGermanDate(isoDate){
  const m=String(isoDate||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(isoDate||"");
}

async function updateElapsedSinceMeasurement(){
  const target=$("elapsedSinceMeasurement");
  const badge=$("intervalTypeBadge");
  const context=$("intervalContextText");
  if(!target || !currentPool) return;

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
    context.textContent="Es wurde keine frühere gespeicherte Messung gefunden. Deshalb kann für diesen Eintrag noch keine Zeitspanne bestimmt werden.";
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

  const almostZero=0.02;
  if(cls.type==="day"){
    badge.textContent=cls.nightHours<=almostZero ? "☀ vollständig tagsüber" : "☀ überwiegend tagsüber";
    badge.className="interval-badge day";
  }else if(cls.type==="night"){
    badge.textContent=cls.dayHours<=almostZero ? "🌙 vollständig nachts" : "🌙 überwiegend nachts";
    badge.className="interval-badge night";
  }else{
    badge.textContent="◐ gemischter Zeitraum";
    badge.className="interval-badge mixed";
  }

  const previousDate=formatGermanDate(last.r.Datum);
  const previousTime=last.r.Uhrzeit || "00:00";
  const span=formatHours(hours);
  const dayText=cls.dayHours.toLocaleString("de-DE",{maximumFractionDigits:1});
  const nightText=cls.nightHours.toLocaleString("de-DE",{maximumFractionDigits:1});
  context.innerHTML=`Die vorherige Messung war am <strong>${previousDate}</strong> um <strong>${previousTime} Uhr</strong>. Die folgenden Angaben beziehen sich auf die <strong>${span}</strong> zwischen dieser Messung und jetzt.<br><span class="interval-split">Davon tagsüber: ${dayText} h · nachts: ${nightText} h</span>`;

  await applyIntervalDefaults(false);
}

const MASTER_DEFAULTS = {
  poolName:"Mein Pool",
  poolVolume:"",
  dayStart:"07:00",
  nightStart:"21:00",
  nightRoof:"",
  nightBath:"",
  nightPump:"",
  nightFloat:"",
  dayRoof:"",
  dayBath:"",
  dayPump:"",
  dayFloat:""
};

function trimTime(value){
  const s=String(value??"");
  return s ? s.slice(0,5) : "";
}

function dbText(value){
  return value===null || value===undefined ? "" : String(value);
}

function dbNumberText(value){
  return value===null || value===undefined ? "" : String(value);
}

function nullableText(value){
  const s=String(value??"").trim();
  return s==="" ? null : s;
}

function nullableNumber(value){
  const s=String(value??"").trim().replaceAll("−","-").replace(",",".");
  if(s==="") return null;
  const n=Number(s);
  return Number.isFinite(n) ? n : null;
}

function eventFromDb(row){
  return {
    _id:row.id,
    _legacy_local_id:row.legacy_local_id,
    _created_at:row.created_at,
    "Kürzel":dbText(row.actor_code),
    "Datum":dbText(row.event_date),
    "Uhrzeit":trimTime(row.event_time),
    "Aktion":dbText(row.action),
    "Reinigungsart":dbText(row.cleaning_type),
    "Wasserlinie":dbNumberText(row.waterline_mm),
    "Wassertemperatur":dbNumberText(row.water_temp_c),
    "Außentemperatur":dbNumberText(row.air_temp_c),
    "Innendach":dbText(row.inner_roof),
    "fCl":dbNumberText(row.free_chlorine_mg_l),
    "fCl_Status":dbText(row.free_chlorine_status),
    "CYA":dbNumberText(row.cya_mg_l),
    "TA":dbNumberText(row.ta_mg_l),
    "pH":dbNumberText(row.ph),
    "Wasseroptik":dbText(row.water_appearance),
    "Dach_Offen_h":dbNumberText(row.roof_open_h),
    "Badebetrieb_h":dbNumberText(row.bathing_h),
    "Chlorschwimmer_h":dbNumberText(row.chlorine_float_h),
    "Pumpe_h":dbNumberText(row.pump_h),
    "CHC_g":dbNumberText(row.chc_g),
    "Notiz":dbText(row.note)
  };
}

function eventToDb(record){
  return {
    pool_id:currentPool.id,
    actor_code:nullableText(record["Kürzel"]),
    event_date:record["Datum"],
    event_time:nullableText(record["Uhrzeit"]),
    action:record["Aktion"],
    cleaning_type:nullableText(record["Reinigungsart"]),
    waterline_mm:nullableNumber(record["Wasserlinie"]),
    water_temp_c:nullableNumber(record["Wassertemperatur"]),
    air_temp_c:nullableNumber(record["Außentemperatur"]),
    inner_roof:nullableText(record["Innendach"]),
    free_chlorine_mg_l:nullableNumber(record["fCl"]),
    free_chlorine_status:nullableText(record["fCl_Status"]),
    cya_mg_l:nullableNumber(record["CYA"]),
    ta_mg_l:nullableNumber(record["TA"]),
    ph:nullableNumber(record["pH"]),
    water_appearance:nullableText(record["Wasseroptik"]),
    roof_open_h:nullableNumber(record["Dach_Offen_h"]),
    bathing_h:nullableNumber(record["Badebetrieb_h"]),
    chlorine_float_h:nullableNumber(record["Chlorschwimmer_h"]),
    pump_h:nullableNumber(record["Pumpe_h"]),
    chc_g:nullableNumber(record["CHC_g"]),
    note:nullableText(record["Notiz"])
  };
}

function poolToMasterData(pool){
  return {
    poolName:pool.name ?? "Mein Pool",
    poolVolume:pool.volume_m3===null || pool.volume_m3===undefined ? "" : String(pool.volume_m3),
    dayStart:trimTime(pool.day_start) || "07:00",
    nightStart:trimTime(pool.night_start) || "21:00",
    nightRoof:pool.night_roof_default ?? "",
    nightBath:pool.night_bath_default ?? "",
    nightPump:pool.night_pump_default ?? "",
    nightFloat:pool.night_float_default ?? "",
    dayRoof:pool.day_roof_default ?? "",
    dayBath:pool.day_bath_default ?? "",
    dayPump:pool.day_pump_default ?? "",
    dayFloat:pool.day_float_default ?? ""
  };
}

async function getAllRecords(){
  if(!currentPool) return [];
  const rows=[];
  const pageSize=1000;
  for(let from=0;;from+=pageSize){
    const {data,error}=await supabase
      .from("events")
      .select("*")
      .eq("pool_id",currentPool.id)
      .range(from,from+pageSize-1);
    if(error) throw error;
    rows.push(...(data||[]));
    if(!data || data.length<pageSize) break;
  }
  return rows.map(eventFromDb);
}

async function getRecord(id){
  const {data,error}=await supabase
    .from("events")
    .select("*")
    .eq("id",id)
    .eq("pool_id",currentPool.id)
    .maybeSingle();
  if(error) throw error;
  return data ? eventFromDb(data) : null;
}

async function addRecord(record){
  const {data,error}=await supabase
    .from("events")
    .insert(eventToDb(record))
    .select("id")
    .single();
  if(error) throw error;
  return data.id;
}

async function putRecord(record){
  const payload=eventToDb(record);
  const {error}=await supabase
    .from("events")
    .update(payload)
    .eq("id",record._id)
    .eq("pool_id",currentPool.id);
  if(error) throw error;
}

async function deleteRecord(id){
  const {error}=await supabase
    .from("events")
    .delete()
    .eq("id",id)
    .eq("pool_id",currentPool.id);
  if(error) throw error;
}

async function loadMasterData(){
  const md=await getMasterData();
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
  if(!currentPool) throw new Error("Kein Pool ausgewählt.");
  const payload={
    name:valueOf("mdPoolName"),
    volume_m3:nullableNumber(valueOf("mdPoolVolume")),
    day_start:valueOf("mdDayStart"),
    night_start:valueOf("mdNightStart"),
    night_roof_default:nullableText(valueOf("mdNightRoof")),
    night_bath_default:nullableText(valueOf("mdNightBath")),
    night_pump_default:nullableText(valueOf("mdNightPump")),
    night_float_default:nullableText(valueOf("mdNightFloat")),
    day_roof_default:nullableText(valueOf("mdDayRoof")),
    day_bath_default:nullableText(valueOf("mdDayBath")),
    day_pump_default:nullableText(valueOf("mdDayPump")),
    day_float_default:nullableText(valueOf("mdDayFloat"))
  };
  const {data,error}=await supabase
    .from("pools")
    .update(payload)
    .eq("id",currentPool.id)
    .select("*")
    .single();
  if(error) throw error;
  currentPool=data;
  updatePoolIdentity();
}

function compareRecordsAsc(a,b){
  const ad=`${a.Datum||""}T${a.Uhrzeit||"00:00"}`;
  const bd=`${b.Datum||""}T${b.Uhrzeit||"00:00"}`;
  if(ad!==bd) return ad.localeCompare(bd);
  const al=Number(a._legacy_local_id ?? 0), bl=Number(b._legacy_local_id ?? 0);
  if(al!==bl) return al-bl;
  return String(a._created_at||"").localeCompare(String(b._created_at||""));
}

function compareRecordsDesc(a,b){ return compareRecordsAsc(b,a); }

function updatePoolIdentity(){
  if($("currentPoolName")) $("currentPoolName").textContent=currentPool?.name || "";
  if($("currentUserEmail")) $("currentUserEmail").textContent=currentUser?.email || "";
}

function setDefaults(){
  form.reset();
  $("Aktion").value="Messung";
  $("Kürzel").value=localStorage.getItem("poollog_actor_code") || "";
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
  rows.sort(compareRecordsDesc);
  $("recentList").replaceChildren(...rows.slice(0,7).map(recordCard));
  $("recordCount").textContent=rows.length.toLocaleString("de-DE");
  renderAllList(rows);
}

function renderAllList(rowsOverride=null){
  const render = async()=>{
    let rows=rowsOverride || await getAllRecords();
    rows.sort(compareRecordsDesc);
    const q=valueOf("searchInput").toLowerCase();
    if(q) rows=rows.filter(r=>HEADERS.some(h=>String(r[h]??"").toLowerCase().includes(q)));
    $("allList").replaceChildren(...rows.map(recordCard));
  };
  render().catch(showError);
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
  rows.sort(compareRecordsAsc);
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
  rows.sort(compareRecordsAsc);

  $("rangeExportInfo").textContent=`${rows.length} Ereignis${rows.length===1?"":"se"} im gewählten Zeitraum`;
  if(!rows.length){ toast("Keine Ereignisse in diesem Zeitraum."); return; }

  const lines=[HEADERS.map(csvEscape).join(";")];
  for(const r of rows) lines.push(HEADERS.map(h=>csvEscape(r[h])).join(";"));
  const suffix=from===to ? from : `${from}_bis_${to}`;
  download("\ufeff"+lines.join("\r\n"),`Pool_Masterdaten_${suffix}.csv`,"text/csv;charset=utf-8");
}

async function exportJSON(){
  const rows=await getAllRecords();
  rows.sort(compareRecordsAsc);
  const masterData=await getMasterData();
  download(
    JSON.stringify({
      version:2,
      appVersion:APP_VERSION,
      exportedAt:new Date().toISOString(),
      headers:HEADERS,
      masterData,
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
  if(!info || !currentPool) return;
  const from=valueOf("exportFrom"), to=valueOf("exportTo");
  if(!from || !to){ info.textContent=""; return; }
  if(from>to){ info.textContent="Von-Datum liegt nach Bis-Datum."; return; }
  const rows=await getAllRecords();
  const n=rows.filter(r=>r.Datum && r.Datum>=from && r.Datum<=to).length;
  info.textContent=`${n} Ereignis${n===1?"":"se"} im gewählten Zeitraum`;
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
  try{
    if(rec.Kürzel) localStorage.setItem("poollog_actor_code",rec.Kürzel);
    if(editingId===null) await addRecord(rec); else await putRecord(rec);
    const msg=editingId===null ? "Zentral gespeichert" : "Änderung zentral gespeichert";
    setDefaults(); await renderLists(); toast(msg);
    window.scrollTo({top:0,behavior:"smooth"});
  }catch(err){ showError(err); }
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
  try{
    await saveMasterData();
    toast("Stammdaten zentral gespeichert");
  }catch(err){ showError(err); }
});
$("closeMenuBtn").addEventListener("click",()=>switchView("entryView"));
$("searchInput").addEventListener("input",()=>renderAllList());
$("exportCsvBtn").addEventListener("click",exportCSV);
$("exportRangeCsvBtn").addEventListener("click",exportRangeCSV);
$("exportFrom").addEventListener("change",updateRangeExportInfo);
$("exportTo").addEventListener("change",updateRangeExportInfo);
$("exportJsonBtn").addEventListener("click",exportJSON);


function showError(err){
  console.error(err);
  const msg=err?.message || String(err || "Unbekannter Fehler");
  toast("Fehler: "+msg);
}

function setAuthMessage(message,isError=false){
  const el=$("authMessage");
  if(!el) return;
  el.textContent=message || "";
  el.classList.toggle("auth-error",!!isError);
}

function showAuth(){
  currentPool=null;
  currentUser=null;
  $("menuBtn").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  switchView("authView");
  updateHeader("Anmelden");
}

function updateHeader(title){
  if($("screenTitle")) $("screenTitle").textContent=title;
  if($("appVersionTop")) $("appVersionTop").textContent=`Version ${APP_VERSION}`;
}

async function loadCurrentPool(){
  const {data,error}=await supabase
    .from("pools")
    .select("*")
    .order("created_at",{ascending:true});
  if(error) throw error;
  if(!data?.length){
    currentPool=null;
    $("menuBtn").classList.add("hidden");
    $("logoutBtn").classList.remove("hidden");
    switchView("onboardingView");
    updateHeader("Pool anlegen");
    return false;
  }
  currentPool=data[0];
  updatePoolIdentity();
  return true;
}

async function startAuthenticatedApp(){
  const ok=await loadCurrentPool();
  if(!ok) return;
  $("menuBtn").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  switchView("entryView");
  updateHeader("Neue Aktion");
  setDefaults();
  $("exportFrom").value=localDateString();
  $("exportTo").value=localDateString();
  await renderLists();
  await updateElapsedSinceMeasurement();
  await updateRangeExportInfo();
}

async function refreshSession(){
  const {data:{session},error}=await supabase.auth.getSession();
  if(error) throw error;
  if(!session){ showAuth(); return; }
  currentUser=session.user;
  await startAuthenticatedApp();
}

async function signIn(){
  if(authBusy) return;
  const email=valueOf("authEmail");
  const password=valueOf("authPassword");
  if(!email || !password){ setAuthMessage("E-Mail und Passwort eingeben.",true); return; }
  authBusy=true;
  setAuthMessage("Anmeldung läuft …");
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  authBusy=false;
  if(error){ setAuthMessage(error.message,true); return; }
  currentUser=data.user;
  setAuthMessage("");
  await startAuthenticatedApp();
}

async function signUp(){
  if(authBusy) return;
  const email=valueOf("authEmail");
  const password=valueOf("authPassword");
  if(!email || !password){ setAuthMessage("E-Mail und Passwort eingeben.",true); return; }
  if(password.length<8){ setAuthMessage("Bitte ein Passwort mit mindestens 8 Zeichen wählen.",true); return; }
  authBusy=true;
  setAuthMessage("Registrierung läuft …");
  const {data,error}=await supabase.auth.signUp({
    email,password,
    options:{emailRedirectTo:SITE_URL}
  });
  authBusy=false;
  if(error){ setAuthMessage(error.message,true); return; }
  if(data.session){
    currentUser=data.user;
    setAuthMessage("");
    await startAuthenticatedApp();
  }else{
    setAuthMessage("Registrierung angelegt. Bitte die Bestätigungs-E-Mail öffnen und anschließend hier anmelden.");
  }
}

async function resetPassword(){
  const email=valueOf("authEmail");
  if(!email){ setAuthMessage("Bitte zuerst die E-Mail-Adresse eingeben.",true); return; }
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:SITE_URL});
  if(error){ setAuthMessage(error.message,true); return; }
  setAuthMessage("E-Mail zum Zurücksetzen des Passworts wurde angefordert.");
}

async function updateRecoveredPassword(){
  const password=valueOf("newPassword");
  const msg=$("recoveryMessage");
  if(password.length<8){
    msg.textContent="Bitte ein Passwort mit mindestens 8 Zeichen wählen.";
    msg.classList.add("auth-error");
    return;
  }
  const {error}=await supabase.auth.updateUser({password});
  if(error){
    msg.textContent=error.message;
    msg.classList.add("auth-error");
    return;
  }
  msg.classList.remove("auth-error");
  msg.textContent="Passwort geändert.";
  setTimeout(()=>startAuthenticatedApp().catch(showError),500);
}

async function signOut(){
  await supabase.auth.signOut();
  showAuth();
}

async function createFirstPool(){
  const name=valueOf("newPoolName");
  const volume=valueOf("newPoolVolume").replace(",",".");
  if(!name){ toast("Poolbezeichnung fehlt."); return; }
  if(volume!=="" && (!Number.isFinite(Number(volume)) || Number(volume)<=0)){
    toast("Poolvolumen bitte prüfen."); return;
  }
  const {data,error}=await supabase
    .from("pools")
    .insert({
      owner_user_id:currentUser.id,
      name,
      volume_m3:volume==="" ? null : Number(volume),
      day_start:"07:00",
      night_start:"21:00"
    })
    .select("*")
    .single();
  if(error){ showError(error); return; }
  currentPool=data;
  await startAuthenticatedApp();
}

$("loginBtn").addEventListener("click",()=>signIn().catch(showError));
$("registerBtn").addEventListener("click",()=>signUp().catch(showError));
$("resetPasswordBtn").addEventListener("click",()=>resetPassword().catch(showError));
$("updatePasswordBtn").addEventListener("click",()=>updateRecoveredPassword().catch(showError));
$("logoutBtn").addEventListener("click",()=>signOut().catch(showError));
$("onboardingForm").addEventListener("submit",e=>{ e.preventDefault(); createFirstPool().catch(showError); });

supabase.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT") showAuth();
  if(event==="PASSWORD_RECOVERY"){
    currentUser=session?.user || currentUser;
    $("menuBtn").classList.add("hidden");
    $("logoutBtn").classList.remove("hidden");
    switchView("passwordRecoveryView");
    updateHeader("Passwort ändern");
  }
});

(async()=>{
  $("appNameTop").textContent=APP_LABEL;
  $("appVersion").textContent="Version "+APP_VERSION;
  $("appVersionTop").textContent="Version "+APP_VERSION;
  try{
    await refreshSession();
  }catch(err){
    showError(err);
    showAuth();
  }
  if("serviceWorker" in navigator && location.protocol!=="file:"){
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  }
})();
