import assert from 'node:assert/strict';
import {NodeRel} from './noderel.mjs';
export function regressions(){
 const g=new NodeRel(':memory:');
 const node=(id,scope='test')=>({id,scope,kind:'test',title:id});
 const edge=(from,to)=>({from,to,scope:'test',type:'LINK',properties:{}});
 try {
  g.rebuild([{nodes:[node('REQ-10'),node('REQ-1'),node('C'),node('HIDDEN','private')],edges:[edge('REQ-10','REQ-1'),edge('REQ-1','C'),edge('C','REQ-10')]}]);
  assert.deepEqual(g.trace({id:'REQ-10',scope:'test',maxDepth:10}).map(r=>[r.id,r.depth]),[['REQ-1',1],['C',2]]);
  assert.equal(g.trace({id:'HIDDEN',scope:'test',maxDepth:10}).length,0);
  assert.throws(()=>g.trace({id:'REQ-10',scope:'test',maxDepth:11}));
  assert.throws(()=>g.rebuild([{nodes:[node('A'),node('A')],edges:[]} ]));
  assert.equal(g.trace({id:'REQ-10',scope:'test',maxDepth:2}).length,2);
  return 4;
 } finally {g.close();}
}
