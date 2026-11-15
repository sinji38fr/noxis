import test from 'node:test';
import assert from 'node:assert/strict';
import {virtualDates,config} from '../config.mjs';
import {VirtualArchiveFS,ftpFilename,ftpEntries} from '../ftp.mjs';
import {validateSearch,createApp,exportsManager} from '../web.mjs';
import {nearReplayEnd} from '../replay.mjs';
test('thirty virtual dates cross month and leap-year boundaries without a NVR query',()=>{
 const dates=virtualDates(30,new Date(2024,2,1,12));assert.equal(dates.length,30);assert.equal(dates[0],'2024-03-01');assert.equal(dates[1],'2024-02-29');assert.equal(new Set(dates).size,30);
});
test('FTP root and day directories are virtual; files from all cameras share a day',async()=>{
 let requests=0;const today=virtualDates()[0];const records=[{id:'aaaaaaaa',channel:1,start:100,end:110},{id:'bbbbbbbb',channel:4,start:120,end:130}];
 const client={day:async date=>{requests++;assert.equal(date,today);return records;}};const fs=new VirtualArchiveFS(async()=>client,{});
 assert.equal((await fs.list('/')).length,config.archiveDays);assert.equal(requests,0);await fs.chdir('/'+today);assert.equal(requests,0);
 const files=await fs.list();assert.equal(requests,1);assert.equal(files.length,2);assert.match(files[0].name,/^Cam01_/);assert.match(files[1].name,/^Cam04_/);assert.equal(files[0].isDirectory(),false);
 assert.equal(ftpFilename(records[0]),ftpFilename({...records[0]}));await assert.rejects(fs.get('/etc/passwd'));await assert.rejects(fs.chdir('/1900-01-01'));
});
test('search validates camera/event arrays and date boundaries',()=>{
 const q={Channel:['True','False'],Type:['True','True','True','True'],Date:'2024-02-29',BeginTime:'00:00:00',EndTime:'23:59:59',PageSize:25,CurrentPage:1};assert.equal(validateSearch(q).Type.length,4);assert.throws(()=>validateSearch({...q,Date:'2024-02-31'}));assert.throws(()=>validateSearch({...q,Channel:['False']}));assert.throws(()=>validateSearch({...q,BeginTime:'25:00:00'}));
});
test('long FTP recordings are split into explicitly named complete ranges without truncation',()=>{const segments=ftpEntries([{id:'abc',channel:2,start:0,end:7500}]);assert.deepEqual(segments.map(s=>[s.start,s.end]),[[0,3600],[3600,7200],[7200,7500]]);});
test('normal archive EOF is distinguished from an early interruption',()=>{assert.equal(nearReplayEnd(100000,189950,100,190),true);assert.equal(nearReplayEnd(100000,130000,100,190),false);assert.equal(nearReplayEnd(null,null,100,190),false);});
test('HTTP health, secret-free config, origin protection and unauthenticated API',async()=>{
 const app=createApp();await new Promise(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.address().port}`;
 try{const health=await fetch(url+'/healthz');assert.equal(health.status,200);assert.equal((await health.json()).name,'Noxis');const settings=await(await fetch(url+'/api/config')).json();assert.ok(!('password'in settings));assert.equal(settings.dates.length,config.archiveDays);assert.equal((await fetch(url+'/api/days')).status,401);const denied=await fetch(url+'/api/session',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json','X-Noxis-Client':'1'},body:'{}'});assert.equal(denied.status,403);}finally{await new Promise(r=>app.close(r));}
});
test.after(async()=>exportsManager.close());
