import {randomBytes} from 'node:crypto';
import {stat} from 'node:fs/promises';
import {exportArchive} from './media.mjs';
import {captureReplay} from './replay.mjs';
import {config,failure} from './config.mjs';
export class ExportManager{
 constructor(){this.jobs=new Map();this.active=0;this.timer=setInterval(()=>this.sweep(),30000);this.timer.unref();}
 create(client,record,{offset=0,duration=record.end-record.start,browser=false}={}){
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(duration)||duration<1||duration>3600||record.start+offset>=record.end)throw failure('Invalid export range.',400,'EXPORT_RANGE');
  const start=record.start+offset,end=Math.min(start+duration,record.end);const key=[client.uid,record.id,start,end,browser].join(':');
  for(const job of this.jobs.values())if(job.key===key&&!['error','cancelled'].includes(job.state)){job.touched=Date.now();return job;}
  if(this.active>=2)throw failure('Two exports are already running.',429,'EXPORT_BUSY');
  const job={id:randomBytes(20).toString('hex'),key,owner:client.uid,state:'capturing',progress:0,created:Date.now(),touched:Date.now(),controller:new AbortController(),record,start,end,browser};this.jobs.set(job.id,job);this.active++;
  const reader=options=>captureReplay({...options,port:config.videoPort,onEvent:event=>{if(event.layer==='progress')job.progress=Math.min(95,Math.round(event.elapsed/(end-start)/10));}});
  job.promise=exportArchive(reader,{username:client.username,password:client.password,channel:record.channel-1,start,end,type:record.type,host:config.host,onAssembling:()=>{job.state='assembling';}},{browser,signal:job.controller.signal}).then(async output=>{job.output=output;job.size=(await stat(output.file)).size;job.progress=100;job.state='ready';job.touched=Date.now();return job;}).catch(error=>{job.state=job.controller.signal.aborted?'cancelled':'error';job.error=error.message;return job;}).finally(()=>this.active--);
  return job;
 }
 get(id,client){const job=this.jobs.get(id);if(!job||job.owner!==client.uid)throw failure('Export not found.',404,'NOT_FOUND');job.touched=Date.now();return job;}
 view(job){return {id:job.id,state:job.state,progress:job.progress,size:job.size||null,error:job.error||null,hasAudio:job.output?.hasAudio,codec:job.output?.codec,filename:this.filename(job)};}
 filename(job){return `Cam${String(job.record.channel).padStart(2,'0')}_${job.start}_${job.end}.mp4`;}
 async sweep(){for(const [id,job]of this.jobs){if(['ready','error','cancelled'].includes(job.state)&&Date.now()-job.touched>30*60000){await job.output?.dispose();this.jobs.delete(id);}}}
 async close(){clearInterval(this.timer);for(const job of this.jobs.values())job.controller.abort();await Promise.all([...this.jobs.values()].map(j=>j.promise));for(const job of this.jobs.values())await job.output?.dispose();this.jobs.clear();}
}
