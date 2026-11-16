import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ExportManager} from '../jobs.mjs';
import {config} from '../config.mjs';
import {createApp,exportsManager} from '../web.mjs';
test('export queue runs two jobs, retains queued jobs and cancels safely',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'noxis-queue-')),file=path.join(folder,'dummy.mp4');await writeFile(file,'synthetic');const releases=[];
 const exporter=async(reader,options,{signal})=>new Promise((resolve,reject)=>{releases.push(()=>resolve({file,dispose:async()=>{}}));signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true});});const manager=new ExportManager({exporter,concurrent:2});
 try{const client={uid:'synthetic',username:'synthetic',password:'synthetic'};const jobs=Array.from({length:4},(_,i)=>manager.create(client,{id:String(i),channel:1,start:100,end:110}));assert.deepEqual(jobs.map(j=>j.state),['capturing','capturing','queued','queued']);jobs[2].controller.abort();assert.equal((await jobs[2].promise).state,'cancelled');releases[0]();await jobs[0].promise;await new Promise(r=>setImmediate(r));assert.equal(jobs[3].state,'capturing');releases[1]();releases[2]();await Promise.all(jobs.map(j=>j.promise));assert.equal(manager.list(client).filter(j=>j.state==='ready').length,3);}
 finally{await manager.close();await unlink(file);await rmdir(folder);}
});
test('batch API enqueues only explicitly selected record IDs',async()=>{
 const token=config.apiToken;config.apiToken='synthetic-token';const records=new Map([['first',{id:'first',channel:1,start:100,end:110}],['chosen',{id:'chosen',channel:2,start:200,end:210}],['third',{id:'third',channel:3,start:300,end:310}]]);const created=[];const manager={queue:[],maxQueued:5000,create:(client,record)=>{created.push(record.id);return {id:record.id};},view:job=>job};const app=createApp({manager,clientProvider:async()=>({uid:'synthetic',records})});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.address().port}`;
 try{const r=await fetch(base+'/api/exports/batch',{method:'POST',headers:{Authorization:'Bearer synthetic-token','Content-Type':'application/json'},body:JSON.stringify({recordIds:['chosen']})});assert.equal(r.status,202);assert.deepEqual(created,['chosen']);const denied=await fetch(base+'/api/exports/batch',{method:'POST',headers:{Authorization:'Bearer synthetic-token','Content-Type':'application/json'},body:JSON.stringify({recordIds:['unknown']})});assert.equal(denied.status,400);assert.deepEqual(created,['chosen']);}
 finally{config.apiToken=token;await new Promise(r=>app.close(r));}
});
test.after(()=>exportsManager.close());
