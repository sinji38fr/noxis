import {archiveFilename} from './filenames.mjs';
import {randomBytes} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {exportArchive} from './media.mjs';
import {captureReplay} from './replay.mjs';
import {config,failure} from './config.mjs';
export class ExportManager{
 constructor({exporter=exportArchive,reader=captureReplay,concurrent=config.exportConcurrency,maxQueued=5000}={}){this.jobs=new Map();this.active=0;this.queue=[];this.exporter=exporter;this.reader=reader;this.concurrent=concurrent;this.maxQueued=maxQueued;this.closed=false;this.timer=setInterval(()=>this.sweep(),30000);this.timer.unref();}
 create(client,record,{offset=0,duration=record.end-record.start,browser=false}={}){
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(duration)||duration<1||duration>3600||record.start+offset>=record.end)throw failure('Invalid export range.',400,'EXPORT_RANGE');
  const start=record.start+offset,end=Math.min(start+duration,record.end),key=[client.uid,record.id,start,end,browser].join(':');
  for(const job of this.jobs.values())if(job.key===key&&!['error','cancelled'].includes(job.state)){job.touched=Date.now();return job;}
  if(this.closed||this.queue.length>=this.maxQueued)throw failure('Export queue is full.',429,'EXPORT_BUSY');
  const job={id:randomBytes(20).toString('hex'),key,owner:client.uid,state:'queued',progress:0,created:Date.now(),touched:Date.now(),controller:new AbortController(),record,start,end,browser};
  job.promise=new Promise(resolve=>{job.resolve=resolve;});job.controller.signal.addEventListener('abort',()=>{if(job.state==='queued'){job.state='cancelled';job.resolve(job);}},{once:true});
  this.jobs.set(job.id,job);this.queue.push({job,client});this.pump();return job;
 }
 pump(){while(!this.closed&&this.active<this.concurrent&&this.queue.length){const task=this.queue.shift();if(task.job.state==='cancelled')continue;this.active++;task.job.state='capturing';this.run(task).finally(()=>{this.active--;this.pump();});}}
 async run({job,client}){
  try{
   const reader=options=>this.reader({...options,port:config.videoPort,onEvent:event=>{if(event.layer==='progress')job.progress=Math.min(95,Math.round(event.elapsed/(job.end-job.start)/10));}});
   job.output=await this.exporter(reader,{username:client.username,password:client.password,channel:job.record.channel-1,start:job.start,end:job.end,type:job.record.type,host:config.host,onAssembling:()=>{job.state='assembling';}},{browser:job.browser,signal:job.controller.signal});
   job.size=(await stat(job.output.file)).size;job.progress=100;job.state='ready';job.touched=Date.now();
  }catch(error){job.state=job.controller.signal.aborted?'cancelled':'error';job.error=error.message;}finally{job.resolve(job);}
 }
 get(id,client){const job=this.jobs.get(id);if(!job||job.owner!==client.uid)throw failure('Export not found.',404,'NOT_FOUND');job.touched=Date.now();return job;}
 list(client){return [...this.jobs.values()].filter(j=>j.owner===client.uid).map(j=>this.view(j));}
 view(job){return {id:job.id,state:job.state,progress:job.progress,size:job.size||null,error:job.error||null,hasAudio:job.output?.hasAudio,codec:job.output?.codec,filename:this.filename(job),channel:job.record.channel,start:job.start,browser:job.browser,created:job.created};}
 filename(job){return archiveFilename({channel:job.record.channel,start:job.start,end:job.end});}
 async sweep(){for(const [id,job]of this.jobs)if(['ready','error','cancelled'].includes(job.state)&&Date.now()-job.touched>30*60000){await job.output?.dispose();this.jobs.delete(id);}}
 async close(){this.closed=true;clearInterval(this.timer);for(const job of this.jobs.values())job.controller.abort();await Promise.all([...this.jobs.values()].map(j=>j.promise));for(const job of this.jobs.values())await job.output?.dispose();this.jobs.clear();this.queue=[];}
}
