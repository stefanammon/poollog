import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const APP_VERSION = globalThis.FPL_VERSION || "Entwicklung";
const APP_LABEL = "FreePoolLog4U";
const SUPABASE_URL = "https://yxuobeqkxewznneqcpbz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77QwPv7tJrTenyrHGZHjWg_2UTuzVgk";
const SITE_URL = "https://stefanammon.github.io/poollog/";
const HEADERS = ["Kürzel", "Datum", "Uhrzeit", "Aktion", "Reinigungsarten", "Wasserlinie", "Wassertemperatur", "Außentemperatur", "Innendach", "fCl", "fCl_Status", "CYA", "TA", "pH", "Wasseroptik", "Dach_Offen_h", "Badebetrieb_h", "Chlorschwimmer_h", "Pumpe_h", "CHC_g", "Wasserpflegeart", "Produkt_Hersteller", "Produkt_Name", "Produktart", "Menge", "Einheit", "Mengenerfassung", "Wasseruhr_vorher_m3", "Wasseruhr_nachher_m3", "Wasserlinie_vorher_mm", "Wasserlinie_nach_Ablassen_mm", "Wasserlinie_nach_Auffuellen_mm", "Entferntes_Wasser_l", "Zugefuehrtes_Wasser_l", "Wasserstandsaenderung_cm", "Wassermenge_l", "Beckenbefund", "Notiz"];

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
let currentUser = null;
let currentPool = null;
let editingId = null;
let authBusy = false;
let recoveryMode = false;
let lastAutoRefreshAt = 0;
let products = [];

const $ = id => document.getElementById(id);
const form = $("entryForm");


const LEGAL_DOCS = {
  privacy:{title:"Datenschutz",template:"privacyTemplate"},
  imprint:{title:"Impressum",template:"imprintTemplate"},
  beta:{title:"Beta-Hinweise",template:"betaTemplate"}
};

function openLegalModal(kind){
  const doc=LEGAL_DOCS[kind];
  if(!doc) return;
  const template=$(doc.template);
  const content=$("legalModalContent");
  if(!template || !content) return;
  $("legalModalTitle").textContent=doc.title;
  content.replaceChildren(template.content.cloneNode(true));
  $("legalModal").classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(()=>$("closeLegalModalBtn")?.focus(),0);
}

function closeLegalModal(){
  $("legalModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function betaWelcomeStorageKey(){
  return currentUser?.id ? `fpl-beta-welcome-${APP_VERSION}-${currentUser.id}` : "";
}

function maybeShowBetaWelcome(){
  const key=betaWelcomeStorageKey();
  if(!key || localStorage.getItem(key)==="1") return;
  $("betaWelcomeModal")?.classList.remove("hidden");
  document.body.classList.add("modal-open");
  setTimeout(()=>$("betaWelcomeOkBtn")?.focus(),0);
}

function dismissBetaWelcome(){
  const key=betaWelcomeStorageKey();
  if(key) localStorage.setItem(key,"1");
  $("betaWelcomeModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function sendBetaFeedback(){
  const subject=`FreePoolLog4U Mini ${APP_VERSION} – Beta-Feedback`;
  const body=[
    "Hallo,",
    "",
    "mein Feedback zu FreePoolLog4U Mini:",
    "",
    "Was ist passiert / was sollte verbessert werden?",
    "",
    "",
    `Version: ${APP_VERSION}`,
    `Browser/Gerät: ${navigator.userAgent}`
  ].join("\n");
  location.href=`mailto:freepoollog4u@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

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

const DEFAULT_CLEANING_TYPES = ["Poolroboter","Boden saugen","Boden bürsten","Wände bürsten","Wasserlinie reinigen","Vorfilter reinigen","Filter rückspülen"];
let cleaningTypes = [];

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
    "Reinigungsarten":dbText(row.cleaning_type),
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
    cleaning_type:null,
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

async function getCleaningAssignments(){
  if(!currentPool) return [];
  const rows=[];
  const pageSize=1000;
  for(let from=0;;from+=pageSize){
    const {data,error}=await supabase
      .from("event_cleaning_types")
      .select("event_id,cleaning_type_id,cleaning_type_name")
      .eq("pool_id",currentPool.id)
      .order("id",{ascending:true})
      .range(from,from+pageSize-1);
    if(error) throw error;
    rows.push(...(data||[]));
    if(!data || data.length<pageSize) break;
  }
  return rows;
}

async function getCleaningAssignmentsForEvent(eventId){
  const {data,error}=await supabase
    .from("event_cleaning_types")
    .select("cleaning_type_id,cleaning_type_name")
    .eq("pool_id",currentPool.id)
    .eq("event_id",eventId)
    .order("id",{ascending:true});
  if(error) throw error;
  return data||[];
}

function attachCleaningAssignments(records,assignments){
  const byEvent=new Map();
  for(const item of assignments){
    const key=String(item.event_id);
    if(!byEvent.has(key)) byEvent.set(key,[]);
    byEvent.get(key).push({id:item.cleaning_type_id,name:String(item.cleaning_type_name||"").trim()});
  }
  for(const record of records){
    const items=(byEvent.get(String(record._id))||[]).filter(x=>x.name);
    record._cleaningTypes=items;
    if(items.length) record["Reinigungsarten"]=items.map(x=>x.name).join(" | ");
  }
  return records;
}

async function replaceCleaningAssignments(eventId,selectedIds){
  const ids=[...new Set((selectedIds||[]).map(String))];
  const selected=ids.map(id=>cleaningTypes.find(x=>String(x.id)===id)).filter(Boolean);
  const {error:deleteError}=await supabase
    .from("event_cleaning_types")
    .delete()
    .eq("pool_id",currentPool.id)
    .eq("event_id",eventId);
  if(deleteError) throw deleteError;
  if(!selected.length) return;
  const rows=selected.map(item=>({
    pool_id:currentPool.id,
    event_id:eventId,
    cleaning_type_id:item.id,
    cleaning_type_name:item.name
  }));
  const {error:insertError}=await supabase.from("event_cleaning_types").insert(rows);
  if(insertError) throw insertError;
}


const CARE_ACTION_LABELS = {
  chlor_add:"Chlor zufügen",
  ph_lower:"pH senken",
  ph_raise:"pH erhöhen",
  ta_lower:"TA senken",
  ta_raise:"TA erhöhen",
  water_exchange_partial:"Teilwasseraustausch",
  water_exchange_full:"Vollständiger Wasseraustausch"
};
const CARE_PRODUCT_TYPES = {
  chlor_add:"chlorine",
  ph_lower:"ph_minus",
  ph_raise:"ph_plus",
  ta_lower:"ta_minus",
  ta_raise:"ta_plus"
};
const UNIT_LABELS={g:"g",kg:"kg",ml:"ml",l:"l",m3:"m³",piece:"Stück"};
const PRODUCT_FORM_LABELS={granulate:"Granulat",powder:"Pulver",liquid:"Flüssigkeit",tablet:"Tablette",stick:"Stick",cartridge:"Kartusche"};
const PRODUCT_TYPE_LABELS={chlorine:"Chlorpräparat",ph_minus:"pH-Senker",ph_plus:"pH-Heber",ta_minus:"TA-Senker",ta_plus:"TA-Heber"};
const BASIN_APPEARANCE_LABELS={gray_brown:"grau/braun",green_yellow:"grün/gelb",black:"schwarz",whitish:"weißlich"};
const BASIN_BEHAVIOR_LABELS={dispersible:"aufwirbelnd",adherent:"festsitzend"};
const BASIN_LOCATION_LABELS={floor:"Boden",wall:"Wand",waterline:"Wasserlinie",steps:"Treppe",fixtures:"Einbauteile"};

function isWaterCareSelection(value){ return String(value||"").startsWith("Wasserpflege:"); }
function careActionFromSelection(value){ return isWaterCareSelection(value) ? String(value).split(":",2)[1] : ""; }
function actionSelectionForRecord(record){
  if(record?.Aktion==="Wasserpflege" && record?._waterCare?.care_action) return `Wasserpflege:${record._waterCare.care_action}`;
  return record?.Aktion || "Messung";
}

async function loadProducts(){
  if(!currentUser){ products=[]; renderProductSelect(); return; }
  const {data,error}=await supabase
    .from("products")
    .select("id,owner_user_id,manufacturer,product_name,product_type,form,default_unit,is_active")
    .eq("owner_user_id",currentUser.id)
    .order("is_active",{ascending:false})
    .order("manufacturer",{ascending:true})
    .order("product_name",{ascending:true});
  if(error) throw error;
  products=data||[];
  renderProductSelect();
  renderProductManager();
}

function renderProductSelect(selectedId=""){
  const select=$("WaterCareProduct");
  if(!select) return;
  const care=careActionFromSelection(valueOf("Aktion"));
  const expected=CARE_PRODUCT_TYPES[care];
  const matching=products.filter(p=>p.is_active && (!expected || p.product_type===expected));
  const selected=String(selectedId||select.value||"");
  select.replaceChildren();
  const empty=document.createElement("option"); empty.value=""; empty.textContent=matching.length ? "Produkt auswählen" : "Noch kein passendes Produkt angelegt"; select.append(empty);
  for(const p of matching){
    const opt=document.createElement("option");
    opt.value=p.id;
    opt.textContent=`${p.manufacturer} – ${p.product_name}`;
    if(String(p.id)===selected) opt.selected=true;
    select.append(opt);
  }
  updateUnitFromProduct();
}

function updateUnitFromProduct(){
  const p=products.find(x=>String(x.id)===valueOf("WaterCareProduct"));
  if(p && $("WaterCareUnit")) $("WaterCareUnit").value=p.default_unit || "g";
}

async function createProductFromForm(){
  const care=careActionFromSelection(valueOf("Aktion"));
  const productType=CARE_PRODUCT_TYPES[care];
  if(!productType){ toast("Für diese Maßnahme ist kein Produkt erforderlich."); return; }
  const manufacturer=valueOf("ProductManufacturer");
  const productName=valueOf("ProductName");
  if(!manufacturer || !productName){ toast("Hersteller und Produktname sind erforderlich."); return; }
  const payload={
    owner_user_id:currentUser.id,
    manufacturer,
    product_name:productName,
    product_type:productType,
    form:valueOf("ProductForm"),
    default_unit:valueOf("ProductUnit"),
    is_active:true
  };
  const {data,error}=await supabase.from("products").insert(payload).select("id").single();
  if(error) throw error;
  await loadProducts();
  renderProductSelect(data.id);
  $("WaterCareProduct").value=data.id;
  updateUnitFromProduct();
  $("productForm").classList.add("hidden");
  toast("Produkt gespeichert");
}

function productDisplayName(p){
  return `${p.manufacturer} – ${p.product_name}`;
}

function renderProductManager(){
  const list=$("productManagerList");
  if(!list) return;
  if(!products.length){
    const empty=document.createElement("p"); empty.className="hint"; empty.textContent="Noch keine Produkte angelegt."; list.replaceChildren(empty); return;
  }
  list.replaceChildren(...products.map(p=>{
    const row=document.createElement("div");
    row.className=`product-manager-row${p.is_active?"":" product-inactive"}`;
    const info=document.createElement("div");
    info.className="product-manager-info";
    const titleLine=document.createElement("div"); titleLine.className="product-title-line";
    const title=document.createElement("strong"); title.textContent=productDisplayName(p);
    const status=document.createElement("span"); status.className=`product-status ${p.is_active?"active":"inactive"}`; status.textContent=p.is_active?"Aktiv":"Deaktiviert";
    titleLine.append(title,status);
    const meta=document.createElement("span");
    meta.textContent=`${PRODUCT_TYPE_LABELS[p.product_type]||p.product_type} · ${PRODUCT_FORM_LABELS[p.form]||p.form} · ${UNIT_LABELS[p.default_unit]||p.default_unit}`;
    info.append(titleLine,meta);
    const actions=document.createElement("div"); actions.className="product-manager-actions";
    const edit=document.createElement("button"); edit.type="button"; edit.className="secondary compact-btn"; edit.textContent="Bearbeiten"; edit.addEventListener("click",()=>openProductEdit(p.id));
    const toggle=document.createElement("button"); toggle.type="button"; toggle.className="secondary compact-btn"; toggle.textContent=p.is_active?"Deaktivieren":"Aktivieren"; toggle.addEventListener("click",()=>toggleProductActive(p.id,!p.is_active).catch(showError));
    actions.append(edit,toggle); row.append(info,actions); return row;
  }));
}

function openProductManager(){
  $("productManager")?.classList.remove("hidden");
  $("productEditForm")?.classList.add("hidden");
  document.body.classList.add("modal-open");
  renderProductManager();
}

function closeProductManager(){
  $("productManager")?.classList.add("hidden");
  $("productEditForm")?.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function openProductEdit(productId){
  const p=products.find(x=>String(x.id)===String(productId));
  if(!p) return;
  $("EditProductId").value=p.id;
  $("EditProductManufacturer").value=p.manufacturer||"";
  $("EditProductName").value=p.product_name||"";
  $("EditProductType").value=p.product_type||"chlorine";
  $("EditProductForm").value=p.form||"granulate";
  $("EditProductUnit").value=p.default_unit||"g";
  $("productEditForm").classList.remove("hidden");
  $("EditProductManufacturer")?.focus();
}

async function saveProductEdit(){
  const id=valueOf("EditProductId");
  const manufacturer=valueOf("EditProductManufacturer");
  const productName=valueOf("EditProductName");
  if(!id || !manufacturer || !productName){ toast("Hersteller und Produktname sind erforderlich."); return; }
  const payload={
    manufacturer, product_name:productName, product_type:valueOf("EditProductType"),
    form:valueOf("EditProductForm"), default_unit:valueOf("EditProductUnit"), updated_at:new Date().toISOString()
  };
  const {error}=await supabase.from("products").update(payload).eq("id",id).eq("owner_user_id",currentUser.id);
  if(error) throw error;
  await loadProducts();
  $("productEditForm").classList.add("hidden");
  toast("Produkt geändert");
}

async function toggleProductActive(productId,isActive){
  const {error}=await supabase.from("products").update({is_active:isActive,updated_at:new Date().toISOString()}).eq("id",productId).eq("owner_user_id",currentUser.id);
  if(error) throw error;
  await loadProducts();
  toast(isActive?"Produkt aktiviert":"Produkt deaktiviert");
}

async function getWaterCareDetails(){
  if(!currentPool) return [];
  const {data,error}=await supabase
    .from("water_care_details")
    .select("*")
    .eq("pool_id",currentPool.id);
  if(error) throw error;
  return data||[];
}

function attachWaterCareDetails(records,details){
  const byEvent=new Map(details.map(x=>[String(x.event_id),x]));
  for(const r of records){
    const d=byEvent.get(String(r._id));
    if(!d) continue;
    r._waterCare=d;
    r["Wasserpflegeart"]=CARE_ACTION_LABELS[d.care_action]||d.care_action||"";
    r["Produkt_Hersteller"]=dbText(d.product_manufacturer_snapshot);
    r["Produkt_Name"]=dbText(d.product_name_snapshot);
    r["Produktart"]=dbText(d.product_type_snapshot);
    r["Menge"]=dbNumberText(d.amount);
    r["Einheit"]=dbText(d.unit);
    r["Mengenerfassung"]=dbText(d.water_exchange_method);
    r["Wasseruhr_vorher_m3"]=dbNumberText(d.meter_before_m3);
    r["Wasseruhr_nachher_m3"]=dbNumberText(d.meter_after_m3);
    r["Wasserlinie_vorher_mm"]=dbNumberText(d.waterline_before_mm);
    r["Wasserlinie_nach_Ablassen_mm"]=dbNumberText(d.waterline_after_drain_mm);
    r["Wasserlinie_nach_Auffuellen_mm"]=dbNumberText(d.waterline_after_refill_mm);
    r["Entferntes_Wasser_l"]=dbNumberText(d.removed_volume_l);
    r["Zugefuehrtes_Wasser_l"]=dbNumberText(d.added_volume_l);
    r["Wasserstandsaenderung_cm"]=dbNumberText(d.level_change_cm);
    r["Wassermenge_l"]=dbNumberText(d.calculated_volume_l);
  }
  return records;
}

async function replaceWaterCareDetail(eventId,detail){
  const {error:delError}=await supabase.from("water_care_details").delete().eq("pool_id",currentPool.id).eq("event_id",eventId);
  if(delError) throw delError;
  if(!detail) return;
  const payload={pool_id:currentPool.id,event_id:eventId,...detail};
  const {error}=await supabase.from("water_care_details").insert(payload);
  if(error) throw error;
}

async function getBasinFindings(){
  if(!currentPool) return [];
  const {data:findings,error}=await supabase.from("basin_findings").select("*").eq("pool_id",currentPool.id);
  if(error) throw error;
  const {data:locations,error:locError}=await supabase.from("basin_finding_locations").select("*").eq("pool_id",currentPool.id);
  if(locError) throw locError;
  const byFinding=new Map();
  for(const loc of locations||[]){
    const key=String(loc.basin_finding_id);
    if(!byFinding.has(key)) byFinding.set(key,[]);
    byFinding.get(key).push(loc.location);
  }
  return (findings||[]).map(f=>({...f,locations:byFinding.get(String(f.id))||[]}));
}

function basinFindingText(f){
  const locs=(f.locations||[]).map(x=>BASIN_LOCATION_LABELS[x]||x).join(", ");
  return [BASIN_APPEARANCE_LABELS[f.appearance]||f.appearance,BASIN_BEHAVIOR_LABELS[f.behavior]||f.behavior,locs].filter(Boolean).join(" · ");
}

function attachBasinFindings(records,findings){
  const byEvent=new Map();
  for(const f of findings){
    const key=String(f.event_id);
    if(!byEvent.has(key)) byEvent.set(key,[]);
    byEvent.get(key).push(f);
  }
  for(const r of records){
    const items=byEvent.get(String(r._id))||[];
    r._basinFindings=items;
    r["Beckenbefund"]=items.map(basinFindingText).join(" | ");
  }
  return records;
}

async function replaceBasinFindings(eventId,findings){
  const {error:delError}=await supabase.from("basin_findings").delete().eq("pool_id",currentPool.id).eq("event_id",eventId);
  if(delError) throw delError;
  for(const f of findings||[]){
    const {data,error}=await supabase.from("basin_findings").insert({
      pool_id:currentPool.id,event_id:eventId,appearance:f.appearance,behavior:f.behavior
    }).select("id").single();
    if(error) throw error;
    const locs=[...new Set(f.locations||[])];
    if(locs.length){
      const rows=locs.map(location=>({pool_id:currentPool.id,basin_finding_id:data.id,location}));
      const {error:locError}=await supabase.from("basin_finding_locations").insert(rows);
      if(locError) throw locError;
    }
  }
}

function createBasinFindingRow(value={}){
  const row=document.createElement("div"); row.className="basin-finding-row";
  const appearance=document.createElement("select"); appearance.className="basin-appearance";
  for(const [v,label] of Object.entries(BASIN_APPEARANCE_LABELS)){ const o=document.createElement("option"); o.value=v;o.textContent=label;appearance.append(o); }
  appearance.value=value.appearance||"gray_brown";
  const behavior=document.createElement("select"); behavior.className="basin-behavior";
  for(const [v,label] of Object.entries(BASIN_BEHAVIOR_LABELS)){ const o=document.createElement("option"); o.value=v;o.textContent=label;behavior.append(o); }
  behavior.value=value.behavior||"dispersible";
  const top=document.createElement("div"); top.className="two-col";
  const la=document.createElement("label");la.className="field";la.innerHTML="<span>Erscheinung</span>";la.append(appearance);
  const lb=document.createElement("label");lb.className="field";lb.innerHTML="<span>Verhalten</span>";lb.append(behavior);top.append(la,lb);
  const places=document.createElement("div");places.className="basin-location-list";
  const selected=new Set(value.locations||[]);
  for(const [v,label] of Object.entries(BASIN_LOCATION_LABELS)){
    const lab=document.createElement("label");lab.className="mini-check";
    const inp=document.createElement("input");inp.type="checkbox";inp.value=v;inp.checked=selected.has(v);
    lab.append(inp,document.createTextNode(label));places.append(lab);
  }
  const del=document.createElement("button");del.type="button";del.className="text-btn delete-config";del.textContent="Auffälligkeit entfernen";del.addEventListener("click",()=>row.remove());
  row.append(top,places,del);return row;
}

function renderBasinFindingsEditor(findings=[]){
  const box=$("basinFindingRows"); if(!box) return;
  box.replaceChildren(...(findings||[]).map(createBasinFindingRow));
  if((findings||[]).length===0) box.append(createBasinFindingRow());
}

function collectBasinFindings(){
  if(!$("HasBasinFinding")?.checked) return [];
  return [...document.querySelectorAll(".basin-finding-row")].map(row=>({
    appearance:row.querySelector(".basin-appearance")?.value||"",
    behavior:row.querySelector(".basin-behavior")?.value||"",
    locations:[...row.querySelectorAll('.basin-location-list input:checked')].map(x=>x.value)
  }));
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
  const records=rows.map(eventFromDb);
  const [assignments,waterCare,basinFindings]=await Promise.all([
    getCleaningAssignments(),getWaterCareDetails(),getBasinFindings()
  ]);
  attachCleaningAssignments(records,assignments);
  attachWaterCareDetails(records,waterCare);
  attachBasinFindings(records,basinFindings);
  return records;
}

async function getRecord(id){
  const {data,error}=await supabase
    .from("events")
    .select("*")
    .eq("id",id)
    .eq("pool_id",currentPool.id)
    .maybeSingle();
  if(error) throw error;
  if(!data) return null;
  const record=eventFromDb(data);
  const [assignments,waterCareRows,basinRows]=await Promise.all([
    getCleaningAssignmentsForEvent(id),
    supabase.from("water_care_details").select("*").eq("pool_id",currentPool.id).eq("event_id",id),
    getBasinFindings()
  ]);
  if(waterCareRows.error) throw waterCareRows.error;
  attachCleaningAssignments([record],assignments);
  attachWaterCareDetails([record],waterCareRows.data||[]);
  attachBasinFindings([record],(basinRows||[]).filter(x=>String(x.event_id)===String(id)));
  return record;
}

async function addRecord(record){
  const {data,error}=await supabase
    .from("events")
    .insert(eventToDb(record))
    .select("id")
    .single();
  if(error) throw error;
  if(record.Aktion==="Reinigung") await replaceCleaningAssignments(data.id,record._cleaningTypeIds||[]);
  await replaceWaterCareDetail(data.id,record._waterCare||null);
  await replaceBasinFindings(data.id,record._basinFindings||[]);
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
  if(record.Aktion==="Reinigung") await replaceCleaningAssignments(record._id,record._cleaningTypeIds||[]);
  else await replaceCleaningAssignments(record._id,[]);
  await replaceWaterCareDetail(record._id,record._waterCare||null);
  await replaceBasinFindings(record._id,record._basinFindings||[]);
}

async function deleteRecord(id){
  const {error}=await supabase
    .from("events")
    .delete()
    .eq("id",id)
    .eq("pool_id",currentPool.id);
  if(error) throw error;
}

async function loadCleaningTypes(){
  if(!currentPool){ cleaningTypes=[]; renderCleaningTypesConfig(); renderCleaningTypeSelect(); return; }
  const {data,error}=await supabase
    .from("pool_cleaning_types")
    .select("id,name,sort_order")
    .eq("pool_id",currentPool.id)
    .order("sort_order",{ascending:true})
    .order("name",{ascending:true});
  if(error) throw error;
  cleaningTypes=(data||[]).map(x=>({id:x.id,name:String(x.name||"").trim(),sort_order:x.sort_order||0})).filter(x=>x.name);
  if(cleaningTypes.length===0){
    const rows=DEFAULT_CLEANING_TYPES.map((name,i)=>({pool_id:currentPool.id,name,sort_order:i+1}));
    const seeded=await supabase.from("pool_cleaning_types").insert(rows).select("id,name,sort_order");
    if(seeded.error) throw seeded.error;
    cleaningTypes=(seeded.data||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  }
  renderCleaningTypesConfig();
  renderCleaningTypeSelect();
}

function selectedCleaningTypeIds(){
  return [...document.querySelectorAll('input[name="Reinigungsart"]:checked')].map(x=>x.value);
}

function renderCleaningTypeSelect(selectedIds=[]){
  const box=$("Reinigungsarten");
  if(!box) return;
  const selected=new Set((selectedIds||[]).map(String));
  box.replaceChildren(...cleaningTypes.map(item=>{
    const label=document.createElement("label");
    label.className="cleaning-choice";
    const input=document.createElement("input");
    input.type="checkbox";
    input.name="Reinigungsart";
    input.value=String(item.id);
    input.checked=selected.has(String(item.id));
    const text=document.createElement("span");
    text.textContent=item.name;
    label.append(input,text);
    return label;
  }));
  if(!cleaningTypes.length){
    const hint=document.createElement("p");
    hint.className="hint";
    hint.textContent="Lege zuerst in den Pool-Stammdaten mindestens eine Reinigungsart an.";
    box.append(hint);
  }
}

function renderCleaningTypesConfig(){
  const box=$("cleaningTypesList");
  if(!box) return;
  box.replaceChildren(...cleaningTypes.map((item,index)=>{
    const row=document.createElement("div"); row.className="config-row";
    const input=document.createElement("input"); input.type="text"; input.maxLength=60; input.value=item.name; input.dataset.cleaningId=item.id;
    input.setAttribute("aria-label",`Reinigungsart ${index+1}`);
    const del=document.createElement("button"); del.type="button"; del.className="text-btn delete-config"; del.textContent="Entfernen";
    del.addEventListener("click",async()=>{
      const {error}=await supabase.from("pool_cleaning_types").delete().eq("id",item.id).eq("pool_id",currentPool.id);
      if(error){ showError(error); return; }
      await loadCleaningTypes();
    });
    row.append(input,del); return row;
  }));
}

async function addCleaningType(){
  const input=$("newCleaningType");
  const name=(input.value||"").trim();
  if(!name){ toast("Bitte eine konkrete Reinigungsart eingeben."); return; }
  if(cleaningTypes.some(x=>x.name.toLocaleLowerCase("de-DE")===name.toLocaleLowerCase("de-DE"))){ toast("Diese Reinigungsart ist bereits vorhanden."); return; }
  const next=Math.max(0,...cleaningTypes.map(x=>Number(x.sort_order)||0))+1;
  const {error}=await supabase.from("pool_cleaning_types").insert({pool_id:currentPool.id,name,sort_order:next});
  if(error){ showError(error); return; }
  input.value=""; await loadCleaningTypes();
}

async function saveCleaningTypeEdits(){
  const inputs=[...document.querySelectorAll("[data-cleaning-id]")];
  const names=inputs.map(x=>x.value.trim());
  if(names.some(x=>!x)) throw new Error("Reinigungsarten dürfen nicht leer sein. Entferne nicht benötigte Einträge stattdessen.");
  const lower=names.map(x=>x.toLocaleLowerCase("de-DE"));
  if(new Set(lower).size!==lower.length) throw new Error("Jede Reinigungsart darf nur einmal vorkommen.");
  for(let i=0;i<inputs.length;i++){
    const item=cleaningTypes.find(x=>String(x.id)===String(inputs[i].dataset.cleaningId));
    if(item && item.name!==names[i]){
      const {error}=await supabase.from("pool_cleaning_types").update({name:names[i]}).eq("id",item.id).eq("pool_id",currentPool.id);
      if(error) throw error;
    }
  }
  await loadCleaningTypes();
}

async function loadMasterData(){
  const md=await getMasterData();
  await loadCleaningTypes();
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

function actorStorageKey(){
  if(!currentUser?.id || !currentPool?.id) return "";
  return `poollog_actor_code:${currentUser.id}:${currentPool.id}`;
}

function currentActorCode(){
  const key=actorStorageKey();
  return key ? (localStorage.getItem(key) || "").trim() : "";
}

async function ensureActorCodeForPool(){
  if(currentActorCode() || !currentPool) return;
  const {data,error}=await supabase
    .from("events")
    .select("actor_code,event_date,event_time,created_at")
    .eq("pool_id",currentPool.id)
    .not("actor_code","is",null)
    .order("event_date",{ascending:false})
    .order("event_time",{ascending:false,nullsFirst:false})
    .order("created_at",{ascending:false})
    .limit(1);
  if(error) throw error;
  const actor=String(data?.[0]?.actor_code || "").trim();
  const key=actorStorageKey();
  if(actor && key) localStorage.setItem(key,actor);
}

function updatePoolIdentity(){
  if($("currentPoolName")) $("currentPoolName").textContent=currentPool?.name || "";
  if($("currentUserEmail")) $("currentUserEmail").textContent=currentUser?.email || "";

  const identity=$("poolIdentityTop");
  if(identity){
    if(currentPool){
      const actor=currentActorCode();
      identity.textContent=actor ? `${currentPool.name} · ${actor}` : currentPool.name;
      identity.classList.remove("hidden");
    }else{
      identity.textContent="";
      identity.classList.add("hidden");
    }
  }
}

function setDefaults(){
  form.reset();
  $("Aktion").value="Messung";
  $("Kürzel").value=currentActorCode();
  $("Datum").value=localDateString();
  $("Uhrzeit").value=localTimeString();
  editingId=null;
  $("saveBtn").textContent="Speichern";
  $("cancelEditBtn").classList.add("hidden");
  $("productForm")?.classList.add("hidden");
  if($("HasBasinFinding")) $("HasBasinFinding").checked=false;
  $("basinFindingsEditor")?.classList.add("hidden");
  renderBasinFindingsEditor([]);
  for(const [prefix] of stateIds()){
    const s=$(prefix+"_state");
    if(s){ s.dataset.touched="0"; setStateUI(prefix,"",false); }
  }
  updateActionUI();
  updateElapsedSinceMeasurement();
}

function updateWaterExchangeUI(){
  const method=valueOf("WaterExchangeMethod");
  const care=careActionFromSelection(valueOf("Aktion"));
  $("partialExchangeWaterlines")?.classList.toggle("hidden",care!=="water_exchange_partial");
  $("directVolumeFields")?.classList.toggle("hidden",method!=="direct_volume");
  $("meterFields")?.classList.toggle("hidden",method!=="water_meter");
}

async function prefillPartialExchangeWaterline(){
  if(!currentPool || careActionFromSelection(valueOf("Aktion"))!=="water_exchange_partial") return;
  if(valueOf("WaterlineBeforeMm")!=="") return;
  const {data,error}=await supabase
    .from("events")
    .select("waterline_mm,event_date,event_time,action")
    .eq("pool_id",currentPool.id)
    .not("waterline_mm","is",null)
    .order("event_date",{ascending:false})
    .order("event_time",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error) return;
  const hint=$("waterlinePrefillHint");
  if(data && data.waterline_mm!==null && data.waterline_mm!==undefined){
    $("WaterlineBeforeMm").value=String(data.waterline_mm);
    if(hint) hint.textContent=`Zuletzt erfasste Wasserlinie (${data.event_date}${data.event_time ? " · "+String(data.event_time).slice(0,5) : ""}): ${data.waterline_mm} mm. Bitte vor dem Ablassen prüfen bzw. korrigieren.`;
  } else if(hint){
    hint.textContent="Keine frühere Wasserlinie gefunden. Bitte den aktuellen Wert vor dem Ablassen eintragen.";
  }
}

function updateActionUI(){
  const action=valueOf("Aktion");
  const care=careActionFromSelection(action);
  const isCare=!!care;
  const isExchange=care==="water_exchange_partial" || care==="water_exchange_full";
  $("measurementBlock").classList.toggle("hidden", action!=="Messung");
  $("chlorBlock").classList.toggle("hidden", action!=="Chlorung");
  $("cleaningBlock").classList.toggle("hidden", action!=="Reinigung");
  $("otherBlock").classList.toggle("hidden", action!=="Wasserfüllung");
  $("waterCareBlock").classList.toggle("hidden", !isCare);
  if(isCare){
    $("waterCareTitle").textContent=CARE_ACTION_LABELS[care]||"Wasserpflege";
    $("productCareFields").classList.toggle("hidden",isExchange);
    $("waterExchangeFields").classList.toggle("hidden",!isExchange);
    // Die drei Wasserlinien sind beim Teilwasseraustausch Primärdaten.
    // Zusätzliche Mengenermittlung ist optional und bleibt standardmäßig leer.
    renderProductSelect();
    updateWaterExchangeUI();
  }
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
  const actionSelection=valueOf("Aktion");
  const careAction=careActionFromSelection(actionSelection);
  const rec={};
  HEADERS.forEach(h=>rec[h]="");
  rec["Kürzel"]=valueOf("Kürzel");
  rec["Datum"]=valueOf("Datum");
  rec["Uhrzeit"]=valueOf("Uhrzeit");
  rec["Aktion"]=careAction ? "Wasserpflege" : actionSelection;
  rec["Notiz"]=valueOf("Notiz");

  if(actionSelection==="Messung"){
    for(const h of ["Innendach","fCl_Status","Wasseroptik"]) rec[h]=valueOf(h);
    for(const h of ["Wasserlinie","Wassertemperatur","Außentemperatur","fCl","CYA","TA","pH"]) rec[h]=numericValueOf(h);
    rec["Dach_Offen_h"]=intervalValueFromState("Dach_Offen");
    rec["Badebetrieb_h"]=intervalValueFromState("Badebetrieb");
    rec["Chlorschwimmer_h"]=intervalValueFromState("Chlorschwimmer");
    rec["Pumpe_h"]=intervalValueFromState("Pumpe");
    rec._basinFindings=collectBasinFindings();
  } else if(actionSelection==="Chlorung"){
    rec["CHC_g"]=numericValueOf("CHC_g");
  } else if(actionSelection==="Reinigung"){
    rec._cleaningTypeIds=selectedCleaningTypeIds();
    rec["Reinigungsarten"]=rec._cleaningTypeIds
      .map(id=>cleaningTypes.find(x=>String(x.id)===String(id))?.name)
      .filter(Boolean)
      .join(" | ");
  } else if(actionSelection==="Wasserfüllung"){
    rec["Wasserlinie"]=numericValueOf("WasserlinieOther");
  } else if(careAction){
    const isExchange=careAction==="water_exchange_partial" || careAction==="water_exchange_full";
    if(isExchange){
      const method=valueOf("WaterExchangeMethod");
      const isPartial=careAction==="water_exchange_partial";
      const waterlineBefore=isPartial ? nullableNumber(valueOf("WaterlineBeforeMm")) : null;
      const waterlineAfterDrain=isPartial ? nullableNumber(valueOf("WaterlineAfterDrainMm")) : null;
      const waterlineAfterRefill=isPartial ? nullableNumber(valueOf("WaterlineAfterRefillMm")) : null;
      const directAmount=method==="direct_volume" ? nullableNumber(valueOf("WaterExchangeAmount")) : null;
      const directUnit=method==="direct_volume" ? nullableText(valueOf("WaterExchangeUnit")) : null;
      const addedDirectAmount=method==="direct_volume" ? nullableNumber(valueOf("WaterExchangeAddedAmount")) : null;
      const addedDirectUnit=method==="direct_volume" ? nullableText(valueOf("WaterExchangeAddedUnit")) : null;
      const meterBefore=method==="water_meter" ? nullableNumber(valueOf("MeterBefore")) : null;
      const meterAfter=method==="water_meter" ? nullableNumber(valueOf("MeterAfter")) : null;
      const removedLiters=(method==="direct_volume" && Number.isFinite(directAmount)) ? (directUnit==="m3" ? directAmount*1000 : directAmount) : null;
      let addedLiters=null;
      if(method==="direct_volume" && Number.isFinite(addedDirectAmount)) addedLiters=addedDirectUnit==="m3" ? addedDirectAmount*1000 : addedDirectAmount;
      if(method==="water_meter" && Number.isFinite(meterBefore) && Number.isFinite(meterAfter) && meterAfter>meterBefore) addedLiters=(meterAfter-meterBefore)*1000;
      // level_change_cm bleibt ausschließlich für bereits vorhandene Legacy-Datensätze erhalten.
      const legacyLevelChangeCm=null;
      if(isPartial && Number.isFinite(waterlineAfterRefill)) rec["Wasserlinie"]=String(waterlineAfterRefill);
      rec._waterCare={
        care_action:careAction,
        product_id:null,
        amount:directAmount,
        unit:directUnit,
        water_exchange_method:method || null,
        meter_before_m3:meterBefore,
        meter_after_m3:meterAfter,
        level_change_cm:legacyLevelChangeCm,
        calculated_volume_l:null,
        waterline_before_mm:waterlineBefore,
        waterline_after_drain_mm:waterlineAfterDrain,
        waterline_after_refill_mm:waterlineAfterRefill,
        removed_volume_l:removedLiters,
        added_volume_l:addedLiters
      };
    }else{
      rec._waterCare={
        care_action:careAction,
        product_id:valueOf("WaterCareProduct") || null,
        amount:nullableNumber(valueOf("WaterCareAmount")),
        unit:valueOf("WaterCareUnit") || null,
        water_exchange_method:null,
        meter_before_m3:null,meter_after_m3:null,level_change_cm:null,calculated_volume_l:null,
        waterline_before_mm:null,waterline_after_drain_mm:null,waterline_after_refill_mm:null,
        removed_volume_l:null,added_volume_l:null
      };
    }
  }
  if(editingId!==null) rec._id=editingId;
  return rec;
}

function validateRecord(rec){
  if(!rec.Datum) return "Datum fehlt.";
  if(!rec.Aktion) return "Aktion fehlt.";
  if(rec.Aktion==="Reinigung" && (!rec._cleaningTypeIds || rec._cleaningTypeIds.length===0)) return "Bitte mindestens eine Reinigungsart auswählen.";
  if(rec.Aktion==="Chlorung" && rec.CHC_g!=="" && Number(rec.CHC_g)<0) return "CHC_g darf nicht negativ sein.";
  if(rec.Aktion==="Wasserpflege"){
    const d=rec._waterCare;
    if(!d?.care_action) return "Wasserpflegeaktion fehlt.";
    const chemical=!!CARE_PRODUCT_TYPES[d.care_action];
    if(chemical && !d.product_id) return "Bitte ein Produkt auswählen oder anlegen.";
    if(chemical && (!Number.isFinite(Number(d.amount)) || Number(d.amount)<=0)) return "Bitte eine positive Menge eingeben.";
    if(chemical && !d.unit) return "Einheit fehlt.";
    if(d.care_action==="water_exchange_partial"){
      if(!Number.isFinite(Number(d.waterline_before_mm))) return "Bitte die Wasserlinie vor dem Ablassen eingeben.";
      if(!Number.isFinite(Number(d.waterline_after_drain_mm))) return "Bitte die Wasserlinie nach dem Ablassen eingeben.";
      if(!Number.isFinite(Number(d.waterline_after_refill_mm))) return "Bitte die Wasserlinie nach dem Auffüllen eingeben.";
      if(Number(d.waterline_after_drain_mm)>=Number(d.waterline_before_mm)) return "Die Wasserlinie nach dem Ablassen liegt nicht unter der Ausgangswasserlinie. Bitte Vorzeichen bzw. Eingabe prüfen.";
      if(Number(d.waterline_after_refill_mm)<=Number(d.waterline_after_drain_mm)) return "Die Wasserlinie nach dem Auffüllen liegt nicht über der Wasserlinie nach dem Ablassen. Bitte Vorzeichen bzw. Eingabe prüfen.";
    }
    if(d.water_exchange_method==="direct_volume" && (!Number.isFinite(Number(d.amount)) || Number(d.amount)<=0)) return "Bitte die abgelassene Wassermenge eingeben.";
    if(d.water_exchange_method==="water_meter" && (!Number.isFinite(Number(d.meter_before_m3)) || !Number.isFinite(Number(d.meter_after_m3)) || Number(d.meter_after_m3)<=Number(d.meter_before_m3))) return "Bitte die Wasseruhrstände prüfen.";
  }
  if(rec.Aktion==="Messung" && $("HasBasinFinding")?.checked && (!rec._basinFindings || rec._basinFindings.length===0)) return "Bitte mindestens eine Beckenauffälligkeit erfassen oder die Auswahl deaktivieren.";
  if(rec._basinFindings?.some(f=>!f.appearance || !f.behavior || !f.locations?.length)) return "Bitte bei jeder Beckenauffälligkeit mindestens einen Ort auswählen.";
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
  if(r.Aktion==="Wasserpflege" && r._waterCare){
    const d=r._waterCare;
    bits.push(CARE_ACTION_LABELS[d.care_action]||"Wasserpflege");
    if(d.product_name_snapshot) bits.push(`${d.product_manufacturer_snapshot||""} ${d.product_name_snapshot}`.trim());
    if(d.amount!==null && d.amount!==undefined) bits.push(`${d.amount} ${UNIT_LABELS[d.unit]||d.unit||""}`.trim());
    if(d.waterline_before_mm!==null && d.waterline_before_mm!==undefined && d.waterline_after_drain_mm!==null && d.waterline_after_drain_mm!==undefined && d.waterline_after_refill_mm!==null && d.waterline_after_refill_mm!==undefined){
      const signed=v=>{ const n=Number(v); return Number.isFinite(n) && n>0 ? `+${v}` : String(v); };
      bits.push(`Wasserlinie: vorher ${signed(d.waterline_before_mm)} mm → nach Ablassen ${signed(d.waterline_after_drain_mm)} mm → nach Auffüllen ${signed(d.waterline_after_refill_mm)} mm`);
    } else if(d.water_exchange_method==="water_level" && d.level_change_cm!==null) {
      bits.push(`Legacy-Absenkung ${d.level_change_cm} cm`);
    }
    if(d.removed_volume_l!==null && d.removed_volume_l!==undefined) bits.push(`${d.removed_volume_l} l entfernt`);
    if(d.water_exchange_method==="water_meter" && d.meter_before_m3!==null && d.meter_after_m3!==null){
      const added=d.added_volume_l!==null && d.added_volume_l!==undefined ? ` · ${d.added_volume_l} l zugeführt` : "";
      bits.push(`Wasseruhr ${d.meter_before_m3} → ${d.meter_after_m3} m³${added}`);
    } else if(d.added_volume_l!==null && d.added_volume_l!==undefined) {
      bits.push(`${d.added_volume_l} l zugeführt`);
    }
  }
  if(r.Wasserlinie!=="" && !(r.Aktion==="Wasserpflege" && r._waterCare?.waterline_after_refill_mm!==null && r._waterCare?.waterline_after_refill_mm!==undefined)) bits.push(`Wasserlinie ${r.Wasserlinie} mm`);
  if(r.Wassertemperatur!=="") bits.push(`Wasser ${r.Wassertemperatur} °C`);
  if(r.Außentemperatur!=="") bits.push(`Außen ${r.Außentemperatur} °C`);
  if(r.Innendach) bits.push(`Innendach ${r.Innendach}`);
  if(r.fCl!=="") bits.push(`fCl ${r.fCl}`);
  if(r.fCl_Status) bits.push(`fCl ${r.fCl_Status}`);
  if(r.pH!=="") bits.push(`pH ${r.pH}`);
  if(r.TA!=="") bits.push(`TA ${r.TA}`);
  if(r.CYA!=="") bits.push(`CYA ${r.CYA}`);
  if(r.Wasseroptik) bits.push(`Optik ${r.Wasseroptik}`);
  if(r.Dach_Offen_h!=="") bits.push(`Dach offen ${r.Dach_Offen_h} h`);
  if(r.Badebetrieb_h!=="") bits.push(`Badebetrieb ${r.Badebetrieb_h} h`);
  if(r.Pumpe_h!=="") bits.push(`Pumpe ${r.Pumpe_h} h`);
  if(r.Chlorschwimmer_h!=="") bits.push(`Chlorschwimmer ${r.Chlorschwimmer_h} h`);
  if(r.CHC_g!=="") bits.push(`${r.CHC_g} g CHC`);
  if(r.Reinigungsarten) bits.push(r.Reinigungsarten);
  if(r.Beckenbefund) bits.push(r.Beckenbefund);
  if(r.Notiz) bits.push(r.Notiz);
  return bits.join(" · ") || "Keine weiteren Angaben";
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

function measurementCell(value,suffix=""){
  const td=document.createElement("td");
  td.textContent=(value===null || value===undefined || String(value)==="") ? "–" : `${value}${suffix}`;
  return td;
}

function renderMeasurementHistory(rows){
  const body=$("measurementHistoryBody");
  if(!body) return;
  const historyFields=["fCl","pH","TA","CYA","Wasserlinie","Wassertemperatur","Außentemperatur","Wasseroptik"];
  const effectiveValue=(r,k)=>{
    if(k==="Wasserlinie" && r._waterCare?.waterline_after_refill_mm!==null && r._waterCare?.waterline_after_refill_mm!==undefined) return r._waterCare.waterline_after_refill_mm;
    return r[k];
  };
  const measurements=(rows||[])
    .filter(r=>historyFields.some(k=>{ const v=effectiveValue(r,k); return v!==null && v!==undefined && String(v)!==""; }))
    .sort(compareRecordsDesc).slice(0,12);
  if(!measurements.length){
    const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=10;td.className="history-empty";td.textContent="Noch keine Messwerte vorhanden.";tr.append(td);body.replaceChildren(tr);return;
  }
  body.replaceChildren(...measurements.map(r=>{
    const tr=document.createElement("tr");
    tr.append(
      measurementCell(formatGermanDate(r.Datum)),measurementCell(r.Uhrzeit),measurementCell(r.fCl),measurementCell(r.pH),measurementCell(r.TA),measurementCell(r.CYA),measurementCell(effectiveValue(r,"Wasserlinie"),String(effectiveValue(r,"Wasserlinie")??"")!==""?" mm":""),measurementCell(r.Wassertemperatur,r.Wassertemperatur!==""?" °C":""),measurementCell(r.Außentemperatur,r.Außentemperatur!==""?" °C":""),measurementCell(r.Wasseroptik)
    );
    return tr;
  }));
}

async function renderLists(){
  let rows=await getAllRecords();
  rows.sort(compareRecordsDesc);
  $("recentList").replaceChildren(...rows.slice(0,7).map(recordCard));
  $("recordCount").textContent=rows.length.toLocaleString("de-DE");
  renderMeasurementHistory(rows);
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
  $("Aktion").value=actionSelectionForRecord(r);
  $("Datum").value=r.Datum || localDateString();
  $("Uhrzeit").value=r.Uhrzeit || "";
  $("Kürzel").value=r.Kürzel ?? "";
  updateActionUI();
  const mapping={
    CHC_g:"CHC_g",Wasserlinie:"Wasserlinie",
    Wassertemperatur:"Wassertemperatur",Außentemperatur:"Außentemperatur",
    Innendach:"Innendach",fCl:"fCl",fCl_Status:"fCl_Status",CYA:"CYA",TA:"TA",pH:"pH",
    Wasseroptik:"Wasseroptik",Notiz:"Notiz"
  };
  for(const [k,id2] of Object.entries(mapping)) if($(id2)) $(id2).value=r[k]??"";
  if(r.Aktion==="Reinigung"){
    const ids=(r._cleaningTypes||[]).map(x=>x.id).filter(x=>x!==null && x!==undefined);
    renderCleaningTypeSelect(ids);
  }
  if(r.Aktion==="Wasserfüllung") $("WasserlinieOther").value=r.Wasserlinie??"";
  if(r.Aktion==="Wasserpflege" && r._waterCare){
    const d=r._waterCare;
    renderProductSelect(d.product_id||"");
    if($("WaterCareProduct")) $("WaterCareProduct").value=d.product_id||"";
    if($("WaterCareAmount")) $("WaterCareAmount").value=d.amount??"";
    if($("WaterCareUnit")) $("WaterCareUnit").value=d.unit||"g";
    if($("WaterExchangeMethod")) $("WaterExchangeMethod").value=d.water_exchange_method||"";
    if($("WaterExchangeAmount")) $("WaterExchangeAmount").value=d.amount??"";
    if($("WaterExchangeUnit")) $("WaterExchangeUnit").value=d.unit||"l";
    if($("MeterBefore")) $("MeterBefore").value=d.meter_before_m3??"";
    if($("MeterAfter")) $("MeterAfter").value=d.meter_after_m3??"";
    if($("LevelChangeCm")) $("LevelChangeCm").value=d.level_change_cm??"";
    if($("WaterlineBeforeMm")) $("WaterlineBeforeMm").value=d.waterline_before_mm??"";
    if($("WaterlineAfterDrainMm")) $("WaterlineAfterDrainMm").value=d.waterline_after_drain_mm??"";
    if($("WaterlineAfterRefillMm")) $("WaterlineAfterRefillMm").value=d.waterline_after_refill_mm??"";
    if($("WaterExchangeAddedAmount")) $("WaterExchangeAddedAmount").value=d.added_volume_l??"";
    if($("WaterExchangeAddedUnit")) $("WaterExchangeAddedUnit").value="l";
    updateWaterExchangeUI();
  }
  if(r.Aktion==="Messung" && (r._basinFindings||[]).length){
    $("HasBasinFinding").checked=true;
    $("basinFindingsEditor").classList.remove("hidden");
    renderBasinFindingsEditor(r._basinFindings);
  }
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
  await loadProducts();
  download(
    JSON.stringify({
      version:3,
      appVersion:APP_VERSION,
      exportedAt:new Date().toISOString(),
      headers:HEADERS,
      masterData,
      products,
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

for(const id of ["Wasserlinie","WasserlinieOther","Wassertemperatur","Außentemperatur","WaterlineBeforeMm","WaterlineAfterDrainMm","WaterlineAfterRefillMm"]){
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
    if(rec.Kürzel){
      const key=actorStorageKey();
      if(key) localStorage.setItem(key,rec.Kürzel);
      updatePoolIdentity();
    }
    if(editingId===null) await addRecord(rec); else await putRecord(rec);
    const msg=editingId===null ? "Zentral gespeichert" : "Änderung zentral gespeichert";
    setDefaults(); await renderLists(); toast(msg);
    window.scrollTo({top:0,behavior:"smooth"});
  }catch(err){ showError(err); }
});

$("Aktion").addEventListener("change",async()=>{
  updateActionUI();
  if(valueOf("Aktion")==="Messung") await updateElapsedSinceMeasurement();
  if(careActionFromSelection(valueOf("Aktion"))==="water_exchange_partial") await prefillPartialExchangeWaterline();
});
$("WaterCareProduct")?.addEventListener("change",updateUnitFromProduct);
$("WaterExchangeMethod")?.addEventListener("change",updateWaterExchangeUI);
$("toggleProductFormBtn")?.addEventListener("click",()=>$("productForm").classList.toggle("hidden"));
$("cancelProductBtn")?.addEventListener("click",()=>$("productForm").classList.add("hidden"));
$("saveProductBtn")?.addEventListener("click",()=>createProductFromForm().catch(showError));
$("manageProductsBtn")?.addEventListener("click",openProductManager);
$("closeProductManagerBtn")?.addEventListener("click",closeProductManager);
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !$("productManager")?.classList.contains("hidden")) closeProductManager(); });
$("saveProductEditBtn")?.addEventListener("click",()=>saveProductEdit().catch(showError));
$("cancelProductEditBtn")?.addEventListener("click",()=>$("productEditForm")?.classList.add("hidden"));
$("HasBasinFinding")?.addEventListener("change",e=>{
  $("basinFindingsEditor").classList.toggle("hidden",!e.target.checked);
  if(e.target.checked && !$("basinFindingRows").children.length) renderBasinFindingsEditor([]);
});
$("addBasinFindingBtn")?.addEventListener("click",()=>$("basinFindingRows").append(createBasinFindingRow()));
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
$("showDataBtn").addEventListener("click",async()=>{
  try{ await renderLists(); }catch(err){ showError(err); }
  switchView("dataView");
});
$("backBtn").addEventListener("click",()=>switchView("entryView"));
$("menuBtn").addEventListener("click",()=>switchView("menuView"));
$("masterDataBtn").addEventListener("click",async()=>{
  try{
    await reloadCurrentPool();
    await loadMasterData();
    switchView("masterDataView");
  }catch(err){ showError(err); }
});
$("closeMasterDataBtn").addEventListener("click",()=>switchView("menuView"));
$("addCleaningTypeBtn").addEventListener("click",()=>addCleaningType().catch(showError));
$("newCleaningType").addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); addCleaningType().catch(showError); } });
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
    await saveCleaningTypeEdits();
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
$("feedbackBtn").addEventListener("click",sendBetaFeedback);
document.querySelectorAll("[data-legal]").forEach(btn=>btn.addEventListener("click",()=>openLegalModal(btn.dataset.legal)));
$("closeLegalModalBtn").addEventListener("click",closeLegalModal);
$("legalModal").addEventListener("click",e=>{ if(e.target===$("legalModal")) closeLegalModal(); });
$("betaWelcomeOkBtn").addEventListener("click",dismissBetaWelcome);
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && !$("legalModal").classList.contains("hidden")) closeLegalModal(); });


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
  recoveryMode=false;
  currentPool=null;
  currentUser=null;
  $("menuBtn").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  updatePoolIdentity();
  switchView("authView");
  updateHeader();
}

function updateHeader(){
  if($("appNameTop")) $("appNameTop").textContent="FreePoolLog4U";
  if($("appVersionTop")) $("appVersionTop").textContent=`Mini Version ${APP_VERSION}`;
  updatePoolIdentity();
}

function showPasswordRecovery(){
  recoveryMode=true;
  $("menuBtn").classList.add("hidden");
  $("logoutBtn").classList.remove("hidden");
  switchView("passwordRecoveryView");
  updateHeader();
  setTimeout(()=>$("newPassword")?.focus(),0);
}

function recoveryRequestedByUrl(){
  const hash=String(location.hash || "");
  const query=String(location.search || "");
  return /(?:^|[&#?])type=recovery(?:&|$)/.test(hash) ||
         /(?:^|[&?])type=recovery(?:&|$)/.test(query);
}

function clearRecoveryUrl(){
  if(history?.replaceState){
    history.replaceState({},document.title,SITE_URL);
  }
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
    updateHeader();
    return false;
  }
  currentPool=data[0];
  await ensureActorCodeForPool();
  updatePoolIdentity();
  return true;
}

async function startAuthenticatedApp(){
  const ok=await loadCurrentPool();
  maybeShowBetaWelcome();
  if(!ok) return;
  $("menuBtn").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  switchView("entryView");
  updateHeader();
  await Promise.all([loadCleaningTypes(),loadProducts()]);
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
  if(recoveryMode || recoveryRequestedByUrl()){
    showPasswordRecovery();
    return;
  }
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
  $("registerBtn").disabled=true;
  $("registerBtn").textContent="Registrierung läuft …";
  setAuthMessage("Registrierung wird angelegt. Das kann einige Sekunden dauern …");
  const {data,error}=await supabase.auth.signUp({
    email,password,
    options:{emailRedirectTo:SITE_URL}
  });
  authBusy=false;
  $("registerBtn").disabled=false;
  $("registerBtn").textContent="Neu registrieren";
  if(error){ setAuthMessage(error.message,true); return; }
  if(data.session){
    currentUser=data.user;
    setAuthMessage("");
    await startAuthenticatedApp();
  }else{
    setAuthMessage("Fast geschafft! Wir haben Dir eine Bestätigungs-E-Mail geschickt. Öffne die E-Mail und bestätige Deine Adresse. Danach kannst Du Dich bei FreePoolLog4U anmelden.");
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
  const confirmPassword=valueOf("newPasswordConfirm");
  const msg=$("recoveryMessage");

  if(password.length<8){
    msg.textContent="Bitte ein Passwort mit mindestens 8 Zeichen wählen.";
    msg.classList.add("auth-error");
    return;
  }
  if(password!==confirmPassword){
    msg.textContent="Die beiden Passwörter stimmen nicht überein.";
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
  msg.textContent="Passwort geändert. Du kannst Dich jetzt mit dem neuen Passwort anmelden.";
  recoveryMode=false;
  clearRecoveryUrl();
  await supabase.auth.signOut();
  $("authPassword").value="";
  setAuthMessage("Passwort erfolgreich geändert. Bitte neu anmelden.");
  showAuth();
}

async function signOut(){
  recoveryMode=false;
  clearRecoveryUrl();
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

async function reloadCurrentPool(){
  if(!currentPool) return;
  const {data,error}=await supabase
    .from("pools")
    .select("*")
    .eq("id",currentPool.id)
    .single();
  if(error) throw error;
  currentPool=data;
  updatePoolIdentity();
}

async function refreshCentralData({force=false}={}){
  if(!currentUser || !currentPool || recoveryMode) return;
  const now=Date.now();
  if(!force && now-lastAutoRefreshAt<1500) return;
  lastAutoRefreshAt=now;

  try{
    await reloadCurrentPool();
    await loadProducts();
    await renderLists();
    await updateElapsedSinceMeasurement();
    await updateRangeExportInfo();
  }catch(err){
    console.error("Automatische Aktualisierung fehlgeschlagen",err);
  }
}

document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible") refreshCentralData();
});
window.addEventListener("focus",()=>refreshCentralData());

supabase.auth.onAuthStateChange((event,session)=>{
  if(event==="SIGNED_OUT"){
    if(!recoveryMode) showAuth();
    return;
  }
  if(event==="PASSWORD_RECOVERY"){
    currentUser=session?.user || currentUser;
    showPasswordRecovery();
    return;
  }
});

(async()=>{
  recoveryMode=recoveryRequestedByUrl();
  $("appNameTop").textContent=APP_LABEL;
  $("appVersion").textContent="Mini Version "+APP_VERSION;
  $("appVersionTop").textContent="Mini Version "+APP_VERSION;
  try{
    await refreshSession();
  }catch(err){
    showError(err);
    if(recoveryMode) showPasswordRecovery();
    else showAuth();
  }
  if("serviceWorker" in navigator && location.protocol!=="file:"){
    navigator.serviceWorker.register("service-worker.js").catch(console.error);
  }
})();


// Beta 3: branded opening screen. It is deliberately brief and never blocks app use.
function dismissSplash(){
  const splash=$("splashScreen");
  if(!splash) return;
  splash.classList.add("splash-hide");
  setTimeout(()=>splash.remove(),500);
}
window.addEventListener("load",()=>setTimeout(dismissSplash,1100),{once:true});
