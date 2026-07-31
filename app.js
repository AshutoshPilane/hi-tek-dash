/* =====================================================================
   HI TEK PRODUCTION — app.js
   Frontend for the Apps Script backend. No build step, no framework.
   Everything runs from three static files on Vercel.
   ===================================================================== */
(function(){
'use strict';

var API = '/api';                 // Vercel rewrite -> Apps Script /exec
var S = { token:null, me:null, data:null, queue:[], tab:null, sel:null };

/* ---------------- safe storage (works in preview AND on Vercel) ------- */
var store = (function(){
  try{ var k='__t'; localStorage.setItem(k,'1'); localStorage.removeItem(k);
       return { get:function(k){return localStorage.getItem(k);},
                set:function(k,v){localStorage.setItem(k,v);},
                del:function(k){localStorage.removeItem(k);} };
  }catch(e){ var m={};
       return { get:function(k){return m[k]||null;},
                set:function(k,v){m[k]=v;}, del:function(k){delete m[k];} }; }
})();

/* ---------------- helpers ---------------- */
function $(id){ return document.getElementById(id); }
function el(tag,cls,txt){ var e=document.createElement(tag);
  if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e; }
function esc(s){ return String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function nf(n){ return (Number(n)||0).toLocaleString('en-IN'); }
function dmy(d){ if(!d) return '—'; var x=new Date(d); if(isNaN(x)) return String(d).slice(0,10);
  return ('0'+x.getDate()).slice(-2)+'/'+('0'+(x.getMonth()+1)).slice(-2); }
var toastT;
function toast(msg,bad){ var t=$('toast'); t.textContent=msg;
  t.className='toast on'+(bad?' bad':''); clearTimeout(toastT);
  toastT=setTimeout(function(){ t.className='toast'; },2400); }

/* ---------------- API with offline queue ---------------- */
function api(action,body){
  var payload = Object.assign({ action:action, token:S.token }, body||{});
  return fetch(API,{ method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
                     body:JSON.stringify(payload) })
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(j){
      if(j.status!=='success'){
        if(j.code==='AUTH'){ logout(true); }
        throw new Error(j.message||'Request failed');
      }
      return j.data;
    });
}
/* Writes queue locally when the connection or power drops, then replay. */
function queueWrite(action,body){
  S.queue.push({ action:action, body:body, at:Date.now() });
  store.set('hitek_q', JSON.stringify(S.queue));
  renderSync();
}
function flushQueue(){
  if(!S.queue.length || !S.token) return Promise.resolve();
  var item = S.queue[0];
  return api(item.action,item.body).then(function(){
    S.queue.shift(); store.set('hitek_q',JSON.stringify(S.queue));
    renderSync(); return flushQueue();
  }).catch(function(){ renderSync(); });
}
function renderSync(){
  var bar=$('syncbar');
  if(S.queue.length){ bar.classList.remove('hidden');
    $('syncmsg').textContent = S.queue.length+' entr'+(S.queue.length>1?'ies':'y')+
      ' saved on this phone, waiting for network'; }
  else bar.classList.add('hidden');
}

/* ---------------- roles ---------------- */
var TABS = {
  director:  [['work','My work'],['board','Sequence'],['report','Screenshots'],
              ['stock','Stores'],['scores','Scoreboard'],['admin','Setup']],
  planner:   [['board','Sequence'],['work','My work'],['report','Screenshots'],
              ['stock','Stores'],['scores','Scoreboard'],['admin','Setup']],
  supervisor:[['work','My work'],['board','Sequence'],['report','Screenshots'],
              ['stock','Stores'],['scores','Scoreboard']],
  operator:  [['work','माझे काम'],['scores','गुण']],
  stores:    [['stock','Stores'],['board','Sequence']],
  office:    [['board','Sequence'],['report','Screenshots'],['stock','Stores']],
  accounts:  [['report','Screenshots'],['stock','Stores']]
};
function isOperator(){ return S.me && S.me.role==='operator'; }

/* ---------------- login ---------------- */
function showLogin(msg){
  $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  if(msg){ var m=$('loginMsg'); m.textContent=msg; m.className='msg show'; }
  $('offhint').textContent = S.queue.length
    ? S.queue.length+' entries are saved on this phone and will upload after you log in.' : '';
}
$('loginForm').addEventListener('submit',function(e){
  e.preventDefault();
  var b=$('loginBtn'); b.disabled=true; b.textContent='Checking…';
  $('loginMsg').className='msg';
  fetch(API,{ method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({ action:'LOGIN', username:$('u').value.trim(), password:$('p').value })})
  .then(function(r){return r.json();})
  .then(function(j){
    if(j.status!=='success') throw new Error(j.message||'Login failed');
    S.token=j.data.token; S.me=j.data.user;
    store.set('hitek_t',S.token); store.set('hitek_u',JSON.stringify(S.me));
    start();
  })
  .catch(function(err){
    var m=$('loginMsg'); m.textContent=err.message; m.className='msg show';
  })
  .then(function(){ b.disabled=false; b.textContent='Log in'; });
});
function logout(expired){
  S.token=null; S.me=null; store.del('hitek_t'); store.del('hitek_u');
  showLogin(expired?'Your session expired. Please log in again.':'');
}
$('logout').addEventListener('click',function(){ logout(false); });

/* ---------------- boot ---------------- */
function start(){
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('whoName').textContent = S.me.name+' · '+S.me.role;
  var tabs=$('tabs'); tabs.innerHTML='';
  (TABS[S.me.role]||TABS.operator).forEach(function(t,i){
    var b=el('button','tab'+(i===0?' on':''),t[1]);
    b.dataset.v=t[0];
    b.addEventListener('click',function(){ setTab(t[0]); });
    tabs.appendChild(b);
    if(i===0) S.tab=t[0];
  });
  setTab(S.tab);
  flushQueue().then(refresh);
}
function setTab(v){
  S.tab=v;
  Array.prototype.forEach.call(document.querySelectorAll('.tab'),function(b){
    b.classList.toggle('on', b.dataset.v===v); });
  Array.prototype.forEach.call(document.querySelectorAll('.view'),function(s){
    s.classList.toggle('on', s.id==='v-'+v); });
  window.scrollTo(0,0);
}
function refresh(){
  return api('bootstrap').then(function(d){
    S.data=d; renderStop(); renderWork(); renderBoard(); renderReport();
    renderStock(); renderScores(); renderAdmin();
  }).catch(function(e){ toast(e.message,true); });
}

/* ---------------- operator queue ---------------- */
function myGroup(){
  var wc=(S.me.workCentre||'').toLowerCase();
  if(wc.indexOf('bend')>=0||wc.indexOf('brake')>=0) return 'Brake';
  if(wc.indexOf('laser')>=0) return 'Laser';
  if(wc.indexOf('powder')>=0) return 'Powder';
  if(wc.indexOf('ctl')>=0||wc.indexOf('length')>=0) return 'CTL';
  if(wc.indexOf('weld')>=0) return 'Welding';
  if(wc.indexOf('grind')>=0) return 'Grinding';
  return null;
}
function renderWork(){
  var d=S.data; if(!d) return;
  var mine = d.projects.filter(function(p){ return p.state!=='done'; });
  var g = myGroup();
  $('workTitle').textContent = isOperator()
    ? (S.me.name+' — '+(S.me.workCentre||'')) : 'My work';
  $('workSub').textContent = isOperator()
    ? 'सर्वात वरचे काम आधी करा' : 'Tap a job to record work or a stoppage.';

  var q=$('workQueue'); q.innerHTML='';
  if(!mine.length){ q.appendChild(el('div','emptyq','Nothing open. Good.')); return; }
  mine.slice(0,14).forEach(function(p){
    var card=el('div','job '+p.state);
    var top=el('div','jtop');
    top.appendChild(el('div','jname',p.Name));
    top.appendChild(el('div','jmeta','DUE '+dmy(p.PromisedDate)));
    card.appendChild(top);
    card.appendChild(el('div','jsub',p.Stage+' · '+p.Division+
      (p.Blocker?' · ⚠ '+p.Blocker:'')));
    var row=el('div','jrow');
    row.appendChild(mk('CR','<b>'+p.cr.toFixed(2)+'</b>'));
    row.appendChild(mk('Days left','<b>'+p.daysLeft+'</b>'));
    if(p.remBrake) row.appendChild(mk('Brake min','<b>'+nf(p.remBrake)+'</b>'));
    card.appendChild(row);
    card.addEventListener('click',function(){ openSheet(p); });
    q.appendChild(card);
  });
  function mk(l,v){ var s=el('div','jstat'); s.innerHTML='<span class="lbl">'+l+'</span><br>'+v; return s; }
}

/* ---------------- tap sheet ---------------- */

function openSheet(p){
  S.sel={ project:p, qty:10 };
  var b=$('sheetBody'); b.innerHTML='';
  b.appendChild(el('div','lbl','Order'));
  b.appendChild(el('div','jname',p.Name));
  b.appendChild(el('div','jsub',p.Stage+' · due '+dmy(p.PromisedDate)));

  var fams = uniq(S.data.std.map(function(t){return t.Family;}));
  b.appendChild(lab('Item'));
  var fsel=el('select'); fsel.id='fFam';
  fams.forEach(function(f){ var o=el('option',null,f); o.value=f; fsel.appendChild(o); });
  b.appendChild(fsel);

  b.appendChild(lab('Operation'));
  var osel=el('select'); osel.id='fOp'; b.appendChild(osel);
  function fillOps(){
    osel.innerHTML='';
    S.data.std.filter(function(t){return t.Family===fsel.value;})
      .forEach(function(t){ var o=el('option',null,t.Operation); o.value=t.Operation; osel.appendChild(o); });
  }
  fsel.addEventListener('change',fillOps); fillOps();

  b.appendChild(lab('Quantity'));
  var grid=el('div','qtygrid');
  [1,5,10,25,50,100].forEach(function(n){
    var q=el('button','qbtn'+(n===10?' sel':''),String(n));
    q.type='button';
    q.addEventListener('click',function(){
      S.sel.qty=n;
      Array.prototype.forEach.call(grid.children,function(c){c.classList.remove('sel');});
      q.classList.add('sel');
    });
    grid.appendChild(q);
  });
  b.appendChild(grid);
  var other=el('input'); other.type='number'; other.min='1'; other.placeholder='or type an exact count';
  other.addEventListener('input',function(){
    if(other.value){ S.sel.qty=Number(other.value);
      Array.prototype.forEach.call(grid.children,function(c){c.classList.remove('sel');}); }
  });
  b.appendChild(other);

  b.appendChild(el('label',null,'Rejected / rework pieces (leave blank if none)'));
  var rw=el('input'); rw.type='number'; rw.min='0'; rw.id='fRw'; rw.placeholder='0';
  b.appendChild(rw);

  var done=el('button','bigbtn b-done dev');
  done.innerHTML='पूर्ण झाले <em>Done</em>';
  done.addEventListener('click',function(){ submitTap(p,fsel.value,osel.value); });
  b.appendChild(done);

  var stop=el('button','bigbtn b-stop dev');
  stop.innerHTML='मशीन बंद <em>Stopped</em>';
  stop.addEventListener('click',function(){ showReasons(b,p); });
  b.appendChild(stop);

  $('sheet').classList.remove('hidden');
  function lab(t){ var l=el('label',null,t); return l; }
}
function showReasons(b,p){
  var old=b.querySelector('.reasons'); if(old) old.remove();
  var wrap=el('div','reasons');
  (S.data.reasons||[]).forEach(function(r){
    var btn=el('button');
    btn.innerHTML='<span>'+esc(r[1])+'</span><em>'+r[0]+'</em>';
    btn.addEventListener('click',function(){
      send('stopStart',{ code:r[0], workCentre:S.me.workCentre||'' },
           'बंद नोंदवले — घड्याळ चालू');
    });
    wrap.appendChild(btn);
  });
  b.appendChild(wrap);
}

/* ---------------- downtime clock ----------------
   Nobody types how long the machine was stopped. The clock does it.  */
var stopTick;
function renderStop(){
  var o=S.data && S.data.openStop;
  var bar=$('stopbar');
  clearInterval(stopTick);
  if(!o){ bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  $('stopReason').textContent=o.Reason;
  var start=new Date(o.StartTs).getTime();
  function tick(){
    var m=Math.max(0,Math.round((Date.now()-start)/60000));
    $('stopTimer').textContent=m+' min';
  }
  tick(); stopTick=setInterval(tick,20000);
}
$('resumeBtn').addEventListener('click',function(){
  api('stopEnd',{}).then(function(d){
    toast((d.minutes||0)+' min downtime recorded'); refresh();
  }).catch(function(){ queueWrite('stopEnd',{}); toast('Saved on this phone'); });
});
function submitTap(p,family,operation){
  if(!operation){ toast('Pick an operation',true); return; }
  var rwEl=$('fRw');
  send('tap',{ projectID:p.ProjectID, family:family, operation:operation,
               qty:S.sel.qty, rework:(rwEl&&rwEl.value)?Number(rwEl.value):0 },
       S.sel.qty+' पूर्ण · logged');
}
function send(action,body,okMsg){
  closeSheet();
  api(action,body).then(function(){ toast(okMsg); refresh(); })
    .catch(function(){ queueWrite(action,body);
      toast('Saved on this phone — will upload when network returns'); });
}
function closeSheet(){ $('sheet').classList.add('hidden'); }
$('sheetClose').addEventListener('click',closeSheet);
$('sheet').addEventListener('click',function(e){ if(e.target===$('sheet')) closeSheet(); });
function uniq(a){ return a.filter(function(v,i){ return a.indexOf(v)===i; }); }

/* ---------------- board ---------------- */
var DIRCOL = { Rupali:'var(--rupali)', Ashutosh:'var(--ashutosh)', Mohit:'var(--mohit)' };
function renderBoard(){
  var d=S.data; if(!d) return;
  var L=d.load, pct=L.pctOfWeek;
  var lc=$('loadCard');
  lc.innerHTML =
    '<h2>Pressbrake — this week</h2>'+
    '<div class="load"><i style="width:'+Math.min(pct,140)/140*100+'%;background:'+
      (pct>100?'var(--late)':pct>85?'var(--warn)':'var(--ok)')+'"></i>'+
      '<span class="cap" style="left:'+(100/140*100)+'%"></span></div>'+
    '<div class="kpi">'+
      kpi(pct+'%', 'Load', pct>100?'var(--late)':'var(--ok)')+
      kpi(nf(L.demand),'Minutes owed')+
      kpi(nf(L.brakeWeek),'Available')+
      kpi(nf(L.released),'Released to pool','var(--ashutosh)')+
    '</div>'+
    '<p class="note" style="margin-top:12px">Floors are guaranteed. '+
    '<b>'+nf(L.released)+' unused minutes</b> have been released to the shared pool and go to '+
    'whichever job is closest to its promised date.</p>';

  var rows = d.projects.map(function(p){
    return '<tr class="'+p.state+'">'+
      '<td><b>'+esc(p.Name)+'</b>'+(p.Blocker?'<br><span class="lbl" style="color:var(--orange)">'+esc(p.Blocker)+'</span>':'')+'</td>'+
      '<td><span class="dot" style="background:'+(DIRCOL[p.Director]||'var(--steel)')+'"></span>'+esc(p.Director)+'</td>'+
      '<td>'+esc(p.Stage)+'</td>'+
      '<td class="num">'+dmy(p.PromisedDate)+'</td>'+
      '<td class="num">'+(p.remBrake?nf(p.remBrake):'—')+'</td>'+
      '<td class="num">'+p.daysLeft+'</td>'+
      '<td class="num"><b>'+(p.state==='done'?'—':p.cr.toFixed(2))+'</b></td>'+
      '<td><span class="pill p-'+p.state+'">'+
        (p.state==='done'?'Close':p.state==='late'?'Late':p.state==='tight'?'Tight':'OK')+'</span></td></tr>';
  }).join('');
  $('boardTable').innerHTML =
    '<thead><tr><th>Project</th><th>Owner</th><th>Stage</th><th class="num">Due</th>'+
    '<th class="num">Brake min</th><th class="num">Days left</th><th class="num">CR</th><th>Status</th></tr></thead>'+
    '<tbody>'+rows+'</tbody>';
  function kpi(v,u,c){ return '<div><div class="k"'+(c?' style="color:'+c+'"':'')+'>'+v+'</div>'+
    '<div class="u">'+u+'</div></div>'; }
}

/* ---------------- screenshots ---------------- */
function renderReport(){
  var d=S.data; if(!d) return;
  var live = d.projects.filter(function(p){return p.state!=='done';});
  var late = live.filter(function(p){return p.state==='late';});
  var tight= live.filter(function(p){return p.state==='tight';});
  var ship = live.filter(function(p){return p.daysLeft<=1 && p.pos>=11;});
  var blocked = live.filter(function(p){return p.Blocker;});
  var closeout= d.projects.filter(function(p){return p.state==='done';});
  var pct = d.load.pctOfWeek;
  var now = new Date();
  var stamp = ('0'+now.getDate()).slice(-2)+'/'+('0'+(now.getMonth()+1)).slice(-2)+'/'+
              String(now.getFullYear()).slice(-2);

  $('shotDay').innerHTML =
    head('HI TEK — DAY REPORT','Gujarwadi Plant · 1 of 2',stamp)+
    '<div class="tiles">'+
      t('Late now',late.length,late.length?'alert':'')+
      t('Tight',tight.length)+
      '<div class="tile wide '+(pct>100?'alert':'')+'"><div class="tl">Pressbrake load this week</div>'+
        '<div class="tv">'+pct+'%</div><div class="pbar"><i style="width:'+Math.min(pct,100)+'%"></i></div></div>'+
      tw('Ship tomorrow', ship.length? ship.map(function(p){return p.Name;}).join(' · ') : 'nothing due')+
      t('Blocked',blocked.length,blocked.length?'alert':'')+
      t('To close out',closeout.length,'good')+
      tw('Late projects', late.length? late.map(function(p){return p.Name+' (CR '+p.cr.toFixed(2)+')';}).join(' · ') : 'none')+
      t('Open projects',live.length)+
      t('Minutes owed',nf(d.load.demand))+
    '</div>'+
    foot('auto-generated','1 / 2');

  /* production, split pre and post lunch */
  var prod=d.production||[];
  var byOp={};
  prod.forEach(function(r){
    var k=r.Operator+'|'+r.ProjectID+'|'+r.Item+'|'+r.Operation;
    if(!byOp[k]) byOp[k]={ op:r.Operator, grp:r.Grp||'Other', proj:r.ProjectID,
                           item:r.Item, am:0, pm:0, min:0 };
    if(String(r.Session)==='AM') byOp[k].am += Number(r.Qty)||0;
    else byOp[k].pm += Number(r.Qty)||0;
    byOp[k].min += Number(r.Minutes)||0;
  });
  var lines=Object.keys(byOp).map(function(k){return byOp[k];});
  var pname={}; d.projects.forEach(function(p){ pname[p.ProjectID]=p.Name; });
  var groups={};
  lines.forEach(function(l){ (groups[l.grp]=groups[l.grp]||[]).push(l); });

  var body='';
  Object.keys(groups).forEach(function(g){
    body+='<tr class="dept"><td colspan="5">'+esc(g)+'</td></tr>';
    groups[g].forEach(function(l){
      body+='<tr><td><span class="who2">'+esc(l.op)+'</span><br><span class="ord">'+
        esc(pname[l.proj]||l.proj)+'</span></td><td>'+esc(l.item)+'</td>'+
        '<td class="n">'+l.am+'</td><td class="n">'+l.pm+'</td>'+
        '<td class="n">'+(l.am+l.pm)+'</td></tr>';
    });
  });
  var tAM=lines.reduce(function(s,l){return s+l.am;},0);
  var tPM=lines.reduce(function(s,l){return s+l.pm;},0);
  var tMin=lines.reduce(function(s,l){return s+l.min;},0);
  if(!lines.length) body='<tr><td colspan="5" style="text-align:center;color:#8a939c;padding:16px">No taps recorded yet today</td></tr>';
  else body+='<tr class="tot"><td>TOTAL PIECES</td><td></td><td class="n">'+tAM+'</td>'+
             '<td class="n">'+tPM+'</td><td class="n">'+(tAM+tPM)+'</td></tr>'+
             '<tr class="tot"><td>STD MIN EARNED</td><td></td><td class="n" colspan="3">'+nf(Math.round(tMin))+'</td></tr>';

  $('shotProd').innerHTML =
    head('PRODUCTION','Gujarwadi Plant · 2 of 2',stamp)+
    '<table class="pt"><thead><tr><th>Who / Order</th><th>Item</th>'+
    '<th class="n">9–1</th><th class="n">1:30–6</th><th class="n">Tot</th></tr></thead>'+
    '<tbody>'+body+'</tbody></table>'+
    foot((d.downtime||[]).length+' stoppages logged','2 / 2');

  function head(a,b,dt){ return '<div class="sh"><div><b>'+a+'</b><small>'+b+'</small></div>'+
    '<div class="sd">'+dt+'<br>'+('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2)+'</div></div>'; }
  function foot(a,b){ return '<div class="shotfoot"><span>'+a+'</span><span>'+b+'</span></div>'; }
  function t(l,v,cls){ return '<div class="tile '+(cls||'')+'"><div class="tl">'+l+'</div><div class="tv">'+v+'</div></div>'; }
  function tw(l,v){ return '<div class="tile wide"><div class="tl">'+l+'</div><div class="tv sm">'+esc(v)+'</div></div>'; }
}

/* ---------------- admin ---------------- */
function renderAdmin(){
  var d=S.data; if(!d) return;
  if(['director','planner'].indexOf(S.me.role)<0) return;
  var pool=d.load.pool, html='<h2>Quota floors</h2><div class="tblwrap"><table class="d">'+
    '<thead><tr><th>Director</th><th class="num">Floor %</th><th class="num">Floor min</th>'+
    '<th class="num">Demand</th><th class="num">Released</th></tr></thead><tbody>';
  Object.keys(pool).forEach(function(k){
    html+='<tr><td><span class="dot" style="background:'+(DIRCOL[k]||'')+'"></span>'+k+'</td>'+
      '<td class="num">'+Math.round(Number(d.config['quota_'+k]||0)*100)+'%</td>'+
      '<td class="num">'+nf(pool[k].floor)+'</td>'+
      '<td class="num">'+nf(pool[k].demand)+'</td>'+
      '<td class="num" style="color:var(--ashutosh)">'+nf(pool[k].unused)+'</td></tr>';
  });
  html+='</tbody></table></div><p class="note" style="margin-top:10px">Change floors in the '+
        '<b>Config</b> sheet (quota_Rupali, quota_Ashutosh, quota_Mohit). '+
        'Released minutes flow to whichever job has the lowest Critical Ratio.</p>';
  $('quotaCard').innerHTML=html;

  $('projTable').innerHTML =
    '<thead><tr><th>ID</th><th>Project</th><th>Director</th><th>Size</th><th>Stage</th>'+
    '<th class="num">Due</th></tr></thead><tbody>'+
    d.projects.map(function(p){ return '<tr><td class="mono">'+esc(p.ProjectID)+'</td><td>'+esc(p.Name)+
      '</td><td>'+esc(p.Director)+'</td><td>'+esc(p.Size)+'</td>'+
      '<td>'+stageSelect(p)+'</td><td class="num">'+dmy(p.PromisedDate)+'</td></tr>'; }).join('')+
    '</tbody>';
  Array.prototype.forEach.call($('projTable').querySelectorAll('select[data-pid]'),function(sel){
    sel.addEventListener('change',function(){
      api('saveProject',{row:{ProjectID:sel.dataset.pid,Stage:sel.value}})
        .then(function(){ toast('Stage updated'); refresh(); })
        .catch(function(e){ toast(e.message,true); });
    });
  });

  $('stdTable').innerHTML =
    '<thead><tr><th>Family</th><th>Operation</th><th>Group</th><th class="num">Setup</th>'+
    '<th class="num">Target</th><th class="num">Plan (learned)</th><th class="num">Runs</th></tr></thead><tbody>'+
    d.std.map(function(t){
      var tgt=Number(t.TargetMin)||0, pl=Number(t.PlanMin)||tgt;
      var diff=tgt? Math.round((pl/tgt-1)*100):0;
      return '<tr><td>'+esc(t.Family)+'</td><td>'+esc(t.Operation)+'</td><td>'+esc(t.Grp)+
        '</td><td class="num">'+t.SetupMin+'</td><td class="num"><b>'+tgt+'</b></td>'+
        '<td class="num">'+pl+(diff?' <span class="lbl" style="color:'+
          (diff>0?'var(--late)':'var(--ok)')+'">'+(diff>0?'+':'')+diff+'%</span>':'')+'</td>'+
        '<td class="num">'+(t.Samples||0)+'</td></tr>'; }).join('')+'</tbody>';

  function stageSelect(p){
    return '<select data-pid="'+esc(p.ProjectID)+'">'+
      S.data.stages.map(function(s){ return '<option'+(s===p.Stage?' selected':'')+'>'+s+'</option>'; })
      .join('')+'</select>';
  }
}

/* ---------------- stores ---------------- */
function renderStock(){
  var d=S.data; if(!d||!d.stock) return;
  $('stockTable').innerHTML =
    '<thead><tr><th>Item</th><th>Type</th><th class="num">Qty</th><th>Unit</th>'+
    '<th class="num">Reorder</th><th class="num">Lead</th><th></th></tr></thead><tbody>'+
    d.stock.map(function(i){
      var low=Number(i.Qty)<=Number(i.ReorderLevel||0);
      return '<tr><td>'+esc(i.Thickness)+'mm · '+esc(i.Width)+'x'+esc(i.Length)+
        (i.Grade?'<br><span class="lbl">'+esc(i.Grade)+'</span>':'')+'</td>'+
        '<td>'+esc(i.Type)+'</td>'+
        '<td class="num'+(low?' low':'')+'"><b>'+i.Qty+'</b></td><td>'+esc(i.Unit)+'</td>'+
        '<td class="num">'+i.ReorderLevel+'</td><td class="num">'+i.LeadDays+'d</td>'+
        '<td>'+moveBtns('stock',i.ItemID)+'</td></tr>'; }).join('')+'</tbody>';

  $('powderTable').innerHTML =
    '<thead><tr><th>Shade</th><th>Make</th><th>Finish</th><th class="num">Kg</th>'+
    '<th class="num">Sqft left</th><th class="num">Reorder</th><th></th></tr></thead><tbody>'+
    d.powder.map(function(p){
      var low=Number(p.StockKg)<=Number(p.ReorderKg||0);
      return '<tr><td><b>'+esc(p.Shade)+'</b></td><td>'+esc(p.Make)+'</td><td>'+esc(p.Finish)+'</td>'+
        '<td class="num'+(low?' low':'')+'"><b>'+p.StockKg+'</b></td>'+
        '<td class="num">'+nf(Math.round(Number(p.StockKg)*(Number(p.SqftPerKg)||50)))+'</td>'+
        '<td class="num">'+p.ReorderKg+'</td>'+
        '<td>'+moveBtns('powder',p.PowderID)+'</td></tr>'; }).join('')+'</tbody>';

  $('challanTable').innerHTML =
    '<thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>Particulars</th>'+
    '<th class="num">Qty</th><th>Vehicle</th></tr></thead><tbody>'+
    (d.challans||[]).map(function(c){
      return '<tr><td class="mono"><b>'+esc(c.ChallanNo)+'</b></td><td class="num">'+dmy(c.Date)+'</td>'+
        '<td>'+esc(c.Customer)+'</td><td>'+esc(c.Particulars)+'</td>'+
        '<td class="num">'+c.Qty+'</td><td>'+esc(c.Vehicle)+'</td></tr>'; }).join('')+'</tbody>';

  Array.prototype.forEach.call(document.querySelectorAll('[data-move]'),function(b){
    b.addEventListener('click',function(){ moveDialog(b.dataset.move,b.dataset.id,b.dataset.dir); });
  });
  function moveBtns(kind,id){
    return '<button class="linkbtn" data-move="'+kind+'" data-id="'+esc(id)+'" data-dir="IN">+ In</button>'+
           '<button class="linkbtn" data-move="'+kind+'" data-id="'+esc(id)+'" data-dir="OUT">− Out</button>';
  }
}
function moveDialog(kind,id,dir){
  var b=$('sheetBody'); b.innerHTML='';
  b.appendChild(el('div','lbl',(dir==='IN'?'Receive into':'Issue from')+' stores'));
  b.appendChild(el('div','jname',id));
  b.appendChild(el('label',null, kind==='powder' ? 'Kilograms' : 'Quantity'));
  var q=el('input'); q.type='number'; q.min='0'; q.step='any'; b.appendChild(q);
  b.appendChild(el('label',null,'For which project (optional)'));
  var ps=el('select'); ps.appendChild(el('option',null,'—'));
  S.data.projects.forEach(function(p){ var o=el('option',null,p.Name); o.value=p.ProjectID; ps.appendChild(o); });
  b.appendChild(ps);
  b.appendChild(el('label',null,'Note (optional)'));
  var nt=el('input'); b.appendChild(nt);
  var go=el('button','bigbtn b-done'); go.textContent=(dir==='IN'?'Receive':'Issue');
  go.addEventListener('click',function(){
    var body=(kind==='powder')
      ? {powderID:id,kg:Number(q.value)||0,dir:dir,projectID:ps.value,note:nt.value}
      : {itemID:id,qty:Number(q.value)||0,dir:dir,projectID:ps.value,note:nt.value};
    closeSheet();
    api(kind==='powder'?'powderMove':'stockMove',body).then(function(r){
      toast(r.low?'Recorded — BELOW REORDER LEVEL':'Recorded');
      refresh();
    }).catch(function(e){ toast(e.message,true); });
  });
  b.appendChild(go);
  $('sheet').classList.remove('hidden');
}
$('newChallan').addEventListener('click',function(){
  var b=$('sheetBody'); b.innerHTML='';
  b.appendChild(el('div','lbl','New delivery challan'));
  b.appendChild(el('label',null,'Project'));
  var ps=el('select'); S.data.projects.forEach(function(p){
    var o=el('option',null,p.Name); o.value=p.ProjectID; ps.appendChild(o); });
  b.appendChild(ps);
  b.appendChild(el('label',null,'Particulars'));
  var pa=el('input'); pa.placeholder='e.g. Folding Door 3sh x 4'; b.appendChild(pa);
  b.appendChild(el('label',null,'Quantity')); var qy=el('input'); qy.type='number'; b.appendChild(qy);
  b.appendChild(el('label',null,'Vehicle number')); var vh=el('input'); b.appendChild(vh);
  b.appendChild(el('label',null,'Driver')); var dv=el('input'); b.appendChild(dv);
  var go=el('button','bigbtn b-done'); go.textContent='Create challan';
  go.addEventListener('click',function(){
    closeSheet();
    api('challan',{projectID:ps.value,particulars:pa.value,qty:Number(qy.value)||0,
      vehicle:vh.value,driver:dv.value,markDispatched:true})
      .then(function(r){ toast('Challan '+r.challanNo+' created'); refresh(); })
      .catch(function(e){ toast(e.message,true); });
  });
  b.appendChild(go);
  $('sheet').classList.remove('hidden');
});

/* ---------------- scoreboard ---------------- */
function renderScores(){
  var d=S.data; if(!d) return;
  var live=String(d.config.scoring_live||'no').toLowerCase()==='yes';
  $('scoreSub').textContent = live
    ? 'Output 50% · Quality 30% · Reliability 20%. Plant-fault downtime is removed from the denominator.'
    : 'Scoring is in MEASURE-ONLY mode. Numbers are being collected but nobody is being judged on them yet.';
  var rows=(d.scores||[]).slice().sort(function(a,b){return Number(b.Score)-Number(a.Score);});
  var body = rows.length ? rows.map(function(r,i){
      var sc=Number(r.Score)||0;
      var col=sc>=90?'var(--ok)':sc>=70?'var(--warn)':'var(--late)';
      return '<tr><td class="mono">'+(i+1)+'</td><td><b>'+esc(r.Operator)+'</b></td>'+
        '<td class="num">'+r.OutputPct+'%</td><td class="num">'+r.QualityPct+'%</td>'+
        '<td class="num">'+r.ReliabilityPct+'%</td>'+
        '<td class="num">'+nf(r.EarnedMin)+'</td>'+
        '<td class="num">'+r.PlantDownMin+'</td>'+
        '<td><span class="scorebar"><i style="width:'+Math.min(sc,100)+'%;background:'+col+'"></i></span> '+
        '<b class="mono">'+sc+'</b></td></tr>';
    }).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--dim);padding:18px">No scores yet. Run it from the Setup tab or wait for the nightly job.</td></tr>';
  $('scoreCard').innerHTML =
    '<h2>Today</h2><div class="tblwrap"><table class="d"><thead><tr><th>#</th><th>Operator</th>'+
    '<th class="num">Output</th><th class="num">Quality</th><th class="num">Reliability</th>'+
    '<th class="num">Min earned</th><th class="num">Not their fault</th><th>Score</th>'+
    '</tr></thead><tbody>'+body+'</tbody></table></div>'+
    (live?'':'<p class="note" style="margin-top:10px">Set <b>scoring_live</b> to <b>yes</b> in the Config sheet when you are ready. Recommended: after 90 days.</p>');

  $('learnTable').innerHTML =
    '<thead><tr><th>Item</th><th>Operation</th><th class="num">Runs</th>'+
    '<th class="num">Was</th><th class="num">Now</th><th class="num">Change</th></tr></thead><tbody>'+
    ((d.learn||[]).length ? d.learn.map(function(l){
      return '<tr><td>'+esc(l.Family)+'</td><td>'+esc(l.Operation)+'</td>'+
        '<td class="num">'+l.Samples+'</td><td class="num">'+l.OldPlanMin+'</td>'+
        '<td class="num"><b>'+l.NewPlanMin+'</b></td>'+
        '<td class="num" style="color:'+(Number(l.ChangePct)>0?'var(--late)':'var(--ok)')+'">'+
        (Number(l.ChangePct)>0?'+':'')+l.ChangePct+'%</td></tr>'; }).join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--dim);padding:18px">Nothing learned yet. Needs 20 clean runs of an operation.</td></tr>')+
    '</tbody>';
}
$('runLearn').addEventListener('click',function(){
  api('runLearning',{}).then(function(r){
    toast((r.rows&&r.rows.length?r.rows.length:0)+' times updated'); refresh();
  }).catch(function(e){ toast(e.message,true); });
});

/* ---------------- go ---------------- */
try{ S.queue = JSON.parse(store.get('hitek_q')||'[]'); }catch(e){ S.queue=[]; }
renderSync();
S.token = store.get('hitek_t');
try{ S.me = JSON.parse(store.get('hitek_u')||'null'); }catch(e){ S.me=null; }
if(S.token && S.me) start(); else showLogin();

window.addEventListener('online', function(){ flushQueue().then(refresh); });
setInterval(function(){ if(S.token && !document.hidden) refresh(); }, 120000);
})();
