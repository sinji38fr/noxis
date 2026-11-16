import {archiveFilename} from './filenames.mjs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {readState,writeState,flushState} from './storage.mjs';
import {stat,rm,readdir} from 'node:fs/promises';
import {exportArchive} from './media.mjs';
import {captureReplay} from './replay.mjs';
import {config,failure} from './config.mjs';
export class ExportManager{
 constructor({exporter=exportArchive,reader=captureReplay,concurrent=config.exportConcurrency,maxQueued=5000}={}){this.jobs=new Map();this.recovered=new Map();this.storageError=null;this.active=0;this.queue=[];this.exporter=exporter;this.reader=reader;this.concurrent=concurrent;this.maxQueued=maxQueued;this.closed=false;this.timer=setInterval(()=>this.sweep(),30000);this.timer.unref();}
 create(client,record,{offset=0,duration=record.end-record.start,browser=false}={}){
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(duration)||duration<1||duration>3600||record.start+offset>=record.end)throw failure('Invalid export range.',400,'EXPORT_RANGE');
  const start=record.start+offset,end=Math.min(start+duration,record.end),key=[client.uid,record.id,start,end,browser].join(':');
  for(const job of this.jobs.values())if(job.key===key&&!['error','cancelled'].includes(job.state)){job.touched=Date.now();if(job.persistent&&Date.now()-(job.persistedTouch||0)>30000){job.persistedTouch=Date.now();this.persist();}return job;}
  if(this.closed||this.queue.length>=this.maxQueued)throw failure('Export queue is full.',429,'EXPORT_BUSY');
  const job={persistent:!!client.persistent&&!!config.dataDir,id:randomBytes(20).toString('hex'),key,owner:client.uid,state:'queued',progress:0,created:Date.now(),touched:Date.now(),controller:new AbortController(),record,start,end,browser};
  job.promise=new Promise(resolve=>{job.resolve=resolve;});job.controller.signal.addEventListener('abort',()=>{if(job.state==='queued'){job.state='cancelled';job.resolve(job);this.persist();}},{once:true});
  this.jobs.set(job.id,job);this.queue.push({job,client});this.pump();this.persist();return job;
 }
 pump(){while(!this.closed&&this.active<this.concurrent&&this.queue.length){const task=this.queue.shift();if(task.job.state==='cancelled')continue;this.active++;task.job.state='capturing';this.run(task).finally(()=>{this.active--;this.pump();});}}
 async run({job,client}){
  try{
   const reader=options=>this.reader({...options,port:config.videoPort,onEvent:event=>{if(event.layer==='progress')job.progress=Math.min(95,Math.round(event.elapsed/(job.end-job.start)/10));}});
   job.output=await this.exporter(reader,{username:client.username,password:client.password,channel:job.record.channel-1,start:job.start,end:job.end,type:job.record.type,host:config.host,onAssembling:()=>{job.state='assembling';}},{browser:job.browser,signal:job.controller.signal});
   job.size=(await stat(job.output.file)).size;job.progress=100;job.state='ready';job.touched=Date.now();
  }catch(error){job.state=job.controller.signal.aborted?'cancelled':'error';job.error=error.message;}finally{this.persist();job.resolve(job);}
 }
 get(id,client){const job=this.jobs.get(id);if(!job||job.owner!==client.uid)throw failure('Export not found.',404,'NOT_FOUND');job.touched=Date.now();return job;}
 list(client){return [...this.jobs.values()].filter(j=>j.owner===client.uid).map(j=>this.view(j));}
 view(job){return {id:job.id,state:job.state,progress:job.progress,size:job.size||null,error:job.error||null,hasAudio:job.output?.hasAudio,codec:job.output?.codec,filename:this.filename(job),channel:job.record.channel,start:job.start,browser:job.browser,created:job.created};}
 filename(job){return archiveFilename({channel:job.record.channel,start:job.start,end:job.end});}
 async sweep(){for(const [id,job]of this.jobs)if(['ready','error','cancelled'].includes(job.state)&&Date.now()-job.touched>30*60000){await job.output?.dispose();this.jobs.delete(id);this.persist();}}
 persist(){
  if(!config.dataDir)return;
  const entries=[...this.jobs.values()].filter(j=>j.persistent).map(j=>({id:j.id,key:j.key,owner:j.owner,state:j.state,created:j.created,touched:j.touched,record:j.record,start:j.start,end:j.end,browser:j.browser,error:j.error,size:j.size,output:j.output?{file:path.relative(path.join(config.dataDir,'media'),j.output.file).replaceAll('\\','/'),codec:j.output.codec,hasAudio:j.output.hasAudio}:null}));
  writeState('exports',entries).then(()=>{this.storageError=null;},()=>{this.storageError='Export state could not be saved.';});
 }
 async recover(client){
  if(!config.dataDir||!client.persistent)return;
  if(this.recovered.has(client.uid))return this.recovered.get(client.uid);
  const pending=(async()=>{
   const entries=await readState('exports',[]);
   for(const saved of entries){
    if(saved.owner!==client.uid||!/^[a-f0-9]{40}$/.test(saved.id)||this.jobs.has(saved.id)||!saved.record||!Number.isInteger(saved.start)||!Number.isInteger(saved.end)||saved.end<=saved.start)continue;
    if(Date.now()-saved.touched>30*60000&&['ready','error','cancelled'].includes(saved.state))continue;
    const job={...saved,persistent:true,controller:new AbortController(),progress:saved.state==='ready'?100:0};job.promise=new Promise(resolve=>{job.resolve=resolve;});
    if(saved.state==='ready'&&/^noxis-[A-Za-z0-9]+\/archive\.mp4$/.test(saved.output?.file||'')){
     const file=path.join(config.dataDir,'media',saved.output.file);
     try{await stat(file);job.output={...saved.output,file,dispose:()=>rm(path.dirname(file),{recursive:true,force:true})};job.resolve(job);}catch{job.state='error';job.error='Cached media unavailable. Prepare this recording again.';job.resolve(job);}
    }else if(['queued','capturing','assembling'].includes(saved.state)){
     job.state='queued';job.output=null;job.touched=Date.now();job.controller.signal.addEventListener('abort',()=>{if(job.state==='queued'){job.state='cancelled';job.resolve(job);this.persist();}},{once:true});this.queue.push({job,client});
    }else{job.output=null;if(saved.state==='ready'){job.state='error';job.error='Cached media unavailable.';}job.resolve(job);}
    this.jobs.set(job.id,job);client.records.set(job.record.id,job.record);
   }
   const retained=new Set([...this.jobs.values()].filter(j=>j.output).map(j=>path.dirname(j.output.file)));
   const mediaRoot=path.join(config.dataDir,'media');
   for(const entry of await readdir(mediaRoot,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(entry.isDirectory()&&/^noxis-[A-Za-z0-9]+$/.test(entry.name)){const folder=path.join(mediaRoot,entry.name);if(!retained.has(folder))await rm(folder,{recursive:true,force:true});}
   this.pump();this.persist();
  })();this.recovered.set(client.uid,pending);try{await pending;}catch(error){this.recovered.delete(client.uid);this.storageError='Export state could not be loaded.';throw error;}
 }
 async close(){this.closed=true;clearInterval(this.timer);for(const job of this.jobs.values())job.controller.abort();await Promise.all([...this.jobs.values()].map(j=>j.promise));for(const job of this.jobs.values())await job.output?.dispose();await flushState();this.jobs.clear();this.queue=[];}
}
