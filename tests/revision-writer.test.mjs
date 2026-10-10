import test from 'node:test';
import assert from 'node:assert/strict';
import { createRevisionWriter, SharedSaveError } from '../app/revision-writer.ts';

test('saves are serialized and each snapshot uses the acknowledged revision', async () => {
  let server = 'r0'; let active = 0; const received = [];
  const writer = createRevisionWriter('/test', server, async (_url, init) => {
    assert.equal(active++, 0);
    const body = JSON.parse(init.body); received.push(body);
    assert.equal(body.expectedUpdatedAt, server);
    await new Promise(resolve => setTimeout(resolve, 5));
    server = `r${received.length}`; active--;
    return Response.json({ updatedAt: server });
  });
  await Promise.all([writer.save({name:'one'}), writer.save({name:'two'}), writer.save({name:'three'})]);
  assert.deepEqual(received.map(b=>b.expectedUpdatedAt), ['r0','r1','r2']);
  await writer.save({name:'three'});
  assert.equal(received.length, 3);
});

test('a conflict blocks every queued write rather than overwriting the other editor', async () => {
  let calls=0;
  const writer=createRevisionWriter('/test','old',async()=>{calls++;return Response.json({error:'Changed elsewhere'},{status:409});});
  const results=await Promise.allSettled([writer.save({a:1}),writer.save({a:2})]);
  assert.equal(calls,1);
  assert.ok(results.every(r=>r.status==='rejected'&&r.reason instanceof SharedSaveError&&r.reason.conflict));
  assert.equal(writer.revision,'old');
});

test('failed network writes can retry without advancing the revision',async()=>{
  let calls=0;
  const writer=createRevisionWriter('/test',null,async(_url,init)=>{
    assert.equal(JSON.parse(init.body).expectedUpdatedAt,null);
    if(++calls===1)throw new Error('offline');
    return Response.json({updatedAt:'created'});
  });
  await assert.rejects(writer.save({name:'draft'}),/offline/);
  assert.equal(await writer.save({name:'draft'}),'created');
});
