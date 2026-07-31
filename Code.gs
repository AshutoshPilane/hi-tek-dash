/**
 * ============================================================
 * HI TEK PRODUCTION SYSTEM — Google Apps Script backend  v2
 * ============================================================
 * Adds: real downtime minutes, scoring, learning (rolling median),
 *       stock, powder, coil, challans.
 *
 * FIRST RUN
 *   1. Script Properties: add  SECRET = <any long random string>
 *   2. Run  setup()  once from the editor.
 *   3. Deploy > New deployment > Web app > Execute as Me > Anyone.
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const TOKEN_HOURS = 12;
const TZ = Session.getScriptTimeZone();

/* ================= schema ================= */
const SCHEMA = {
  Users:       ['Username','Password','Name','Role','WorkCentre','Lang','Active'],
  Projects:    ['ProjectID','Name','Division','Director','Customer','Address','Size','Qty','Unit',
                'PromisedDate','Stage','Blocker','Active'],
  /* TargetMin = what people are scored on (human-set).
     PlanMin   = what the scheduler uses (the system learns this).  Never merge them. */
  StdTimes:    ['Family','Operation','Grp','SetupMin','TargetMin','PlanMin','Samples','LastLearned'],
  WorkCentres: ['Name','Grp','Qty','HrsDay','Avail','Shifts'],
  Production:  ['Ts','Date','Session','Operator','ProjectID','Item','Operation','Grp',
                'Qty','Rework','EarnedMin','ElapsedMin'],
  Downtime:    ['ID','Date','Operator','WorkCentre','Reason','Fault','StartTs','EndTs','Minutes','Open'],
  Stock:       ['ItemID','Type','Thickness','Width','Length','Grade','Qty','Unit',
                'ReorderLevel','LeadDays','RatePerKg','Updated'],
  StockMoves:  ['Ts','Date','ItemID','Dir','Qty','ProjectID','By','Note'],
  Powder:      ['PowderID','Make','Shade','Finish','StockKg','ReorderKg','RatePerKg','SqftPerKg','Updated'],
  PowderMoves: ['Ts','Date','PowderID','Dir','Kg','ProjectID','By','Note'],
  Challans:    ['ChallanNo','Date','ProjectID','Customer','Address','Particulars','Qty',
                'Vehicle','Driver','By','Ts'],
  Scores:      ['Date','Operator','EarnedMin','AvailMin','OwnDownMin','PlantDownMin',
                'Qty','Rework','OutputPct','QualityPct','ReliabilityPct','Score'],
  LearnLog:    ['Ts','Family','Operation','Samples','OldPlanMin','NewPlanMin','ChangePct'],
  Config:      ['Key','Value']
};

const STAGES = ['Enquiry','Measurement','Design','Nesting','Laser Cutting','Cut to Length',
                'Bending','Fabrication','Grinding','Powder Coating','Assembly','Packing',
                'Dispatched','Installation','Complete'];
const STAGE_POS = {'Enquiry':1,'Measurement':2,'Design':3,'Nesting':4,'Laser Cutting':5,
  'Cut to Length':5,'Bending':6,'Fabrication':7,'Grinding':8,'Powder Coating':9,
  'Assembly':10,'Packing':11,'Dispatched':12,'Installation':13,'Complete':14};

/* Fault = plant  -> minutes leave the operator's denominator (not their fault)
   Fault = own    -> minutes stay against them                                   */
const REASONS = [
  ['D01','मटेरियल नाही','No material','plant'],
  ['D02','प्रोग्रॅम नाही','No program / nesting','plant'],
  ['D03','मागील प्रोसेस बाकी','Waiting previous process','plant'],
  ['D04','मशीन बिघाड','Machine breakdown','plant'],
  ['D05','टूल बदल','Tool / die change','own'],
  ['D06','पावडर रंग बदल','Powder colour change','own'],
  ['D07','लाईट गेली','Power cut','plant'],
  ['D08','ड्रॉइंग नाही','Waiting drawing','plant'],
  ['D09','हार्डवेअर नाही','Waiting hardware / glass','plant'],
  ['D10','क्वालिटी प्रॉब्लेम','Quality problem / rework','own'],
  ['D11','साफसफाई','Cleaning / maintenance','own'],
  ['D12','काम नाही','No work available','plant']
];

const DEFAULT_CONFIG = {
  quota_Rupali:'0.20', quota_Ashutosh:'0.20', quota_Mohit:'0.20',
  ceiling:'0.85', promise_buffer_pct:'0.20', promise_buffer_min_days:'2',
  cr_red:'1.0', cr_amber:'1.5', days_per_week:'6',
  size_S:'50', size_M:'300', size_L:'2000', size_XL:'8500',
  brake_min_per_week:'3510',
  shift_start:'09:00', lunch_start:'13:00', lunch_end:'13:30', shift_end:'18:00',
  scoring_live:'no',                 /* keep 'no' for 90 days */
  score_w_output:'0.50', score_w_quality:'0.30', score_w_reliability:'0.20',
  learn_min_samples:'20', learn_max_change:'0.25', learning_live:'yes'
};

/* ================= plumbing ================= */
function sheet_(n){ let s=SS.getSheetByName(n); if(!s){ s=SS.insertSheet(n); s.appendRow(SCHEMA[n]); } return s; }
function readAll_(n){
  const sh=sheet_(n), rows=sh.getDataRange().getValues();
  if(rows.length<2) return [];
  const head=rows.shift();
  return rows.filter(r=>String(r[0]).trim()!=='').map(r=>{const o={};head.forEach((h,i)=>o[h]=r[i]);return o;});
}
function append_(n,o){ const sh=sheet_(n); sh.appendRow(SCHEMA[n].map(h=>o[h]!==undefined?o[h]:'')); }
function upsert_(n,key,o){
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const sh=sheet_(n), head=SCHEMA[n], rows=sh.getDataRange().getValues(), kc=head.indexOf(key);
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][kc])===String(o[key])){
        head.forEach((h,c)=>{ if(o[h]!==undefined) rows[i][c]=o[h]; });
        sh.getRange(i+1,1,1,head.length).setValues([rows[i]]);
        return 'updated';
      }
    }
    sh.appendRow(head.map(h=>o[h]!==undefined?o[h]:''));
    return 'created';
  } finally{ lock.releaseLock(); }
}
function cfg_(){ const c={}; Object.keys(DEFAULT_CONFIG).forEach(k=>c[k]=DEFAULT_CONFIG[k]);
  readAll_('Config').forEach(r=>c[r.Key]=String(r.Value)); return c; }
function today_(){ return Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd'); }
function dstr_(d){ return Utilities.formatDate(new Date(d),TZ,'yyyy-MM-dd'); }
function session_(){ const c=cfg_(); return nowMin_() < hm_(c.lunch_start) ? 'AM':'PM'; }
function nowMin_(){ const d=new Date(); return d.getHours()*60+d.getMinutes(); }
function hm_(s){ const p=String(s).split(':'); return Number(p[0])*60+Number(p[1]||0); }
function uid_(p){ return p+'-'+Date.now()+'-'+Math.floor(Math.random()*1000); }
function median_(a){ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y), m=Math.floor(s.length/2);
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }

/* ================= auth ================= */
function secret_(){ const s=PropertiesService.getScriptProperties().getProperty('SECRET');
  if(!s) throw new Error('Set SECRET in Script Properties'); return s; }
function sign_(b){ return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(b,secret_())); }
function makeToken_(u){
  const exp=Date.now()+TOKEN_HOURS*3600*1000;
  const b=Utilities.base64EncodeWebSafe([u.Username,u.Role,u.WorkCentre||'',u.Name,exp].join('|'));
  return b+'.'+sign_(b);
}
function readToken_(t){
  if(!t||t.indexOf('.')<0) return null;
  const p=t.split('.'); if(sign_(p[0])!==p[1]) return null;
  const f=Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString().split('|');
  if(Number(f[4])<Date.now()) return null;
  return {username:f[0],role:f[1],workCentre:f[2],name:f[3]};
}
const CAN = {
  director:  ['bootstrap','tap','stopStart','stopEnd','saveProject','saveConfig','saveStdTime',
              'saveUser','stockMove','powderMove','challan','runScores','runLearning','money'],
  planner:   ['bootstrap','tap','stopStart','stopEnd','saveProject','saveStdTime','stockMove',
              'powderMove','challan','runScores','runLearning'],
  supervisor:['bootstrap','tap','stopStart','stopEnd','saveProject','stockMove','powderMove','challan'],
  operator:  ['bootstrap','tap','stopStart','stopEnd'],
  stores:    ['bootstrap','stockMove','powderMove'],
  office:    ['bootstrap','saveProject','challan'],
  accounts:  ['bootstrap','money']
};
function allowed_(r,a){ return (CAN[r]||[]).indexOf(a)>=0; }

/* ================= router ================= */
function doPost(e){
  let out;
  try{
    const q=JSON.parse(e.postData.contents), a=q.action;
    if(a==='LOGIN') out=login_(q);
    else{
      const s=readToken_(q.token);
      if(!s) out={status:'error',code:'AUTH',message:'Session expired. Please log in again.'};
      else if(!allowed_(s.role,a)) out={status:'error',code:'FORBIDDEN',message:'Your role cannot do that.'};
      else out=handle_(a,q,s);
    }
  }catch(err){ out={status:'error',message:String(err)}; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(){ return ContentService.createTextOutput(JSON.stringify({status:'success',data:{ok:1}}))
  .setMimeType(ContentService.MimeType.JSON); }
function ok_(d){ return {status:'success',data:d||{}}; }

function login_(q){
  const u=readAll_('Users').filter(x=>
    String(x.Username).toLowerCase()===String(q.username||'').toLowerCase() &&
    String(x.Password)===String(q.password||'') &&
    String(x.Active).toLowerCase()!=='no')[0];
  if(!u) return {status:'error',message:'Wrong username or password.'};
  return ok_({token:makeToken_(u),
    user:{name:u.Name,role:u.Role,workCentre:u.WorkCentre||'',lang:u.Lang||'en'}});
}
function handle_(a,q,s){
  switch(a){
    case 'bootstrap':   return ok_(bootstrap_(s));
    case 'tap':         return tap_(q,s);
    case 'stopStart':   return stopStart_(q,s);
    case 'stopEnd':     return stopEnd_(q,s);
    case 'stockMove':   return stockMove_(q,s);
    case 'powderMove':  return powderMove_(q,s);
    case 'challan':     return challan_(q,s);
    case 'runScores':   return ok_({rows:computeScores(q.date||today_())});
    case 'runLearning': return ok_({rows:runLearning()});
    case 'saveProject': upsert_('Projects','ProjectID',q.row); return ok_();
    case 'saveStdTime': upsert_('StdTimes','Family',q.row);    return ok_();
    case 'saveConfig':  upsert_('Config','Key',q.row);         return ok_();
    case 'saveUser':    upsert_('Users','Username',q.row);     return ok_();
    default: return {status:'error',message:'Unknown action '+a};
  }
}

/* ================= downtime with REAL minutes ================= */
/* Operator taps STOPPED -> row opens with a start time.
   Operator taps RESUMED -> row closes, minutes computed from the clock.
   Nobody types a number, so nobody guesses one.                        */
function stopStart_(q,s){
  const open=readAll_('Downtime').filter(d=>d.Operator===s.name && String(d.Open)==='yes')[0];
  if(open) return ok_({id:open.ID,already:true});
  const r=REASONS.filter(x=>x[0]===q.code||x[1]===q.reason)[0];
  const id=uid_('DT');
  append_('Downtime',{ID:id,Date:today_(),Operator:s.name,
    WorkCentre:q.workCentre||s.workCentre||'',Reason:r?r[1]:(q.reason||'Other'),
    Fault:r?r[3]:'plant',StartTs:new Date(),EndTs:'',Minutes:'',Open:'yes'});
  return ok_({id:id});
}
function stopEnd_(q,s){
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const sh=sheet_('Downtime'), head=SCHEMA.Downtime, rows=sh.getDataRange().getValues();
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][head.indexOf('Operator')])===s.name &&
         String(rows[i][head.indexOf('Open')])==='yes'){
        const start=new Date(rows[i][head.indexOf('StartTs')]);
        const mins=Math.max(0,Math.round((Date.now()-start.getTime())/60000));
        rows[i][head.indexOf('EndTs')]=new Date();
        rows[i][head.indexOf('Minutes')]=mins;
        rows[i][head.indexOf('Open')]='no';
        sh.getRange(i+1,1,1,head.length).setValues([rows[i]]);
        return ok_({minutes:mins});
      }
    }
    return ok_({minutes:0,none:true});
  } finally{ lock.releaseLock(); }
}
function openDowntime_(name){
  return readAll_('Downtime').filter(d=>d.Operator===name && String(d.Open)==='yes')[0]||null;
}

/* ================= production tap ================= */
/* EarnedMin  = qty x TargetMin   -> used for scoring
   ElapsedMin = real clock time   -> used for learning.  These must stay separate,
   otherwise the system learns from its own assumption and drifts forever.        */
function tap_(q,s){
  const std=readAll_('StdTimes').filter(t=>t.Family===q.family&&t.Operation===q.operation)[0];
  const target=std?Number(std.TargetMin)||0:0;
  const qty=Number(q.qty)||0, rework=Number(q.rework)||0;
  const c=cfg_();

  /* elapsed since this operator's previous tap today, or since shift start */
  const mine=readAll_('Production').filter(p=>p.Operator===s.name && dstr_(p.Date)===today_());
  let fromMs;
  if(mine.length) fromMs=new Date(mine[mine.length-1].Ts).getTime();
  else{ const d=new Date(); d.setHours(Math.floor(hm_(c.shift_start)/60),hm_(c.shift_start)%60,0,0);
        fromMs=d.getTime(); }
  let elapsed=Math.max(0,Math.round((Date.now()-fromMs)/60000));
  /* subtract downtime that closed inside that window */
  readAll_('Downtime').filter(d=>d.Operator===s.name && dstr_(d.Date)===today_() && d.EndTs)
    .forEach(d=>{ if(new Date(d.EndTs).getTime()>fromMs) elapsed-=Number(d.Minutes)||0; });
  /* subtract lunch if the window straddles it */
  const lunchLen=hm_(c.lunch_end)-hm_(c.lunch_start);
  const fromMin=new Date(fromMs).getHours()*60+new Date(fromMs).getMinutes();
  if(fromMin<hm_(c.lunch_start) && nowMin_()>hm_(c.lunch_end)) elapsed-=lunchLen;
  elapsed=Math.max(0,elapsed);

  append_('Production',{Ts:new Date(),Date:today_(),Session:session_(),Operator:s.name,
    ProjectID:q.projectID,Item:q.family,Operation:q.operation,Grp:std?std.Grp:'',
    Qty:qty,Rework:rework,EarnedMin:Math.round(qty*target*10)/10,ElapsedMin:elapsed});

  if(q.stage) upsert_('Projects','ProjectID',{ProjectID:q.projectID,Stage:q.stage});
  return ok_({earned:Math.round(qty*target*10)/10,elapsed:elapsed});
}

/* ================= stock, powder, coil ================= */
function stockMove_(q,s){
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const items=readAll_('Stock'), it=items.filter(x=>x.ItemID===q.itemID)[0];
    if(!it) return {status:'error',message:'Unknown stock item '+q.itemID};
    const qty=Number(q.qty)||0, dir=(q.dir==='IN')?1:-1;
    const now=Number(it.Qty)||0, next=now+dir*qty;
    if(next<0) return {status:'error',message:'Only '+now+' left in stock.'};
    upsert_('Stock','ItemID',{ItemID:q.itemID,Qty:next,Updated:new Date()});
    append_('StockMoves',{Ts:new Date(),Date:today_(),ItemID:q.itemID,Dir:q.dir,
      Qty:qty,ProjectID:q.projectID||'',By:s.name,Note:q.note||''});
    const low = next <= (Number(it.ReorderLevel)||0);
    return ok_({qty:next,low:low,leadDays:Number(it.LeadDays)||0});
  } finally{ lock.releaseLock(); }
}
function powderMove_(q,s){
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const p=readAll_('Powder').filter(x=>x.PowderID===q.powderID)[0];
    if(!p) return {status:'error',message:'Unknown powder '+q.powderID};
    const kg=Number(q.kg)||0, dir=(q.dir==='IN')?1:-1;
    const next=(Number(p.StockKg)||0)+dir*kg;
    if(next<0) return {status:'error',message:'Only '+p.StockKg+' kg left.'};
    upsert_('Powder','PowderID',{PowderID:q.powderID,StockKg:Math.round(next*100)/100,Updated:new Date()});
    append_('PowderMoves',{Ts:new Date(),Date:today_(),PowderID:q.powderID,Dir:q.dir,
      Kg:kg,ProjectID:q.projectID||'',By:s.name,Note:q.note||''});
    return ok_({kg:Math.round(next*100)/100,
      low: next <= (Number(p.ReorderKg)||0),
      sqftLeft: Math.round(next*(Number(p.SqftPerKg)||50))});
  } finally{ lock.releaseLock(); }
}
function challan_(q,s){
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const all=readAll_('Challans');
    let max=0; all.forEach(c=>{ const n=parseInt(String(c.ChallanNo).replace(/\D/g,''),10);
      if(n>max) max=n; });
    const no=String(max+1);
    const p=readAll_('Projects').filter(x=>x.ProjectID===q.projectID)[0]||{};
    append_('Challans',{ChallanNo:no,Date:today_(),ProjectID:q.projectID,
      Customer:q.customer||p.Customer||p.Name||'',Address:q.address||p.Address||'',
      Particulars:q.particulars||'',Qty:Number(q.qty)||0,Vehicle:q.vehicle||'',
      Driver:q.driver||'',By:s.name,Ts:new Date()});
    if(q.markDispatched) upsert_('Projects','ProjectID',{ProjectID:q.projectID,Stage:'Dispatched'});
    return ok_({challanNo:no});
  } finally{ lock.releaseLock(); }
}

/* ================= scoring ================= */
/* Output uses minutes the operator could actually work.
   Plant-fault downtime leaves the denominator. That is the whole fairness design. */
function computeScores(date){
  const c=cfg_(), d=date||today_();
  const prod=readAll_('Production').filter(p=>dstr_(p.Date)===d);
  const down=readAll_('Downtime').filter(x=>dstr_(x.Date)===d && String(x.Open)!=='yes');
  const shiftMin=(hm_(c.shift_end)-hm_(c.shift_start))-(hm_(c.lunch_end)-hm_(c.lunch_start));
  const names={}; prod.forEach(p=>names[p.Operator]=1); down.forEach(x=>names[x.Operator]=1);

  const out=[];
  Object.keys(names).forEach(n=>{
    const mine=prod.filter(p=>p.Operator===n);
    const earned=mine.reduce((t,p)=>t+(Number(p.EarnedMin)||0),0);
    const qty=mine.reduce((t,p)=>t+(Number(p.Qty)||0),0);
    const rework=mine.reduce((t,p)=>t+(Number(p.Rework)||0),0);
    const dn=down.filter(x=>x.Operator===n);
    const plantDown=dn.filter(x=>x.Fault==='plant').reduce((t,x)=>t+(Number(x.Minutes)||0),0);
    const ownDown=dn.filter(x=>x.Fault!=='plant').reduce((t,x)=>t+(Number(x.Minutes)||0),0);
    const workable=Math.max(1,shiftMin-plantDown);
    const output=Math.min(1.3,earned/workable);
    const quality=qty>0?Math.max(0,(qty-rework)/qty):1;
    const firstTap=mine.length?new Date(mine[0].Ts):null;
    const onTime=firstTap ? ((firstTap.getHours()*60+firstTap.getMinutes())<=hm_(c.shift_start)+20?1:0.7) : 0;
    const reliability=mine.length?onTime:0;
    const score=(Number(c.score_w_output)*output+Number(c.score_w_quality)*quality+
                 Number(c.score_w_reliability)*reliability)*100;
    const row={Date:d,Operator:n,EarnedMin:Math.round(earned),AvailMin:shiftMin,
      OwnDownMin:ownDown,PlantDownMin:plantDown,Qty:qty,Rework:rework,
      OutputPct:Math.round(output*100),QualityPct:Math.round(quality*100),
      ReliabilityPct:Math.round(reliability*100),Score:Math.round(score)};
    upsert_('Scores','Operator',row);   /* one live row per operator; history in Production */
    out.push(row);
  });
  return out;
}

/* ================= learning ================= */
/* Rolling MEDIAN of clean runs, not average. One three-hour breakdown must not
   move a standard time. Only PlanMin moves; TargetMin never does.               */
function runLearning(){
  const c=cfg_();
  if(String(c.learning_live).toLowerCase()!=='yes') return [];
  const need=Number(c.learn_min_samples)||20;
  const cap=Number(c.learn_max_change)||0.25;
  const prod=readAll_('Production').filter(p=>Number(p.Qty)>0 && Number(p.ElapsedMin)>0);
  const std=readAll_('StdTimes');
  const log=[];

  std.forEach(t=>{
    const runs=prod.filter(p=>p.Item===t.Family && p.Operation===t.Operation)
                   .slice(-200)
                   .map(p=>Number(p.ElapsedMin)/Number(p.Qty))
                   .filter(v=>isFinite(v)&&v>0);
    if(runs.length<need) return;
    const recent=runs.slice(-need);
    const med=median_(recent);
    const old=Number(t.PlanMin)||Number(t.TargetMin)||med;
    /* never let one learning pass move a time more than learn_max_change */
    const lo=old*(1-cap), hi=old*(1+cap);
    const next=Math.round(Math.min(hi,Math.max(lo,med))*100)/100;
    if(Math.abs(next-old)<0.01) return;
    upsert_('StdTimes','Family',{Family:t.Family,PlanMin:next,Samples:recent.length,
      LastLearned:new Date()});
    const row={Ts:new Date(),Family:t.Family,Operation:t.Operation,Samples:recent.length,
      OldPlanMin:old,NewPlanMin:next,ChangePct:Math.round((next/old-1)*100)};
    append_('LearnLog',row); log.push(row);
  });
  return log;
}
/* Optional: Triggers > add trigger > runNightly > time-driven > 11pm */
function runNightly(){ computeScores(today_()); runLearning(); }

/* ================= bootstrap ================= */
function workDays_(a,b){
  const x=new Date(a),y=new Date(b); x.setHours(0,0,0,0); y.setHours(0,0,0,0);
  const sign=y<x?-1:1; let n=0,cur=new Date(Math.min(x,y)),end=new Date(Math.max(x,y));
  while(cur<end){ cur.setDate(cur.getDate()+1); if(cur.getDay()!==0) n++; }
  return n*sign;
}
function bootstrap_(s){
  const c=cfg_(), d=today_();
  const projects=readAll_('Projects').filter(p=>String(p.Active).toLowerCase()!=='no');
  const std=readAll_('StdTimes');
  const brakeWeek=Number(c.brake_min_per_week)||3510;

  const scored=projects.map(p=>{
    const pos=STAGE_POS[p.Stage]||1;
    const tot=Number(c['size_'+p.Size]||0);
    const rem=pos<=6?tot:0;
    const left=p.PromisedDate?workDays_(new Date(),new Date(p.PromisedDate)):99;
    const stagesLeft=Math.max(0,12-pos);
    const wd=Math.max(rem/(brakeWeek/6),stagesLeft*0.5);
    const cr=wd>0?left/wd:99;
    return Object.assign({},p,{pos:pos,totalBrake:tot,remBrake:rem,daysLeft:left,
      workDays:Math.round(wd*10)/10,cr:Math.round(cr*100)/100,
      state:pos>=12?'done':(cr<Number(c.cr_red)?'late':(cr<Number(c.cr_amber)?'tight':'ok'))});
  }).sort((a,b)=>(a.state==='done')-(b.state==='done')||a.cr-b.cr);

  const dirs=['Rupali','Ashutosh','Mohit'], ceiling=Number(c.ceiling)||0.85;
  const pool={}; let released=0;
  dirs.forEach(dr=>{
    const floor=Number(c['quota_'+dr]||0)*brakeWeek*ceiling;
    const demand=scored.filter(p=>p.Director===dr&&p.state!=='done').reduce((t,p)=>t+p.remBrake,0);
    const unused=Math.max(0,floor-demand); released+=unused;
    pool[dr]={floor:Math.round(floor),demand:demand,unused:Math.round(unused)};
  });
  const totalDemand=scored.filter(p=>p.state!=='done').reduce((t,p)=>t+p.remBrake,0);
  const stock=readAll_('Stock'), powder=readAll_('Powder');

  return {
    me:s, config:c, stages:STAGES, reasons:REASONS,
    projects:scored, std:std, workCentres:readAll_('WorkCentres'),
    production:readAll_('Production').filter(p=>dstr_(p.Date)===d),
    downtime:readAll_('Downtime').filter(x=>dstr_(x.Date)===d),
    openStop:openDowntime_(s.name),
    stock:stock, powder:powder,
    lowStock:stock.filter(i=>Number(i.Qty)<=Number(i.ReorderLevel||0)).length,
    lowPowder:powder.filter(p=>Number(p.StockKg)<=Number(p.ReorderKg||0)).length,
    challans:readAll_('Challans').slice(-25).reverse(),
    scores:readAll_('Scores'),
    learn:readAll_('LearnLog').slice(-25).reverse(),
    load:{brakeWeek:brakeWeek,ceiling:ceiling,demand:totalDemand,
      pctOfWeek:brakeWeek?Math.round(totalDemand/brakeWeek*100):0,
      pool:pool,released:Math.round(released)}
  };
}

/* ================= one-time setup ================= */
function setup(){
  Object.keys(SCHEMA).forEach(n=>sheet_(n));
  seed_('Config', Object.keys(DEFAULT_CONFIG).map(k=>[k,DEFAULT_CONFIG[k]]));
  seed_('Users',[
    ['ashutosh','change-me','Ashutosh','director','','en','yes'],
    ['rupali','change-me','Rupali','director','','en','yes'],
    ['mohit','change-me','Mohit','director','','en','yes'],
    ['prashant','change-me','Prashant Swami','planner','','en','yes'],
    ['surekhat','change-me','Surekha Thakar','supervisor','','en','yes'],
    ['stores','change-me','Stores','stores','','en','yes'],
    ['kaveri','1234','Kaveri','operator','Bending','mr','yes'],
    ['umesh','1234','Umesh','operator','Laser','mr','yes'],
    ['padma','1234','Padma','operator','Powder','mr','yes'],
    ['pooja','1234','Pooja','operator','Welding','mr','yes'],
    ['gulab','1234','Gulab Dhombe','supervisor','Packing','mr','yes']
  ]);
  seed_('WorkCentres',[
    ['1500 W Fiber Laser','Laser',1,8,0.75,1],['3000 W Fiber Laser','Laser',1,8,0.75,1],
    ['CNC Pressbrake - Yawei','Brake',1,8,0.75,1],['CNC Pressbrake - Energy Mission','Brake',1,5,0.75,1],
    ['Powder Coating Unit','Powder',1,8,0.75,1],['Decoiler + Cut to Length','CTL',1,8,0.75,1],
    ['CO2 Welding Machines','Welding',4,8,0.75,1],['Grinding bench','Grinding',1,8,0.75,1],
    ['Hardware bench','Hardware',1,6,0.75,1]
  ]);
  /* Family, Operation, Grp, Setup, TargetMin, PlanMin, Samples, LastLearned */
  seed_('StdTimes',[
    ['Baffle 50x20 panel','Laser Cutting','Laser',5,1.5,1.5,0,''],
    ['Baffle 50x20 panel','Bending','Brake',15,2,2,0,''],
    ['Baffle 50x20 panel','Cut to Length','CTL',8,0.2,0.2,0,''],
    ['Baffle 50x20 panel','Powder Coating','Powder',25,3,3,0,''],
    ['Baffle carrier','Laser Cutting','Laser',5,10,10,0,''],
    ['Baffle carrier','Bending','Brake',15,1.5,1.5,0,''],
    ['L Bracket','Bending','Brake',15,1,1,0,''],
    ['Folding door shutter','Laser Cutting','Laser',5,3,3,0,''],
    ['Folding door shutter','Bending','Brake',15,10,10,0,''],
    ['Folding door shutter','Tacking','Welding',10,4,4,0,''],
    ['Folding door shutter','Full Welding','Welding',10,10,10,0,''],
    ['Folding door shutter','Grinding','Grinding',5,10,10,0,''],
    ['Folding door shutter','Powder Coating','Powder',25,12,12,0,''],
    ['Folding door shutter','Hardware Assembly','Hardware',25,12,12,0,''],
    ['Door frame section','Bending','Brake',15,2,2,0,''],
    ['Window shutter','Bending','Brake',15,10,10,0,'']
  ]);
  seed_('Projects',[
    ['P-001','Nagpur','Doors & Windows - Wholesale','Rupali','Nagpur','','S',13,'Door','2026-08-05','Powder Coating','','yes'],
    ['P-002','Ranade','Doors & Windows - Wholesale','Rupali','Ranade Relators','Baner','S',13,'Door','2026-08-12','Fabrication','','yes'],
    ['P-003','Retail 1','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-04','Fabrication','','yes'],
    ['P-004','Retail 2','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-05','Powder Coating','','yes'],
    ['P-005','Retail 3','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-10','Bending','','yes'],
    ['P-006','Retail 4','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-04','Fabrication','','yes'],
    ['P-007','Retail 5','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-03','Bending','','yes'],
    ['P-008','Vaichal frames','Doors & Windows - Wholesale','Rupali','Vaichal','','M',35,'Door Frames','2026-08-18','Fabrication','','yes'],
    ['P-009','Vaichal WC windows','Doors & Windows - Wholesale','Rupali','Vaichal','','M',98,'WC Windows','2026-08-18','Fabrication','','yes'],
    ['P-010','Osian One','Architectural','Ashutosh','Osian','','XL',2000,'Baffles','2026-08-20','Cut to Length','','yes'],
    ['P-011','Ashiana','Architectural','Ashutosh','Ashiana','','L',600,'Baffles','2026-08-01','Packing','','yes'],
    ['P-012','Badiyani-Vanaha','Architectural','Ashutosh','Badiyani','','L',600,'Baffles','2026-08-01','Packing','','yes'],
    ['P-013','Nirmiti Developers','Architectural','Ashutosh','Nirmiti','','S',4,'Z Louvers','2026-07-31','Packing','','yes'],
    ['P-014','Kiosk','Hi Fab Homes & Pods','Mohit','','','M',1,'Pod','2026-07-30','Complete','','yes'],
    ['P-015','Satyajit Gaikwad','Laser Cutting job work','Ashutosh','Satyajit','','XL',52,'Boxes','2026-08-01','Packing','','yes'],
    ['P-016','Trimech','Laser Cutting job work','Ashutosh','Trimech','','S',1,'Batch','2026-07-30','Dispatched','','yes'],
    ['P-017','ASN Packaging','Laser Cutting job work','Ashutosh','ASN','','L',1,'Batch','2026-08-10','Nesting','Waiting drawing / approval','yes'],
    ['P-018','Navdurga','Laser Cutting job work','Ashutosh','Navdurga','','L',1,'Batch','2026-08-10','Design','Waiting drawing / approval','yes']
  ]);
  /* ItemID, Type, Thk, W, L, Grade, Qty, Unit, Reorder, LeadDays, Rate, Updated */
  seed_('Stock',[
    ['S-09-1250-2500','GI Sheet',0.9,1250,2500,'GI',60,'sheets',10,1,72,''],
    ['S-12-1250-2500','GI Sheet',1.2,1250,2500,'GI',12,'sheets',5,1,72,''],
    ['S-06-1220-2440','GI Sheet',0.6,1220,2440,'GI',0,'sheets',5,1,72,''],
    ['S-05-1220-2440','GI Sheet',0.5,1220,2440,'GI',10,'sheets',5,1,72,''],
    ['S-20-1250-2500','MS Sheet',2.0,1250,2500,'MS',1,'sheets',3,1,68,''],
    ['S-30-1250-2500','MS Sheet',3.0,1250,2500,'MS',1,'sheets',3,1,68,''],
    ['S-05-1250-3100','GI Sheet',0.5,1250,3100,'GI',6,'sheets',5,1,72,''],
    ['S-06-1250-3100','GI Sheet',0.6,1250,3100,'GI',6,'sheets',5,1,72,''],
    ['S-05-1250-2500-PC','Precoated Sheet',0.5,1250,2500,'Precoated White',2,'sheets',5,3,86,''],
    ['S-08-1250-2500','GI Sheet',0.8,1250,2500,'GI',1,'sheets',5,1,72,''],
    ['C-05-122-PC','Precoated Coil',0.5,122,0,'Precoated White',0,'kg',500,5,78,''],
    ['C-GI-COIL','GI Coil',0,0,0,'GI',14,'coils',3,5,78,'']
  ]);
  /* PowderID, Make, Shade, Finish, StockKg, ReorderKg, Rate, SqftPerKg, Updated */
  seed_('Powder',[
    ['PW-9005','Rapid Coat','RAL 9005','Matt',18,15,260,50,''],
    ['PW-WHSTR','Rapid Coat','White Structure','Structure',10,15,260,50,''],
    ['PW-8011','Fortune Coat','RAL 8011','Semi Gloss',10,15,255,50,''],
    ['PW-IVSTR','Rapid Coat','Ivory Structure','Structure',30,15,260,50,''],
    ['PW-9010','Rapid Coat','RAL 9010','Matt',20,15,260,50,''],
    ['PW-7015','Beger','RAL 7015','Semi Gloss PP',50,20,270,50,''],
    ['PW-BLSTR','Libra','Black Structure PP','Structure',20,15,250,50,''],
    ['PW-8004','Libra','RAL 8004','Semi Gloss PP',15,15,250,50,''],
    ['PW-WGSAT','Libra','Warm Gray Satin','Satin',25,15,250,50,''],
    ['PW-7044-L','Libra','RAL 7044','Matt',10,15,250,50,''],
    ['PW-7043','Libra','RAL 7043','Matt',30,15,250,50,''],
    ['PW-7035','Rapid Coat','RAL 7035','Glossy',75,20,260,50,''],
    ['PW-CB03','Libra','CB 03 Text PP','Textured',20,15,250,50,''],
    ['PW-7044-R','Rapid Coat','RAL 7044','Matt',12,15,260,50,''],
    ['PW-7006','Progressive','RAL 7006','Semi Gloss PP',210,50,265,50,''],
    ['PW-CB013','Libra','CB 013 Text PP','Textured',8,15,250,50,''],
    ['PW-DAGRY','Rapid Coat','D.A. Gray Structure','Structure',5,15,260,50,'']
  ]);
  seed_('Challans',[['494','2026-07-29','','Jayant Shirke','Katraj','Folding Door 3sh x4, 1sh x1',5,
    'MH12 XX8696','Gulab Dhombe','migrated','']]);
}
function seed_(name,rows){
  const sh=sheet_(name);
  if(sh.getLastRow()>=2) return;
  rows.forEach(r=>sh.appendRow(r));
}
