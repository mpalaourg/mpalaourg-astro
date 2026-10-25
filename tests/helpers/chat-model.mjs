// Transport fixtures isolate routing and evidence planning from answer mocks.
// Dedicated decision/evidence tests exercise those protocols independently.
export function decisionResponse(kind='factual') {
  const probabilities=Object.fromEntries(['factual','courtesy','clarification','refusal','uncertain'].map(route=>[route,route===kind?1:0]));
  return Response.json({answers:{route:{type:'choice',choice:kind,probabilities}}});
}
export function withDecisionMock(mock,kind='factual') {
  return async(url,init)=>String(url)==='https://openrouter.ai/api/alpha/decisions'?decisionResponse(kind):mock(url,init);
}
export function withEvidencePlan(mock) {
  return withDecisionMock(async (url,init) => {
    if(!String(url).startsWith('https://openrouter.ai/'))return mock(url,init);
    const request=init?.body && JSON.parse(init.body);
    const context=request?.messages?.[1]?.content && JSON.parse(request.messages[1].content);
    if(context?.stage==='plan')return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({retrieve:{queries:[context.question],sourceUrls:context.selectedSourceUrls,citationPapers:[]}})}}]});
    return mock(url,init);
  });
}
