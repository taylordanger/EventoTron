import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSketches, sketchPoint } from '../app/tabletron/sketch-data.ts';
test('sketch coordinates remain in room feet regardless of canvas size',()=>{
 assert.deepEqual(sketchPoint(150,100,{left:50,top:50,width:200,height:100},60,30),{x:30,y:15});
 assert.deepEqual(sketchPoint(-1,999,{left:0,top:0,width:100,height:100},10,20),{x:0,y:20});
});
test('old layouts have no sketch and corrupt strokes are rejected',()=>{
 assert.deepEqual(normalizeSketches(undefined),[]);
 const good={id:'stroke',points:[{x:1,y:2},{x:3,y:4}],label:'a'.repeat(100)};
 const normalized=normalizeSketches([good,{id:'bad',points:[{x:NaN,y:1}]},{id:'dot',points:[{x:1,y:1}]}]);
 assert.equal(normalized.length,1);assert.equal(normalized[0].label.length,80);
});
