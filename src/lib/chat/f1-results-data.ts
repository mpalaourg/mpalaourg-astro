// Shared transport for server-owned result snapshots. Model prose never creates cards.
export const F1_RESULT_KINDS = ['race','qualifying','sprint','sprint_qualifying','fp1','fp2','fp3','drivers','constructors'] as const;
export type F1ResultKind = typeof F1_RESULT_KINDS[number];
export type F1Row = Partial<Record<'position'|'name'|'team'|'points'|'wins'|'status'|'laps'|'Q1'|'Q2'|'Q3'|'positionText'|'lapTime'|'gapToLeader'|'time',string>> & Partial<Record<'dnf'|'dns'|'dsq'|'noResult'|'positionReported'|'qualifyingPositionKnown',boolean>>;
export type F1Snapshot = {kind:F1ResultKind;observedAt:string;season?:number;round?:number;event?:string;sessionDate?:string;raceDate?:string;status:string;cacheState?:string;calendarState?:string;afterRound?:string;fetchedAt?:string;provisional?:boolean;classification:F1Row[]};
export type ChatCitation = {title:string;url:string;f1Results?:F1Snapshot[]};
export function f1Snapshots(value:unknown):F1Snapshot[]{
 if(!Array.isArray(value))return [];
 const output:F1Snapshot[]=[];
 for(const raw of value.slice(0,3)){
  if(!raw||typeof raw!=='object'||!F1_RESULT_KINDS.includes(raw.kind)||typeof raw.observedAt!=='string'||!Number.isFinite(Date.parse(raw.observedAt))||!['complete','available','pending','live','unavailable'].includes(raw.status)||!Array.isArray(raw.classification))continue;
  const snapshot:F1Snapshot={kind:raw.kind,observedAt:raw.observedAt,status:raw.status,classification:[]};
  for(const key of ['event','sessionDate','raceDate','cacheState','calendarState','afterRound','fetchedAt'] as const)if(typeof raw[key]==='string')snapshot[key]=raw[key].slice(0,180);
  for(const key of ['season','round'] as const)if(Number.isInteger(raw[key])&&raw[key]>=1&&raw[key]<2200)snapshot[key]=raw[key];
  if(typeof raw.provisional==='boolean')snapshot.provisional=raw.provisional;
  for(const item of raw.classification.slice(0,30)){
   if(!item||typeof item!=='object')continue;
   const row:F1Row={};
   for(const key of ['position','name','team','points','wins','status','laps','Q1','Q2','Q3','positionText','lapTime','gapToLeader','time'] as const)if(typeof item[key]==='string')row[key]=item[key].slice(0,180);
   for(const key of ['dnf','dns','dsq','noResult','positionReported','qualifyingPositionKnown'] as const)if(typeof item[key]==='boolean')row[key]=item[key];
   if(row.name)snapshot.classification.push(row);
  }
  if(snapshot.classification.length&&JSON.stringify(snapshot).length<=16000&&JSON.stringify([...output,snapshot]).length<=40000)output.push(snapshot);
 }
 return output;
}

/** Compact session-specific values for the inline preview. */
export function f1PreviewMetrics(snapshot:F1Snapshot,row:F1Row,lang:'en'|'el'):{label:string;value:string}[]{
 const valid=(value:string|undefined)=>!!value?.trim()&&!/^[·—–-]+$/.test(value.trim());
 const points={label:lang==='el'?'Βαθ.':'Pts',value:row.points||'·'};
 if(snapshot.kind==='drivers'||snapshot.kind==='constructors')return [points];
 const status=row.dsq?'DSQ':row.dns?'DNS':row.noResult?(lang==='el'?'Χωρίς χρόνο':'No time'):row.dnf?'DNF':'';
 if(status)return [{label:lang==='el'?'Κατάσταση':'Status',value:status},...(valid(row.points)?[points]:[])];
 if(snapshot.kind==='qualifying'||snapshot.kind==='sprint_qualifying'){
  for(const stage of ['Q3','Q2','Q1'] as const)if(valid(row[stage]))return [{label:snapshot.kind==='sprint_qualifying'?stage.replace('Q','SQ'):stage,value:row[stage]!}];
  return [{label:lang==='el'?'Χρόνος':'Time',value:'·'}];
 }
 const practice=/^fp[123]$/.test(snapshot.kind);
 const value=(practice?[row.lapTime,row.time]:[row.time,row.gapToLeader,row.lapTime]).find(valid);
 const timing={label:practice?(lang==='el'?'Καλύτερος γύρος':'Best lap'):(lang==='el'?'Χρόνος / διαφορά':'Time / gap'),value:row.status?.toLowerCase()==='lapped'?'Lapped':valid(value)?value!:row.status||'·'};
 return [timing,...(practice&&valid(row.gapToLeader)?[{label:lang==='el'?'Διαφορά':'Gap',value:row.gapToLeader!}]:[]),...(!practice&&valid(row.points)?[points]:[])];
}
