import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
const output=await build({stdin:{contents:"export {f1Snapshots,f1PreviewMetrics} from './src/lib/chat/f1-results-data';export {savedCitations} from './src/lib/chat/storage';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {f1Snapshots,f1PreviewMetrics,savedCitations}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].contents).toString('base64'));
const snapshot={kind:'race',status:'complete',observedAt:'2026-10-25T19:12:00Z',season:2026,round:17,event:'Singapore Grand Prix',classification:[{position:'1',name:'Test Driver',team:'Test Team',points:'25',dsq:false}]};
test('server-owned F1 cards survive the same saved citation path as a reopened answer',()=>{
 const value=[{title:'F1',url:'/formula/',f1Results:[snapshot]}];
 assert.deepEqual(savedCitations(JSON.stringify(value)),value);
 assert.deepEqual(savedCitations(JSON.stringify([{title:'About',url:'/about/',f1Results:[snapshot]}])),[{title:'About',url:'/about/'}]);
 assert.deepEqual(savedCitations(JSON.stringify([{title:'F1',url:'https://evil.test',f1Results:[snapshot]}])),[]);
});
test('invalid, unbounded and unknown presentation fields are rejected or removed',()=>{
 for(const change of [{kind:'url'},{status:'invented'},{observedAt:'invalid'},{classification:null}])assert.deepEqual(f1Snapshots([{...snapshot,...change}]),[]);
 const result=f1Snapshots([{...snapshot,privateConfig:'hidden',classification:[{...snapshot.classification[0],html:'<script>',positionReported:false}]}]);
 assert.equal(result[0].privateConfig,undefined);assert.equal(result[0].classification[0].html,undefined);assert.equal(result[0].classification[0].positionReported,false);
 assert.equal(f1Snapshots(Array(8).fill(snapshot)).length,3);
 assert.equal(f1Snapshots([{...snapshot,classification:Array(50).fill(snapshot.classification[0])}])[0].classification.length,30);
});
test('older plain citations remain compatible and snapshots do not create missing points',()=>{
 assert.deepEqual(savedCitations('[{"title":"Formula","url":"/formula/"}]'),[{title:'Formula',url:'/formula/'}]);
 const item=f1Snapshots([{...snapshot,classification:[{name:'Unknown classification'}]}])[0].classification[0];
 assert.equal(item.points,undefined);assert.equal(item.position,undefined);
});

test('inline previews use session-specific timing and points',()=>{
 const metrics=(kind,row,lang='en')=>f1PreviewMetrics({...snapshot,kind},row,lang);
 assert.deepEqual(metrics('fp1',{lapTime:'1:31.123',gapToLeader:'+0.200'}),[{label:'Best lap',value:'1:31.123'},{label:'Gap',value:'+0.200'}]);
 assert.deepEqual(metrics('qualifying',{Q1:'1:31.100',Q2:'1:30.900',Q3:'1:30.500'}),[{label:'Q3',value:'1:30.500'}]);
 assert.deepEqual(metrics('sprint_qualifying',{Q1:'1:31.100',Q2:'1:30.900',Q3:'—'}),[{label:'SQ2',value:'1:30.900'}]);
 assert.deepEqual(metrics('race',{time:'+7.335',points:'18'}),[{label:'Time / gap',value:'+7.335'},{label:'Pts',value:'18'}]);
 assert.deepEqual(metrics('sprint',{dnf:true,points:'0'}),[{label:'Status',value:'DNF'},{label:'Pts',value:'0'}]);
 assert.deepEqual(metrics('fp2',{lapTime:'—',time:'1:30.123'},'el'),[{label:'Καλύτερος γύρος',value:'1:30.123'}]);
 assert.deepEqual(metrics('drivers',{points:'340'}),[{label:'Pts',value:'340'}]);
});
