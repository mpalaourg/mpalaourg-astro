import type {Source} from './policy';

export interface OwnerBackgroundEnv {
  CHAT_OWNER_BACKGROUND_B64?:string;
}

// Approved background lives in server secret configuration, never source code,
// browser assets, the @ picker, or the public retrieval corpus. Base64 is a
// transport encoding for Unicode/dotenv safety, not encryption.
export function ownerBackgroundSources(lang:'en'|'el',encoded?:string):Source[]{
  if(!encoded||encoded.length>24000)return [];
  try{
    const bytes=Uint8Array.from(atob(encoded),point=>point.charCodeAt(0));
    const facts:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!Array.isArray(facts)||facts.length>12||facts.some(fact=>
      !fact||typeof fact!=='object'||Object.keys(fact).sort().join(',')!=='el,en'||
      ['en','el'].some(key=>typeof fact[key]!=='string'||!fact[key].trim()||fact[key].length>1200||/[\p{Cc}\p{Cf}]/u.test(fact[key]))
    ))return [];
    return facts.map(fact=>({
      title:lang==='el'?'Πληροφορίες από τον Γιώργο':'Background shared by Georgios',
      url:'',kind:'owner-background',body:fact[lang],
    }));
  }catch{return []}
}
