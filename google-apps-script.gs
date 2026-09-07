const HN={sessions:'Seances',monitors:'Moniteurs',tariffs:'Tarifs',dashboard:'Tableau de bord',config:'Configuration',invoices:'Factures',active:'ACTIF',pending:'EN_ATTENTE',inactive:'INACTIF'};
const SESSION_HEADERS=['Date et heure','Identifiant','Moniteur','Activité','Stagiaires','Durée (h)','CA (€)','Part historique (%)','Rémunération (€)','Jeton moniteur','Empreinte','Doublon forcé','Type de prestation','Public','Mode tarif','Tarif appliqué','Mois'];
const MONITOR_HEADERS=['Jeton','Nom','E-mail','Statut','Part historique (%)','Demande le','Validation le','Adresse','SIRET / identifiant','TVA / mention','IBAN','Mode rémunération par défaut','Tarif par défaut'];

function onOpen(){SpreadsheetApp.getUi().createMenu('Evolution2 Lacanau').addItem('Initialiser / mettre à jour le tableau','initialiserTableau').addItem('Actualiser le tableau de bord','actualiserTableauDeBord').addSeparator().addItem('Générer une facture moniteur','genererFactureMoniteur').addToUi()}

function onEdit(e){if(!e||e.range.getSheet().getName()!==HN.monitors||e.range.getColumn()!==4||e.range.getRow()<2)return;if(String(e.value)===HN.active)e.range.getSheet().getRange(e.range.getRow(),7).setValue(new Date())}

function initialiserTableau(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sessions=setupSheet_(ss,HN.sessions,SESSION_HEADERS);
  const monitors=setupSheet_(ss,HN.monitors,MONITOR_HEADERS);
  const tariffs=setupSheet_(ss,HN.tariffs,['Moniteur','Activité','Mode','Tarif','Notes']);
  setupSheet_(ss,HN.invoices,['Numéro','Créée le','Moniteur','Début','Fin','Montant (€)','Lien PDF']);
  const config=setupSheet_(ss,HN.config,['Paramètre','Valeur']);
  if(config.getLastRow()<2)config.getRange(2,1,6,2).setValues([
    ['Nom du club','À compléter'],['Adresse du club','À compléter'],['SIRET / identifiant du club','À compléter'],
    ['E-mail du club','À compléter'],['Délai de paiement','Paiement à 30 jours'],['Devise','EUR']
  ]);
  const statuses=SpreadsheetApp.newDataValidation().requireValueInList([HN.pending,HN.active,HN.inactive],true).build();
  monitors.getRange(2,4,Math.max(monitors.getMaxRows()-1,1),1).setDataValidation(statuses);
  const modes=SpreadsheetApp.newDataValidation().requireValueInList(['HORAIRE','POURCENTAGE_CA','FORFAIT_SEANCE'],true).build();
  monitors.getRange(2,12,Math.max(monitors.getMaxRows()-1,1),1).setDataValidation(modes);
  tariffs.getRange(2,3,Math.max(tariffs.getMaxRows()-1,1),1).setDataValidation(modes);
  tariffs.getRange('A1').setNote('Nom exact du moniteur. Utilisez * pour un tarif applicable à tous.');
  tariffs.getRange('B1').setNote('Nom exact de l’activité. Utilisez * comme tarif par défaut.');
  tariffs.getRange('C1').setNote('HORAIRE : tarif × durée. POURCENTAGE_CA : pourcentage du CA. FORFAIT_SEANCE : montant fixe.');
  completeLegacyRows_(sessions,monitors);
  actualiserTableauDeBord(false);
  SpreadsheetApp.getUi().alert('Tableau mis à jour sans effacer les données. Les tarifs se règlent dans « Moniteurs » et « Tarifs ».');
}

function setupSheet_(ss,name,headers){let sheet=ss.getSheetByName(name);if(!sheet)sheet=ss.insertSheet(name);sheet.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#073b4c').setFontColor('#ffffff');sheet.setFrozenRows(1);sheet.autoResizeColumns(1,headers.length);return sheet}

function completeLegacyRows_(sessions,monitors){
  if(sessions.getLastRow()>1){const dates=sessions.getRange(2,1,sessions.getLastRow()-1,1).getValues(),months=dates.map(r=>[r[0]instanceof Date?Utilities.formatDate(r[0],Session.getScriptTimeZone(),'yyyy-MM'):'']);sessions.getRange(2,17,months.length,1).setValues(months)}
  if(monitors.getLastRow()>1){const range=monitors.getRange(2,1,monitors.getLastRow()-1,13),rows=range.getValues();rows.forEach(r=>{if(!r[11])r[11]='POURCENTAGE_CA';if(r[12]===''||r[12]===null)r[12]=Number(r[4])||30});range.setValues(rows)}
}

function actualiserTableauDeBord(showMessage=true){
  const ss=SpreadsheetApp.getActive(),sessions=ss.getSheetByName(HN.sessions);if(!sessions)throw new Error('Lancez initialiserTableau');
  let dashboard=ss.getSheetByName(HN.dashboard);if(!dashboard)dashboard=ss.insertSheet(HN.dashboard);
  dashboard.getPivotTables().forEach(p=>p.remove());dashboard.clear();
  dashboard.getRange('A1').setValue('TABLEAU DE BORD — ACTIVITÉS PAR MOIS').setFontSize(16).setFontWeight('bold').setFontColor('#073b4c');
  dashboard.getRange('A2').setValue('Chiffre d’affaires et rémunérations calculés depuis l’onglet Seances.').setFontColor('#63777d');
  const source=sessions.getRange(1,1,sessions.getMaxRows(),SESSION_HEADERS.length),pivot=dashboard.getRange('A4').createPivotTable(source);
  pivot.addRowGroup(4);pivot.addColumnGroup(17);
  pivot.addPivotValue(7,SpreadsheetApp.PivotTableSummarizeFunction.SUM);
  pivot.addPivotValue(9,SpreadsheetApp.PivotTableSummarizeFunction.SUM);
  dashboard.setFrozenRows(3);dashboard.autoResizeColumns(1,Math.min(dashboard.getMaxColumns(),18));
  if(showMessage)SpreadsheetApp.getUi().alert('Tableau de bord actualisé.');
}

function doPost(e){
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const data=JSON.parse(e.postData.contents||'{}');if(data.action==='requestAccess')return json_({ok:requestAccess_(data)});if(data.action==='session')return json_(saveSession_(data));return json_({ok:false,error:'ACTION_INCONNUE'})}
  catch(error){return json_({ok:false,error:String(error.message||error)})}
  finally{lock.releaseLock()}
}

function doGet(e){
  const callback=String(e.parameter.callback||'callback').replace(/[^a-zA-Z0-9_$]/g,'');let result={ok:false,error:'ACTION_INCONNUE'};
  if(e.parameter.action==='status')result=getStatus_(e.parameter.token);
  return ContentService.createTextOutput(callback+'('+JSON.stringify(result)+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function requestAccess_(data){
  const sheet=SpreadsheetApp.getActive().getSheetByName(HN.monitors);if(!sheet)throw new Error('Lancez initialiserTableau');
  const rows=sheet.getDataRange().getValues(),token=String(data.token||'');if(!token||!data.name||!data.email)throw new Error('Demande incomplète');
  for(let i=1;i<rows.length;i++)if(String(rows[i][0])===token){sheet.getRange(i+1,2,1,2).setValues([[data.name,data.email]]);return true}
  sheet.appendRow([token,data.name,data.email,HN.pending,30,new Date(),'','','','','','POURCENTAGE_CA',30]);return true;
}

function getStatus_(token){
  const sheet=SpreadsheetApp.getActive().getSheetByName(HN.monitors);if(!sheet)return{ok:false,status:'INCONNU'};
  const rows=sheet.getDataRange().getValues();for(let i=1;i<rows.length;i++)if(String(rows[i][0])===String(token))return{ok:true,status:String(rows[i][3]||HN.pending),name:String(rows[i][1]||'')};
  return{ok:false,status:'INCONNU'};
}

function saveSession_(data){
  const access=getStatus_(data.token);if(!access.ok||access.status!==HN.active)return{ok:false,error:'ACCES_REFUSE'};
  const sheet=SpreadsheetApp.getActive().getSheetByName(HN.sessions);if(!sheet)throw new Error('Lancez initialiserTableau');
  const values=sheet.getDataRange().getValues();if(values.some((row,i)=>i>0&&String(row[1])===String(data.id)))return{ok:false,error:'IDENTIFIANT_DUPLIQUE'};
  const serviceType=String(data.serviceType||'Cours'),audience=String(data.audience||'Individuel'),fingerprint=[data.date,access.name,data.activity,serviceType,audience,Number(data.participants),Number(data.duration),Number(data.revenue)].join('|');
  if(!data.forceDuplicate&&values.some((row,i)=>i>0&&String(row[10])===fingerprint))return{ok:false,error:'SEANCE_DUPLIQUE'};
  const pricing=findPricing_(access.name,String(data.activity)),revenue=Number(data.revenue)||0,duration=Number(data.duration)||0;
  let compensation=0;if(pricing.mode==='HORAIRE')compensation=duration*pricing.amount;else if(pricing.mode==='FORFAIT_SEANCE')compensation=pricing.amount;else compensation=revenue*pricing.amount/100;
  compensation=Math.round(compensation*100)/100;const historicalShare=pricing.mode==='POURCENTAGE_CA'?pricing.amount:'';
  sheet.appendRow([new Date(data.timestamp),data.id,access.name,data.activity,Number(data.participants),duration,revenue,historicalShare,compensation,data.token,fingerprint,!!data.forceDuplicate,serviceType,audience,pricing.mode,pricing.amount,Utilities.formatDate(new Date(data.timestamp),Session.getScriptTimeZone(),'yyyy-MM')]);return{ok:true};
}

function findPricing_(monitorName,activity){
  const ss=SpreadsheetApp.getActive(),sheet=ss.getSheetByName(HN.tariffs),name=String(monitorName).trim().toLowerCase(),act=String(activity).trim().toLowerCase();
  if(sheet&&sheet.getLastRow()>1){const rows=sheet.getDataRange().getValues().slice(1),candidates=[[name,act],[name,'*'],['*',act],['*','*']];for(const pair of candidates){const row=rows.find(r=>String(r[0]).trim().toLowerCase()===pair[0]&&String(r[1]).trim().toLowerCase()===pair[1]&&r[3]!==''&&r[3]!==null);if(row)return validatePricing_(row[2],row[3])}}
  const monitors=ss.getSheetByName(HN.monitors).getDataRange().getValues().slice(1),monitor=monitors.find(r=>String(r[1]).trim().toLowerCase()===name);if(!monitor)throw new Error('Moniteur introuvable');
  return validatePricing_(monitor[11]||'POURCENTAGE_CA',monitor[12]!==''&&monitor[12]!==null?monitor[12]:(Number(monitor[4])||30));
}

function validatePricing_(mode,amount){const value=Number(amount),validModes=['HORAIRE','POURCENTAGE_CA','FORFAIT_SEANCE'],normalized=String(mode||'').trim().toUpperCase();if(!validModes.includes(normalized)||!Number.isFinite(value)||value<0)throw new Error('Tarif invalide dans Moniteurs ou Tarifs');return{mode:normalized,amount:value}}

function genererFactureMoniteur(){
  const ui=SpreadsheetApp.getUi(),name=ui.prompt('Facture moniteur','Nom exact du moniteur :',ui.ButtonSet.OK_CANCEL);if(name.getSelectedButton()!==ui.Button.OK)return;
  const start=ui.prompt('Période','Date de début (AAAA-MM-JJ) :',ui.ButtonSet.OK_CANCEL);if(start.getSelectedButton()!==ui.Button.OK)return;
  const end=ui.prompt('Période','Date de fin incluse (AAAA-MM-JJ) :',ui.ButtonSet.OK_CANCEL);if(end.getSelectedButton()!==ui.Button.OK)return;
  try{
    const startDate=parseDate_(start.getResponseText()),endDate=parseDate_(end.getResponseText());endDate.setHours(23,59,59,999);
    const ss=SpreadsheetApp.getActive(),monitor=findMonitor_(name.getResponseText().trim()),rows=ss.getSheetByName(HN.sessions).getDataRange().getValues().slice(1).filter(r=>String(r[2]).toLowerCase()===String(monitor.name).toLowerCase()&&r[0]instanceof Date&&r[0]>=startDate&&r[0]<=endDate);
    if(!rows.length){ui.alert('Aucune séance trouvée pour ce moniteur sur cette période.');return}
    const config=getConfig_(),invoiceSheet=ss.getSheetByName(HN.invoices),number='FAC-'+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd')+'-'+String(invoiceSheet.getLastRow()).padStart(3,'0');
    const doc=DocumentApp.create(number+' - '+monitor.name),body=doc.getBody();body.appendParagraph('FACTURE').setHeading(DocumentApp.ParagraphHeading.TITLE);body.appendParagraph(number+'\nDate : '+formatDate_(new Date()));
    body.appendParagraph('ÉMETTEUR').setHeading(DocumentApp.ParagraphHeading.HEADING2);body.appendParagraph([monitor.name,monitor.address,monitor.businessId,monitor.email,monitor.vat,monitor.iban].filter(Boolean).join('\n'));
    body.appendParagraph('CLIENT').setHeading(DocumentApp.ParagraphHeading.HEADING2);body.appendParagraph([config['Nom du club'],config['Adresse du club'],config['SIRET / identifiant du club'],config['E-mail du club']].filter(Boolean).join('\n'));
    body.appendParagraph('Période du '+formatDate_(startDate)+' au '+formatDate_(endDate)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const table=body.appendTable([['Date','Activité','Prestation','Durée','Rémunération']]);let total=0;rows.forEach(r=>{total+=Number(r[8])||0;const row=table.appendTableRow();[formatDate_(r[0]),String(r[3]),String(r[12]||''),Number(r[5])+' h',money_(r[8],config.Devise)].forEach(value=>row.appendTableCell(value))});
    body.appendParagraph('TOTAL À PAYER : '+money_(total,config.Devise)).setHeading(DocumentApp.ParagraphHeading.HEADING1);body.appendParagraph(config['Délai de paiement']||'');doc.saveAndClose();
    const folder=getInvoiceFolder_(),pdf=folder.createFile(DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF)).setName(number+' - '+monitor.name+'.pdf');DriveApp.getFileById(doc.getId()).setTrashed(true);
    invoiceSheet.appendRow([number,new Date(),monitor.name,startDate,endDate,total,pdf.getUrl()]);ui.alert('Facture créée : '+pdf.getUrl());
  }catch(error){ui.alert('Impossible de créer la facture : '+String(error.message||error))}
}

function findMonitor_(name){const rows=SpreadsheetApp.getActive().getSheetByName(HN.monitors).getDataRange().getValues().slice(1),r=rows.find(x=>String(x[1]).toLowerCase()===String(name).toLowerCase());if(!r)throw new Error('Moniteur introuvable');return{name:r[1],email:r[2],address:r[7],businessId:r[8],vat:r[9],iban:r[10]}}
function getConfig_(){const rows=SpreadsheetApp.getActive().getSheetByName(HN.config).getDataRange().getValues().slice(1),o={};rows.forEach(r=>o[r[0]]=r[1]);return o}
function getInvoiceFolder_(){const it=DriveApp.getFoldersByName('Factures Evolution2 Lacanau');return it.hasNext()?it.next():DriveApp.createFolder('Factures Evolution2 Lacanau')}
function parseDate_(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());if(!m)throw new Error('Date invalide : utilisez AAAA-MM-JJ');return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]))}
function formatDate_(d){return Utilities.formatDate(d,Session.getScriptTimeZone(),'dd/MM/yyyy')}
function money_(n,currency){return Utilities.formatString('%.2f %s',Number(n)||0,currency||'EUR')}
function json_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON)}
