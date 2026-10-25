import {f1Snapshots,f1PreviewMetrics,type ChatCitation,type F1Snapshot,type F1Row} from '../lib/chat/f1-results-data';
const labels={
 en:{race:'Race',qualifying:'Qualifying',sprint:'Sprint',sprint_qualifying:'Sprint qualifying',fp1:'Practice 1',fp2:'Practice 2',fp3:'Practice 3',drivers:'Drivers’ standings',constructors:'Constructors’ standings',results:'F1 results',full:'Full classification',close:'Close results',swipe:'Scroll sideways for all columns.',position:'Pos',driver:'Driver',constructor:'Constructor',team:'Team',points:'Pts',time:'Time / gap',standings:'Standings snapshot',final:'Final classification',provisional:'Provisional',stale:'Cached snapshot',asOf:'Retrieved',round:'Round',after:'After round',source:'Formula page',snapshot:'Results saved with this answer.'},
 el:{race:'Αγώνας',qualifying:'Κατατακτήριες',sprint:'Sprint',sprint_qualifying:'Sprint qualifying',fp1:'Ελεύθερες δοκιμές 1',fp2:'Ελεύθερες δοκιμές 2',fp3:'Ελεύθερες δοκιμές 3',drivers:'Βαθμολογία οδηγών',constructors:'Βαθμολογία κατασκευαστών',results:'Αποτελέσματα F1',full:'Όλη η κατάταξη',close:'Κλείσιμο αποτελεσμάτων',swipe:'Σύρετε οριζόντια για όλες τις στήλες.',position:'Θέση',driver:'Οδηγός',constructor:'Κατασκευαστής',team:'Ομάδα',points:'Βαθ.',time:'Χρόνος / διαφορά',standings:'Στιγμιότυπο βαθμολογίας',final:'Τελική κατάταξη',provisional:'Προσωρινά αποτελέσματα',stale:'Αποθηκευμένα δεδομένα',asOf:'Ανάκτηση',round:'Γύρος',after:'Μετά τον γύρο',source:'Σελίδα Formula',snapshot:'Τα αποτελέσματα αποθηκεύτηκαν μαζί με την απάντηση.'},
};
function node<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''){const element=document.createElement(tag);element.className=className;element.textContent=text;return element;}
function add(parent:Node,...children:Node[]){for(const child of children)parent.appendChild(child);}
function date(value:string|undefined,lang:'en'|'el',time=false){if(!value)return '';const stamp=new Date(value);return Number.isFinite(stamp.getTime())?new Intl.DateTimeFormat(lang==='el'?'el-GR':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC',...(time?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(stamp)+(time?' UTC':''):'';}
function heading(snapshot:F1Snapshot,lang:'en'|'el'){return snapshot.event||`${labels[lang][snapshot.kind]}${snapshot.season?' · '+snapshot.season:''}`;}
function badge(snapshot:F1Snapshot,lang:'en'|'el'){
 const stale=snapshot.cacheState==='stale_cache'||snapshot.calendarState==='stale_cache';
 const provisional=snapshot.provisional||snapshot.status==='pending'||snapshot.status==='live';
 return node('span',`chat-f1-badge${stale||provisional?' is-caution':''}`,stale?labels[lang].stale+(provisional?' · '+labels[lang].provisional:''):provisional?labels[lang].provisional:snapshot.kind==='drivers'||snapshot.kind==='constructors'?labels[lang].standings:labels[lang].final);
}
function position(row:F1Row){return row.dsq?'DSQ':row.dns?'DNS':row.noResult||row.positionReported===false||row.qualifyingPositionKnown===false?'·':row.position||'·';}
function resultTime(row:F1Row){return row.dsq?'DSQ':row.dns?'DNS':row.dnf?'DNF':row.status?.toLowerCase()==='lapped'?'Lapped':row.time||row.lapTime||row.gapToLeader||row.status||'·';}
function metadata(snapshot:F1Snapshot,lang:'en'|'el'){
 const copy=labels[lang];return [copy[snapshot.kind],date(snapshot.sessionDate||snapshot.raceDate,lang),snapshot.afterRound?`${copy.after} ${snapshot.afterRound}`:snapshot.round?`${copy.round} ${snapshot.round}`:''].filter(Boolean).join(' · ');
}
function openResults(owner:HTMLElement,opener:HTMLButtonElement,snapshot:F1Snapshot,url:string,lang:'en'|'el'){
 const copy=labels[lang],dialog=node('dialog','chat-f1-dialog'),title=node('h2','',heading(snapshot,lang));title.id=`chat-f1-title-${crypto.randomUUID()}`;
 dialog.setAttribute('aria-labelledby',title.id);
 const header=node('header','chat-f1-dialog-heading'),close=node('button','chat-f1-close','×');close.type='button';close.setAttribute('aria-label',copy.close);close.title=copy.close;
 const intro=node('div');add(intro,node('p','chat-f1-kicker',copy.results),title,node('p','chat-f1-meta',metadata(snapshot,lang)));
 add(header,intro,close);add(dialog,header,badge(snapshot,lang));
 const scroller=node('div','chat-f1-table-wrap');scroller.tabIndex=0;scroller.setAttribute('role','region');scroller.setAttribute('aria-label',copy.full);
 const table=node('table','chat-f1-table');const caption=node('caption','sr-only',`${heading(snapshot,lang)} · ${copy.full}`);add(table,caption);
 const constructors=snapshot.kind==='constructors',qualifying=snapshot.kind==='qualifying'||snapshot.kind==='sprint_qualifying';
 const hasPoints=snapshot.classification.some(row=>row.points!==undefined&&row.points!==''),hasTime=!qualifying&&snapshot.kind!=='drivers'&&!constructors;
 const columns=[copy.position,constructors?copy.constructor:copy.driver,...(!constructors?[copy.team]:[]),...(qualifying?(snapshot.kind==='sprint_qualifying'?['SQ1','SQ2','SQ3']:['Q1','Q2','Q3']):[]),...(hasTime?[copy.time]:[]),...(hasPoints?[copy.points]:[])];
 const head=node('thead'),headRow=node('tr');for(const label of columns){const cell=node('th','',label);cell.scope='col';add(headRow,cell);}add(head,headRow);add(table,head);
 const body=node('tbody');
 for(const row of snapshot.classification){const tr=node('tr');const values=[position(row),row.name||'·',...(!constructors?[row.team||'·']:[]),...(qualifying?[row.Q1||'·',row.Q2||'·',row.Q3||'·']:[]),...(hasTime?[resultTime(row)]:[]),...(hasPoints?[row.points||'·']:[])];
  for(const [index,value]of values.entries()){if(index===1){const th=node('th','',value);th.scope='row';add(tr,th);}else add(tr,node('td','',value));}add(body,tr);
 }
 add(table,body);add(scroller,table);add(dialog,node('p','chat-f1-scroll-hint',`↔ ${copy.swipe}`),scroller);
 const footer=node('footer','chat-f1-dialog-footer');const info=node('div');add(info,node('p','',copy.snapshot),node('p','chat-f1-meta',`${copy.asOf} ${date(snapshot.observedAt,lang,true)}`));
 const link=node('a','',`${copy.source} ↗`);link.href=url;link.target='_blank';link.rel='noopener noreferrer';add(footer,info,link);add(dialog,footer);
 close.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
 dialog.addEventListener('close',()=>{dialog.remove();if(opener.isConnected)opener.focus();},{once:true});
 add(owner,dialog);dialog.showModal();close.focus();
}
export function renderF1Cards(target:HTMLElement,sources:ChatCitation[],lang:'en'|'el'){
 const owner=target.closest<HTMLElement>('site-chat')||target,copy=labels[lang];
 for(const source of sources){
  if(!/^\/(?:el\/)?formula\/$/.test(source.url))continue;
  for(const snapshot of f1Snapshots(source.f1Results)){
   const card=node('section','chat-f1-card');card.setAttribute('aria-label',`${copy.results}: ${heading(snapshot,lang)}`);
   const header=node('div','chat-f1-card-header');add(header,node('span','chat-f1-kicker',`▦ ${copy.results}`),badge(snapshot,lang));
   add(card,header,node('h3','',heading(snapshot,lang)),node('p','chat-f1-meta',metadata(snapshot,lang)));
   const list=node('ol','chat-f1-preview');
   for(const row of snapshot.classification.slice(0,3)){const item=node('li'),identity=node('div');add(identity,node('strong','',row.name));if(snapshot.kind!=='constructors'&&row.team&&row.team.trim().toLocaleLowerCase()!==row.name?.trim().toLocaleLowerCase())add(identity,node('span','',row.team));add(item,node('span','chat-f1-position',position(row)),identity);const metrics=node('div','chat-f1-metrics');for(const metric of f1PreviewMetrics(snapshot,row,lang)){const entry=node('span','chat-f1-metric');add(entry,node('span','chat-f1-metric-label',metric.label),node('strong','chat-f1-metric-value',metric.value));add(metrics,entry);}add(item,metrics);add(list,item);}
   const button=node('button','chat-f1-open');button.type='button';add(button,node('span','',copy.full),node('span','','⤢'));button.setAttribute('aria-label',`${copy.full}: ${heading(snapshot,lang)}`);
   button.addEventListener('click',()=>openResults(owner,button,snapshot,source.url,lang));add(card,list,button);add(target,card);
  }
 }
}
