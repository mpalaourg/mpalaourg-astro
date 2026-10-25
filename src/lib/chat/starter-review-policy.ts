import {SYSTEM_PROMPT,SCOPE_PROMPT,answerLanguagePrompt} from './policy';
import {personaPrompt,type Persona} from './personas';
import {continuationPrompt} from './contact';
import {EVIDENCE_PROMPT} from './evidence-plan';
import {decisionPrompt,ROUTING_QUESTION} from './decisions';
export function starterReviewPolicy(lang:'en'|'el',persona:Persona){
  return SYSTEM_PROMPT+SCOPE_PROMPT+answerLanguagePrompt(lang)+personaPrompt(persona,lang)+continuationPrompt(lang,persona,3,[])+EVIDENCE_PROMPT+decisionPrompt('factual')+JSON.stringify(ROUTING_QUESTION);
}
