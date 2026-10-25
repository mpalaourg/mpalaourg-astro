// One shared list for visible suggestions and server cache eligibility.
export const CHAT_STARTERS={
  en:['What does Georgios work on?','Tell me about the workflows to agents workshop','What has Georgios published?','What can I explore in the Formula 1 section?'],
  el:['Με τι ασχολείται ο Γιώργος;','Τι περιλαμβάνει το workshop «From Workflows to Agents»;','Τι έρευνα έχει δημοσιεύσει;','Τι θα βρω στην ενότητα Formula 1;'],
} as const;
export function starterQuestion(question:string,lang:'en'|'el'){
  const normalize=(value:string)=>value.normalize('NFC').trim().replace(/\s+/gu,' ');
  return CHAT_STARTERS[lang].find(value=>normalize(value)===normalize(question));
}
