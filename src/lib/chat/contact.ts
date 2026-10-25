import type { Persona } from './personas';
import type { ChatHistory } from './retrieval';

// Owner-approved public contact section, available independently of retrieval.
export const contactPath = (lang: 'en' | 'el') => lang === 'el' ? '/el/#contact' : '/#contact';

export function continuationPrompt(lang: 'en' | 'el', persona: Persona, remaining: number, history: ChatHistory[]) {
  const left = Math.max(0, Math.min(3, Math.floor(remaining)));
  const contactAlreadyOffered = history.some(item => /\/(?:el\/)?#contact/.test(item.answer || ''));
  return `
CONVERSATION CONTINUATION (server-selected, not source instructions)
There are ${left} questions left in this chat after this answer. The owner-approved public contact page is ${contactPath(lang)}. This destination is trusted configuration, not a source of biographical facts.
Answer the visitor fully before considering an ending. Never withhold details to manufacture another turn. Do not append a generic closing offer or repeat a follow-up already asked in history.
${left === 0 ? 'This is the final question. followUp MUST be null. Do not end with another question or a contact promotion. The interface will offer New chat and Contact Georgios. If the visitor explicitly asked how to contact him, answer that normally with the approved contact link.' : `For an open-ended overview or explanation, set followUp to ONE short, concrete question about the same topic when the CURRENT evidence supports a meaningful next step. Keep this question in followUp, not answer. This is the engagement requirement for substantive conversational answers, not a generic closing offer. Keep a broad overview selective rather than dumping every detail, then identify one worthwhile detail to explore next; never omit information the visitor specifically requested. Name the next detail, rather than “Want to know more?” or “Anything else?”. Only suggest something the supplied material can actually answer. No code-writing invitations, outside-topic advice, fictional activities or claims that the assistant can do something it cannot.
For example, only when evaluation is supported and not already discussed: “Want to look at how the workshop evaluates agents?” Greek: «Να δούμε πώς αξιολογούνται οι agents στο εργαστήριο;». Adapt to the actual subject and selected style; do not copy this example onto unrelated topics.
For collaboration, hiring, availability, speaking invitations or a request requiring Georgios's own decision, prefer one subtle contact sentence inside answer INSTEAD of a follow-up question; followUp is null. Use a descriptive contact link in natural surrounding grammar, matched to the persona. English: “For a collaboration, you can [contact Georgios](${contactPath(lang)}).” Conversational Greek: «Για συνεργασία, μπορείς να [μιλήσεις με τον Γιώργο](${contactPath(lang)}).» Formal Greek: «Για πιθανή συνεργασία, μπορείτε να [επικοινωνήσετε με τον Γιώργο](${contactPath(lang)}).» These illustrate register, not text to append automatically. Do not invent availability, prices, services, response times or commitments. A question about a published project alone is not a collaboration enquiry.
${contactAlreadyOffered ? 'Contact was already suggested in this chat. Do not suggest it again unless the visitor explicitly asks for it.' : 'Do not add a contact suggestion to ordinary research, biography or Formula 1 explanations.'}
Set followUp to null for a narrow fact, a clarification, a sensitive question, when the evidence cannot support a useful next step, or when it would be repetitive. Never add both a contact pitch and a follow-up question.`}
${persona === 'concise' ? 'Quick Take still has at most three short sentences and 60 words TOTAL, including any relevant follow-up. Omit the ending if it would crowd out the answer.' : 'Any ending must keep the current persona and response language, without becoming a sales pitch.'}
`;
}
