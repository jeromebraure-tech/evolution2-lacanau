const STORAGE_KEY='horizon-nautique-sessions-v2';
const ENDPOINT_KEY='horizon-nautique-endpoint';
const ACCESS_KEY='horizon-nautique-access-v1';
const INSTRUCTOR_KEY='horizon-nautique-instructor';
const euro=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});
const $=id=>document.getElementById(id);
const todayKey=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const getAccess=()=>JSON.parse(localStorage.getItem(ACCESS_KEY)||'null');
const setAccess=value=>localStorage.setItem(ACCESS_KEY,JSON.stringify(value));
const makeId=()=>globalThis.crypto?.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
const configuredEndpoint=()=>globalThis.HORIZON_CONFIG?.sheetEndpoint||localStorage.getItem(ENDPOINT_KEY)||'';

const catalog={
  Kite:{icon:'K',color:'#ff6b35',services:['Cours','Navigation surveillée'],audiences:['Individuel','Séminaire','Dassault'],count:'people',help:'120 € par personne hors saison ou 140 € par personne en pleine saison.',quick:[{label:'hors saison',value:120,perPerson:true},{label:'pleine saison',value:140,perPerson:true}]},
  Wingfoil:{icon:'W',color:'#118ab2',services:['Cours','Navigation surveillée'],audiences:['Individuel','Séminaire','Dassault'],count:'people',help:'110 € par stagiaire.',formula:({participants})=>110*participants},
  Paddle:{icon:'P',color:'#06a77d',services:['Location','Encadrement'],audiences:['Individuel','Séminaire','EVG / EVJF'],count:'people',help:({service})=>service==='Location'?'12 € par paddle en location.':'Saisis le montant total encaissé.',formula:({service,participants})=>service==='Location'?12*participants:null},
  Wakeboard:{icon:'W',color:'#7b61ff',services:['Session 15 min','Privatisation 1 h'],audiences:['Individuel','UCPA stage wake','Séminaire','EVG / EVJF'],count:'runs',help:({service,audience})=>service==='Privatisation 1 h'?'155 € par privatisation.':audience==='UCPA stage wake'?'36 € par session UCPA Wake.':'38 € par session de 15 minutes.',formula:({service,audience,quantity})=>(service==='Privatisation 1 h'?155:audience==='UCPA stage wake'?36:38)*quantity},
  Efoil:{icon:'E',color:'#00a6a6',services:['Session'],audiences:['Individuel','Séminaire','Dassault'],count:'efoil',help:'110 € par efoil et par session.',formula:({participants,quantity})=>110*participants*quantity},
  Pumpfoil:{icon:'P',color:'#4361ee',services:['Session'],audiences:['Individuel','Autre'],count:'sessions',help:'45 € par session.',formula:({quantity})=>45*quantity},
  'Fat bike':{icon:'F',color:'#8a5a44',services:['Sortie découverte','Sortie sportive'],audiences:['Individuel','Séminaire','EVG / EVJF'],count:'people',help:({service})=>service==='Sortie sportive'?'65 € par personne.':'55 € par personne.',formula:({service,participants})=>(service==='Sortie sportive'?65:55)*participants},
  Trottinette:{icon:'T',color:'#9b5de5',services:['Encadrement'],audiences:['Individuel','Séminaire','EVG / EVJF'],count:'people',help:'45 € par personne.',formula:({participants})=>45*participants},
  Groupe:{icon:'G',color:'#ef476f',services:['Animation','Autre'],audiences:['Séminaire','EVG / EVJF'],count:'people',help:'Saisis le montant total encaissé.'},
  Autre:{icon:'+',color:'#63777d',services:['Autre'],audiences:['Individuel','Séminaire','EVG / EVJF','Dassault','Autre'],count:'people',help:'Saisis le montant total encaissé.',employeeOnly:true}
};
const colors=Object.fromEntries(Object.entries(catalog).map(([key,value])=>[key,value.color]));
let amountWasSuggested=false;
let selectedQuickRate=null;
let isSubmitting=false;
let remoteJournal=null;

const allSessions=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]').map(item=>item.activity==='Ski nautique'?{...item,activity:'Wakeboard'}:item);
const todaySessions=()=>allSessions().filter(item=>item.date===todayKey());
function escapeHtml(value){const d=document.createElement('div');d.textContent=value;return d.innerHTML}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),3200)}
function selected(name){return document.querySelector(`input[name="${name}"]:checked`)?.value||''}
function profile(){return getAccess()?.profile||'INDEPENDANT'}
function availableActivities(){return Object.entries(catalog).filter(([,item])=>!item.employeeOnly||profile()==='SALARIE')}

function renderActivities(){
  const current=selected('activity')||'Kite';
  $('activityChoices').innerHTML=availableActivities().map(([name,item])=>`<label class="activity"><input type="radio" name="activity" value="${escapeHtml(name)}" ${name===current?'checked':''}><span class="activity-icon" style="--activity-color:${item.color}">${item.icon}</span><span>${escapeHtml(name)}</span></label>`).join('');
  if(!selected('activity'))document.querySelector('input[name="activity"]')?.click();
  document.querySelectorAll('input[name="activity"]').forEach(input=>input.addEventListener('change',()=>{amountWasSuggested=false;selectedQuickRate=null;renderConditionalForm()}));
}
function renderChips(containerId,name,values,current){
  $(containerId).innerHTML=values.map((value,index)=>`<label class="choice-chip"><input type="radio" name="${name}" value="${escapeHtml(value)}" ${value===(current||values[0])||(!current&&index===0)?'checked':''}><span>${escapeHtml(value)}</span></label>`).join('');
  document.querySelectorAll(`input[name="${name}"]`).forEach(input=>input.addEventListener('change',()=>{amountWasSuggested=false;selectedQuickRate=null;updateDetails()}));
}
function countValues(countType,count,efoilFormat=1){
  const entered=Math.max(1,Number(count)||1),format=Math.max(1,Number(efoilFormat)||1);
  return{participants:countType==='efoil'?format:entered,quantity:['efoil','runs','sessions'].includes(countType)?entered:1};
}
function state(){
  const activity=selected('activity'),item=catalog[activity],service=selected('serviceType'),audience=selected('audience');
  const count=Math.max(1,Number($('count').value)||1),values=countValues(item.count,count,$('efoilFormat').value),participants=values.participants,quantity=values.quantity;
  return{activity,item,service,audience,count,participants,quantity};
}
function renderConditionalForm(){
  const activity=selected('activity'),item=catalog[activity],oldService=selected('serviceType'),oldAudience=selected('audience');
  renderChips('serviceChoices','serviceType',item.services,item.services.includes(oldService)?oldService:item.services[0]);
  renderChips('audienceChoices','audience',item.audiences,item.audiences.includes(oldAudience)?oldAudience:item.audiences[0]);
  $('count').value=1;$('efoilFormat').value='1';updateDetails();
}
function updateDetails(){
  const {activity,item,service,audience,count,participants,quantity}=state(),isEfoil=item.count==='efoil',isRuns=item.count==='runs',isSessions=item.count==='sessions',isShared=service==='Navigation surveillée';
  $('efoilFormatField').hidden=!isEfoil;
  $('countLabel').textContent=isEfoil||isSessions?'Nombre de sessions':isRuns&&service==='Privatisation 1 h'?'Nombre de privatisations':isRuns?'Nombre de runs':'Nombre de personnes';
  $('monitorCountField').hidden=!isShared;if(!isShared)$('monitorCount').value='1';
  $('durationField').hidden=profile()!=='SALARIE';$('duration').required=profile()==='SALARIE';
  const help=typeof item.help==='function'?item.help({service,audience,participants,quantity}):item.help;$('revenueHelp').textContent=help||'';
  const computed=item.formula?.({service,audience,participants,quantity});
  $('quickAmounts').innerHTML=item.quick?item.quick.map(q=>{const amount=q.perPerson?q.value*participants:q.value;return `<button type="button" data-amount="${amount}" data-rate="${q.value}">${euro.format(amount)} · ${q.label}</button>`}).join(''):computed!=null?`<button type="button" data-amount="${computed}">Utiliser ${euro.format(computed)}</button>`:'';
  document.querySelectorAll('[data-amount]').forEach(button=>button.addEventListener('click',()=>{$('revenue').value=button.dataset.amount;selectedQuickRate=button.dataset.rate?Number(button.dataset.rate):null;amountWasSuggested=true;updateSummary()}));
  if(item.quick&&amountWasSuggested&&selectedQuickRate!=null)$('revenue').value=selectedQuickRate*participants;
  if(amountWasSuggested&&computed!=null)$('revenue').value=computed;
  const runUnit=service==='Privatisation 1 h'?'privatisation':'run',detail=isEfoil?`${participants} efoil${participants>1?'s':''} · ${quantity} session${quantity>1?'s':''}`:isSessions?`${quantity} session${quantity>1?'s':''}`:isRuns?`${quantity} ${runUnit}${quantity>1?'s':''}`:`${participants} personne${participants>1?'s':''}`;
  $('entrySummary').textContent=`${activity} · ${service} · ${audience} · ${detail}`;updateSummary();
}
function updateSummary(){const value=Number($('revenue').value);const base=$('entrySummary').textContent.split(' · Montant')[0];$('entrySummary').textContent=base+(Number.isFinite(value)&&$('revenue').value!==''?` · Montant ${euro.format(value)}`:'')}

function render(){
  const localItems=todaySessions(),journalItems=remoteJournal?.entries||localItems,revenue=localItems.reduce((sum,item)=>sum+(Number(item.revenue)||0),0),hours=remoteJournal?.totalHours??localItems.reduce((sum,item)=>sum+(Number(item.duration)||0),0),employee=profile()==='SALARIE',earnings=remoteJournal?.totalCompensation??0;
  $('headerMetricLabel').textContent=employee?'Heures du jour':'CA du jour';$('headerRevenue').textContent=employee?`${hours.toLocaleString('fr-FR')} h`:euro.format(revenue);$('totalMetricLabel').textContent=employee?'Heures cumulées aujourd’hui':'Rémunération du jour';$('totalRevenue').textContent=employee?`${hours.toLocaleString('fr-FR')} h`:euro.format(earnings);$('entriesMetric').hidden=employee;$('journalSummary').classList.toggle('single',employee);$('totalEntries').textContent=journalItems.length;$('entryCount').textContent=journalItems.length;$('emptyState').hidden=journalItems.length>0;
  $('entries').innerHTML=journalItems.slice().reverse().map(item=>{const quantity=Number(item.quantity)||1,unit=item.unit||'séance',detail=item.activity==='Efoil'?`${item.participants} efoil${item.participants>1?'s':''} · ${quantity} session${quantity>1?'s':''}`:item.activity==='Pumpfoil'?`${quantity} session${quantity>1?'s':''}`:quantity>1?`${quantity} ${escapeHtml(unit)}s`:`${item.participants} personne${item.participants>1?'s':''}`,result=employee?`${Number(item.duration).toLocaleString('fr-FR')} h`:item.compensation==null?'—':euro.format(item.compensation);return `<article class="entry"><div class="entry-main"><span class="entry-icon" style="background:${colors[item.activity]||'#007f78'}">${escapeHtml(catalog[item.activity]?.icon||'?')}</span><div><h3>${escapeHtml(item.activity)} · ${escapeHtml(item.instructor)}</h3><p>${escapeHtml(item.serviceType||'Cours')} · ${escapeHtml(item.audience||'Individuel')} · ${detail}</p></div></div><div class="entry-amount"><strong>${result}</strong></div></article>`}).join('');
  const endpoint=configuredEndpoint(),access=getAccess();$('connectionButton').classList.toggle('connected',!!endpoint&&access?.status==='ACTIF');$('connectionText').textContent=!endpoint?'Configuration indisponible':access?.status==='ACTIF'?'Accès actif':access?.status==='INACTIF'?'Accès désactivé':'Validation en attente';
  const locked=!endpoint||access?.status!=='ACTIF';$('accessGate').hidden=!locked;$('sessionForm').hidden=locked;
  if(access){$('accessName').value=access.name||'';$('accessEmail').value=access.email||'';$('accessStatus').textContent=access.status==='ACTIF'?'Accès autorisé.':access.status==='INACTIF'?'Cet accès a été désactivé.':'Demande envoyée : le responsable doit maintenant l’accepter.'}else{$('accessName').value='';$('accessEmail').value='';$('accessStatus').textContent=''}
  if(locked){$('gateIcon').textContent=!endpoint?'⚠':access?.status==='INACTIF'?'⊘':'⌛';$('gateTitle').textContent=!endpoint?'Application non configurée':access?.status==='INACTIF'?'Accès désactivé':'Validation nécessaire';$('gateMessage').textContent=!endpoint?'Contacte le responsable de l’application.':access?.status==='INACTIF'?'Contacte le responsable pour réactiver ton accès.':'Ta demande doit être acceptée dans la feuille « Moniteurs ».'}
}

function jsonp(params){
  return new Promise((resolve,reject)=>{const callback=`hn_${Date.now()}_${Math.random().toString(36).slice(2)}`,script=document.createElement('script'),timer=setTimeout(()=>{cleanup();reject(new Error('timeout'))},10000);function cleanup(){clearTimeout(timer);delete window[callback];script.remove()}window[callback]=data=>{cleanup();resolve(data)};script.src=`${configuredEndpoint()}?${new URLSearchParams({...params,callback})}`;script.onerror=()=>{cleanup();reject(new Error('network'))};document.body.appendChild(script)})
}
async function liveAccess(){
  const access=getAccess(),endpoint=configuredEndpoint();if(!endpoint||!access?.token)return{active:false,reason:'missing'};
  for(let attempt=0;attempt<2;attempt++)try{const result=await jsonp({action:'status',token:access.token});const updated={...access,status:result.status||'INCONNU',name:result.name||access.name,profile:result.profile||access.profile||'INDEPENDANT'};setAccess(updated);return{active:updated.status==='ACTIF',reason:'status',access:updated}}catch(error){if(attempt===1)return{active:false,reason:'network'}}
}
async function refreshRemoteJournal(){
  const access=getAccess();if(!configuredEndpoint()||access?.status!=='ACTIF'||!access.token)return;
  try{const result=await jsonp({action:'journal',token:access.token,date:todayKey()});if(result.ok){remoteJournal=result;render()}}catch(error){}
}
async function checkAccess(showMessage=true){
  const result=await liveAccess();if(result.access?.status==='ACTIF'){$('instructor').value=result.access.name;$('instructor').readOnly=true;renderActivities();renderConditionalForm()}render();if(result.active)await refreshRemoteJournal();
  if(showMessage)toast(result.active?'Accès autorisé':result.reason==='network'?'Impossible de joindre Google. Réessaie.':'Accès non encore autorisé');return result;
}

document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.tab,.view').forEach(el=>el.classList.remove('active'));button.classList.add('active');$(button.dataset.view).classList.add('active');if(button.dataset.view==='journal')refreshRemoteJournal()}));
$('countField').addEventListener('click',event=>{const button=event.target.closest('[data-step]');if(!button)return;$('count').value=Math.max(1,(Number($('count').value)||1)+Number(button.dataset.step));updateDetails()});
$('count').addEventListener('input',updateDetails);$('efoilFormat').addEventListener('change',updateDetails);$('revenue').addEventListener('input',()=>{amountWasSuggested=false;selectedQuickRate=null;updateSummary()});$('monitorCount').addEventListener('change',updateSummary);
$('connectionButton').addEventListener('click',()=>$('settingsDialog').showModal());$('checkAccessButton').addEventListener('click',()=>checkAccess());
$('disconnectButton').addEventListener('click',()=>{localStorage.removeItem(ACCESS_KEY);$('instructor').readOnly=false;$('settingsDialog').close();render();toast('Accès réinitialisé sur cet appareil')});
$('requestAccessButton').addEventListener('click',async()=>{const endpoint=configuredEndpoint(),name=$('accessName').value.trim(),email=$('accessEmail').value.trim();if(!endpoint){toast('Application non configurée : contacte le responsable');return}if(!name||!email||!$('accessEmail').checkValidity()){toast('Renseigne un nom et un e-mail valides');return}const existing=getAccess(),access={token:existing?.token||makeId(),name,email,status:'EN_ATTENTE',profile:existing?.profile||'INDEPENDANT'};setAccess(access);try{await fetch(endpoint,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'requestAccess',...access,timestamp:new Date().toISOString()})});toast('Demande envoyée au responsable')}catch(error){toast('Envoi impossible : réessaie')}render()});
$('clearButton').addEventListener('click',()=>{if(confirm('Effacer les saisies conservées sur cet appareil ?')){localStorage.removeItem(STORAGE_KEY);render()}});

$('sessionForm').addEventListener('submit',async event=>{
  event.preventDefault();if(isSubmitting)return;setSubmitting(true);
  try{
    const accessResult=await liveAccess();if(!accessResult.active){toast(accessResult.reason==='network'?'Impossible de vérifier l’accès. Vérifie la connexion et réessaie.':'Ton accès n’est pas actif');render();return}
    const access=accessResult.access,{activity,item,service,audience,participants,quantity}=state(),monitorCount=service==='Navigation surveillée'?Number($('monitorCount').value)||1:1,duration=profile()==='SALARIE'?Number($('duration').value)||0:0,unit=item.count==='runs'?(service==='Privatisation 1 h'?'privatisation':'run'):['efoil','sessions'].includes(item.count)?'session':'séance';
    if(profile()==='SALARIE'&&duration<=0){toast('Indique le nombre d’heures travaillées');return}
    const record={action:'session',id:makeId(),date:todayKey(),timestamp:new Date().toISOString(),token:access.token,instructor:access.name,activity,serviceType:service,audience,participants,duration,revenue:Number($('revenue').value),monitorCount,quantity,unit};
    const duplicate=allSessions().find(x=>x.date===record.date&&x.instructor===record.instructor&&x.activity===record.activity&&(x.serviceType||'Cours')===record.serviceType&&(x.audience||'Individuel')===record.audience&&Number(x.participants)===record.participants&&Number(x.quantity||1)===record.quantity&&Number(x.duration)===record.duration&&Number(x.revenue)===record.revenue);
    if(duplicate&&!confirm('Une saisie identique existe déjà aujourd’hui. Veux-tu vraiment l’envoyer une deuxième fois ?'))return;record.forceDuplicate=!!duplicate;
    try{await fetch(configuredEndpoint(),{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(record)});toast('Activité enregistrée')}catch(error){toast('Envoi impossible : la saisie n’a pas été validée');return}
    localStorage.setItem(INSTRUCTOR_KEY,record.instructor);const sessions=allSessions();sessions.push(record);localStorage.setItem(STORAGE_KEY,JSON.stringify(sessions));$('revenue').value='';$('count').value='1';amountWasSuggested=false;selectedQuickRate=null;updateDetails();render();await refreshRemoteJournal();
  }finally{setSubmitting(false)}
});

function setSubmitting(busy){isSubmitting=busy;$('submitButton').disabled=busy;$('submitButton').classList.toggle('is-loading',busy);$('submitText').textContent=busy?'Envoi en cours…':'Enregistrer'}

$('today').textContent=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());$('instructor').value=localStorage.getItem(INSTRUCTOR_KEY)||'';renderActivities();renderConditionalForm();render();if(configuredEndpoint()&&getAccess()?.token)checkAccess(false);if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
