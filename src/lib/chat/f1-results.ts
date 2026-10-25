import { GET as schedule } from '../../pages/api/f1/schedule';
import { GET as session } from '../../pages/api/f1/session';
import { GET as standings } from '../../pages/api/f1/standings';
import { isSessionOver } from '../../utils/f1/session-timing';
import { checkRun, runSignal } from './cancellation';
import { traceStep } from './tracing';
import type { ChatEnv } from './server';
import type { Source } from './policy';

import { F1_RESULT_KINDS, type F1ResultKind } from './f1-results-data';
export { F1_RESULT_KINDS, type F1ResultKind } from './f1-results-data';
export const F1_TOOL_KINDS=[...F1_RESULT_KINDS,'calendar'] as const;
export type F1ToolKind=typeof F1_TOOL_KINDS[number];
type RecordData = Record<string, unknown>;
type Handler = typeof schedule;
type Reader = (route:'schedule'|'session'|'standings', params:Record<string,string>, signal:AbortSignal) => Promise<RecordData>;
const handlers = {schedule, session, standings};
const object = (value:unknown): RecordData => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordData : {};
const text = (value:unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).slice(0,180) : '';

// Internal dispatch reuses the modal's cache, refresh rules and provider adapters.
// The planner selects enums only; it cannot supply a URL, SQL or provider arguments.
function reader(env:ChatEnv): Reader {
  return async (route,params,signal) => {
    const url=new URL(`https://mpalaourg.dev/api/f1/${route}`);
    url.search=new URLSearchParams(params).toString();
    let onAbort:()=>void=()=>{};
    const cancelled=new Promise<never>((_,reject)=>{
      onAbort=()=>reject(signal.reason || new DOMException('F1 lookup stopped','AbortError'));
      if(signal.aborted)onAbort();else signal.addEventListener('abort',onAbort,{once:true});
    });
    try {
      // Only the shared handlers' url/locals inputs are used. No visitor data or
      // credentials enter an HTTP request to this synthetic routing URL.
      const response=await Promise.race([
        handlers[route]({url,locals:{runtime:{env:{DB:env.DB}}}} as Parameters<Handler>[0]),cancelled,
      ]);
      if(!response.ok)throw new Error('f1_results_unavailable');
      const data:unknown=await response.json();
      if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('invalid_f1_results');
      return data as RecordData;
    } finally {signal.removeEventListener('abort',onAbort);}
  };
}

function rows(value:unknown,kind:F1ResultKind) {
  if(!Array.isArray(value))return [];
  return value.slice(0,30).map(raw=>{
    const row=object(raw),driver=object(row.Driver),constructor=object(row.Constructor);
    const name=text(driver.givenName||row.name)+' '+text(driver.familyName);
    const teams=Array.isArray(row.Constructors)?row.Constructors.map(team=>text(object(team).name)).join(', '):'';
    const fields:RecordData={position:text(row.position),name:kind==='constructors'?text(constructor.name):name.trim(),team:text(constructor.name||row.teamName)||teams};
    for(const key of ['points','wins','status','laps','Q1','Q2','Q3','positionText','lapTime','gapToLeader'])if(row[key]!==undefined)fields[key]=text(row[key]);
    for(const key of ['Q1','Q2','Q3'])if(fields[key]===undefined&&row[key.toLowerCase()]!==undefined)fields[key]=text(row[key.toLowerCase()]);
    for(const key of ['dnf','dns','dsq','noResult','positionReported','qualifyingPositionKnown'])if(typeof row[key]==='boolean')fields[key]=row[key];
    if(row.Time)fields.time=text(object(row.Time).time);
    if(row.FastestLap){const lap=object(row.FastestLap);fields.fastestLap={rank:text(lap.rank),time:text(object(lap.Time).time)};}
    return fields;
  });
}

/** Latest-session evidence shares the Formula modal's data path and remains optional. */
export async function f1ResultSources(env:ChatEnv,requested:F1ToolKind[]|undefined,attached:string[],lang:'en'|'el',read?:Reader,now=Date.now()):Promise<Source[]> {
  if(!requested?.length)return [];
  const url=lang==='el'?'/el/formula/':'/formula/';
  if(attached.length&&!attached.includes(url))return [];
  const span=traceStep(env,'Formula 1 · results and calendar','tool');
  const kinds=[...new Set(requested)].filter(kind=>F1_TOOL_KINDS.includes(kind)).slice(0,3);
  span?.input({kinds});
  const signal=runSignal(env,8000),load=read||reader(env),year=new Date(now).getUTCFullYear();
  const calendars=new Map<number,Promise<RecordData>>();
  const calendar=(season:number)=>{let value=calendars.get(season);if(!value){value=load('schedule',{season:String(season)},signal);calendars.set(season,value);}return value;};
  try {
    const sources=await Promise.all(kinds.map(async kind=>{
      let evidence:RecordData={kind,observedAt:new Date(now).toISOString()};
      try {
        if(kind==='calendar') {
          const seasons=await Promise.all([year,year+1].map(async season=>{
            try {
              const data=await calendar(season);
              const races=Array.isArray(data.races)?data.races:[];
              return {season,cacheState:text(data.source),races:races.slice(0,30).map(raw=>{
                const race=object(raw),circuit=object(race.Circuit),location=object(circuit.Location);
                const sessions=Object.entries({fp1:'FirstPractice',fp2:'SecondPractice',fp3:'ThirdPractice',qualifying:'Qualifying',sprint:'Sprint',sprint_qualifying:'SprintQualifying'}).flatMap(([type,key])=>{const session=object(race[key]);return session.date?[{type,date:text(session.date),time:text(session.time)}]:[]});
                return {round:text(race.round),event:text(race.raceName),date:text(race.date),time:text(race.time),circuit:text(circuit.circuitName),locality:text(location.locality),country:text(location.country),sessions};
              })};
            } catch(error){checkRun(env);if(signal.aborted)throw error;return {season,cacheState:'unavailable',races:[]};}
          }));
          evidence={...evidence,status:seasons.some(season=>season.races.length)?'available':'unavailable',timeZone:'UTC',seasons};
        } else if(kind==='drivers'||kind==='constructors') {
          const data=await load('standings',{season:String(year),type:kind},signal);
          const classification=rows(data.standings,kind);
          evidence={...evidence,season:year,status:classification.length?'available':'unavailable',cacheState:text(data.source),afterRound:text(data.afterRound),fetchedAt:text(data.fetchedAt),classification};
        } else {
          let chosen:RecordData|undefined,season=year,calendarState='',sessionDate='';
          for(const candidateYear of [year,year-1]) {
            const data=await calendar(candidateYear);
            const races=Array.isArray(data.races)?data.races:[];
            const dateFor=(race:RecordData)=>object(kind==='race'?{date:race.date,time:race.time}:race[({fp1:'FirstPractice',fp2:'SecondPractice',fp3:'ThirdPractice',qualifying:'Qualifying',sprint:'Sprint',sprint_qualifying:'SprintQualifying'} as const)[kind]]);
            chosen=races.map(object).filter(race=>{const date=dateFor(race);return isSessionOver({date:text(date.date),time:text(date.time)||null},kind,now);}).sort((a,b)=>Number(b.round)-Number(a.round))[0];
            if(chosen){season=candidateYear;calendarState=text(data.source);sessionDate=text(dateFor(chosen).date);break;}
          }
          if(!chosen)evidence={...evidence,status:'unavailable'};
          else {
            const round=Number(chosen.round);
            if(!Number.isInteger(round)||round<1||round>30)throw new Error('invalid_f1_round');
            const data=await load('session',{season:String(season),round:String(round),type:kind},signal);
            const classification=rows(data.results,kind);
            evidence={...evidence,season,round,event:text(chosen.raceName),raceDate:text(chosen.date),sessionDate,calendarState,status:text(data.status)||'unavailable',provisional:data.status!=='complete',classification};
            if(!classification.length)evidence.status='unavailable';
          }
        }
      } catch(error) {
        checkRun(env);if(signal.aborted)throw error;
        evidence={...evidence,status:'unavailable'};
      }
      return {title:kind==='calendar'?(lang==='el'?'Formula 1: ημερολόγιο αγώνων':'Formula 1: race calendar'):(lang==='el'?'Formula 1: πρόσφατα αποτελέσματα':'Formula 1: latest results'),url,kind:'f1-results' as const,body:JSON.stringify(evidence)};
    }));
    span?.output({sources:sources.map(source=>JSON.parse(source.body))});span?.end({source_count:sources.length});
    return sources;
  } catch(error) {
    span?.end({},'f1_results_unavailable',undefined,error);checkRun(env);
    return [{title:lang==='el'?'Formula 1: αποτελέσματα μη διαθέσιμα':'Formula 1: results unavailable',url,kind:'f1-results',body:JSON.stringify({status:'unavailable',observedAt:new Date(now).toISOString(),kinds})}];
  }
}
