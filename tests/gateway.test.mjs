import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {takeSnapshot} from '../snapshot.mjs';
import {runFFmpeg} from '../media.mjs';
import {config} from '../config.mjs';
import {createApp,exportsManager} from '../web.mjs';
import {ExportManager} from '../jobs.mjs';
import {writeState,flushState} from '../storage.mjs';

test('snapshot produces one real JPEG from HEVC and releases the reader',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'noxis-photo-'));let aborted=false;
 try{const file=path.join(dir,'test.hevc');await runFFmpeg(['-y','-f','lavfi','-i','color=c=green:s=96x64:r=10:d=1','-c:v','libx265','-x265-params','log-level=error','-f','hevc',file]);const data=await readFile(file);
  const reader=async options=>{options.onFrame({codec:'H265',key:true,data});options.signal.addEventListener('abort',()=>{aborted=true;},{once:true});};
  const result=await takeSnapshot({username:'fixture',password:'fixture'},1,{reader,timeout:5000});assert.deepEqual([...result.jpeg.subarray(0,2)],[255,216]);assert.deepEqual([...result.jpeg.subarray(-2)],[255,217]);assert.ok(aborted);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('snapshot timeout aborts a stalled source',async()=>{let aborted=false;await assert.rejects(takeSnapshot({},1,{timeout:20,reader:async({signal})=>new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}))}),/timed out/);assert.equal(aborted,true);});
test('monitor token can read cached status but cannot start media operations',async()=>{
 const original=config.monitorToken;config.monitorToken='fixture-monitor';let contacts=0;const app=createApp({clientProvider:async()=>{contacts++;return {};}});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.address().port,headers={Authorization:'Bearer fixture-monitor'};
 try{assert.equal((await fetch(base+'/api/status',{headers})).status,200);assert.equal(contacts,0);assert.equal((await fetch(base+'/api/cameras',{headers})).status,200);assert.equal((await fetch(base+'/api/exports',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'})).status,401);const schema=await(await fetch(base+'/openapi.json')).json();assert.ok(schema.paths['/api/cameras/{channel}/snapshot']);assert.equal(contacts,0);}finally{config.monitorToken=original;await new Promise(resolve=>app.close(resolve));}
});
test('durable exports recover ready files and restart interrupted work without stored credentials',async()=>{
 const previous=config.dataDir,folder=await mkdtemp(path.join(os.tmpdir(),'noxis-durable-'));config.dataDir=folder;let manager;
 try{const dir=path.join(folder,'media','noxis-fixture');await mkdir(dir,{recursive:true});const file=path.join(dir,'archive.mp4');await writeFile(file,'synthetic');const record={id:'record',channel:1,start:100,end:110};const base={owner:'fixture',created:Date.now(),touched:Date.now(),record,start:100,end:110,browser:false};
  await writeState('exports',[{...base,id:'a'.repeat(40),key:'first',state:'ready',output:{file:'noxis-fixture/archive.mp4',codec:'H265',hasAudio:true}},{...base,id:'b'.repeat(40),key:'second',state:'capturing'}]);let captures=0;
  manager=new ExportManager({exporter:async()=>{captures++;return {file,codec:'H265',hasAudio:true,dispose:async()=>{}};}});const client={uid:'fixture',persistent:true,records:new Map(),username:'private-username',password:'private-password'};await manager.recover(client);await manager.jobs.get('b'.repeat(40)).promise;assert.equal(captures,1);assert.equal(manager.jobs.get('a'.repeat(40)).state,'ready');assert.equal(manager.jobs.get('b'.repeat(40)).state,'ready');await flushState();const json=await readFile(path.join(folder,'exports.json'),'utf8');assert.ok(!json.includes('private-password'));assert.ok(!json.includes('private-username'));
 }finally{await manager?.close();config.dataDir=previous;await rm(folder,{recursive:true,force:true});}
});
test.after(()=>exportsManager.close());
