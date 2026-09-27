const API='/api';
let token=localStorage.getItem('stenopro_token')||'';
let user=JSON.parse(localStorage.getItem('stenopro_user')||'null');
let dictations=[];
let currentPage='dashboard', currentPassage=null, testSeconds=0, timerId=null, testStartedAt=null;
let activeLang='all', activeSpeed='all';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2500)}
async function api(path,opts={}){
  const headers=new Headers(opts.headers||{});
  if(token) headers.set('Authorization','Bearer '+token);
  const r=await fetch(API+path,{...opts,headers});
  let data={};try{data=await r.json()}catch{}
  if(r.status===401){logout(false);throw new Error(data.error||'Session expired')}
  if(!r.ok)throw new Error(data.error||'Request failed');
  return data;
}
function setSession(t,u){token=t;user=u;localStorage.setItem('stenopro_token',t);localStorage.setItem('stenopro_user',JSON.stringify(u))}
function logout(show=true){token='';user=null;localStorage.removeItem('stenopro_token');localStorage.removeItem('stenopro_user');$('appView').classList.add('hidden');$('authView').classList.remove('hidden');if(show)toast('Logged out')}
function showAuth(mode='login'){
  $('authView').classList.remove('hidden');$('appView').classList.add('hidden');
  document.querySelectorAll('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.auth===mode));
  $('authTitle').textContent=mode==='login'?'Welcome back':'Create your account';
  $('authSub').textContent=mode==='login'?'अपने practice dashboard में प्रवेश करें।':'अपना StenoPro student account बनाएं।';
  $('authName').style.display=mode==='register'?'grid':'none';$('authName').required=mode==='register';
  $('authSubmit').textContent=mode==='login'?'Login':'Create account';
}
async function loadMe(){try{const d=await api('/me');user=d.user;localStorage.setItem('stenopro_user',JSON.stringify(user));return true}catch{return false}}
async function loadDictations(){const d=await api('/dictations');dictations=d.dictations||[]}
function audioUrl(d){return `${API}/dictations/${d.id}/audio?token=${encodeURIComponent(token)}`}
function showApp(){
  $('authView').classList.add('hidden');$('appView').classList.remove('hidden');
  document.querySelector('[data-page="admin"]').style.display=user?.role==='admin'?'flex':'none';
  $('helloName').textContent=user?.name||'Student';$('profileName').textContent=user?.name||'Student';$('profileEmail').textContent=user?.email||'';$('profileAvatar').textContent=(user?.name||'S').slice(0,1).toUpperCase();
  goPage('dashboard');
}
async function boot(){
  if(!token||!(await loadMe()))return showAuth('login');
  await refreshData();showApp();
}
async function refreshData(){try{await loadDictations();}catch(e){toast(e.message)}}
function goPage(page){
  if(page==='admin'&&user?.role!=='admin')return toast('Admin access required');
  currentPage=page;document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$('page-'+page)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page==='dashboard')renderDashboard();if(page==='dictations')renderDictations();if(page==='history')renderHistory();if(page==='admin')renderAdmin();if(page==='tests')renderTests();
}
function stats(){const rs=window.results||[];const best=rs.length?Math.max(...rs.map(r=>r.wpm)):0;const avg=rs.length?rs.reduce((a,r)=>a+Number(r.accuracy),0)/rs.length:0;return {best,avg,count:rs.length}}
async function loadResults(){try{const d=await api('/results/me');window.results=d.results||[]}catch{window.results=[]}}
async function renderDashboard(){await loadResults();const s=stats();$('bestWpm').textContent=s.best.toFixed(0);$('avgAccuracy').textContent=s.count?s.avg.toFixed(1)+'%':'—';$('testsDone').textContent=s.count;$('streak').textContent=s.count?'1 🔥':'0 🔥';
  const rec=dictations.slice(0,3);$('recommended').innerHTML=rec.length?rec.map(d=>`<div class="mini-row"><div><b>${esc(d.title)}</b><small>${d.language} • ${d.wpm} WPM • ${d.duration_minutes} min</small></div><button class="btn small" data-open="${d.id}">Practice</button></div>`).join(''):'<p class="muted">Admin has not published any dictations yet.</p>';
  $('recentResults').innerHTML=window.results?.length?window.results.slice(0,4).map(r=>`<div class="mini-row"><div><b>${esc(r.title)}</b><small>${Number(r.wpm).toFixed(0)} WPM • ${Number(r.accuracy).toFixed(1)}%</small></div><span class="tag">${r.errors} errors</span></div>`).join(''):'<p class="muted">No test results yet.</p>';
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openTest(Number(b.dataset.open)));
}
function renderDictations(){
  const list=dictations.filter(d=>(activeLang==='all'||d.language===activeLang)&&(activeSpeed==='all'||String(d.wpm)===activeSpeed));
  $('dictationGrid').innerHTML=list.length?list.map(d=>`<article class="dictation-card"><div class="top"><span class="tag">${d.wpm} WPM</span><span>${esc(d.language)}</span></div><h3>${esc(d.title)}</h3><p>${esc(d.passage.slice(0,120))}…</p><div class="meta"><span>⏱ ${d.duration_minutes} min</span><span>🎧 MP3</span></div><audio controls preload="none" src="${audioUrl(d)}" style="width:100%;margin-bottom:10px"></audio><button class="btn primary full" data-open="${d.id}">Start Dictation</button></article>`).join(''):'<div class="panel"><p class="muted">No dictations match your filters.</p></div>';
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openTest(Number(b.dataset.open)));
}
function renderTests(){
  const speeds=[80,100,120];
  $('page-tests').querySelector('.test-grid').innerHTML=speeds.map(sp=>{const d=dictations.find(x=>Number(x.wpm)===sp);return `<article class="test-card"><div class="test-icon">${sp===80?'⚡':sp===100?'🔥':'🏆'}</div><span class="tag">${sp} WPM</span><h2>${d?esc(d.title):'Not published'}</h2><p>${d?'Exam-style transcription with instant server scoring.':'Admin must upload a dictation at this speed.'}</p><button class="btn primary" ${d?'':'disabled'} data-open="${d?.id||''}">Start Test</button></article>`}).join('');
  document.querySelectorAll('#page-tests [data-open]').forEach(b=>b.onclick=()=>openTest(Number(b.dataset.open)));
}
async function renderHistory(){await loadResults();$('historyBody').innerHTML=window.results?.length?window.results.map(r=>`<tr><td>${new Date(r.created_at).toLocaleString()}</td><td>${esc(r.title)}</td><td>${r.target_wpm}</td><td>${Number(r.wpm).toFixed(0)}</td><td>${Number(r.accuracy).toFixed(1)}%</td><td>${r.errors}</td></tr>`).join(''):'<tr><td colspan="6">No results yet.</td></tr>'}
function openTest(id){const d=dictations.find(x=>x.id===id);if(!d)return toast('Dictation not found');currentPassage=d;$('runner').classList.remove('hidden');$('runnerTitle').textContent=d.title;$('runnerMeta').textContent=`${d.wpm} WPM • ${d.language}`;$('runnerDictationTitle').textContent=d.title;$('runnerInstruction').textContent='पहले audio सुनें, फिर transcription box में वही passage type करें।';$('runnerWordCount').textContent='0 words';$('runnerText').value='';
  const old=$('runnerAudio');if(old)old.remove();const audio=document.createElement('audio');audio.id='runnerAudio';audio.controls=true;audio.src=audioUrl(d);audio.style.width='100%';$('audioPanel').appendChild(audio);
  testSeconds=Number(d.duration_minutes)*60;testStartedAt=Date.now();updateTimer();clearInterval(timerId);timerId=setInterval(()=>{testSeconds--;updateTimer();if(testSeconds<=0){clearInterval(timerId);toast('Time up — Submit करें')}} ,1000);$('runnerText').focus();
}
function updateTimer(){const m=Math.max(0,Math.floor(testSeconds/60));const s=Math.max(0,testSeconds%60);$('testTimer').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
async function finishTest(){if(!currentPassage)return;clearInterval(timerId);const elapsed=Math.max(1,Math.round((Date.now()-testStartedAt)/1000));try{const r=await api('/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dictation_id:currentPassage.id,typed_text:$('runnerText').value,elapsed_seconds:elapsed})});$('runner').classList.add('hidden');$('rWpm').textContent=Number(r.wpm).toFixed(0);$('rAcc').textContent=Number(r.accuracy).toFixed(1)+'%';$('rErr').textContent=r.errors;$('rWords').textContent=$('runnerText').value.trim()?$('runnerText').value.trim().split(/\s+/).length:0;$('resultMessage').textContent=r.accuracy>=90?'Excellent accuracy. Keep building speed.':r.accuracy>=75?'Good work. Focus on the words you missed.':'Keep practicing slowly and accurately before increasing speed.';$('resultModal').classList.remove('hidden')}catch(e){toast(e.message)}}
async function renderAdmin(){if(user?.role!=='admin')return;const list=dictations;$('adminAudioList').innerHTML=list.length?list.map(d=>`<div class="admin-audio-row"><div><b>${esc(d.title)}</b><small>${esc(d.language)} • ${d.wpm} WPM • ${d.duration_minutes} min</small></div><audio controls src="${audioUrl(d)}"></audio><div class="audio-actions"><button class="delete-audio" data-delete="${d.id}">Delete</button></div></div>`).join(''):'<p style="color:var(--muted)">अभी कोई uploaded MP3 नहीं है।</p>';document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this dictation?'))return;try{await api('/admin/dictations/'+b.dataset.delete,{method:'DELETE'});await refreshData();renderAdmin();renderDictations();toast('Dictation deleted')}catch(e){toast(e.message)}})}

$('authForm').onsubmit=async e=>{e.preventDefault();const register=document.querySelector('.auth-tab.active').dataset.auth==='register';try{const d=await api(register?'/auth/register':'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('authName').value,email:$('authEmail').value,password:$('authPassword').value})});setSession(d.token,d.user);await refreshData();showApp();toast(register?'Account created':'Welcome back')}catch(e){toast(e.message)}};
document.querySelectorAll('.auth-tab').forEach(b=>b.onclick=()=>showAuth(b.dataset.auth));
document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.onclick=()=>goPage(b.dataset.page));
document.querySelectorAll('[data-page-jump]').forEach(b=>b.onclick=()=>goPage(b.dataset.pageJump));
$('logoutBtn').onclick=()=>logout();$('closeRunner').onclick=()=>{clearInterval(timerId);$('runner').classList.add('hidden')};$('submitTest').onclick=finishTest;$('closeResult').onclick=()=>$('resultModal').classList.add('hidden');$('resultAgain').onclick=()=>{$('resultModal').classList.add('hidden');if(currentPassage)openTest(currentPassage.id)};
$('runnerText').oninput=()=>{$('runnerWordCount').textContent=(($('runnerText').value.trim().match(/\S+/g)||[]).length)+' words'};
document.querySelectorAll('.filter').forEach(b=>b.onclick=()=>{document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeLang=b.dataset.filter;renderDictations()});$('speedFilter').onchange=e=>{activeSpeed=e.target.value;renderDictations()};$('mobileMenu').onclick=()=>document.querySelector('.sidebar')?.classList.toggle('mobile-open');
$('audioFile').onchange=e=>{const f=e.target.files[0];$('fileName').textContent=f?`${f.name} • ${Math.round(f.size/1024)} KB`:'MP3 file चुनें'};
$('audioForm').onsubmit=async e=>{e.preventDefault();const f=$('audioFile').files[0];if(!f||(!f.type.includes('mpeg')&&!f.name.toLowerCase().endsWith('.mp3')))return toast('सिर्फ MP3 file चुनें');const fd=new FormData();fd.append('title',$('audioTitle').value.trim());fd.append('language',$('audioLang').value);fd.append('wpm',$('audioWpm').value);fd.append('duration_minutes',$('audioDuration').value);fd.append('passage',$('audioPassage').value.trim());fd.append('audio',f);try{await api('/admin/dictations',{method:'POST',body:fd});e.target.reset();$('fileName').textContent='MP3 file चुनें';await refreshData();renderAdmin();renderDictations();toast('MP3 uploaded successfully')}catch(err){toast(err.message)}};

boot();
