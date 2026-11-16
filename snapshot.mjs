import {spawn} from 'node:child_process';
import {ffmpeg} from './media.mjs';
import {captureReplay} from './replay.mjs';
import {config,failure} from './config.mjs';

// A bounded first-frame capture, independent of the long archive export queue.
export async function takeSnapshot(client,channel,{reader=captureReplay,timeout=15000,signal}={}){
 const controller=new AbortController();let decoder,buffer=Buffer.alloc(0),settled=false;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 let resolve,reject;const result=new Promise((a,b)=>{resolve=a;reject=b;});
 const finish=(error,jpeg)=>{if(settled)return;settled=true;clearTimeout(timer);controller.abort();decoder?.kill();error?reject(error):resolve({jpeg,capturedAt:new Date().toISOString()});};
 const timer=setTimeout(()=>finish(failure('Snapshot timed out.',504,'SNAPSHOT_TIMEOUT')),timeout);
 controller.signal.addEventListener('abort',()=>{if(!settled)finish(failure('Snapshot cancelled.',499,'CANCELLED'));},{once:true});
 if(signal?.aborted)abort();
 const capture=Promise.resolve().then(()=>reader({host:config.host,port:config.videoPort,username:client.username,password:client.password,channel:channel-1,stream:1,mode:'live',signal:controller.signal,onFrame:frame=>{
  if(settled)return;
  if(!decoder){if(!frame.key)return;if(!['H264','H265'].includes(frame.codec))throw failure('Unsupported video codec.',502,'CODEC');
   decoder=spawn(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-f',frame.codec==='H265'?'hevc':'h264','-i','pipe:0','-frames:v','1','-an','-vf',"scale='min(1280,iw)':-2",'-threads','1','-f','image2pipe','-c:v','mjpeg','pipe:1'],{windowsHide:true,stdio:['pipe','pipe','ignore']});
   decoder.on('error',()=>finish(failure('Snapshot decoder unavailable.',503,'DECODER')));decoder.stdin.on('error',()=>{});
   decoder.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>8*1024*1024)return finish(failure('Snapshot too large.',502,'SNAPSHOT_SIZE'));const start=buffer.indexOf(Buffer.from([255,216])),end=start<0?-1:buffer.indexOf(Buffer.from([255,217]),start+2);if(end>=0)finish(null,buffer.subarray(start,end+2));});
   decoder.on('close',()=>{if(!settled)finish(failure('No complete snapshot received.',502,'SNAPSHOT_EMPTY'));});
  }
  if(decoder.stdin.writableLength>8*1024*1024)throw failure('Snapshot decoder overloaded.',503,'DECODER');
  decoder.stdin.write(frame.data);
 }})).then(()=>{decoder?.stdin.end();if(!decoder&&!settled)finish(failure('No video received.',502,'SNAPSHOT_EMPTY'));}).catch(error=>{if(!settled)finish(error);});
 try{return await result;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();decoder?.kill();await capture;}
}
