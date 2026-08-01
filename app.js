/* =====================================================================
   HI TEK PRODUCTION — app.js  v3  (task-centric)
   An operator sees only the tasks assigned to him. Nothing else exists.
   ===================================================================== */
(function(){
'use strict';
var API='/api';
var S={token:null,me:null,data:null,queue:[],tab:null,sel:null,
       station:null,stationToken:null,crew:{op:null,helpers:[]}};

var store=(function(){
  try{var k='__t';localStorage.setItem(k,'1');localStorage.removeItem(k);
    return{get:function(k){return localStorage.getItem(k);},
           set:function(k,v){localStorage.setItem(k,v);},
           del:function(k){localStorage.removeItem(k);}};
  }catch(e){var m={};return{get:function(k){return m[k]||null;},
    set:function(k,v){m[k]=v;},del:function(k){delete m[k];}};}
})();

function $(i){return document.getElementById(i);}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function nf(n){return (Number(n)||0).toLocaleString('en-IN');}
function dmy(d){if(!d)return '—';var x=new Date(d);if(isNaN(x))return String(d).slice(0,10);
  return ('0'+x.getDate()).slice(-2)+'/'+('0'+(x.getMonth()+1)).slice(-2);}
var tT;function toast(m,bad){var t=$('toast');t.textContent=m;t.className='toast on'+(bad?' bad':'');
  clearTimeout(tT);tT=setTimeout(function(){t.className='toast';},2800);}
function opt(sel,v,t,on){var o=el('option',null,t||v);o.value=v;if(on)o.selected=true;sel.appendChild(o);return o;}
function lab(b,t){b.appendChild(el('label',null,t));}
function inp(b,type,ph){var i=el('input');i.type=type||'text';if(ph)i.placeholder=ph;b.appendChild(i);return i;}

/* ---------- API + offline ---------- */
/* Apps Script queues concurrent requests. A queued call must retry quietly,
   not surface as "the portal is locked". Three tries, 1s / 2s / 4s.          */
function api(a,body,tries){
  tries=tries||0;
  return fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(Object.assign({action:a,token:S.token},body||{}))})
  .then(function(r){
    if(r.status===429||r.status===503||r.status>=500){
      if(tries<3) return wait(Math.pow(2,tries)*1000).then(function(){return api(a,body,tries+1);});
      throw new Error('Server is busy. Please try again in a minute.');
    }
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  })
  .then(function(j){
    if(j&&j.status!=='success'){
      if(j.code==='AUTH'){ logout(true); throw new Error(j.message||'Session expired'); }
      if(/busy/i.test(j.message||'') && tries<3)
        return wait(Math.pow(2,tries)*1000).then(function(){return api(a,body,tries+1);});
      throw new Error(j.message||'Request failed');
    }
    return j.data;
  })
  .catch(function(e){
    /* a dropped connection is not a failed action — retry before giving up */
    if(/Failed to fetch|NetworkError|Load failed/i.test(e.message||'') && tries<3)
      return wait(Math.pow(2,tries)*1000).then(function(){return api(a,body,tries+1);});
    throw e;
  });
}
function wait(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
function queueWrite(a,b){S.queue.push({action:a,body:b});store.set('q',JSON.stringify(S.queue));renderSync();}
function flushQueue(){
  if(!S.queue.length||!S.token)return Promise.resolve();
  var it=S.queue[0];
  return api(it.action,it.body).then(function(){S.queue.shift();
    store.set('q',JSON.stringify(S.queue));renderSync();return flushQueue();})
    .catch(function(){renderSync();});
}
function renderSync(){var b=$('syncbar');
  if(S.queue.length){b.classList.remove('hidden');
    $('syncmsg').textContent=S.queue.length+' entr'+(S.queue.length>1?'ies':'y')+' saved on this phone, waiting for network';}
  else b.classList.add('hidden');}

/* ---------- roles ---------- */
var TABS={
  director:[['work','Work'],['tracker','Order tracker'],['docs','Documents'],['board','Sequence'],
            ['report','Screenshots'],['stock','Stores'],['scores','Scoreboard'],['admin','Setup']],
  planner:[['tracker','Order tracker'],['work','Work'],['docs','Documents'],['board','Sequence'],
           ['report','Screenshots'],['stock','Stores'],['scores','Scoreboard'],['admin','Setup']],
  supervisor:[['work','My department'],['tracker','Order tracker'],['docs','Documents'],
              ['board','Sequence'],['report','Screenshots'],['stock','Stores'],['scores','Scoreboard']],
  operator:[['work','माझे काम'],['scores','गुण']],
  stores:[['stock','Stores'],['tracker','Order tracker'],['docs','Documents']],
  office:[['tracker','Order tracker'],['docs','Documents'],['board','Sequence'],
          ['report','Screenshots'],['stock','Stores']],
  accounts:[['report','Screenshots'],['stock','Stores'],['docs','Documents']],
  station:[['work','कामे / Jobs']]
};
function isOp(){return S.me&&S.me.role==='operator';}
function canAssign(){return ['director','planner','supervisor'].indexOf(S.me.role)>=0;}

/* ---------- login ---------- */
function showLogin(m){$('app').classList.add('hidden');$('login').classList.remove('hidden');
  if(m){var x=$('loginMsg');x.textContent=m;x.className='msg show';}
  $('offhint').textContent=S.queue.length?S.queue.length+' entries saved on this phone will upload after login.':'';}
$('loginForm').addEventListener('submit',function(e){
  e.preventDefault();var b=$('loginBtn');b.disabled=true;b.textContent='Checking…';
  $('loginMsg').className='msg';
  fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'LOGIN',username:$('u').value.trim(),password:$('p').value})})
  .then(function(r){return r.json();})
  .then(function(j){if(j.status!=='success')throw new Error(j.message||'Login failed');
    S.token=j.data.token;S.me=j.data.user;
    store.set('t',S.token);store.set('me',JSON.stringify(S.me));
    store.set('who',S.me.username||'');start();})
  .catch(function(e){var x=$('loginMsg');x.textContent=e.message;x.className='msg show';})
  .then(function(){b.disabled=false;b.textContent='Log in';});
});
function logout(exp){S.token=null;S.me=null;store.del('t');store.del('me');
  showLogin(exp?'Your session expired. Please log in again.':'');}
$('logout').addEventListener('click',function(){logout(false);});

/* ---------- boot ---------- */
function start(){
  $('login').classList.add('hidden');$('app').classList.remove('hidden');
  $('whoName').textContent=S.me.name+' · '+S.me.role;
  var onFloor=['operator','helper','supervisor','manager','station'].indexOf(S.me.role)>=0;
  $('stationbar').style.display=onFloor?'flex':'none';
  $('stnName').textContent=S.me.workCentre||S.me.station||'—';
  /* Always available on the floor. Hiding it was the bug — a station account
     has no personal work centre until somebody signs in with a PIN.          */
  /* Only a shared tablet needs a "who is working" switch. On a personal
     login the person is already known, so the button just adds helpers.     */
  $('crewBtn').classList.toggle('hidden',!onFloor);
  $('crewBtn').innerHTML = (S.me.role==='station')
    ? 'कोण काम करत आहे <em>Who is working</em>'
    : 'मदतनीस <em>Helpers with me</em>';
  renderCrew();
  var t=$('tabs');t.innerHTML='';
  (TABS[S.me.role]||TABS.operator).forEach(function(x,i){
    var b=el('button','tab'+(i?'':' on'),x[1]);b.dataset.v=x[0];
    b.addEventListener('click',function(){setTab(x[0]);});t.appendChild(b);
    if(!i)S.tab=x[0];});
  setTab(S.tab);flushQueue().then(refresh);
}
function setTab(v){S.tab=v;
  Array.prototype.forEach.call(document.querySelectorAll('.tab'),function(b){b.classList.toggle('on',b.dataset.v===v);});
  Array.prototype.forEach.call(document.querySelectorAll('.view'),function(s){s.classList.toggle('on',s.id==='v-'+v);});
  window.scrollTo(0,0);}
function refresh(){
  if(S._busy) return Promise.resolve();      /* never stack two bootstraps */
  S._busy=true;
  return api('bootstrap').then(function(d){S._busy=false;S._lastRefresh=Date.now();S.data=d;
  renderStop();renderWork();renderTracker();renderDocs();renderBoard();renderReport();
  renderStock();renderScores();renderAdmin();})
  .catch(function(e){S._busy=false;toast(e.message,true);});}

/* ---------- WORK CENTRE downtime (not per project) ---------- */
var tick;
function renderStop(){
  var o=S.data&&S.data.openStop,bar=$('stopbar');clearInterval(tick);
  if(!o){bar.classList.add('hidden');return;}
  bar.classList.remove('hidden');
  $('stopReason').textContent=o.Reason+(o.WorkCentre?' · '+o.WorkCentre:'');
  var st=new Date(o.StartTs).getTime();
  function t(){$('stopTimer').textContent=Math.max(0,Math.round((Date.now()-st)/60000))+' min';}
  t();tick=setInterval(t,20000);
}
$('stopBtn').addEventListener('click',function(){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','Work centre stopped'));
  b.appendChild(el('div','top',S.me.workCentre||'—'));
  b.appendChild(el('p','note','This stops the whole work centre, not one job. Everything queued here is affected.'));
  var wrap=el('div','reasons');
  (S.data.reasons||[]).forEach(function(r){
    var btn=el('button');btn.innerHTML='<span class="dev">'+esc(r[1])+'</span><em>'+r[0]+'</em>';
    btn.addEventListener('click',function(){
      closeSheet();
      api('stopStart',{code:r[0],workCentre:S.me.workCentre||''})
        .then(function(){toast('बंद नोंदवले — घड्याळ चालू');refresh();})
        .catch(function(){queueWrite('stopStart',{code:r[0],workCentre:S.me.workCentre||''});
          toast('Saved on this phone');});
    });wrap.appendChild(btn);});
  b.appendChild(wrap);$('sheet').classList.remove('hidden');
});
$('resumeBtn').addEventListener('click',function(){
  api('stopEnd',{workCentre:S.me.workCentre||''}).then(function(d){
    toast((d.minutes||0)+' min downtime recorded');refresh();})
    .catch(function(){queueWrite('stopEnd',{workCentre:S.me.workCentre||''});toast('Saved on this phone');});
});

/* ---------- STATION MODE ----------
   One tablet stays logged in at the machine. People identify with a 4-digit PIN.
   This is what makes the system work for helpers who have no phone.            */
function renderCrew(){
  var c=$('stnCrew');c.innerHTML='';
  if(S.crew.op){
    var a=el('span','crewchip op',S.crew.op);c.appendChild(a);
  }
  S.crew.helpers.forEach(function(h){c.appendChild(el('span','crewchip help',h));});
  if(!S.crew.op&&!S.crew.helpers.length&&S.me.workCentre)
    c.appendChild(el('span','crewchip','कोणी नाही · nobody signed in'));
}
$('crewBtn').addEventListener('click',function(){crewDialog();});
function wcNameOf(){ return S.me.workCentre||S.me.station||'Station'; }
function crewDialog(){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','Who is working here now'));
  b.appendChild(el('div','top',wcNameOf()));
  b.appendChild(el('p','note', S.me.role==='station'
    ? 'The operator signs in with a PIN. Helpers are just ticked — no PIN, no device.'
    : 'You are already signed in. Just tick anyone helping you right now.'));

  var wcName=S.me.workCentre||S.me.station||'';
  var all=(S.data.users||[]);
  var people=all.filter(function(u){
    return !wcName || u.WorkCentre===wcName || u.Kind==='helper';});
  if(!people.length) people=all;   /* never show an empty picker */
  if(S.me.role==='station'){
    lab(b,'Operator running the machine');
    var ops=el('div','people');
    people.filter(function(u){return u.Kind!=='helper';}).forEach(function(u){
      var d=el('div','person'+(S.crew.op===u.Name?' sel':''),u.Name);
      d.appendChild(el('small',null,'Operator'));
      d.addEventListener('click',function(){pinPad(u.Name);});
      ops.appendChild(d);});
    b.appendChild(ops);
  } else {
    S.crew.op=S.me.name;
  }

  lab(b,'Helpers assisting (tap to add or remove)');
  var hs=el('div','people');
  people.filter(function(u){return u.Kind==='helper'&&u.Name!==S.me.name;}).forEach(function(u){
    var on=S.crew.helpers.indexOf(u.Name)>=0;
    var d=el('div','person'+(on?' sel':''),u.Name);
    d.appendChild(el('small',null,'Helper'));
    d.addEventListener('click',function(){
      var i=S.crew.helpers.indexOf(u.Name);
      if(i>=0)S.crew.helpers.splice(i,1);else S.crew.helpers.push(u.Name);
      store.set('crew',JSON.stringify(S.crew));
      d.classList.toggle('sel');renderCrew();});
    hs.appendChild(d);});
  if(!hs.children.length) hs.appendChild(el('div','note','No helpers listed. Add them in Setup with Kind = helper.'));
  b.appendChild(hs);

  var go=el('button','bigbtn b-done dev');go.innerHTML='ठीक आहे <em>Done</em>';
  go.addEventListener('click',closeSheet);b.appendChild(go);
  $('sheet').classList.remove('hidden');
}
function pinPad(name){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','PIN for'));
  b.appendChild(el('div','top',name));
  var dots=el('div','pindots','');b.appendChild(dots);
  var pin='';
  var g=el('div','pingrid');
  ['1','2','3','4','5','6','7','8','9','←','0','OK'].forEach(function(k){
    var btn=el('button','pinkey',k);btn.type='button';
    btn.addEventListener('click',function(){
      if(k==='←'){pin=pin.slice(0,-1);}
      else if(k==='OK'){submit();return;}
      else if(pin.length<6){pin+=k;}
      dots.textContent=pin.replace(/./g,'●');
      if(pin.length===4)submit();
    });
    g.appendChild(btn);});
  b.appendChild(g);
  function submit(){
    if(pin.length<4)return;
    fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action:'PIN',token:S.stationToken||S.token,name:name,pin:pin})})
    .then(function(r){return r.json();})
    .then(function(j){
      if(j.status!=='success')throw new Error(j.message||'Wrong PIN');
      if(!S.stationToken){S.stationToken=S.token;store.set('stok',S.stationToken);}
      S.token=j.data.token;S.me=j.data.user;
      S.crew.op=j.data.user.name;store.set('crew',JSON.stringify(S.crew));
      store.set('t',S.token);store.set('me',JSON.stringify(S.me));
      closeSheet();toast(j.data.user.name+' signed in');start();
    })
    .catch(function(e){pin='';dots.textContent='';toast(e.message,true);});
  }
  $('sheet').classList.remove('hidden');
}

/* ---------- MY WORK ---------- */
function renderWork(){
  var d=S.data;if(!d)return;
  $('workTitle').textContent=isOp()?(S.me.name+' — '+(S.me.workCentre||''))
    :(S.me.role==='supervisor'?('Department — '+(S.me.workCentre||'')):'All open tasks');
  $('workSub').textContent=isOp()?'फक्त तुमच्या नावावरचे काम. सर्वात वरचे आधी करा.'
    :'Tap a task to record work. Long-press to reassign.';
  $('otherWork').style.display=isOp()?'block':'none';

  var q=$('workQueue');q.innerHTML='';
  var list=d.myTasks||[];
  if(!list.length){q.appendChild(el('div','emptyq',
    isOp()?'तुमच्यासाठी आत्ता काम नाही. सुपरवायझरला विचारा.':'No open tasks.'));return;}
  list.forEach(function(t){
    var c=el('div','task '+(t.state||'ok'));
    var top=el('div','ttop');
    top.appendChild(el('div','top',t.Operation));
    top.appendChild(el('div','tmeta','DUE '+dmy(t.PromisedDate)+' · CR '+(t.cr||0)));
    c.appendChild(top);
    c.appendChild(el('div','tproj',t.ProjectName+' · '+(t.WorkCentre||t.Grp)+
      (t.AssignedTo&&!isOp()?' · '+t.AssignedTo:'')+(t.Note?' · ⚠ '+t.Note:'')));
    var tgt=Number(t.QtyTarget)||0,dn=Number(t.QtyDone)||0;
    var bar=el('div','tprog');var i=el('i');
    i.style.width=(tgt?Math.min(100,dn/tgt*100):0)+'%';bar.appendChild(i);c.appendChild(bar);
    c.appendChild(el('div','tqty',dn+' / '+tgt+(t.QtyRework?'  ·  '+t.QtyRework+' rework':'')));
    if(t.noteCount||t.docCount){
      var ch=el('div','chips');
      if(t.noteCount)ch.appendChild(el('span','chip on',t.noteCount+' note'+(t.noteCount>1?'s':'')));
      if(t.docCount)ch.appendChild(el('span','chip',t.docCount+' file'+(t.docCount>1?'s':'')));
      c.appendChild(ch);
    }
    /* pinned notes shout on the card itself — an operator should not have to open anything */
    (t.notes||[]).filter(function(n){return n.Pinned==='yes';}).slice(0,2).forEach(function(n){
      var w=el('div','note-item pinned '+(n.Scope==='station'?'station':''));
      w.appendChild(el('div',null,n.Text));
      c.appendChild(w);
    });
    c.addEventListener('click',function(){openTask(t);});
    if(canAssign()){
      var press;
      c.addEventListener('contextmenu',function(e){e.preventDefault();assignDialog(t);});
      c.addEventListener('touchstart',function(){press=setTimeout(function(){assignDialog(t);},650);});
      c.addEventListener('touchend',function(){clearTimeout(press);});
    }
    q.appendChild(c);
  });
}
function openTask(t,off){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl',off?'Other work (off station)':'Record work'));

  b.appendChild(el('div','top',t.Operation));
  b.appendChild(el('div','tproj',t.ProjectName+' · '+(t.WorkCentre||t.Grp)));

  /* --- notes first: instructions before action --- */
  if((t.notes||[]).length){
    var nw=el('div','notes');
    t.notes.forEach(function(n){
      var it=el('div','note-item'+(n.Pinned==='yes'?' pinned':'')+(n.Scope==='station'?' station':''));
      it.appendChild(el('div',null,n.Text));
      it.appendChild(el('div','nmeta',(n.Scope==='station'?'STANDING · ':n.Scope==='project'?'PROJECT · ':'')+
        n.By+' · '+dmy(n.Date)));
      nw.appendChild(it);
    });
    b.appendChild(nw);
  }
  /* --- documents: drawing, BOQ, job card, right where the work happens --- */
  if((t.docs||[]).length){
    var tr=el('div','thumbrow');
    t.docs.slice(0,8).forEach(function(d){
      var a=el('a');a.href=d.Url;a.target='_blank';a.rel='noopener';
      a.title=d.Kind+' — '+d.Name;
      if(String(d.Mime).indexOf('image')===0)a.style.backgroundImage='url('+d.ThumbUrl+')';
      else a.textContent='PDF';
      tr.appendChild(a);});
    b.appendChild(tr);
  }
  var actions=el('div','chips');
  var bNote=el('button','chip');bNote.textContent='+ Note';
  bNote.addEventListener('click',function(){noteDialog(t);});
  var bFile=el('button','chip');bFile.textContent='+ Photo / file';
  bFile.addEventListener('click',function(){uploadDialog(t.ProjectID,t.TaskID);});
  var bMat=el('button','chip');bMat.textContent='+ Material used';
  bMat.addEventListener('click',function(){materialDialog(t);});
  actions.appendChild(bNote);actions.appendChild(bFile);actions.appendChild(bMat);
  b.appendChild(actions);

  lab(b,'Item');
  var fs=el('select');
  var fams=(S.data.std||[]).filter(function(x){return x.Operation===t.Operation;})
                           .map(function(x){return x.Family;});
  if(!fams.length) fams=(S.data.items||[]).map(function(x){return x.Family;});
  fams.filter(function(v,i,a){return a.indexOf(v)===i;}).forEach(function(f){opt(fs,f);});
  b.appendChild(fs);

  if(off){ lab(b,'Which work centre'); var wc=el('select');
    (S.data.workCentres||[]).forEach(function(w){opt(wc,w.Name);});b.appendChild(wc); }

  lab(b,'Quantity');
  S.sel={qty:10};
  var g=el('div','qtygrid');
  [1,5,10,25,50,100].forEach(function(n){
    var q=el('button','qbtn'+(n===10?' sel':''),String(n));q.type='button';
    q.addEventListener('click',function(){S.sel.qty=n;
      Array.prototype.forEach.call(g.children,function(c){c.classList.remove('sel');});q.classList.add('sel');});
    g.appendChild(q);});
  b.appendChild(g);
  var ex=inp(b,'number','or type an exact count');
  ex.addEventListener('input',function(){if(ex.value){S.sel.qty=Number(ex.value);
    Array.prototype.forEach.call(g.children,function(c){c.classList.remove('sel');});}});

  lab(b,'Rejected / rework pieces (blank if none)');
  var rw=inp(b,'number','0');

  var done=el('button','bigbtn b-done dev');done.innerHTML='पूर्ण झाले <em>Done</em>';
  done.addEventListener('click',function(){
    var body={taskID:t.TaskID,family:fs.value,qty:S.sel.qty,
      rework:rw.value?Number(rw.value):0,
      workCentre:off?wc.value:(t.WorkCentre||S.me.workCentre||''),offStation:off?1:0,
      helpers:S.crew.helpers.join(', '),via:S.stationToken?'station':'phone'};
    closeSheet();
    api('tap',body).then(function(r){
      toast(r.finished?('Task complete → '+(r.next||'')):(S.sel.qty+' पूर्ण · logged'));
      refresh();
    }).catch(function(e){
      if(String(e.message).indexOf('assigned to')>=0){toast(e.message,true);return;}
      queueWrite('tap',body);toast('Saved on this phone');});
  });
  b.appendChild(done);

  if(!off){
    var fin=el('button','bigbtn b-stop dev');fin.innerHTML='हे काम संपले <em>Task finished</em>';
    fin.addEventListener('click',function(){closeSheet();
      api('completeTask',{taskID:t.TaskID}).then(function(r){
        toast('Passed to '+(r.next||'next station'));refresh();})
        .catch(function(e){toast(e.message,true);});});
    b.appendChild(fin);
  }
  $('sheet').classList.remove('hidden');
}
$('otherWork').addEventListener('click',function(){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','दुसरीकडे केलेले काम / Work you did elsewhere'));
  if(!((S.data.allOpen||[]).length)&&!((S.data.tasks||[]).length)){
    b.appendChild(el('p','note','No open jobs found anywhere. If this looks wrong, log out and log in again.'));
  }
  b.appendChild(el('p','note','Pick the task you actually worked on. Your supervisor will see this was off your own station.'));
  var pool=(S.data.allOpen&&S.data.allOpen.length)?S.data.allOpen:(S.data.tasks||[]);
  pool=pool.filter(function(t){return ['ready','running'].indexOf(String(t.Status))>=0;});

  lab(b,'कोणत्या मशीनवर / Which machine');
  var wsel=el('select');opt(wsel,'','— सर्व / all —');
  pool.map(function(t){return t.Grp;})
      .filter(function(v,i,a){return v&&a.indexOf(v)===i;})
      .sort().forEach(function(g){opt(wsel,g);});
  b.appendChild(wsel);

  lab(b,'कोणते काम / Which job');
  var ts=el('select');ts.size=1;
  var cnt=el('div','note');
  function fillJobs(){
    ts.innerHTML='';
    var list=pool.filter(function(t){return !wsel.value||t.Grp===wsel.value;});
    list.sort(function(a,b){return String(a.ProjectName).localeCompare(String(b.ProjectName));});
    list.forEach(function(t){
      opt(ts,t.TaskID,t.ProjectName+' — '+t.Operation+
        (t.AssignedTo&&t.AssignedTo!==S.me.name?' · '+t.AssignedTo:''));});
    if(!ts.children.length){opt(ts,'','No open jobs there');}
    cnt.textContent=list.length+' open job'+(list.length===1?'':'s')+' to choose from';
  }
  wsel.addEventListener('change',fillJobs);fillJobs();
  b.appendChild(ts);b.appendChild(cnt);
  b.appendChild(el('p','note','No approval needed. It is simply recorded as work you did at another machine.'));
  var go=el('button','bigbtn b-done dev');go.innerHTML='पुढे <em>Continue</em>';
  go.addEventListener('click',function(){
    var t=(S.data.tasks||[]).filter(function(x){return x.TaskID===ts.value;})[0];
    if(!t){toast('Pick a job',true);return;}
    openTask(t,true);
  });
  b.appendChild(go);$('sheet').classList.remove('hidden');
});

/* ---------- MATERIAL FROM INSIDE A TASK ----------
   The operator who consumes the sheet is the one who records it. Stores stops
   being a bottleneck and the stock figure stops drifting.                      */
function materialDialog(t){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','Material used on this job'));
  b.appendChild(el('div','top',t.Operation));
  b.appendChild(el('div','tproj',t.ProjectName));
  lab(b,'What did you use');
  var kind=el('select');opt(kind,'stock','Sheet / coil');opt(kind,'powder','Powder');
  b.appendChild(kind);
  lab(b,'Which one');
  var item=el('select');b.appendChild(item);
  function fill(){
    item.innerHTML='';
    if(kind.value==='powder')
      (S.data.powder||[]).forEach(function(p){opt(item,p.PowderID,p.Shade+' · '+p.Make+' ('+p.StockKg+' kg)');});
    else
      (S.data.stock||[]).forEach(function(i){opt(item,i.ItemID,
        i.Thickness+'mm '+i.Width+'x'+i.Length+' · '+i.Type+' ('+i.Qty+' '+i.Unit+')');});
  }
  kind.addEventListener('change',fill);fill();
  lab(b,'How much');
  var qn=inp(b,'number','quantity');qn.step='any';
  var go=el('button','bigbtn b-done dev');go.innerHTML='वापरले <em>Used</em>';
  go.addEventListener('click',function(){
    var n=Number(qn.value)||0;
    if(!n){toast('Enter a quantity',true);return;}
    var body=(kind.value==='powder')
      ?{powderID:item.value,kg:n,dir:'OUT',workCentre:t.WorkCentre||S.me.workCentre||'',
        taskID:t.TaskID,projectID:t.ProjectID,note:'used at '+t.Operation}
      :{itemID:item.value,qty:n,dir:'OUT',workCentre:t.WorkCentre||S.me.workCentre||'',
        taskID:t.TaskID,projectID:t.ProjectID,note:'used at '+t.Operation};
    closeSheet();
    api(kind.value==='powder'?'powderMove':'stockMove',body)
      .then(function(r){toast(r.low?'Recorded — STOCK NOW LOW':'Material recorded');refresh();})
      .catch(function(e){toast(e.message,true);});});
  b.appendChild(go);$('sheet').classList.remove('hidden');
}

/* ---------- NOTES ---------- */
function noteDialog(t,projectOnly){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','Add a note'));
  b.appendChild(el('div','top',projectOnly?t.Name:t.Operation));
  b.appendChild(el('div','tproj',projectOnly?'':t.ProjectName));
  lab(b,'Note');
  var ta=el('textarea');ta.rows=4;ta.placeholder='e.g. Customer wants hinges on the right side';
  b.appendChild(ta);
  var scope='task',pinned=false;
  if(!projectOnly&&canAssign()){
    lab(b,'Who should see this');
    var sc=el('select');
    opt(sc,'task','Only this task');
    opt(sc,'project','Everyone on this project');
    opt(sc,'station','Standing instruction for '+(t.WorkCentre||t.Grp)+' — shows on every job here');
    b.appendChild(sc);
    lab(b,'Show it on the job card itself');
    var pn=el('select');opt(pn,'','No, keep it inside');opt(pn,'yes','Yes, pin it');b.appendChild(pn);
  }
  var go=el('button','bigbtn b-done');go.textContent='Save note';
  go.addEventListener('click',function(){
    if(!ta.value.trim()){toast('Note is empty',true);return;}
    if(sc){scope=sc.value;pinned=(pn.value==='yes');}
    if(projectOnly){scope='project';}
    closeSheet();
    api('addNote',{text:ta.value,scope:scope,pinned:pinned?1:0,
      projectID:projectOnly?t.ProjectID:t.ProjectID,taskID:projectOnly?'':t.TaskID,
      workCentre:t.WorkCentre||'',operation:t.Operation||''})
      .then(function(){toast('Note saved');refresh();})
      .catch(function(e){toast(e.message,true);});});
  b.appendChild(go);$('sheet').classList.remove('hidden');
}

/* ---------- DOCUMENTS ----------
   Images are resized and re-compressed IN THE BROWSER before upload.
   A 4 MB phone photo becomes about 150 KB, which is what makes this
   workable on a shop-floor connection and inside Apps Script limits. */
function compress(file,maxPx,quality){
  return new Promise(function(res,rej){
    if(String(file.type).indexOf('image')!==0){
      var fr=new FileReader();
      fr.onload=function(){res({data:fr.result.split(',')[1],mime:file.type,name:file.name});};
      fr.onerror=rej;fr.readAsDataURL(file);return;
    }
    var img=new Image(),url=URL.createObjectURL(file);
    img.onload=function(){
      var w=img.width,h=img.height,m=maxPx||1600;
      if(w>m||h>m){ if(w>h){h=Math.round(h*m/w);w=m;} else {w=Math.round(w*m/h);h=m;} }
      var cv=document.createElement('canvas');cv.width=w;cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      var d=cv.toDataURL('image/jpeg',quality||0.72);
      res({data:d.split(',')[1],mime:'image/jpeg',
           name:(file.name||'photo').replace(/\.[^.]+$/,'')+'.jpg'});
    };
    img.onerror=function(){URL.revokeObjectURL(url);rej(new Error('Could not read that image'));};
    img.src=url;
  });
}
var UP={projectID:'',taskID:'',kind:'Other',caption:''};
function uploadDialog(projectID,taskID){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','Upload a file'));
  lab(b,'Project');
  var ps=el('select');
  (S.data.projects||[]).forEach(function(p){opt(ps,p.ProjectID,p.Name,p.ProjectID===projectID);});
  b.appendChild(ps);
  lab(b,'Attach to a specific task (optional)');
  var ts=el('select');opt(ts,'','— whole project —');
  (S.data.tasks||[]).filter(function(t){return t.ProjectID===(projectID||ps.value);})
    .forEach(function(t){opt(ts,t.TaskID,t.Operation+' · '+(t.AssignedTo||'unassigned'),t.TaskID===taskID);});
  b.appendChild(ts);
  ps.addEventListener('change',function(){
    ts.innerHTML='';opt(ts,'','— whole project —');
    (S.data.tasks||[]).filter(function(t){return t.ProjectID===ps.value;})
      .forEach(function(t){opt(ts,t.TaskID,t.Operation+' · '+(t.AssignedTo||'unassigned'));});});
  lab(b,'What is it');
  var ks=el('select');(S.data.docKinds||['Other']).forEach(function(k){opt(ks,k);});b.appendChild(ks);
  lab(b,'Caption (optional)');var cp=inp(b,'text','e.g. site measurement, left elevation');
  var bar=el('div','upbar');var bi=el('i');bar.appendChild(bi);b.appendChild(bar);
  var go=el('button','bigbtn b-done');go.textContent='Choose file / take photo';
  go.addEventListener('click',function(){
    UP={projectID:ps.value,taskID:ts.value,kind:ks.value,caption:cp.value,bar:bi,btn:go};
    $('filePick').click();});
  b.appendChild(go);$('sheet').classList.remove('hidden');
}
$('filePick').addEventListener('change',function(e){
  var f=e.target.files&&e.target.files[0];
  e.target.value='';
  if(!f)return;
  if(UP.btn){UP.btn.disabled=true;UP.btn.textContent='Compressing…';}
  if(UP.bar)UP.bar.style.width='25%';
  compress(f,1600,0.72).then(function(out){
    if(UP.bar)UP.bar.style.width='60%';
    if(UP.btn)UP.btn.textContent='Uploading…';
    return api('upload',{projectID:UP.projectID,taskID:UP.taskID,kind:UP.kind,
      caption:UP.caption,name:out.name,mime:out.mime,data:out.data,
      workCentre:S.me.workCentre||''});
  }).then(function(){
    if(UP.bar)UP.bar.style.width='100%';
    closeSheet();toast('File uploaded');refresh();
  }).catch(function(err){
    if(UP.btn){UP.btn.disabled=false;UP.btn.textContent='Choose file / take photo';}
    if(UP.bar)UP.bar.style.width='0';
    toast(err.message||'Upload failed',true);
  });
});
$('uploadBtn').addEventListener('click',function(){uploadDialog('','');});
function renderDocs(){
  var d=S.data;if(!d)return;
  var f=$('docFilter');
  if(!f.options.length){
    opt(f,'all','All projects');
    (d.projects||[]).forEach(function(p){opt(f,p.ProjectID,p.Name);});
    f.addEventListener('change',renderDocs);
  }
  var v=f.value||'all';
  var docs=[];
  (d.tasks||[]).forEach(function(t){(t.docs||[]).forEach(function(x){
    if(docs.filter(function(y){return y.DocID===x.DocID;}).length===0)docs.push(x);});});
  (d.projects||[]).forEach(function(p){(p.docs||[]).forEach(function(x){
    if(docs.filter(function(y){return y.DocID===x.DocID;}).length===0)docs.push(x);});});
  if(v!=='all')docs=docs.filter(function(x){return x.ProjectID===v;});
  docs.sort(function(a,b){return new Date(b.Ts)-new Date(a.Ts);});
  var g=$('docGrid');g.innerHTML='';
  if(!docs.length){g.appendChild(el('div','emptyq','No documents yet. Upload a BOQ, a measurement sheet or a site photo.'));return;}
  var pn={};(d.projects||[]).forEach(function(p){pn[p.ProjectID]=p.Name;});
  docs.forEach(function(x){
    var c=el('div','doc');
    var a=el('a','thumb');a.href=x.Url;a.target='_blank';a.rel='noopener';
    if(String(x.Mime).indexOf('image')===0)a.style.backgroundImage='url('+x.ThumbUrl+')';
    else{var ic=el('div','ficon',(String(x.Name).split('.').pop()||'FILE').toUpperCase());a.appendChild(ic);}
    c.appendChild(a);
    var bd=el('div','dbody');
    bd.appendChild(el('div','dkind',x.Kind));
    bd.appendChild(el('div','dname',x.Caption||x.Name));
    bd.appendChild(el('div','dmeta',(pn[x.ProjectID]||x.ProjectID||'—')+' · '+x.By+' · '+dmy(x.Date)));
    c.appendChild(bd);
    if(canAssign()){
      var act=el('div','dact');
      var del=el('button','linkbtn','Remove');
      del.addEventListener('click',function(){
        api('delDoc',{docID:x.DocID}).then(function(){toast('Removed');refresh();})
          .catch(function(e){toast(e.message,true);});});
      act.appendChild(del);c.appendChild(act);
    }
    g.appendChild(c);
  });
}

/* ---------- ORDER TRACKER ---------- */
function renderTracker(){
  var d=S.data;if(!d)return;
  var f=$('trackFilter');
  if(!f.options.length){
    opt(f,'open','Open projects');opt(f,'all','All projects');opt(f,'late','Late only');
    ['Rupali','Ashutosh','Mohit'].forEach(function(x){opt(f,'dir:'+x,x+"'s projects");});
    f.addEventListener('change',renderTracker);
  }
  var v=f.value||'open';
  var list=(d.projects||[]).filter(function(p){
    if(v==='all')return true;
    if(v==='late')return p.state==='late';
    if(v.indexOf('dir:')===0)return p.Director===v.slice(4);
    return p.state!=='done';});
  var wrap=$('trackList');wrap.innerHTML='';
  if(!list.length){wrap.appendChild(el('div','emptyq','Nothing here.'));return;}
  list.forEach(function(p){
    var c=el('div','trk');
    var h=el('div','trkhead');
    h.appendChild(el('b',null,p.Name));
    var meta=el('div','tmeta',p.Director+' · due '+dmy(p.PromisedDate)+
      ' · CR '+(p.cr||0)+' · '+p.pct+'% done');
    h.appendChild(meta);
    if(canAssign()){
      var hb=el('div','trkbtns');
      var bs=el('button','btn ghost small','Set stage');
      bs.addEventListener('click',function(e){e.stopPropagation();stageDialog(p);});
      hb.appendChild(bs);
      if(['director','planner'].indexOf(S.me.role)>=0){
        var be2=el('button','btn ghost small','Edit project');
        be2.addEventListener('click',function(e){e.stopPropagation();projectEditor(p);});
        hb.appendChild(be2);
      }
      h.appendChild(hb);
    }
    c.appendChild(h);
    if(p.Blocker) c.appendChild(el('div','tproj','⚠ '+p.Blocker));
    var tasks=(d.tasks||[]).filter(function(t){return t.ProjectID===p.ProjectID;})
      .sort(function(a,b){return Number(a.Seq)-Number(b.Seq);});
    var pipe=el('div','pipe');
    tasks.forEach(function(t){
      var st=String(t.Status);
      var s=el('div','step '+st);
      s.appendChild(el('div','sn',String(t.Seq)));
      s.appendChild(el('div','st',t.Operation));
      s.appendChild(el('div','sw',(t.AssignedTo||'—')+
        (st==='running'?' · '+t.QtyDone+'/'+t.QtyTarget:'')));
      if(canAssign()) s.addEventListener('click',function(){taskEditor(t);});
      pipe.appendChild(s);});
    c.appendChild(pipe);
    var ch=el('div','chips');
    if((p.docs||[]).length)ch.appendChild(el('span','chip',p.docs.length+' file'+(p.docs.length>1?'s':'')));
    if(canAssign()){
      var bn=el('button','chip');bn.textContent='+ Note';
      bn.addEventListener('click',function(){noteDialog(p,true);});
      var bf=el('button','chip');bf.textContent='+ File';
      bf.addEventListener('click',function(){uploadDialog(p.ProjectID,'');});
      ch.appendChild(bn);ch.appendChild(bf);

    }
    c.appendChild(ch);
    (p.notes||[]).slice(0,3).forEach(function(n){
      var it=el('div','note-item'+(n.Pinned==='yes'?' pinned':''));
      it.appendChild(el('div',null,n.Text));
      it.appendChild(el('div','nmeta',n.By+' · '+dmy(n.Date)));
      c.appendChild(it);});
    wrap.appendChild(c);
  });
}

/* ---------- SEQUENCE ---------- */
var DIRCOL={Rupali:'var(--rupali)',Ashutosh:'var(--ashutosh)',Mohit:'var(--mohit)'};
function renderBoard(){
  var d=S.data;if(!d)return;var L=d.load,pct=L.pctOfWeek;
  $('loadCard').innerHTML='<h2>Pressbrake — this week</h2>'+
    '<div class="load"><i style="width:'+Math.min(pct,140)/140*100+'%;background:'+
    (pct>100?'var(--late)':pct>85?'var(--warn)':'var(--ok)')+'"></i>'+
    '<span class="cap" style="left:'+(100/140*100)+'%"></span></div><div class="kpi">'+
    k(pct+'%','Load',pct>100?'var(--late)':'var(--ok)')+k(nf(L.demand),'Minutes owed')+
    k(nf(L.brakeWeek),'Available')+k(nf(L.released),'Released to pool','var(--ashutosh)')+'</div>';
  $('boardTable').innerHTML='<thead><tr><th>Project</th><th>Owner</th><th>At</th>'+
    '<th class="num">Due</th><th class="num">Brake</th><th class="num">Days</th>'+
    '<th class="num">CR</th><th class="num">Done</th><th>Status</th></tr></thead><tbody>'+
    (d.projects||[]).map(function(p){
      return '<tr class="'+p.state+'"><td><b>'+esc(p.Name)+'</b>'+
        (p.Blocker?'<br><span class="lbl" style="color:var(--orange)">'+esc(p.Blocker)+'</span>':'')+'</td>'+
        '<td><span class="dot" style="background:'+(DIRCOL[p.Director]||'var(--steel)')+'"></span>'+esc(p.Director)+'</td>'+
        '<td>'+esc(p.Stage)+'</td><td class="num">'+dmy(p.PromisedDate)+'</td>'+
        '<td class="num">'+(p.remBrake?nf(p.remBrake):'—')+'</td>'+
        '<td class="num">'+p.daysLeft+'</td>'+
        '<td class="num"><b>'+(p.state==='done'?'—':p.cr)+'</b></td>'+
        '<td class="num">'+p.pct+'%</td>'+
        '<td><span class="pill p-'+p.state+'">'+(p.state==='done'?'Close':
          p.state==='late'?'Late':p.state==='tight'?'Tight':'OK')+'</span></td></tr>';}).join('')+'</tbody>';
  function k(v,u,c){return '<div><div class="k"'+(c?' style="color:'+c+'"':'')+'>'+v+'</div><div class="u">'+u+'</div></div>';}
}

/* ---------- SCREENSHOTS ---------- */
function renderReport(){
  var d=S.data;if(!d)return;
  var live=(d.projects||[]).filter(function(p){return p.state!=='done';});
  var late=live.filter(function(p){return p.state==='late';});
  var tight=live.filter(function(p){return p.state==='tight';});
  var blocked=live.filter(function(p){return p.Blocker;});
  var ship=live.filter(function(p){return p.daysLeft<=1&&p.pos>=11;});
  var pct=d.load.pctOfWeek,now=new Date();
  var stamp=('0'+now.getDate()).slice(-2)+'/'+('0'+(now.getMonth()+1)).slice(-2)+'/'+String(now.getFullYear()).slice(-2);
  var hh=('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2);
  function head(a,b){return '<div class="sh"><div><b>'+a+'</b><small>'+b+'</small></div>'+
    '<div class="sd">'+stamp+'<br>'+hh+'</div></div>';}
  function t(l,v,c){return '<div class="tile '+(c||'')+'"><div class="tl">'+l+'</div><div class="tv">'+v+'</div></div>';}
  function tw(l,v){return '<div class="tile wide"><div class="tl">'+l+'</div><div class="tv sm">'+esc(v)+'</div></div>';}

  $('shotDay').innerHTML=head('HI TEK — DAY REPORT','Gujarwadi · 1 of 2')+'<div class="tiles">'+
    t('Late now',late.length,late.length?'alert':'')+t('Tight',tight.length)+
    '<div class="tile wide '+(pct>100?'alert':'')+'"><div class="tl">Pressbrake load this week</div>'+
    '<div class="tv">'+pct+'%</div><div class="pbar"><i style="width:'+Math.min(pct,100)+'%"></i></div></div>'+
    tw('Ship tomorrow',ship.length?ship.map(function(p){return p.Name;}).join(' · '):'nothing due')+
    t('Blocked',blocked.length,blocked.length?'alert':'')+t('Open projects',live.length)+
    tw('Late projects',late.length?late.map(function(p){return p.Name+' (CR '+p.cr+')';}).join(' · '):'none')+
    t('Low stock',d.stock.filter(function(i){return Number(i.Qty)<=Number(i.ReorderLevel||0);}).length,'alert')+
    t('Minutes owed',nf(d.load.demand))+
    '</div><div class="shotfoot"><span>auto-generated</span><span>1 / 2</span></div>';

  var byKey={};
  (d.production||[]).forEach(function(r){
    var k=r.Operator+'|'+r.ProjectID+'|'+r.Item+'|'+r.Operation;
    if(!byKey[k])byKey[k]={op:r.Operator,grp:r.Grp||r.WorkCentre||'Other',proj:r.ProjectID,
      item:r.Item,oper:r.Operation,am:0,pm:0,min:0,off:r.OffStation?1:0};
    if(String(r.Session)==='AM')byKey[k].am+=Number(r.Qty)||0;else byKey[k].pm+=Number(r.Qty)||0;
    byKey[k].min+=Number(r.EarnedMin)||0;});
  var lines=Object.keys(byKey).map(function(k){return byKey[k];});
  var pn={};(d.projects||[]).forEach(function(p){pn[p.ProjectID]=p.Name;});
  var groups={};lines.forEach(function(l){(groups[l.grp]=groups[l.grp]||[]).push(l);});
  var body='';
  Object.keys(groups).forEach(function(g){
    body+='<tr class="dept"><td colspan="5">'+esc(g)+'</td></tr>';
    groups[g].forEach(function(l){
      body+='<tr><td><span class="who2">'+esc(l.op)+(l.off?' *':'')+'</span><br>'+
        '<span class="ord">'+esc(pn[l.proj]||l.proj)+' · '+esc(l.oper)+'</span></td>'+
        '<td>'+esc(l.item)+'</td><td class="n">'+l.am+'</td><td class="n">'+l.pm+'</td>'+
        '<td class="n">'+(l.am+l.pm)+'</td></tr>';});});
  var aM=lines.reduce(function(s,l){return s+l.am;},0),pM=lines.reduce(function(s,l){return s+l.pm;},0);
  var mn=lines.reduce(function(s,l){return s+l.min;},0);
  if(!lines.length)body='<tr><td colspan="5" style="text-align:center;color:#8a939c;padding:16px">No taps recorded yet today</td></tr>';
  else body+='<tr class="tot"><td>TOTAL PIECES</td><td></td><td class="n">'+aM+'</td>'+
    '<td class="n">'+pM+'</td><td class="n">'+(aM+pM)+'</td></tr>'+
    '<tr class="tot"><td>STD MIN EARNED</td><td></td><td class="n" colspan="3">'+nf(Math.round(mn))+'</td></tr>';
  var dn=(d.downtime||[]).reduce(function(s,x){return s+(Number(x.Minutes)||0);},0);
  $('shotProd').innerHTML=head('PRODUCTION','Gujarwadi · 2 of 2')+
    '<table class="pt"><thead><tr><th>Who / Order</th><th>Item</th><th class="n">9–1</th>'+
    '<th class="n">1:30–6</th><th class="n">Tot</th></tr></thead><tbody>'+body+'</tbody></table>'+
    '<div class="shotfoot"><span>'+dn+' min downtime · * = off station</span><span>2 / 2</span></div>';
}

/* ---------- STORES ---------- */
function renderStock(){
  var d=S.data;if(!d||!d.stock)return;
  $('stockTable').innerHTML='<thead><tr><th>Item</th><th>Type</th><th class="num">Qty</th>'+
    '<th>Unit</th><th class="num">Reorder</th><th class="num">Lead</th><th></th></tr></thead><tbody>'+
    d.stock.map(function(i){var low=Number(i.Qty)<=Number(i.ReorderLevel||0);
      return '<tr><td>'+esc(i.Thickness)+'mm · '+esc(i.Width)+'x'+esc(i.Length)+
        (i.Grade?'<br><span class="lbl">'+esc(i.Grade)+'</span>':'')+'</td><td>'+esc(i.Type)+'</td>'+
        '<td class="num'+(low?' low':'')+'"><b>'+i.Qty+'</b></td><td>'+esc(i.Unit)+'</td>'+
        '<td class="num">'+i.ReorderLevel+'</td><td class="num">'+i.LeadDays+'d</td>'+
        '<td>'+mv('stock',i.ItemID)+'</td></tr>';}).join('')+'</tbody>';
  $('powderTable').innerHTML='<thead><tr><th>Shade</th><th>Make</th><th>Finish</th>'+
    '<th class="num">Kg</th><th class="num">Sqft left</th><th class="num">Reorder</th><th></th></tr></thead><tbody>'+
    d.powder.map(function(p){var low=Number(p.StockKg)<=Number(p.ReorderKg||0);
      return '<tr><td><b>'+esc(p.Shade)+'</b></td><td>'+esc(p.Make)+'</td><td>'+esc(p.Finish)+'</td>'+
        '<td class="num'+(low?' low':'')+'"><b>'+p.StockKg+'</b></td>'+
        '<td class="num">'+nf(Math.round(Number(p.StockKg)*(Number(p.SqftPerKg)||50)))+'</td>'+
        '<td class="num">'+p.ReorderKg+'</td><td>'+mv('powder',p.PowderID)+'</td></tr>';}).join('')+'</tbody>';
  $('movesTable').innerHTML='<thead><tr><th>When</th><th>Item</th><th class="num">Qty</th>'+
    '<th>Work centre</th><th>Project</th><th>By</th></tr></thead><tbody>'+
    (d.stockMoves||[]).slice(0,25).map(function(m){
      return '<tr><td class="num">'+dmy(m.Date)+'</td><td>'+esc(m.ItemID)+'</td>'+
        '<td class="num">'+(m.Dir==='IN'?'+':'−')+m.Qty+'</td><td>'+esc(m.WorkCentre||'—')+'</td>'+
        '<td>'+esc(m.ProjectID||'—')+'</td><td>'+esc(m.By)+'</td></tr>';}).join('')+'</tbody>';
  $('challanTable').innerHTML='<thead><tr><th>No.</th><th>Date</th><th>Customer</th>'+
    '<th>Particulars</th><th class="num">Qty</th><th>Vehicle</th></tr></thead><tbody>'+
    (d.challans||[]).map(function(c){return '<tr><td class="mono"><b>'+esc(c.ChallanNo)+'</b></td>'+
      '<td class="num">'+dmy(c.Date)+'</td><td>'+esc(c.Customer)+'</td><td>'+esc(c.Particulars)+'</td>'+
      '<td class="num">'+c.Qty+'</td><td>'+esc(c.Vehicle)+'</td></tr>';}).join('')+'</tbody>';
  Array.prototype.forEach.call(document.querySelectorAll('[data-move]'),function(b){
    b.addEventListener('click',function(){moveDialog(b.dataset.move,b.dataset.id,b.dataset.dir);});});
  function mv(k,id){return '<button class="linkbtn" data-move="'+k+'" data-id="'+esc(id)+'" data-dir="IN">+ In</button>'+
    '<button class="linkbtn" data-move="'+k+'" data-id="'+esc(id)+'" data-dir="OUT">− Out</button>';}
}
function moveDialog(kind,id,dir){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl',(dir==='IN'?'Receive into':'Issue from')+' stores'));
  b.appendChild(el('div','top',id));
  lab(b,kind==='powder'?'Kilograms':'Quantity');var q=inp(b,'number');q.step='any';
  lab(b,'Which work centre is taking it');
  var wc=el('select');opt(wc,'','—');
  (S.data.workCentres||[]).forEach(function(w){opt(wc,w.Name,w.Name,w.Name===S.me.workCentre);});
  b.appendChild(wc);
  lab(b,'For which task');
  var ts=el('select');opt(ts,'','— none —');
  (S.data.tasks||[]).filter(function(t){return ['ready','running'].indexOf(String(t.Status))>=0;})
    .forEach(function(t){opt(ts,t.TaskID,t.ProjectName+' — '+t.Operation);});
  b.appendChild(ts);
  lab(b,'Note (optional)');var nt=inp(b,'text');
  var go=el('button','bigbtn b-done');go.textContent=(dir==='IN'?'Receive':'Issue');
  go.addEventListener('click',function(){
    var task=(S.data.tasks||[]).filter(function(t){return t.TaskID===ts.value;})[0];
    var body=(kind==='powder')
      ?{powderID:id,kg:Number(q.value)||0,dir:dir,workCentre:wc.value,taskID:ts.value,
        projectID:task?task.ProjectID:'',note:nt.value}
      :{itemID:id,qty:Number(q.value)||0,dir:dir,workCentre:wc.value,taskID:ts.value,
        projectID:task?task.ProjectID:'',note:nt.value};
    closeSheet();
    api(kind==='powder'?'powderMove':'stockMove',body)
      .then(function(r){toast(r.low?'Recorded — BELOW REORDER LEVEL':'Recorded');refresh();})
      .catch(function(e){toast(e.message,true);});});
  b.appendChild(go);$('sheet').classList.remove('hidden');
}
$('addStock').addEventListener('click',function(){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','New stock item'));
  lab(b,'Type');var ty=el('select');
  ['GI Sheet','MS Sheet','SS Sheet','Precoated Sheet','GI Coil','Precoated Coil','Aluminium','UPVC Profile','Hardware']
    .forEach(function(x){opt(ty,x);});b.appendChild(ty);
  lab(b,'Thickness mm');var th=inp(b,'number');th.step='any';
  lab(b,'Width mm');var wd=inp(b,'number');
  lab(b,'Length mm');var ln=inp(b,'number');
  lab(b,'Grade / finish');var gr=inp(b,'text');
  lab(b,'Opening quantity');var qt=inp(b,'number');
  lab(b,'Unit');var un=el('select');['sheets','kg','coils','nos','metres'].forEach(function(x){opt(un,x);});b.appendChild(un);
  lab(b,'Reorder level');var rl=inp(b,'number');
  lab(b,'Supplier lead time (days)');var ld=inp(b,'number');
  lab(b,'Rate per kg');var rt=inp(b,'number');
  var go=el('button','bigbtn b-done');go.textContent='Add item';
  go.addEventListener('click',function(){
    var id=(String(ty.value).indexOf('Coil')>=0?'C-':'S-')+(th.value||0)+'-'+(wd.value||0)+'-'+(ln.value||0)+
      (gr.value?'-'+gr.value.replace(/\s+/g,'').slice(0,6).toUpperCase():'');
    closeSheet();
    api('saveStock',{row:{ItemID:id,Type:ty.value,Thickness:Number(th.value)||0,
      Width:Number(wd.value)||0,Length:Number(ln.value)||0,Grade:gr.value,
      Qty:Number(qt.value)||0,Unit:un.value,ReorderLevel:Number(rl.value)||0,
      LeadDays:Number(ld.value)||0,RatePerKg:Number(rt.value)||0,Active:'yes',Updated:new Date()}})
      .then(function(){toast('Item added');refresh();}).catch(function(e){toast(e.message,true);});});
  b.appendChild(go);$('sheet').classList.remove('hidden');
});
$('addPowder').addEventListener('click',function(){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','New powder shade'));
  lab(b,'Make');var mk=inp(b,'text','Rapid Coat / Libra / Beger');
  lab(b,'Shade');var sh=inp(b,'text','RAL 7006');
  lab(b,'Finish');var fi=el('select');['Matt','Glossy','Semi Gloss','Structure','Satin','Textured']
    .forEach(function(x){opt(fi,x);});b.appendChild(fi);
  lab(b,'Opening kg');var kg=inp(b,'number');kg.step='any';
  lab(b,'Reorder kg');var rk=inp(b,'number');
  lab(b,'Rate per kg');var rt=inp(b,'number');
  lab(b,'Coverage sqft per kg');var cv=inp(b,'number');cv.value='50';
  var go=el('button','bigbtn b-done');go.textContent='Add shade';
  go.addEventListener('click',function(){
    closeSheet();
    api('savePowder',{row:{PowderID:'PW-'+String(sh.value).replace(/\W/g,'').toUpperCase().slice(0,8),
      Make:mk.value,Shade:sh.value,Finish:fi.value,StockKg:Number(kg.value)||0,
      ReorderKg:Number(rk.value)||0,RatePerKg:Number(rt.value)||0,
      SqftPerKg:Number(cv.value)||50,Active:'yes',Updated:new Date()}})
      .then(function(){toast('Shade added');refresh();}).catch(function(e){toast(e.message,true);});});
  b.appendChild(go);$('sheet').classList.remove('hidden');
});
$('newChallan').addEventListener('click',function(){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','New delivery challan'));
  lab(b,'Project');var ps=el('select');
  (S.data.projects||[]).forEach(function(p){opt(ps,p.ProjectID,p.Name);});b.appendChild(ps);
  lab(b,'Particulars');var pa=inp(b,'text','e.g. Folding Door 3sh x 4');
  lab(b,'Quantity');var qy=inp(b,'number');
  lab(b,'Vehicle number');var vh=inp(b,'text');
  lab(b,'Driver');var dv=inp(b,'text');
  var go=el('button','bigbtn b-done');go.textContent='Create challan';
  go.addEventListener('click',function(){closeSheet();
    api('challan',{projectID:ps.value,particulars:pa.value,qty:Number(qy.value)||0,
      vehicle:vh.value,driver:dv.value,markDispatched:true})
      .then(function(r){toast('Challan '+r.challanNo+' created');refresh();})
      .catch(function(e){toast(e.message,true);});});
  b.appendChild(go);$('sheet').classList.remove('hidden');
});

/* ---------- SCORES ---------- */
function renderScores(){
  var d=S.data;if(!d)return;
  var live=String(d.config.scoring_live||'no').toLowerCase()==='yes';
  $('scoreSub').textContent=live?'Output 50% · Quality 30% · Reliability 20%. Plant-fault downtime is removed.'
    :'MEASURE-ONLY mode. Numbers are being collected but nobody is judged on them yet.';
  var rows=(d.scores||[]).slice().sort(function(a,b){return Number(b.Score)-Number(a.Score);});
  if(isOp()) rows=rows.filter(function(r){return r.Operator===S.me.name;});
  $('scoreCard').innerHTML='<h2>Today</h2><div class="tblwrap"><table class="d"><thead><tr>'+
    '<th>#</th><th>Operator</th><th class="num">Output</th><th class="num">Quality</th>'+
    '<th class="num">Reliability</th><th class="num">Min earned</th>'+
    '<th class="num">Not their fault</th><th>Score</th></tr></thead><tbody>'+
    (rows.length?rows.map(function(r,i){var sc=Number(r.Score)||0;
      var c=sc>=90?'var(--ok)':sc>=70?'var(--warn)':'var(--late)';
      return '<tr><td class="mono">'+(i+1)+'</td><td><b>'+esc(r.Operator)+'</b></td>'+
        '<td class="num">'+r.OutputPct+'%</td><td class="num">'+r.QualityPct+'%</td>'+
        '<td class="num">'+r.ReliabilityPct+'%</td><td class="num">'+nf(r.EarnedMin)+'</td>'+
        '<td class="num">'+r.PlantDownMin+'</td><td><span class="scorebar">'+
        '<i style="width:'+Math.min(sc,100)+'%;background:'+c+'"></i></span> <b class="mono">'+sc+'</b></td></tr>';}).join('')
      :'<tr><td colspan="8" style="text-align:center;color:var(--dim);padding:18px">No scores yet today.</td></tr>')+
    '</tbody></table></div>';
  $('learnTable').innerHTML='<thead><tr><th>Item</th><th>Operation</th><th class="num">Runs</th>'+
    '<th class="num">Was</th><th class="num">Now</th><th class="num">Change</th></tr></thead><tbody>'+
    ((d.learn||[]).length?d.learn.map(function(l){
      return '<tr><td>'+esc(l.Family)+'</td><td>'+esc(l.Operation)+'</td><td class="num">'+l.Samples+'</td>'+
        '<td class="num">'+l.OldPlanMin+'</td><td class="num"><b>'+l.NewPlanMin+'</b></td>'+
        '<td class="num" style="color:'+(Number(l.ChangePct)>0?'var(--late)':'var(--ok)')+'">'+
        (Number(l.ChangePct)>0?'+':'')+l.ChangePct+'%</td></tr>';}).join('')
      :'<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:18px">Nothing learned yet — needs 20 clean runs.</td></tr>')+'</tbody>';
}
$('runLearn').addEventListener('click',function(){
  api('runLearning',{}).then(function(r){toast(((r.rows||[]).length)+' times updated');refresh();})
    .catch(function(e){toast(e.message,true);});});

/* ---------- ADMIN ---------- */
function renderAdmin(){
  var d=S.data;if(!d||['director','planner'].indexOf(S.me.role)<0)return;
  var pool=d.load.pool,h='<h2>Quota floors</h2><div class="tblwrap"><table class="d"><thead><tr>'+
    '<th>Director</th><th class="num">Floor %</th><th class="num">Floor min</th>'+
    '<th class="num">Demand</th><th class="num">Released</th></tr></thead><tbody>';
  Object.keys(pool).forEach(function(k){
    h+='<tr><td><span class="dot" style="background:'+(DIRCOL[k]||'')+'"></span>'+k+'</td>'+
      '<td class="num">'+Math.round(Number(d.config['quota_'+k]||0)*100)+'%</td>'+
      '<td class="num">'+nf(pool[k].floor)+'</td><td class="num">'+nf(pool[k].demand)+'</td>'+
      '<td class="num" style="color:var(--ashutosh)">'+nf(pool[k].unused)+'</td></tr>';});
  $('quotaCard').innerHTML=h+'</tbody></table></div>';

  $('wcTable').innerHTML='<thead><tr><th>Work centre</th><th>Group</th><th class="num">Qty</th>'+
    '<th class="num">Hrs/day</th><th class="num">Avail</th><th class="num">Shifts</th></tr></thead><tbody>'+
    (d.workCentres||[]).map(function(w){return '<tr><td><b>'+esc(w.Name)+'</b></td><td>'+esc(w.Grp)+'</td>'+
      '<td class="num">'+w.Qty+'</td><td class="num">'+w.HrsDay+'</td>'+
      '<td class="num">'+Math.round(Number(w.Avail)*100)+'%</td><td class="num">'+w.Shifts+'</td></tr>';}).join('')+'</tbody>';
  $('itemTable').innerHTML='<thead><tr><th>Item</th><th>Division</th><th>Unit</th></tr></thead><tbody>'+
    (d.items||[]).map(function(i){return '<tr><td><b>'+esc(i.Family)+'</b></td><td>'+esc(i.Division)+
      '</td><td>'+esc(i.Unit)+'</td></tr>';}).join('')+'</tbody>';
  $('stdTable').innerHTML='<thead><tr><th>Item</th><th>Operation</th><th>Group</th>'+
    '<th class="num">Setup</th><th class="num">Target</th><th class="num">Plan</th><th class="num">Runs</th></tr></thead><tbody>'+
    (d.std||[]).map(function(t){var tg=Number(t.TargetMin)||0,pl=Number(t.PlanMin)||tg;
      var df=tg?Math.round((pl/tg-1)*100):0;
      return '<tr><td>'+esc(t.Family)+'</td><td>'+esc(t.Operation)+'</td><td>'+esc(t.Grp)+'</td>'+
        '<td class="num">'+t.SetupMin+'</td><td class="num"><b>'+tg+'</b></td>'+
        '<td class="num">'+pl+(df?' <span class="lbl" style="color:'+(df>0?'var(--late)':'var(--ok)')+'">'+
        (df>0?'+':'')+df+'%</span>':'')+'</td><td class="num">'+(t.Samples||0)+'</td></tr>';}).join('')+'</tbody>';
}

/* ---- add dialogs ---- */
$('addProject').addEventListener('click',function(){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl','New project'));
  b.appendChild(el('p','note','All the tasks for this division are created automatically from the routing.'));
  lab(b,'Project name');var nm=inp(b,'text');
  lab(b,'Division');var dv=el('select');
  var divs=(S.data.routings||[]).map(function(r){return r.Division;})
    .filter(function(v,i,a){return a.indexOf(v)===i;});
  divs.forEach(function(x){opt(dv,x);});b.appendChild(dv);
  lab(b,'Director');var dr=el('select');['Rupali','Ashutosh','Mohit'].forEach(function(x){opt(dr,x);});b.appendChild(dr);
  lab(b,'Customer');var cu=inp(b,'text');
  lab(b,'Site address');var ad=inp(b,'text');
  lab(b,'Size class');var sz=el('select');
  [['S','S — one item'],['M','M — a few items'],['L','L — a batch'],['XL','XL — full project']]
    .forEach(function(x){opt(sz,x[0],x[1]);});b.appendChild(sz);
  lab(b,'Quantity');var qt=inp(b,'number');
  lab(b,'Unit');var un=el('select');['Door','Window','Piece','Baffles','Pod','Batch','Sqft']
    .forEach(function(x){opt(un,x);});b.appendChild(un);
  lab(b,'Promised date');var pd=inp(b,'date');

  /* Activities: all steps ticked by default, untick what this job does not need */
  lab(b,'Activities for this project');
  var actWrap=el('div','opsel');b.appendChild(actWrap);
  var allBtn=el('button','chip on','All');allBtn.type='button';
  var noneBtn=el('button','chip','None');noneBtn.type='button';
  var tog=el('div','chips');tog.appendChild(allBtn);tog.appendChild(noneBtn);
  b.insertBefore(tog,actWrap);
  function drawActs(){
    actWrap.innerHTML='';
    var steps=(S.data.routings||[]).filter(function(r){return r.Division===dv.value;})
      .sort(function(a,b){return Number(a.Seq)-Number(b.Seq);});
    if(!steps.length){actWrap.appendChild(el('div','note','No routing set for this division yet.'));return;}
    steps.forEach(function(r){
      var l=el('label');
      var cb=el('input');cb.type='checkbox';cb.checked=true;cb.value=r.Operation;
      l.appendChild(cb);l.appendChild(el('span',null,r.Seq+'. '+r.Operation));
      var def=(S.data.defaults||[]).filter(function(d){return d.Operation===r.Operation;})[0];
      l.appendChild(el('span','who',def&&def.AssignedTo?def.AssignedTo:'unassigned'));
      actWrap.appendChild(l);});
  }
  dv.addEventListener('change',drawActs);drawActs();
  allBtn.addEventListener('click',function(){
    Array.prototype.forEach.call(actWrap.querySelectorAll('input'),function(c){c.checked=true;});
    allBtn.classList.add('on');noneBtn.classList.remove('on');});
  noneBtn.addEventListener('click',function(){
    Array.prototype.forEach.call(actWrap.querySelectorAll('input'),function(c){c.checked=false;});
    noneBtn.classList.add('on');allBtn.classList.remove('on');});

  var go=el('button','bigbtn b-done');go.textContent='Create project + tasks';
  go.addEventListener('click',function(){
    if(!nm.value){toast('Name is required',true);return;}
    var ops=[];
    Array.prototype.forEach.call(actWrap.querySelectorAll('input'),function(c){
      if(c.checked)ops.push(c.value);});
    if(!ops.length){toast('Pick at least one activity',true);return;}
    closeSheet();
    api('newProject',{operations:ops,
      row:{Name:nm.value,Division:dv.value,Director:dr.value,Customer:cu.value,
      Address:ad.value,Size:sz.value,Qty:Number(qt.value)||0,Unit:un.value,PromisedDate:pd.value}})
      .then(function(r){toast(r.tasks+' tasks created and assigned');refresh();})
      .catch(function(e){toast(e.message,true);});});
  b.appendChild(go);$('sheet').classList.remove('hidden');
});
function simpleAdd(title,fields,action,build){
  var b=$('sheetBody');b.innerHTML='';
  b.appendChild(el('div','lbl',title));
  var refs={};
  fields.forEach(function(f){
    lab(b,f.label);
    if(f.options){var s=el('select');f.options().forEach(function(o){opt(s,o);});b.appendChild(s);refs[f.key]=s;}
    else{var i=inp(b,f.type||'text',f.ph);if(f.value)i.value=f.value;refs[f.key]=i;}
  });
  var go=el('button','bigbtn b-done');go.textContent='Save';
  go.addEventListener('click',function(){closeSheet();
    api(action,{row:build(refs)}).then(function(){toast('Saved');refresh();})
      .catch(function(e){toast(e.message,true);});});
  b.appendChild(go);$('sheet').classList.remove('hidden');
}
$('addWC').addEventListener('click',function(){
  simpleAdd('New work centre',[
    {key:'Name',label:'Name',ph:'e.g. CNC Pressbrake 3'},
    {key:'Grp',label:'Group',options:function(){return ['Laser','Brake','CTL','Welding','Grinding',
      'Powder','Hardware','Packing','Design','Site'];}},
    {key:'Qty',label:'How many machines',type:'number',value:'1'},
    {key:'HrsDay',label:'Hours per day',type:'number',value:'8'},
    {key:'Avail',label:'Availability (0.75 = 75%)',type:'number',value:'0.75'},
    {key:'Shifts',label:'Shifts',type:'number',value:'1'}
  ],'saveWorkCentre',function(r){return {Name:r.Name.value,Grp:r.Grp.value,
    Qty:Number(r.Qty.value)||1,HrsDay:Number(r.HrsDay.value)||8,
    Avail:Number(r.Avail.value)||0.75,Shifts:Number(r.Shifts.value)||1,Active:'yes'};});
});
$('addItem').addEventListener('click',function(){
  simpleAdd('New item',[
    {key:'Family',label:'Item name',ph:'e.g. Z Louver 132mm'},
    {key:'Division',label:'Division',options:function(){return (S.data.routings||[])
      .map(function(r){return r.Division;}).filter(function(v,i,a){return a.indexOf(v)===i;});}},
    {key:'Unit',label:'Sold / counted in',options:function(){return ['Piece','Sqft','Sqm','Metre','Set','Pod','Batch','Kg'];}}
  ],'saveItem',function(r){return {Family:r.Family.value,Division:r.Division.value,
    Unit:r.Unit.value,Active:'yes'};});
});
$('addOp').addEventListener('click',function(){
  simpleAdd('New operation',[
    {key:'Operation',label:'Operation name',ph:'e.g. Deburring'},
    {key:'Grp',label:'Work centre group',options:function(){return ['Laser','Brake','CTL','Welding',
      'Grinding','Powder','Hardware','Packing','Design','Site'];}}
  ],'saveOperation',function(r){return {Operation:r.Operation.value,Grp:r.Grp.value};});
});
$('addStd').addEventListener('click',function(){
  simpleAdd('New standard time',[
    {key:'Family',label:'Item',options:function(){return (S.data.items||[]).map(function(i){return i.Family;});}},
    {key:'Operation',label:'Operation',options:function(){return (S.data.operations||[]).map(function(o){return o.Operation;});}},
    {key:'Grp',label:'Group',options:function(){return ['Laser','Brake','CTL','Welding','Grinding',
      'Powder','Hardware','Packing','Design','Site'];}},
    {key:'SetupMin',label:'Setup minutes per batch',type:'number',value:'0'},
    {key:'TargetMin',label:'Target minutes per unit',type:'number'}
  ],'saveStdTime',function(r){var t=Number(r.TargetMin.value)||0;
    return {Family:r.Family.value,Operation:r.Operation.value,Grp:r.Grp.value,
      SetupMin:Number(r.SetupMin.value)||0,TargetMin:t,PlanMin:t,Samples:0};});
});
$('addUser').addEventListener('click',function(){
  simpleAdd('New person',[
    {key:'Username',label:'Username (lower case, no spaces)'},
    {key:'Password',label:'Password'},
    {key:'Name',label:'Full name'},
    {key:'Role',label:'Role',options:function(){return ['operator','supervisor','stores','planner','office','accounts','director','station'];}},
    {key:'Kind',label:'Operator or helper',options:function(){return ['operator','helper'];}},
    {key:'Pin',label:'4-digit PIN for the shared tablet',ph:'e.g. 1234'},
    {key:'WorkCentre',label:'Work centre group',options:function(){return ['','Laser','Brake','CTL',
      'Welding','Grinding','Powder','Hardware','Packing','Design','Site'];}},
    {key:'Lang',label:'Language',options:function(){return ['mr','en'];}}
  ],'saveUser',function(r){return {Username:r.Username.value.toLowerCase(),Password:r.Password.value,
    Name:r.Name.value,Role:r.Role.value,WorkCentre:r.WorkCentre.value,Lang:r.Lang.value,
    Kind:r.Kind.value,Pin:r.Pin.value,Active:'yes'};});
});

/* ---------- go ---------- */
try{S.queue=JSON.parse(store.get('q')||'[]');}catch(e){S.queue=[];}
try{S.crew=JSON.parse(store.get('crew')||'{"op":null,"helpers":[]}');}catch(e){S.crew={op:null,helpers:[]};}
S.stationToken=store.get('stok');
renderSync();
S.token=store.get('t');
try{S.me=JSON.parse(store.get('me')||'null');}catch(e){S.me=null;}
if(S.token&&S.me)start();else showLogin();
window.addEventListener('online',function(){flushQueue().then(refresh);});
/* Random offset per device, and no polling while the screen is hidden.
   Without this every phone wakes on the same second and Apps Script queues them. */
var POLL=120000+Math.floor(Math.random()*45000);
setInterval(function(){ if(S.token&&!document.hidden) refresh(); },POLL);
document.addEventListener('visibilitychange',function(){
  if(!document.hidden&&S.token){
    if(!S._lastRefresh||Date.now()-S._lastRefresh>30000) refresh();
  }
});
})();
