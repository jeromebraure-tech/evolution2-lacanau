const STORAGE_KEY='horizon-nautique-sessions-v2';
const ENDPOINT_KEY='horizon-nautique-endpoint';
const ACCESS_KEY='horizon-nautique-access-v1';
const INSTRUCTOR_KEY='horizon-nautique-instructor';
const colors={Kite:'#ff6b35',Wingfoil:'#118ab2',Paddle:'#06a77d','Ski nautique':'#7b61ff'};
const euro=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});
const $=id=>document.getElementById(id);
const todayKey=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const allSessions=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
const todaySessions=()=>allSessions().filter(item=>item.date===todayKey());
const getAccess=()=>JSON.parse(localStorage.getItem(ACCESS_KEY)||'null');
const setAccess=value=>localStorage.setItem(ACCESS_KEY,JSON.stringify(value));
const makeId=()=>globalThis.crypto?.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const configuredEndpoint=()=>localStorage.getItem(ENDPOINT_KEY)||globalThis.HORIZON_CONFIG?.sheetEndpoint||'';

$('today').textContent=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
$('instructor').value=localStorage.getItem(INSTRUCTOR_KEY)||'';

function updateCommission(){const amount=Number($('revenue').value)||0;const rate=Number($('rate').value)||0;$('commissionPreview').textContent=euro.format(amount*rate/100)}
function escapeHtml(value){const d=document.createElement('div');d.textContent=value;return d.innerHTML}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2800)}

function render(){
  const items=todaySessions(),revenue=items.reduce((s,x)=>s+x.revenue,0),commission=items.reduce((s,x)=>s+x.commission,0),participants=items.reduce((s,x)=>s+x.participants,0);
  $('headerRevenue').textContent=euro.format(revenue);$('totalRevenue').textContent=euro.format(revenue);$('totalCommission').textContent=euro.format(commission);$('totalParticipants').textContent=participants;$('entryCount').textContent=items.length;$('emptyState').hidden=items.length>0;
  $('entries').innerHTML=items.slice().reverse().map(item=>`<article class="entry"><div class="entry-main"><span class="entry-icon" style="background:${colors[item.activity]||'#007f78'}">${item.activity[0]}</span><div><h3>${escapeHtml(item.activity)} · ${escapeHtml(item.instructor)}</h3><p>${item.participants} stagiaire${item.participants>1?'s':''} · ${item.duration} h · part moniteur ${item.rate}%</p></div></div><div class="entry-amount"><strong>${euro.format(item.revenue)}</strong><span>${euro.format(item.commission)} moniteur</span></div></article>`).join('');
  const endpoint=configuredEndpoint(),access=getAccess();
  $('endpoint').value=endpoint;$('accessSetup').hidden=!endpoint;$('connectionButton').classList.toggle('connected',!!endpoint&&access?.status==='ACTIF');
  $('connectionText').textContent=!endpoint?'Mode essai':access?.status==='ACTIF'?'Accès actif':access?.status==='INACTIF'?'Accès désactivé':'Validation en attente';
  const locked=!!endpoint&&access?.status!=='ACTIF';$('accessGate').hidden=!locked;$('sessionForm').hidden=locked;
  if(access){$('accessName').value=access.name||'';$('accessEmail').value=access.email||'';$('accessStatus').textContent=access.status==='ACTIF'?'Accès autorisé.':access.status==='INACTIF'?'Cet accès a été désactivé.':'Demande envoyée : le responsable doit maintenant l’accepter.'}
  if(locked){$('gateIcon').textContent=access?.status==='INACTIF'?'⊘':'⌛';$('gateTitle').textContent=access?.status==='INACTIF'?'Accès désactivé':'Validation nécessaire';$('gateMessage').textContent=access?.status==='INACTIF'?'Contacte le responsable pour réactiver ton accès.':'Ta demande doit être acceptée dans la feuille « Moniteurs ».'}
}

function jsonp(params){
  return new Promise((resolve,reject)=>{const callback=`hn_${Date.now()}_${Math.random().toString(36).slice(2)}`,script=document.createElement('script'),timer=setTimeout(()=>{cleanup();reject(new Error('timeout'))},10000);function cleanup(){clearTimeout(timer);delete window[callback];script.remove()}window[callback]=data=>{cleanup();resolve(data)};const endpoint=configuredEndpoint();script.src=`${endpoint}?${new URLSearchParams({...params,callback})}`;script.onerror=()=>{cleanup();reject(new Error('network'))};document.body.appendChild(script)})
}
async function checkAccess(showMessage=true){
  const access=getAccess(),endpoint=configuredEndpoint();if(!endpoint||!access?.token)return false;
  try{const result=await jsonp({action:'status',token:access.token});const updated={...access,status:result.status||'INCONNU',name:result.name||access.name,rate:Number(result.rate)||access.rate||30};setAccess(updated);if(updated.status==='ACTIF'){$('instructor').value=updated.name;$('instructor').readOnly=true;$('rate').value=updated.rate;updateCommission()}render();if(showMessage)toast(updated.status==='ACTIF'?'Accès autorisé':'Accès non encore autorisé');return updated.status==='ACTIF'}catch(error){if(showMessage)toast('Impossible de vérifier l’accès');return false}
}

document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.tab,.view').forEach(el=>el.classList.remove('active'));button.classList.add('active');$(button.dataset.view).classList.add('active')}));
document.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>{$('participants').value=Math.max(1,(Number($('participants').value)||1)+Number(button.dataset.step))}));
$('revenue').addEventListener('input',updateCommission);$('rate').addEventListener('input',updateCommission);
$('connectionButton').addEventListener('click',()=>$('settingsDialog').showModal());
$('checkAccessButton').addEventListener('click',()=>checkAccess());
$('saveEndpoint').addEventListener('click',()=>{const value=$('endpoint').value.trim();if(value&&!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(value)){toast('Utilise l’adresse Google qui se termine par /exec');return}localStorage.setItem(ENDPOINT_KEY,value);render();if(value&&getAccess()?.token){$('settingsDialog').close();checkAccess(false)}else if(value){toast('Tableau enregistré : demande maintenant ton accès')}else{$('settingsDialog').close();toast('Mode essai activé')}});
$('disconnectButton').addEventListener('click',()=>{localStorage.removeItem(ENDPOINT_KEY);localStorage.removeItem(ACCESS_KEY);$('settingsDialog').close();$('instructor').readOnly=false;render();toast('Tableau déconnecté')});
$('requestAccessButton').addEventListener('click',async()=>{const endpoint=configuredEndpoint(),name=$('accessName').value.trim(),email=$('accessEmail').value.trim();if(!endpoint){toast('Enregistre d’abord l’adresse du tableau');return}if(!name||!email||!$('accessEmail').checkValidity()){toast('Renseigne un nom et un e-mail valides');return}const existing=getAccess(),access={token:existing?.token||makeId(),name,email,status:'EN_ATTENTE'};setAccess(access);try{await fetch(endpoint,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'requestAccess',...access,timestamp:new Date().toISOString()})});toast('Demande envoyée au responsable')}catch(error){toast('Envoi impossible : réessaie')}render()});
$('clearButton').addEventListener('click',()=>{if(confirm('Effacer les séances conservées sur cet appareil ?')){localStorage.removeItem(STORAGE_KEY);render()}});

$('sessionForm').addEventListener('submit',async event=>{
  event.preventDefault();const formElement=event.currentTarget,endpoint=configuredEndpoint(),access=getAccess();if(endpoint&&!(await checkAccess(false))){toast('Ton accès n’est pas actif');render();return}
  const form=new FormData(formElement),revenue=Number(form.get('revenue')),rate=endpoint?Number(access.rate):Number(form.get('rate'));
  const record={action:'session',id:makeId(),date:todayKey(),timestamp:new Date().toISOString(),token:access?.token||'',instructor:endpoint?access.name:String(form.get('instructor')).trim(),activity:String(form.get('activity')),participants:Number(form.get('participants')),duration:Number(form.get('duration')),revenue,rate,commission:Number((revenue*rate/100).toFixed(2))};
  const duplicate=allSessions().find(x=>x.date===record.date&&x.instructor===record.instructor&&x.activity===record.activity&&x.participants===record.participants&&x.duration===record.duration&&x.revenue===record.revenue&&x.rate===record.rate);
  if(duplicate&&!confirm('Une séance identique est déjà enregistrée aujourd’hui. Veux-tu vraiment l’envoyer une deuxième fois ?'))return;record.forceDuplicate=!!duplicate;
  if(endpoint){try{await fetch(endpoint,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(record)});toast('Séance envoyée au tableau partagé')}catch(error){toast('Envoi impossible : la séance n’a pas été validée');return}}else{toast('Séance enregistrée en mode essai')}
  localStorage.setItem(INSTRUCTOR_KEY,record.instructor);const sessions=allSessions();sessions.push(record);localStorage.setItem(STORAGE_KEY,JSON.stringify(sessions));$('revenue').value='';updateCommission();render();
});
render();updateCommission();if(configuredEndpoint()&&getAccess()?.token)checkAccess(false);if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
