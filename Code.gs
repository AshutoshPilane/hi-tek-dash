/**
 * ==========================================================================
 * HI TEK PRODUCTION SYSTEM — backend  v3   (task-centric)
 * ==========================================================================
 * The unit of work is a TASK: one project x one operation x one work centre
 * x one named person. Everything else follows from that.
 *
 * FIRST RUN
 *   1. Script Properties: SECRET = <long random string>
 *   2. Run setup()
 *   3. Deploy > New deployment > Web app > Execute as Me > Anyone
 */
const SS = SpreadsheetApp.getActiveSpreadsheet();
const TOKEN_HOURS = 12;
const TZ = Session.getScriptTimeZone();

const SCHEMA = {
  Users:       ['Username','Password','Name','Role','WorkCentre','Lang','Active','Pin','Kind'],
  DefaultAssign:['Key','Scope','Operation','WorkCentre','Division','AssignedTo','Helpers','Active'],
  TaskCrew:    ['Ts','Date','TaskID','WorkCentre','Operator','Helpers','Session'],
  Projects:    ['ProjectID','Name','Division','Director','Customer','Address','Size','Qty','Unit',
                'PromisedDate','Stage','Blocker','Active'],
  /* one row per project x operation — the heart of the system */
  Tasks:       ['TaskID','ProjectID','Seq','Operation','Grp','WorkCentre','AssignedTo',
                'QtyTarget','QtyDone','QtyRework','Status','ReadyTs','DoneTs','Note','Helpers'],
  Routings:    ['Division','Seq','Operation','Grp','Optional'],
  Items:       ['Family','Division','Unit','Active'],
  Operations:  ['Operation','Grp'],
  StdTimes:    ['Key','Family','Operation','Grp','SetupMin','TargetMin','PlanMin','Samples','LastLearned'],
  WorkCentres: ['Name','Grp','Qty','HrsDay','Avail','Shifts','Active'],
  Production:  ['Ts','Date','Session','Operator','TaskID','ProjectID','Item','Operation','Grp',
                'WorkCentre','OffStation','Qty','Rework','EarnedMin','ElapsedMin','Helpers','Via'],
  Downtime:    ['ID','Date','Operator','WorkCentre','Reason','Fault','StartTs','EndTs','Minutes','Open'],
  Stock:       ['ItemID','Type','Thickness','Width','Length','Grade','Qty','Unit',
                'ReorderLevel','LeadDays','RatePerKg','Active','Updated'],
  StockMoves:  ['Ts','Date','ItemID','Dir','Qty','WorkCentre','TaskID','ProjectID','By','Note'],
  Powder:      ['PowderID','Make','Shade','Finish','StockKg','ReorderKg','RatePerKg','SqftPerKg','Active','Updated'],
  PowderMoves: ['Ts','Date','PowderID','Dir','Kg','WorkCentre','TaskID','ProjectID','By','Note'],
  Challans:    ['ChallanNo','Date','ProjectID','Customer','Address','Particulars','Qty','Vehicle','Driver','By','Ts'],
  Scores:      ['Date','Operator','EarnedMin','AvailMin','OwnDownMin','PlantDownMin','Qty','Rework',
                'OutputPct','QualityPct','ReliabilityPct','Score'],
  LearnLog:    ['Ts','Family','Operation','Samples','OldPlanMin','NewPlanMin','ChangePct'],
  Docs:        ['DocID','Ts','Date','ProjectID','TaskID','WorkCentre','Kind','Name',
                'FileID','Url','ThumbUrl','Mime','SizeKB','By','Caption','Active'],
  Notes:       ['NoteID','Ts','Date','ProjectID','TaskID','WorkCentre','Operation','Scope',
                'Pinned','By','Role','Text','Active'],
  AuditLog:    ['Ts','Who','What','Detail'],
  Config:      ['Key','Value']
};

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
  ['D10','क्वालिटी प्रॉब्लेम','Quality / rework','own'],
  ['D11','साफसफाई','Cleaning / maintenance','own'],
  ['D12','काम नाही','No work available','plant']
];

const DEFAULT_CONFIG = {
  quota_Rupali:'0.20', quota_Ashutosh:'0.20', quota_Mohit:'0.20',
  ceiling:'0.85', cr_red:'1.0', cr_amber:'1.5', days_per_week:'6',
  size_S:'50', size_M:'300', size_L:'2000', size_XL:'8500',
  brake_min_per_week:'3510',
  shift_start:'09:00', lunch_start:'13:00', lunch_end:'13:30', shift_end:'18:00',
  scoring_live:'no', score_w_output:'0.50', score_w_quality:'0.30', score_w_reliability:'0.20',
  learning_live:'yes', learn_min_samples:'20', learn_max_change:'0.25',
  block_task_if_no_material:'yes',
  drive_folder_id:'', max_upload_kb:'1200'
};

/* ================= plumbing ================= */
function sheet_(n){ let s=SS.getSheetByName(n); if(!s){ s=SS.insertSheet(n); s.appendRow(SCHEMA[n]); } return s; }
/* Per-execution memo: bootstrap used to read the same sheet many times in one call. */
var _memo = {};
function readAll_(n){
  if(_memo[n]) return _memo[n];
  const sh=sheet_(n), rows=sh.getDataRange().getValues();
  if(rows.length<2){ _memo[n]=[]; return []; }
  const head=rows.shift();
  _memo[n]=rows.filter(r=>String(r[0]).trim()!=='')
    .map(r=>{const o={};head.forEach((h,i)=>o[h]=r[i]);return o;});
  return _memo[n];
}
function bust_(n){ if(n) delete _memo[n]; else _memo={}; try{ CacheService.getScriptCache().removeAll(BOOT_KEYS); }catch(e){} }
var BOOT_KEYS=[];
function append_(n,o){ sheet_(n).appendRow(SCHEMA[n].map(h=>o[h]!==undefined?o[h]:'')); bust_(n); }
function appendMany_(n,list){
  if(!list.length) return;
  const sh=sheet_(n), head=SCHEMA[n];
  sh.getRange(sh.getLastRow()+1,1,list.length,head.length)
    .setValues(list.map(o=>head.map(h=>o[h]!==undefined?o[h]:'')));
  bust_(n);
}
function upsert_(n,key,o){
  /* 8s not 20s. A stuck write must never make the whole plant wait. */
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000)) throw new Error('System busy, please tap again in a moment.');
  try{
    bust_(n);
    const sh=sheet_(n), head=SCHEMA[n], rows=sh.getDataRange().getValues(), kc=head.indexOf(key);
    for(let i=1;i<rows.length;i++){
      if(String(rows[i][kc])===String(o[key])){
        head.forEach((h,c)=>{ if(o[h]!==undefined) rows[i][c]=o[h]; });
        sh.getRange(i+1,1,1,head.length).setValues([rows[i]]); return 'updated';
      }
    }
    sh.appendRow(head.map(h=>o[h]!==undefined?o[h]:'')); return 'created';
  } finally{ bust_(n); lock.releaseLock(); }
}
function del_(n,key,val){
  const sh=sheet_(n), head=SCHEMA[n], rows=sh.getDataRange().getValues(), kc=head.indexOf(key);
  for(let i=rows.length-1;i>=1;i--) if(String(rows[i][kc])===String(val)) sh.deleteRow(i+1);
}
function cfg_(){ const c={}; Object.keys(DEFAULT_CONFIG).forEach(k=>c[k]=DEFAULT_CONFIG[k]);
  readAll_('Config').forEach(r=>c[r.Key]=String(r.Value)); return c; }
function today_(){ return Utilities.formatDate(new Date(),TZ,'yyyy-MM-dd'); }
function dstr_(d){ return d?Utilities.formatDate(new Date(d),TZ,'yyyy-MM-dd'):''; }
function nowMin_(){ const d=new Date(); return d.getHours()*60+d.getMinutes(); }
function hm_(s){ const p=String(s).split(':'); return Number(p[0])*60+Number(p[1]||0); }
function session_(){ return nowMin_()<hm_(cfg_().lunch_start)?'AM':'PM'; }
function uid_(p){ return p+'-'+Date.now().toString(36)+Math.floor(Math.random()*900+100); }
function median_(a){ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y),m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2; }
function audit_(who,what,detail){ append_('AuditLog',{Ts:new Date(),Who:who,What:what,Detail:detail||''}); }

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
const CAN={
  director:['*'], planner:['*'],
  supervisor:['bootstrap','tap','completeTask','stopStart','stopEnd','assignTask','reassignTask',
              'stockMove','powderMove','challan','saveProject','saveTask','addTask','runScores',
              'upload','delDoc','addNote','pinNote','delNote','setTaskStatus'],
  operator:['bootstrap','tap','completeTask','stopStart','stopEnd','stockMove','powderMove',
            'upload','addNote'],
  station:['bootstrap','stopStart','stopEnd'],
  stores:['bootstrap','stockMove','powderMove','saveStock','savePowder','upload','addNote'],
  office:['bootstrap','saveProject','challan','upload','addNote','delDoc'],
  accounts:['bootstrap']
};
function allowed_(r,a){ const l=CAN[r]||[]; return l.indexOf('*')>=0||l.indexOf(a)>=0; }

/* ================= router ================= */
function doPost(e){
  let out;
  try{
    const q=JSON.parse(e.postData.contents), a=q.action;
    if(a==='LOGIN') out=login_(q);
    else if(a==='PIN') out=pinLogin_(q);
    else{
      const s=readToken_(q.token);
      if(!s) out={status:'error',code:'AUTH',message:'Session expired. Please log in again.'};
      else if(!allowed_(s.role,a)) out={status:'error',code:'FORBIDDEN',message:'Your role cannot do that.'};
      else out=handle_(a,q,s);
    }
  }catch(err){ out={status:'error',message:String(err)}; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
/* 20-second shared cache per role. Twenty phones polling at 9am now cost ONE read. */
function cachedBoot_(s){
  const key='b_'+s.role+'_'+(s.role==='operator'||s.role==='supervisor'?s.username:'all');
  if(BOOT_KEYS.indexOf(key)<0) BOOT_KEYS.push(key);
  const cache=CacheService.getScriptCache();
  try{
    const hit=cache.get(key);
    if(hit){ const o=JSON.parse(hit); o.me=s; o.cached=true; return o; }
  }catch(e){}
  const fresh=bootstrap_(s);
  try{
    const str=JSON.stringify(fresh);
    if(str.length<95000) cache.put(key,str,20);
  }catch(e){}
  return fresh;
}
function doGet(){ return ContentService.createTextOutput(JSON.stringify({status:'success',data:{ok:1}}))
  .setMimeType(ContentService.MimeType.JSON); }
function ok_(d){ return {status:'success',data:d||{}}; }
function err_(m){ return {status:'error',message:m}; }

function login_(q){
  const u=readAll_('Users').filter(x=>
    String(x.Username).toLowerCase()===String(q.username||'').toLowerCase() &&
    String(x.Password)===String(q.password||'') && String(x.Active).toLowerCase()!=='no')[0];
  if(!u) return err_('Wrong username or password.');
  return ok_({token:makeToken_(u),
    user:{username:u.Username,name:u.Name,role:u.Role,workCentre:u.WorkCentre||'',lang:u.Lang||'en'}});
}
/* One tablet at the machine, logged in as the station and never logged out.
   Each person taps their name + 4-digit PIN. No personal phone required.      */
function pinLogin_(q){
  const st=readToken_(q.token);
  if(!st) return {status:'error',code:'AUTH',message:'Station session expired.'};
  const u=readAll_('Users').filter(x=>String(x.Name)===String(q.name||'') &&
        String(x.Pin||'')===String(q.pin||'') && String(x.Active).toLowerCase()!=='no')[0];
  if(!u) return err_('Wrong PIN for '+(q.name||'that person')+'.');
  return ok_({token:makeToken_(u),
    user:{username:u.Username,name:u.Name,role:u.Role,workCentre:u.WorkCentre||'',
          lang:u.Lang||'mr',kind:u.Kind||'operator',station:st.workCentre||''}});
}
function handle_(a,q,s){
  switch(a){
    case 'bootstrap':     return ok_(cachedBoot_(s));
    case 'tap':           return tap_(q,s);
    case 'completeTask':  return completeTask_(q,s);
    case 'stopStart':     return stopStart_(q,s);
    case 'stopEnd':       return stopEnd_(q,s);
    case 'assignTask':
    case 'reassignTask':  return assignTask_(q,s);
    case 'addTask':       return addTask_(q,s);
    case 'saveTask':      upsert_('Tasks','TaskID',q.row);
                          if(q.row.ProjectID) recomputeStage_(q.row.ProjectID);
                          audit_(s.name,'edit task',q.row.TaskID); return ok_();
    case 'setTaskStatus': return setTaskStatus_(q,s);
    case 'delTask':       del_('Tasks','TaskID',q.taskID);
                          if(q.projectID) recomputeStage_(q.projectID);
                          audit_(s.name,'delete task',q.taskID); return ok_();
    case 'saveDefault':   upsert_('DefaultAssign','Key',q.row); return ok_();
    case 'newProject':    return newProject_(q,s);
    case 'saveProject':   upsert_('Projects','ProjectID',q.row); recomputeStage_(q.row.ProjectID); return ok_();
    case 'stockMove':     return stockMove_(q,s);
    case 'powderMove':    return powderMove_(q,s);
    case 'saveStock':     upsert_('Stock','ItemID',q.row);   audit_(s.name,'stock item',q.row.ItemID);  return ok_();
    case 'savePowder':    upsert_('Powder','PowderID',q.row);audit_(s.name,'powder',q.row.PowderID);    return ok_();
    case 'saveWorkCentre':upsert_('WorkCentres','Name',q.row); return ok_();
    case 'saveItem':      upsert_('Items','Family',q.row); return ok_();
    case 'saveOperation': upsert_('Operations','Operation',q.row); return ok_();
    case 'saveStdTime':   q.row.Key=q.row.Family+'|'+q.row.Operation;
                          upsert_('StdTimes','Key',q.row); return ok_();
    case 'saveRouting':   upsert_('Routings','Division',q.row); return ok_();
    case 'saveUser':      upsert_('Users','Username',q.row); return ok_();
    case 'saveConfig':    upsert_('Config','Key',q.row); return ok_();
    case 'challan':       return challan_(q,s);
    case 'runScores':     return ok_({rows:computeScores(q.date||today_())});
    case 'runLearning':   return ok_({rows:runLearning()});
    case 'upload':        return upload_(q,s);
    case 'delDoc':        upsert_('Docs','DocID',{DocID:q.docID,Active:'no'});
                          audit_(s.name,'delete doc',q.docID); return ok_();
    case 'addNote':       return addNote_(q,s);
    case 'pinNote':       upsert_('Notes','NoteID',{NoteID:q.noteID,Pinned:q.pinned?'yes':''});
                          return ok_();
    case 'delNote':       upsert_('Notes','NoteID',{NoteID:q.noteID,Active:'no'}); return ok_();
    default: return err_('Unknown action '+a);
  }
}

/* ================= TASKS — the core ================= */
/* Creating a project generates its whole routing at once. Nobody hand-builds 17 rows. */
function newProject_(q,s){
  const p=q.row||{};
  if(!p.ProjectID) p.ProjectID='P-'+uid_('').slice(1,8).toUpperCase();
  p.Active='yes'; if(!p.Stage) p.Stage='Enquiry';
  upsert_('Projects','ProjectID',p);
  const made=generateTasks_(p, q.assign||{}, q.operations||null);
  audit_(s.name,'new project',p.ProjectID+' ('+made+' tasks)');
  recomputeStage_(p.ProjectID);
  return ok_({projectID:p.ProjectID,tasks:made});
}
/* Every task gets a person the moment it is born.
   Priority: explicit override -> division-specific default -> operation default. */
function defaultFor_(operation,division){
  const d=readAll_('DefaultAssign').filter(x=>String(x.Active).toLowerCase()!=='no');
  const byDiv=d.filter(x=>x.Operation===operation&&x.Division&&x.Division===division)[0];
  if(byDiv) return byDiv;
  const byOp=d.filter(x=>x.Operation===operation&&!x.Division)[0];
  return byOp||null;
}
function generateTasks_(p, assign, onlyOps){
  let route=readAll_('Routings')
    .filter(r=>r.Division===p.Division && String(r.Optional).toLowerCase()!=='skip')
    .sort((a,b)=>Number(a.Seq)-Number(b.Seq));
  if(onlyOps && onlyOps.length) route=route.filter(r=>onlyOps.indexOf(r.Operation)>=0);
  if(!route.length) return 0;
  const wcs=readAll_('WorkCentres');
  const rows=route.map((r,i)=>{
    const def=defaultFor_(r.Operation,p.Division);
    const wc=(def&&def.WorkCentre)||(wcs.filter(w=>w.Grp===r.Grp)[0]||{}).Name||'';
    return {TaskID:p.ProjectID+'-T'+String(i+1).padStart(2,'0'),ProjectID:p.ProjectID,
      Seq:Number(r.Seq),Operation:r.Operation,Grp:r.Grp,WorkCentre:wc,
      AssignedTo:(assign&&assign[r.Operation])||(def&&def.AssignedTo)||'',
      QtyTarget:Number(p.Qty)||0,QtyDone:0,QtyRework:0,
      Status:i===0?'ready':'waiting',ReadyTs:i===0?new Date():'',DoneTs:'',Note:'',
      Helpers:(def&&def.Helpers)||''};
  });
  appendMany_('Tasks',rows);
  return rows.length;
}
function addTask_(q,s){
  const t=q.row||{};
  if(!t.TaskID) t.TaskID=t.ProjectID+'-T'+uid_('').slice(1,5).toUpperCase();
  if(!t.Status) t.Status='waiting';
  if(t.QtyDone===undefined) t.QtyDone=0;
  upsert_('Tasks','TaskID',t);
  audit_(s.name,'add task',t.TaskID);
  return ok_({taskID:t.TaskID});
}
function assignTask_(q,s){
  const t=readAll_('Tasks').filter(x=>x.TaskID===q.taskID)[0];
  if(!t) return err_('Task not found');
  upsert_('Tasks','TaskID',{TaskID:q.taskID,AssignedTo:q.to||''});
  audit_(s.name,'assign',q.taskID+' -> '+(q.to||'unassigned')+(t.AssignedTo?' (was '+t.AssignedTo+')':''));
  return ok_();
}
/* When a task finishes, the NEXT one in the routing opens by itself. */
function advance_(projectID){
  const tasks=readAll_('Tasks').filter(t=>t.ProjectID===projectID)
                               .sort((a,b)=>Number(a.Seq)-Number(b.Seq));
  let opened=null;
  for(let i=0;i<tasks.length;i++){
    if(String(tasks[i].Status)!=='done'){
      if(String(tasks[i].Status)==='waiting'){
        const prevDone=tasks.slice(0,i).every(x=>String(x.Status)==='done');
        if(prevDone){
          upsert_('Tasks','TaskID',{TaskID:tasks[i].TaskID,Status:'ready',ReadyTs:new Date()});
          opened=tasks[i];
        }
      }
      break;
    }
  }
  recomputeStage_(projectID);
  return opened;
}
/* Project stage is derived, never typed. It is the earliest operation not yet finished. */
function recomputeStage_(projectID){
  const tasks=readAll_('Tasks').filter(t=>t.ProjectID===projectID)
                               .sort((a,b)=>Number(a.Seq)-Number(b.Seq));
  if(!tasks.length) return;
  const open=tasks.filter(t=>String(t.Status)!=='done')[0];
  upsert_('Projects','ProjectID',{ProjectID:projectID,
    Stage:open?open.Operation:'Complete'});
}
/* Directors and planners can force a task to any status — reopen a closed one,
   skip a step, or push work forward. Everything is written to the AuditLog.     */
function setTaskStatus_(q,s){
  if(['director','planner'].indexOf(s.role)<0) return err_('Only a director or planner can do that.');
  const t=readAll_('Tasks').filter(x=>x.TaskID===q.taskID)[0];
  if(!t) return err_('Task not found');
  const patch={TaskID:q.taskID,Status:q.status};
  if(q.status==='done'){ patch.DoneTs=new Date(); if(!Number(t.QtyDone)) patch.QtyDone=t.QtyTarget; }
  if(q.status==='ready'){ patch.ReadyTs=new Date(); patch.DoneTs=''; }
  if(q.status==='waiting'){ patch.ReadyTs=''; patch.DoneTs=''; }
  upsert_('Tasks','TaskID',patch);
  if(q.status==='done') advance_(t.ProjectID); else recomputeStage_(t.ProjectID);
  audit_(s.name,'force status',q.taskID+' -> '+q.status+' (was '+t.Status+')');
  return ok_();
}
function completeTask_(q,s){
  const t=readAll_('Tasks').filter(x=>x.TaskID===q.taskID)[0];
  if(!t) return err_('Task not found');
  if(s.role==='operator' && String(t.AssignedTo)!==s.name)
    return err_('That task is not assigned to you.');
  upsert_('Tasks','TaskID',{TaskID:q.taskID,Status:'done',DoneTs:new Date()});
  const nxt=advance_(t.ProjectID);
  audit_(s.name,'complete',q.taskID);
  return ok_({next:nxt?nxt.Operation+' → '+(nxt.AssignedTo||'unassigned'):'project complete'});
}

/* ================= production tap ================= */
function tap_(q,s){
  const tasks=readAll_('Tasks');
  const t=tasks.filter(x=>x.TaskID===q.taskID)[0];
  if(!t) return err_('Task not found');
  /* An operator may only report against work assigned to him.
     Anything else must be declared as off-station, and the supervisor sees it. */
  const off = String(t.AssignedTo)!==s.name;
  if(s.role==='operator' && off && !q.offStation)
    return err_('That task is assigned to '+(t.AssignedTo||'nobody')+'. Use "Other work" if you really did it.');

  const key=t.Operation+'|'+q.family;
  const std=readAll_('StdTimes').filter(x=>x.Family===q.family && x.Operation===t.Operation)[0];
  const target=std?Number(std.TargetMin)||0:0;
  const qty=Number(q.qty)||0, rework=Number(q.rework)||0;
  const c=cfg_();

  const mine=readAll_('Production').filter(p=>p.Operator===s.name && dstr_(p.Date)===today_());
  let fromMs;
  if(mine.length) fromMs=new Date(mine[mine.length-1].Ts).getTime();
  else{ const d=new Date(); d.setHours(Math.floor(hm_(c.shift_start)/60),hm_(c.shift_start)%60,0,0);
        fromMs=d.getTime(); }
  let elapsed=Math.max(0,Math.round((Date.now()-fromMs)/60000));
  readAll_('Downtime').filter(d=>d.Operator===s.name&&dstr_(d.Date)===today_()&&d.EndTs)
    .forEach(d=>{ if(new Date(d.EndTs).getTime()>fromMs) elapsed-=Number(d.Minutes)||0; });
  const fm=new Date(fromMs); const fMin=fm.getHours()*60+fm.getMinutes();
  if(fMin<hm_(c.lunch_start)&&nowMin_()>hm_(c.lunch_end)) elapsed-=(hm_(c.lunch_end)-hm_(c.lunch_start));
  elapsed=Math.max(0,elapsed);

  const helpers=(q.helpers||'').toString();
  append_('Production',{Ts:new Date(),Date:today_(),Session:session_(),Operator:s.name,
    TaskID:t.TaskID,ProjectID:t.ProjectID,Item:q.family,Operation:t.Operation,Grp:t.Grp,
    WorkCentre:q.workCentre||t.WorkCentre||s.workCentre||'',OffStation:off?'yes':'',
    Qty:qty,Rework:rework,EarnedMin:Math.round(qty*target*10)/10,ElapsedMin:elapsed,
    Helpers:helpers,Via:q.via||''});
  if(helpers) append_('TaskCrew',{Ts:new Date(),Date:today_(),TaskID:t.TaskID,
    WorkCentre:q.workCentre||t.WorkCentre||'',Operator:s.name,Helpers:helpers,Session:session_()});

  const doneQty=(Number(t.QtyDone)||0)+qty;
  const rw=(Number(t.QtyRework)||0)+rework;
  const target_=Number(t.QtyTarget)||0;
  const finished = target_>0 && doneQty>=target_;
  upsert_('Tasks','TaskID',{TaskID:t.TaskID,QtyDone:doneQty,QtyRework:rw,
    Status:finished?'done':'running', DoneTs:finished?new Date():t.DoneTs});

  let next=null;
  if(finished) next=advance_(t.ProjectID);
  /* rework goes back a step rather than just being counted */
  if(rework>0) sendBack_(t,rework,s);

  return ok_({earned:Math.round(qty*target*10)/10,elapsed:elapsed,
    qtyDone:doneQty,finished:finished,
    next:next?next.Operation+' → '+(next.AssignedTo||'unassigned'):''});
}
function sendBack_(t,qty,s){
  const tasks=readAll_('Tasks').filter(x=>x.ProjectID===t.ProjectID)
                               .sort((a,b)=>Number(a.Seq)-Number(b.Seq));
  const idx=tasks.findIndex(x=>x.TaskID===t.TaskID);
  if(idx<=0) return;
  const prev=tasks[idx-1];
  upsert_('Tasks','TaskID',{TaskID:prev.TaskID,Status:'ready',ReadyTs:new Date(),
    QtyTarget:(Number(prev.QtyTarget)||0),
    QtyDone:Math.max(0,(Number(prev.QtyDone)||0)-qty),
    Note:'Rework '+qty+' returned from '+t.Operation});
  audit_(s.name,'rework',qty+' pcs back to '+prev.Operation+' on '+t.ProjectID);
}

/* ================= downtime — WORK CENTRE level, not project ================= */
function stopStart_(q,s){
  const wc=q.workCentre||s.workCentre||'';
  const open=readAll_('Downtime').filter(d=>String(d.Open)==='yes' &&
        (d.Operator===s.name || (wc && d.WorkCentre===wc)))[0];
  if(open) return ok_({id:open.ID,already:true});
  const r=REASONS.filter(x=>x[0]===q.code)[0];
  const id=uid_('DT');
  append_('Downtime',{ID:id,Date:today_(),Operator:s.name,WorkCentre:wc,
    Reason:r?r[1]:(q.reason||'Other'),Fault:r?r[3]:'plant',
    StartTs:new Date(),EndTs:'',Minutes:'',Open:'yes'});
  return ok_({id:id});
}
function stopEnd_(q,s){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000)) return err_('System busy, please tap again in a moment.');
  try{
    const sh=sheet_('Downtime'),head=SCHEMA.Downtime,rows=sh.getDataRange().getValues();
    const wc=q.workCentre||s.workCentre||'';
    for(let i=1;i<rows.length;i++){
      const isOpen=String(rows[i][head.indexOf('Open')])==='yes';
      const mine=String(rows[i][head.indexOf('Operator')])===s.name ||
                 (wc && String(rows[i][head.indexOf('WorkCentre')])===wc);
      if(isOpen&&mine){
        const mins=Math.max(0,Math.round((Date.now()-new Date(rows[i][head.indexOf('StartTs')]).getTime())/60000));
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

/* ================= stores — issue is tied to a work centre AND a task ========= */
function stockMove_(q,s){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000)) return err_('System busy, please try again in a moment.');
  try{
    const it=readAll_('Stock').filter(x=>x.ItemID===q.itemID)[0];
    if(!it) return err_('Unknown stock item '+q.itemID);
    const qty=Number(q.qty)||0, dir=(q.dir==='IN')?1:-1;
    const next=(Number(it.Qty)||0)+dir*qty;
    if(next<0) return err_('Only '+it.Qty+' '+(it.Unit||'')+' left in stores.');
    upsert_('Stock','ItemID',{ItemID:q.itemID,Qty:next,Updated:new Date()});
    append_('StockMoves',{Ts:new Date(),Date:today_(),ItemID:q.itemID,Dir:q.dir,Qty:qty,
      WorkCentre:q.workCentre||s.workCentre||'',TaskID:q.taskID||'',ProjectID:q.projectID||'',
      By:s.name,Note:q.note||''});
    return ok_({qty:next,low:next<=(Number(it.ReorderLevel)||0),leadDays:Number(it.LeadDays)||0});
  } finally{ lock.releaseLock(); }
}
function powderMove_(q,s){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000)) return err_('System busy, please try again in a moment.');
  try{
    const p=readAll_('Powder').filter(x=>x.PowderID===q.powderID)[0];
    if(!p) return err_('Unknown powder '+q.powderID);
    const kg=Number(q.kg)||0, dir=(q.dir==='IN')?1:-1;
    const next=(Number(p.StockKg)||0)+dir*kg;
    if(next<0) return err_('Only '+p.StockKg+' kg left.');
    upsert_('Powder','PowderID',{PowderID:q.powderID,StockKg:Math.round(next*100)/100,Updated:new Date()});
    append_('PowderMoves',{Ts:new Date(),Date:today_(),PowderID:q.powderID,Dir:q.dir,Kg:kg,
      WorkCentre:q.workCentre||s.workCentre||'',TaskID:q.taskID||'',ProjectID:q.projectID||'',
      By:s.name,Note:q.note||''});
    return ok_({kg:Math.round(next*100)/100,low:next<=(Number(p.ReorderKg)||0),
      sqftLeft:Math.round(next*(Number(p.SqftPerKg)||50))});
  } finally{ lock.releaseLock(); }
}
function challan_(q,s){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(8000)) return err_('System busy, please try again in a moment.');
  try{
    let max=0; readAll_('Challans').forEach(c=>{
      const n=parseInt(String(c.ChallanNo).replace(/\D/g,''),10); if(n>max) max=n; });
    const no=String(max+1);
    const p=readAll_('Projects').filter(x=>x.ProjectID===q.projectID)[0]||{};
    append_('Challans',{ChallanNo:no,Date:today_(),ProjectID:q.projectID,
      Customer:q.customer||p.Customer||p.Name||'',Address:q.address||p.Address||'',
      Particulars:q.particulars||'',Qty:Number(q.qty)||0,Vehicle:q.vehicle||'',
      Driver:q.driver||'',By:s.name,Ts:new Date()});
    if(q.markDispatched){
      readAll_('Tasks').filter(t=>t.ProjectID===q.projectID&&String(t.Status)!=='done')
        .forEach(t=>upsert_('Tasks','TaskID',{TaskID:t.TaskID,Status:'done',DoneTs:new Date()}));
      recomputeStage_(q.projectID);
    }
    return ok_({challanNo:no});
  } finally{ lock.releaseLock(); }
}

/* ================= documents =================
   Files live in Google Drive, not in the Sheet. The Sheet only stores the link.
   A folder is created per project so the Drive stays navigable by a human too.  */
function rootFolder_(){
  const c=cfg_();
  if(c.drive_folder_id){
    try{ return DriveApp.getFolderById(c.drive_folder_id); }catch(e){}
  }
  const it=DriveApp.getFoldersByName('Hi Tek Production Files');
  const f= it.hasNext() ? it.next() : DriveApp.createFolder('Hi Tek Production Files');
  upsert_('Config','Key',{Key:'drive_folder_id',Value:f.getId()});
  return f;
}
function projectFolder_(projectID){
  const root=rootFolder_();
  const p=readAll_('Projects').filter(x=>x.ProjectID===projectID)[0];
  const name=projectID+(p&&p.Name?' - '+p.Name:'');
  const it=root.getFoldersByName(name);
  return it.hasNext()?it.next():root.createFolder(name);
}
function upload_(q,s){
  if(!q.data) return err_('No file received.');
  const maxKb=Number(cfg_().max_upload_kb)||1200;
  const bytes=Utilities.base64Decode(q.data);
  const kb=Math.round(bytes.length/1024);
  if(kb>maxKb) return err_('File is '+kb+' KB. Limit is '+maxKb+' KB. Photos are compressed automatically — for a PDF, please reduce it first.');
  const blob=Utilities.newBlob(bytes,q.mime||'application/octet-stream',q.name||('file-'+Date.now()));
  const folder= q.projectID ? projectFolder_(q.projectID) : rootFolder_();
  const file=folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  const id=file.getId();
  const doc={DocID:uid_('DOC'),Ts:new Date(),Date:today_(),ProjectID:q.projectID||'',
    TaskID:q.taskID||'',WorkCentre:q.workCentre||s.workCentre||'',
    Kind:q.kind||'Other',Name:q.name||file.getName(),FileID:id,
    Url:'https://drive.google.com/file/d/'+id+'/view',
    ThumbUrl:'https://drive.google.com/thumbnail?id='+id+'&sz=w400',
    Mime:q.mime||'',SizeKB:kb,By:s.name,Caption:q.caption||'',Active:'yes'};
  append_('Docs',doc);
  audit_(s.name,'upload',(q.kind||'file')+' on '+(q.projectID||'-'));
  return ok_({doc:doc});
}

/* ================= notes =================
   Scope 'task'    -> this one task only
   Scope 'project' -> everyone on the project sees it
   Scope 'station' -> standing instruction for that work centre, on every task there   */
function addNote_(q,s){
  const n={NoteID:uid_('N'),Ts:new Date(),Date:today_(),ProjectID:q.projectID||'',
    TaskID:q.taskID||'',WorkCentre:q.workCentre||'',Operation:q.operation||'',
    Scope:q.scope||'task',Pinned:q.pinned?'yes':'',By:s.name,Role:s.role,
    Text:String(q.text||'').slice(0,1000),Active:'yes'};
  if(!n.Text) return err_('Note is empty.');
  append_('Notes',n);
  return ok_({note:n});
}
/* Which notes apply to a given task: its own, its project's, and its station's standing ones */
function notesFor_(all,t){
  return all.filter(n=>String(n.Active).toLowerCase()!=='no' && (
    (n.Scope==='task'    && n.TaskID===t.TaskID) ||
    (n.Scope==='project' && n.ProjectID===t.ProjectID) ||
    (n.Scope==='station' && (n.WorkCentre===t.WorkCentre || n.Operation===t.Operation))
  ));
}

/* ================= scoring & learning ================= */
function computeScores(date){
  const c=cfg_(), d=date||today_();
  const prod=readAll_('Production').filter(p=>dstr_(p.Date)===d);
  const down=readAll_('Downtime').filter(x=>dstr_(x.Date)===d&&String(x.Open)!=='yes');
  const shift=(hm_(c.shift_end)-hm_(c.shift_start))-(hm_(c.lunch_end)-hm_(c.lunch_start));
  const names={}; prod.forEach(p=>names[p.Operator]=1); down.forEach(x=>names[x.Operator]=1);
  const out=[];
  Object.keys(names).forEach(n=>{
    const mine=prod.filter(p=>p.Operator===n);
    const earned=mine.reduce((t,p)=>t+(Number(p.EarnedMin)||0),0);
    const qty=mine.reduce((t,p)=>t+(Number(p.Qty)||0),0);
    const rw=mine.reduce((t,p)=>t+(Number(p.Rework)||0),0);
    const dn=down.filter(x=>x.Operator===n);
    const plant=dn.filter(x=>x.Fault==='plant').reduce((t,x)=>t+(Number(x.Minutes)||0),0);
    const own=dn.filter(x=>x.Fault!=='plant').reduce((t,x)=>t+(Number(x.Minutes)||0),0);
    const workable=Math.max(1,shift-plant);
    const output=Math.min(1.3,earned/workable);
    const quality=qty>0?Math.max(0,(qty-rw)/qty):1;
    const first=mine.length?new Date(mine[0].Ts):null;
    const rel=first?((first.getHours()*60+first.getMinutes())<=hm_(c.shift_start)+20?1:0.7):0;
    const score=(Number(c.score_w_output)*output+Number(c.score_w_quality)*quality+
                 Number(c.score_w_reliability)*rel)*100;
    const row={Date:d,Operator:n,EarnedMin:Math.round(earned),AvailMin:shift,OwnDownMin:own,
      PlantDownMin:plant,Qty:qty,Rework:rw,OutputPct:Math.round(output*100),
      QualityPct:Math.round(quality*100),ReliabilityPct:Math.round(rel*100),Score:Math.round(score)};
    upsert_('Scores','Operator',row); out.push(row);
  });
  return out;
}
function runLearning(){
  const c=cfg_();
  if(String(c.learning_live).toLowerCase()!=='yes') return [];
  const need=Number(c.learn_min_samples)||20, cap=Number(c.learn_max_change)||0.25;
  const prod=readAll_('Production').filter(p=>Number(p.Qty)>0&&Number(p.ElapsedMin)>0&&!p.OffStation);
  const log=[];
  readAll_('StdTimes').forEach(t=>{
    const runs=prod.filter(p=>p.Item===t.Family&&p.Operation===t.Operation).slice(-200)
      .map(p=>Number(p.ElapsedMin)/Number(p.Qty)).filter(v=>isFinite(v)&&v>0);
    if(runs.length<need) return;
    const med=median_(runs.slice(-need));
    const old=Number(t.PlanMin)||Number(t.TargetMin)||med;
    const next=Math.round(Math.min(old*(1+cap),Math.max(old*(1-cap),med))*100)/100;
    if(Math.abs(next-old)<0.01) return;
    upsert_('StdTimes','Key',{Key:t.Key,PlanMin:next,Samples:need,LastLearned:new Date()});
    const row={Ts:new Date(),Family:t.Family,Operation:t.Operation,Samples:need,
      OldPlanMin:old,NewPlanMin:next,ChangePct:Math.round((next/old-1)*100)};
    append_('LearnLog',row); log.push(row);
  });
  return log;
}
function runNightly(){ computeScores(today_()); runLearning(); }

/* ================= bootstrap ================= */
const STAGE_POS={'Enquiry':1,'Measurement':2,'Design':3,'Nesting':4,'Laser Cutting':5,
  'Cut to Length':5,'Bending':6,'Section Welding':7,'Fabrication':7,'Tacking':7,'Full Welding':7,
  'Grinding':8,'Powder Coating':9,'Assembly':10,'Hardware Assembly':10,'Packing':11,
  'Dispatch':12,'Dispatched':12,'Installation':13,'Complete':14};
function workDays_(a,b){
  const x=new Date(a),y=new Date(b); x.setHours(0,0,0,0); y.setHours(0,0,0,0);
  const sign=y<x?-1:1; let n=0,cur=new Date(Math.min(x,y)),end=new Date(Math.max(x,y));
  while(cur<end){ cur.setDate(cur.getDate()+1); if(cur.getDay()!==0) n++; }
  return n*sign;
}
/* An operator needs his own tasks and nothing else. Sending him the whole plant on
   every poll was the real cost: 20 sheet reads x 26 phones x every 2 minutes.       */
function bootstrapLite_(s){
  const c=cfg_(), d=today_();
  const projects=readAll_('Projects').filter(p=>String(p.Active).toLowerCase()!=='no');
  const pmap={}; projects.forEach(p=>pmap[p.ProjectID]=p);
  const allNotes=readAll_('Notes').filter(x=>String(x.Active).toLowerCase()!=='no');
  const allDocs=readAll_('Docs').filter(x=>String(x.Active).toLowerCase()!=='no');
  const mine=readAll_('Tasks').filter(t=>t.AssignedTo===s.name &&
        ['ready','running'].indexOf(String(t.Status))>=0);
  const myTasks=mine.map(t=>{
    const p=pmap[t.ProjectID]||{};
    const nts=notesFor_(allNotes,t);
    const dcs=allDocs.filter(x=>x.TaskID===t.TaskID||(x.ProjectID===t.ProjectID&&!x.TaskID));
    return Object.assign({},t,{ProjectName:p.Name||t.ProjectID,PromisedDate:p.PromisedDate||'',
      cr:99,state:'ok',notes:nts.sort((a,b)=>(b.Pinned==='yes')-(a.Pinned==='yes')),
      docs:dcs,noteCount:nts.length,docCount:dcs.length});
  });
  return {
    me:s, config:c, reasons:REASONS, lite:true,
    projects:[], tasks:myTasks, myTasks:myTasks,
    items:readAll_('Items'), operations:[], routings:[], workCentres:readAll_('WorkCentres'),
    std:readAll_('StdTimes'),
    users:readAll_('Users').filter(u=>String(u.Active).toLowerCase()!=='no' &&
      (u.WorkCentre===s.workCentre||String(u.Kind||'')==='helper'))
      .map(u=>({Name:u.Name,Kind:u.Kind||'operator',WorkCentre:u.WorkCentre})),
    stock:readAll_('Stock').filter(x=>String(x.Active).toLowerCase()!=='no'),
    powder:readAll_('Powder').filter(x=>String(x.Active).toLowerCase()!=='no'),
    docKinds:['BOQ','Measurement sheet','Drawing','Job card','Site photo','QC photo',
              'Dispatch photo','Nest file','Other'],
    production:[], downtime:[], stockMoves:[], challans:[], learn:[],
    scores:readAll_('Scores').filter(x=>x.Operator===s.name),
    openStop:readAll_('Downtime').filter(x=>String(x.Open)==='yes'&&
      (x.Operator===s.name||(s.workCentre&&x.WorkCentre===s.workCentre)))[0]||null,
    load:{brakeWeek:0,ceiling:0,demand:0,pctOfWeek:0,pool:{},released:0}
  };
}
function bootstrap_(s){
  if(s.role==='operator') return bootstrapLite_(s);
  const c=cfg_(), d=today_();
  const projects=readAll_('Projects').filter(p=>String(p.Active).toLowerCase()!=='no');
  const tasks=readAll_('Tasks');
  const brakeWeek=Number(c.brake_min_per_week)||3510;

  const scored=projects.map(p=>{
    const mine=tasks.filter(t=>t.ProjectID===p.ProjectID);
    const openT=mine.filter(t=>String(t.Status)!=='done')
                    .sort((a,b)=>Number(a.Seq)-Number(b.Seq));
    const stage=openT.length?openT[0].Operation:'Complete';
    const pos=STAGE_POS[stage]||1;
    const tot=Number(c['size_'+p.Size]||0);
    const rem=pos<=6?tot:0;
    const left=p.PromisedDate?workDays_(new Date(),new Date(p.PromisedDate)):99;
    const wd=Math.max(rem/(brakeWeek/6),Math.max(0,12-pos)*0.5);
    const cr=wd>0?left/wd:99;
    const doneN=mine.filter(t=>String(t.Status)==='done').length;
    return Object.assign({},p,{Stage:stage,pos:pos,remBrake:rem,daysLeft:left,
      cr:Math.round(cr*100)/100,taskCount:mine.length,tasksDone:doneN,
      pct:mine.length?Math.round(doneN/mine.length*100):0,
      state:pos>=12?'done':(cr<Number(c.cr_red)?'late':(cr<Number(c.cr_amber)?'tight':'ok'))});
  }).sort((a,b)=>(a.state==='done')-(b.state==='done')||a.cr-b.cr);

  const pmap={}; scored.forEach(p=>pmap[p.ProjectID]=p);
  const allDocs=readAll_('Docs').filter(x=>String(x.Active).toLowerCase()!=='no');
  const allNotes=readAll_('Notes').filter(x=>String(x.Active).toLowerCase()!=='no');
  const enriched=tasks.map(t=>{
    const p=pmap[t.ProjectID]||{};
    const nts=notesFor_(allNotes,t);
    return Object.assign({},t,{ProjectName:p.Name||t.ProjectID,Director:p.Director||'',
      PromisedDate:p.PromisedDate||'',cr:p.cr!==undefined?p.cr:99,state:p.state||'ok',
      docs:allDocs.filter(x=>x.TaskID===t.TaskID||(x.ProjectID===t.ProjectID&&!x.TaskID)),
      notes:nts.sort((a,b)=>(b.Pinned==='yes')-(a.Pinned==='yes')),
      noteCount:nts.length,
      docCount:allDocs.filter(x=>x.TaskID===t.TaskID||(x.ProjectID===t.ProjectID&&!x.TaskID)).length});
  }).sort((a,b)=>(a.cr-b.cr)||(Number(a.Seq)-Number(b.Seq)));
  scored.forEach(p=>{
    p.docs=allDocs.filter(x=>x.ProjectID===p.ProjectID);
    p.notes=allNotes.filter(x=>x.ProjectID===p.ProjectID&&x.Scope==='project');
  });

  /* An operator gets ONLY what is assigned to him and open. Nothing else exists for him. */
  let myTasks;
  if(s.role==='operator')
    myTasks=enriched.filter(t=>t.AssignedTo===s.name&&['ready','running'].indexOf(String(t.Status))>=0);
  else if(s.role==='supervisor'&&s.workCentre)
    myTasks=enriched.filter(t=>(t.WorkCentre===s.workCentre||t.Grp===s.workCentre)&&
                               ['ready','running'].indexOf(String(t.Status))>=0);
  else myTasks=enriched.filter(t=>['ready','running'].indexOf(String(t.Status))>=0);

  const dirs=['Rupali','Ashutosh','Mohit'],ceiling=Number(c.ceiling)||0.85;
  const pool={}; let released=0;
  dirs.forEach(dr=>{
    const floor=Number(c['quota_'+dr]||0)*brakeWeek*ceiling;
    const demand=scored.filter(p=>p.Director===dr&&p.state!=='done').reduce((t,p)=>t+p.remBrake,0);
    const unused=Math.max(0,floor-demand); released+=unused;
    pool[dr]={floor:Math.round(floor),demand:demand,unused:Math.round(unused)};
  });
  const stock=readAll_('Stock').filter(x=>String(x.Active).toLowerCase()!=='no');
  const powder=readAll_('Powder').filter(x=>String(x.Active).toLowerCase()!=='no');

  return {
    me:s, config:c, reasons:REASONS,
    projects:scored, tasks:enriched, myTasks:myTasks,
    items:readAll_('Items'), operations:readAll_('Operations'),
    routings:readAll_('Routings'), std:readAll_('StdTimes'),
    workCentres:readAll_('WorkCentres').filter(w=>String(w.Active).toLowerCase()!=='no'),
    users:(['director','planner','supervisor'].indexOf(s.role)>=0)
      ? readAll_('Users').filter(u=>String(u.Active).toLowerCase()!=='no')
          .map(u=>({Name:u.Name,Role:u.Role,WorkCentre:u.WorkCentre,Kind:u.Kind||'operator'})) : [],
    production:readAll_('Production').filter(p=>dstr_(p.Date)===d),
    downtime:readAll_('Downtime').filter(x=>dstr_(x.Date)===d),
    openStop:readAll_('Downtime').filter(x=>String(x.Open)==='yes'&&
      (x.Operator===s.name||(s.workCentre&&x.WorkCentre===s.workCentre)))[0]||null,
    stock:stock, powder:powder,
    docKinds:['BOQ','Measurement sheet','Drawing','Job card','Site photo','QC photo',
              'Dispatch photo','Nest file','Other'],
    stationNotes:allNotes.filter(n=>n.Scope==='station'),
    defaults:readAll_('DefaultAssign').filter(x=>String(x.Active).toLowerCase()!=='no'),
    crew:readAll_('TaskCrew').filter(x=>dstr_(x.Date)===d),
    stockMoves:readAll_('StockMoves').slice(-60).reverse(),
    challans:readAll_('Challans').slice(-25).reverse(),
    scores:readAll_('Scores'), learn:readAll_('LearnLog').slice(-25).reverse(),
    load:{brakeWeek:brakeWeek,ceiling:ceiling,
      demand:scored.filter(p=>p.state!=='done').reduce((t,p)=>t+p.remBrake,0),
      pctOfWeek:brakeWeek?Math.round(scored.filter(p=>p.state!=='done')
        .reduce((t,p)=>t+p.remBrake,0)/brakeWeek*100):0,
      pool:pool,released:Math.round(released)}
  };
}

/* ================= MIGRATION — safe on a live sheet =================
   Adds missing sheets and APPENDS missing columns at the end of existing ones.
   Never deletes, never reorders, never touches a single existing value.
   Safe to run as many times as you like.                                      */
function migrate(){
  const report=[];
  Object.keys(SCHEMA).forEach(name=>{
    let sh=SS.getSheetByName(name);
    if(!sh){ sh=SS.insertSheet(name); sh.appendRow(SCHEMA[name]);
             report.push('CREATED sheet: '+name); return; }
    const lastCol=Math.max(1,sh.getLastColumn());
    const head=sh.getRange(1,1,1,lastCol).getValues()[0].map(String);
    const missing=SCHEMA[name].filter(c=>head.indexOf(c)<0);
    if(missing.length){
      sh.getRange(1,lastCol+1,1,missing.length).setValues([missing]);
      report.push('ADDED to '+name+': '+missing.join(', '));
    }
  });
  seedDefaults_();
  bust_();
  const msg=report.length?report.join('\n'):'Nothing to change — already up to date.';
  Logger.log(msg);
  return msg;
}
/* Default assignments: who normally does which operation. Used automatically
   whenever a project is created, so nobody hand-assigns 17 tasks again.        */
function seedDefaults_(){
  const sh=sheet_('DefaultAssign');
  if(sh.getLastRow()>=2) return;
  const rows=[
    ['op:Measurement','operation','Measurement','Site','','Surekha Thakar','','yes'],
    ['op:Design','operation','Design','Design','','Prashant Swami','','yes'],
    ['op:Nesting','operation','Nesting','Design','','Prashant Swami','','yes'],
    ['op:Laser Cutting','operation','Laser Cutting','1500 W Fiber Laser','','Umesh','','yes'],
    ['op:Cut to Length','operation','Cut to Length','Decoiler + Cut to Length','','Umesh','','yes'],
    ['op:Bending','operation','Bending','CNC Pressbrake - Yawei','','Kaveri','','yes'],
    ['op:Tacking','operation','Tacking','CO2 Welding','','Pooja','','yes'],
    ['op:Full Welding','operation','Full Welding','CO2 Welding','','Pooja','','yes'],
    ['op:Section Welding','operation','Section Welding','CO2 Welding','','Vinod','','yes'],
    ['op:Fabrication','operation','Fabrication','CO2 Welding','','Vinod','','yes'],
    ['op:Grinding','operation','Grinding','Grinding bench','','Rambhadevi','','yes'],
    ['op:Powder Coating','operation','Powder Coating','Powder Coating Unit','','Padma','','yes'],
    ['op:Hardware Assembly','operation','Hardware Assembly','Hardware bench','','Alka','','yes'],
    ['op:Assembly','operation','Assembly','Hardware bench','','Alka','','yes'],
    ['op:Packing','operation','Packing','Packing bench','','Gulab Dhombe','','yes'],
    ['op:Dispatch','operation','Dispatch','Packing bench','','Gulab Dhombe','','yes'],
    ['op:Installation','operation','Installation','Site team','','Surekha Thakar','','yes']
  ];
  sh.getRange(2,1,rows.length,SCHEMA.DefaultAssign.length).setValues(rows);
}

/* ================= one-time setup ================= */
function seed_(n,rows){ const sh=sheet_(n); if(sh.getLastRow()>=2) return;
  sh.getRange(2,1,rows.length,SCHEMA[n].length).setValues(rows); }

function setup(){
  Object.keys(SCHEMA).forEach(n=>sheet_(n));
  seed_('Config',Object.keys(DEFAULT_CONFIG).map(k=>[k,DEFAULT_CONFIG[k]]));

  seed_('Users',[
    ['ashutosh','change-me','Ashutosh','director','','en','yes'],
    ['rupali','change-me','Rupali','director','','en','yes'],
    ['mohit','change-me','Mohit','director','','en','yes'],
    ['prashant','change-me','Prashant Swami','planner','','en','yes'],
    ['surekhat','change-me','Surekha Thakar','supervisor','','en','yes'],
    ['stores','change-me','Stores','stores','','en','yes'],
    ['kaveri','1234','Kaveri','operator','Brake','mr','yes'],
    ['umesh','1234','Umesh','operator','Laser','mr','yes'],
    ['padma','1234','Padma','operator','Powder','mr','yes'],
    ['pooja','1234','Pooja','operator','Welding','mr','yes'],
    ['vinod','1234','Vinod','operator','Welding','mr','yes'],
    ['rambha','1234','Rambhadevi','operator','Grinding','mr','yes'],
    ['alka','1234','Alka','operator','Hardware','mr','yes'],
    ['gulab','1234','Gulab Dhombe','supervisor','Packing','mr','yes']
  ]);

  seed_('WorkCentres',[
    ['1500 W Fiber Laser','Laser',1,8,0.75,1,'yes'],
    ['3000 W Fiber Laser','Laser',1,8,0.75,1,'yes'],
    ['CNC Pressbrake - Yawei','Brake',1,8,0.75,1,'yes'],
    ['CNC Pressbrake - Energy Mission','Brake',1,5,0.75,1,'yes'],
    ['Decoiler + Cut to Length','CTL',1,8,0.75,1,'yes'],
    ['CO2 Welding','Welding',4,8,0.75,1,'yes'],
    ['Grinding bench','Grinding',1,8,0.75,1,'yes'],
    ['Powder Coating Unit','Powder',1,8,0.75,1,'yes'],
    ['Hardware bench','Hardware',1,6,0.75,1,'yes'],
    ['Packing bench','Packing',1,6,0.75,1,'yes'],
    ['Design desk','Design',1,8,0.9,1,'yes'],
    ['Site team','Site',2,8,0.8,1,'yes']
  ]);

  seed_('Operations',[
    ['Measurement','Site'],['Design','Design'],['Nesting','Design'],
    ['Laser Cutting','Laser'],['Cut to Length','CTL'],['Bending','Brake'],
    ['Section Welding','Welding'],['Tacking','Welding'],['Full Welding','Welding'],
    ['Fabrication','Welding'],['Grinding','Grinding'],['Powder Coating','Powder'],
    ['Hardware Assembly','Hardware'],['Assembly','Hardware'],['Packing','Packing'],
    ['Dispatch','Packing'],['Installation','Site']
  ]);

  /* Division, Seq, Operation, Grp, Optional */
  seed_('Routings',[
    ['Doors & Windows - Retail',1,'Measurement','Site',''],
    ['Doors & Windows - Retail',2,'Design','Design',''],
    ['Doors & Windows - Retail',3,'Nesting','Design',''],
    ['Doors & Windows - Retail',4,'Laser Cutting','Laser',''],
    ['Doors & Windows - Retail',5,'Bending','Brake',''],
    ['Doors & Windows - Retail',6,'Tacking','Welding',''],
    ['Doors & Windows - Retail',7,'Full Welding','Welding',''],
    ['Doors & Windows - Retail',8,'Grinding','Grinding',''],
    ['Doors & Windows - Retail',9,'Powder Coating','Powder',''],
    ['Doors & Windows - Retail',10,'Hardware Assembly','Hardware',''],
    ['Doors & Windows - Retail',11,'Packing','Packing',''],
    ['Doors & Windows - Retail',12,'Dispatch','Packing',''],
    ['Doors & Windows - Retail',13,'Installation','Site',''],

    ['Doors & Windows - Wholesale',1,'Design','Design',''],
    ['Doors & Windows - Wholesale',2,'Nesting','Design',''],
    ['Doors & Windows - Wholesale',3,'Laser Cutting','Laser',''],
    ['Doors & Windows - Wholesale',4,'Bending','Brake',''],
    ['Doors & Windows - Wholesale',5,'Tacking','Welding',''],
    ['Doors & Windows - Wholesale',6,'Full Welding','Welding',''],
    ['Doors & Windows - Wholesale',7,'Grinding','Grinding',''],
    ['Doors & Windows - Wholesale',8,'Powder Coating','Powder',''],
    ['Doors & Windows - Wholesale',9,'Hardware Assembly','Hardware',''],
    ['Doors & Windows - Wholesale',10,'Packing','Packing',''],
    ['Doors & Windows - Wholesale',11,'Dispatch','Packing',''],

    ['Architectural',1,'Measurement','Site',''],
    ['Architectural',2,'Design','Design',''],
    ['Architectural',3,'Nesting','Design',''],
    ['Architectural',4,'Cut to Length','CTL',''],
    ['Architectural',5,'Laser Cutting','Laser',''],
    ['Architectural',6,'Bending','Brake',''],
    ['Architectural',7,'Powder Coating','Powder',''],
    ['Architectural',8,'Packing','Packing',''],
    ['Architectural',9,'Dispatch','Packing',''],
    ['Architectural',10,'Installation','Site',''],

    ['Hi Fab Homes & Pods',1,'Design','Design',''],
    ['Hi Fab Homes & Pods',2,'Nesting','Design',''],
    ['Hi Fab Homes & Pods',3,'Laser Cutting','Laser',''],
    ['Hi Fab Homes & Pods',4,'Bending','Brake',''],
    ['Hi Fab Homes & Pods',5,'Section Welding','Welding',''],
    ['Hi Fab Homes & Pods',6,'Powder Coating','Powder',''],
    ['Hi Fab Homes & Pods',7,'Assembly','Hardware',''],
    ['Hi Fab Homes & Pods',8,'Packing','Packing',''],
    ['Hi Fab Homes & Pods',9,'Dispatch','Packing',''],

    ['Laser Cutting job work',1,'Design','Design',''],
    ['Laser Cutting job work',2,'Nesting','Design',''],
    ['Laser Cutting job work',3,'Laser Cutting','Laser',''],
    ['Laser Cutting job work',4,'Bending','Brake',''],
    ['Laser Cutting job work',5,'Fabrication','Welding',''],
    ['Laser Cutting job work',6,'Powder Coating','Powder',''],
    ['Laser Cutting job work',7,'Packing','Packing',''],
    ['Laser Cutting job work',8,'Dispatch','Packing','']
  ]);

  seed_('Items',[
    ['Folding door shutter','Doors & Windows - Retail','Piece','yes'],
    ['Door frame section','Doors & Windows - Retail','Piece','yes'],
    ['Window shutter','Doors & Windows - Wholesale','Piece','yes'],
    ['WC window','Doors & Windows - Wholesale','Piece','yes'],
    ['Steel door','Doors & Windows - Wholesale','Piece','yes'],
    ['Baffle 50x20 panel','Architectural','Piece','yes'],
    ['Baffle carrier','Architectural','Piece','yes'],
    ['L Bracket','Architectural','Piece','yes'],
    ['Z Louver','Architectural','Piece','yes'],
    ['Kiosk','Hi Fab Homes & Pods','Pod','yes'],
    ['Security cabin','Hi Fab Homes & Pods','Pod','yes'],
    ['Job work batch','Laser Cutting job work','Batch','yes']
  ]);

  /* Key, Family, Operation, Grp, Setup, TargetMin, PlanMin, Samples, LastLearned */
  const st=[
    ['Baffle 50x20 panel','Laser Cutting','Laser',5,1.5],
    ['Baffle 50x20 panel','Bending','Brake',15,2],
    ['Baffle 50x20 panel','Cut to Length','CTL',8,0.2],
    ['Baffle 50x20 panel','Powder Coating','Powder',25,3],
    ['Baffle carrier','Laser Cutting','Laser',5,10],
    ['Baffle carrier','Bending','Brake',15,1.5],
    ['L Bracket','Bending','Brake',15,1],
    ['Folding door shutter','Laser Cutting','Laser',5,3],
    ['Folding door shutter','Bending','Brake',15,10],
    ['Folding door shutter','Tacking','Welding',10,4],
    ['Folding door shutter','Full Welding','Welding',10,10],
    ['Folding door shutter','Grinding','Grinding',5,10],
    ['Folding door shutter','Powder Coating','Powder',25,12],
    ['Folding door shutter','Hardware Assembly','Hardware',25,12],
    ['Door frame section','Bending','Brake',15,2],
    ['Window shutter','Bending','Brake',15,10]
  ];
  seed_('StdTimes',st.map(r=>[r[0]+'|'+r[1],r[0],r[1],r[2],r[3],r[4],r[4],0,'']));

  seed_('Stock',[
    ['S-09-1250-2500','GI Sheet',0.9,1250,2500,'GI',60,'sheets',10,1,72,'yes',''],
    ['S-12-1250-2500','GI Sheet',1.2,1250,2500,'GI',12,'sheets',5,1,72,'yes',''],
    ['S-06-1220-2440','GI Sheet',0.6,1220,2440,'GI',0,'sheets',5,1,72,'yes',''],
    ['S-05-1220-2440','GI Sheet',0.5,1220,2440,'GI',10,'sheets',5,1,72,'yes',''],
    ['S-20-1250-2500','MS Sheet',2,1250,2500,'MS',1,'sheets',3,1,68,'yes',''],
    ['S-30-1250-2500','MS Sheet',3,1250,2500,'MS',1,'sheets',3,1,68,'yes',''],
    ['S-05-1250-3100','GI Sheet',0.5,1250,3100,'GI',6,'sheets',5,1,72,'yes',''],
    ['S-06-1250-3100','GI Sheet',0.6,1250,3100,'GI',6,'sheets',5,1,72,'yes',''],
    ['S-05-1250-2500-PC','Precoated Sheet',0.5,1250,2500,'Precoated White',2,'sheets',5,3,86,'yes',''],
    ['S-08-1250-2500','GI Sheet',0.8,1250,2500,'GI',1,'sheets',5,1,72,'yes',''],
    ['C-05-122-PC','Precoated Coil',0.5,122,0,'Precoated White',0,'kg',500,5,78,'yes',''],
    ['C-GI-COIL','GI Coil',0,0,0,'GI',14,'coils',3,5,78,'yes','']
  ]);
  seed_('Powder',[
    ['PW-9005','Rapid Coat','RAL 9005','Matt',18,15,260,50,'yes',''],
    ['PW-WHSTR','Rapid Coat','White Structure','Structure',10,15,260,50,'yes',''],
    ['PW-8011','Fortune Coat','RAL 8011','Semi Gloss',10,15,255,50,'yes',''],
    ['PW-IVSTR','Rapid Coat','Ivory Structure','Structure',30,15,260,50,'yes',''],
    ['PW-9010','Rapid Coat','RAL 9010','Matt',20,15,260,50,'yes',''],
    ['PW-7015','Beger','RAL 7015','Semi Gloss PP',50,20,270,50,'yes',''],
    ['PW-BLSTR','Libra','Black Structure PP','Structure',20,15,250,50,'yes',''],
    ['PW-8004','Libra','RAL 8004','Semi Gloss PP',15,15,250,50,'yes',''],
    ['PW-WGSAT','Libra','Warm Gray Satin','Satin',25,15,250,50,'yes',''],
    ['PW-7044-L','Libra','RAL 7044','Matt',10,15,250,50,'yes',''],
    ['PW-7043','Libra','RAL 7043','Matt',30,15,250,50,'yes',''],
    ['PW-7035','Rapid Coat','RAL 7035','Glossy',75,20,260,50,'yes',''],
    ['PW-CB03','Libra','CB 03 Text PP','Textured',20,15,250,50,'yes',''],
    ['PW-7044-R','Rapid Coat','RAL 7044','Matt',12,15,260,50,'yes',''],
    ['PW-7006','Progressive','RAL 7006','Semi Gloss PP',210,50,265,50,'yes',''],
    ['PW-CB013','Libra','CB 013 Text PP','Textured',8,15,250,50,'yes',''],
    ['PW-DAGRY','Rapid Coat','D.A. Gray Structure','Structure',5,15,260,50,'yes','']
  ]);
  seed_('Notes',[
    ['N-SEED1',new Date(),'','', '','Powder','Powder Coating','station','yes','Ashutosh','director',
     'RAL 7044 Matt exists from BOTH Libra and Rapid Coat. Never spray both makes on the same job — the shade will not match.','yes'],
    ['N-SEED2',new Date(),'','', '','Brake','Bending','station','yes','Ashutosh','director',
     'Precoated sheet scratches easily. Clean the die and use protective film on the bottom tool.','yes']
  ]);
  seed_('Challans',[['494','2026-07-29','','Jayant Shirke','Katraj',
    'Folding Door 3sh x4, 1sh x1',5,'MH12 XX8696','Gulab Dhombe','migrated','']]);

  seedProjects_();
}

/* Creates the 18 live projects AND their full task routings, with sensible
   default assignments so the operator screens are not empty on day one.      */
function seedProjects_(){
  if(sheet_('Projects').getLastRow()>=2) return;
  const ASSIGN={'Laser Cutting':'Umesh','Cut to Length':'Umesh','Bending':'Kaveri',
    'Tacking':'Pooja','Full Welding':'Pooja','Section Welding':'Vinod','Fabrication':'Vinod',
    'Grinding':'Rambhadevi','Powder Coating':'Padma','Hardware Assembly':'Alka',
    'Assembly':'Alka','Packing':'Gulab Dhombe','Dispatch':'Gulab Dhombe',
    'Design':'Prashant Swami','Nesting':'Prashant Swami','Measurement':'Surekha Thakar',
    'Installation':'Surekha Thakar'};
  const P=[
    ['P-001','Nagpur','Doors & Windows - Wholesale','Rupali','Nagpur','','S',13,'Door','2026-08-05','Powder Coating'],
    ['P-002','Ranade','Doors & Windows - Wholesale','Rupali','Ranade Relators','Baner','S',13,'Door','2026-08-12','Full Welding'],
    ['P-003','Retail 1','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-04','Full Welding'],
    ['P-004','Retail 2','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-05','Powder Coating'],
    ['P-005','Retail 3','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-10','Bending'],
    ['P-006','Retail 4','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-04','Full Welding'],
    ['P-007','Retail 5','Doors & Windows - Retail','Rupali','','','S',1,'Door','2026-08-03','Bending'],
    ['P-008','Vaichal frames','Doors & Windows - Wholesale','Rupali','Vaichal','','M',35,'Door Frames','2026-08-18','Full Welding'],
    ['P-009','Vaichal WC windows','Doors & Windows - Wholesale','Rupali','Vaichal','','M',98,'WC Windows','2026-08-18','Full Welding'],
    ['P-010','Osian One','Architectural','Ashutosh','Osian','','XL',2000,'Baffles','2026-08-20','Cut to Length'],
    ['P-011','Ashiana','Architectural','Ashutosh','Ashiana','','L',600,'Baffles','2026-08-01','Packing'],
    ['P-012','Badiyani-Vanaha','Architectural','Ashutosh','Badiyani','','L',600,'Baffles','2026-08-01','Packing'],
    ['P-013','Nirmiti Developers','Architectural','Ashutosh','Nirmiti','','S',4,'Z Louvers','2026-07-31','Packing'],
    ['P-014','Kiosk','Hi Fab Homes & Pods','Mohit','','','M',1,'Pod','2026-07-30','Dispatch'],
    ['P-015','Satyajit Gaikwad','Laser Cutting job work','Ashutosh','Satyajit','','XL',52,'Boxes','2026-08-01','Packing'],
    ['P-016','Trimech','Laser Cutting job work','Ashutosh','Trimech','','S',1,'Batch','2026-07-30','Dispatch'],
    ['P-017','ASN Packaging','Laser Cutting job work','Ashutosh','ASN','','L',1,'Batch','2026-08-10','Nesting'],
    ['P-018','Navdurga','Laser Cutting job work','Ashutosh','Navdurga','','L',1,'Batch','2026-08-10','Design']
  ];
  P.forEach(r=>{
    const p={ProjectID:r[0],Name:r[1],Division:r[2],Director:r[3],Customer:r[4],Address:r[5],
      Size:r[6],Qty:r[7],Unit:r[8],PromisedDate:r[9],Stage:r[10],Blocker:'',Active:'yes'};
    upsert_('Projects','ProjectID',p);
    generateTasks_(p,ASSIGN);
    /* fast-forward tasks that are already finished in real life */
    const tasks=readAll_('Tasks').filter(t=>t.ProjectID===p.ProjectID)
                                 .sort((a,b)=>Number(a.Seq)-Number(b.Seq));
    let hit=false;
    tasks.forEach(t=>{
      if(t.Operation===r[10]) hit=true;
      if(!hit) upsert_('Tasks','TaskID',{TaskID:t.TaskID,Status:'done',
        QtyDone:Number(p.Qty)||0,DoneTs:new Date()});
      else if(t.Operation===r[10]) upsert_('Tasks','TaskID',{TaskID:t.TaskID,
        Status:'ready',ReadyTs:new Date()});
    });
  });
  upsert_('Projects','ProjectID',{ProjectID:'P-017',Blocker:'Waiting drawing / approval'});
  upsert_('Projects','ProjectID',{ProjectID:'P-018',Blocker:'Waiting drawing / approval'});
}
